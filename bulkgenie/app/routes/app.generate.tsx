import { useState, useCallback, useMemo } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  useLoaderData,
  useActionData,
  useSubmit,
  useNavigation,
  useRouteError,
  isRouteErrorResponse,
} from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  InlineStack,
  Badge,
  IndexTable,
  Thumbnail,
  ChoiceList,
  useIndexResourceState,
  Banner,
} from "@shopify/polaris";
import { ImageIcon } from "@shopify/polaris-icons";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";

interface ShopifyProduct {
  id: string;
  title: string;
  productType: string;
  vendor: string;
  status: string;
  cursor: string;
  featuredImage: { url: string; altText: string | null } | null;
  seo: { title: string | null; description: string | null };
  descriptionHtml: string;
  images: {
    edges: Array<{ node: { id: string; altText: string | null } }>;
  };
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, "").trim();
}

function missingAltCount(product: ShopifyProduct) {
  const total = product.images.edges.length;
  const missing = product.images.edges.filter(
    (e) => !e.node.altText,
  ).length;
  return { total, missing };
}

function contentGapScore(product: ShopifyProduct) {
  const alt = missingAltCount(product);
  return [
    !stripHtml(product.descriptionHtml),
    !product.seo.title,
    !product.seo.description,
    alt.missing > 0,
  ].filter(Boolean).length;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { admin, session } = await authenticate.admin(request);
    const shopDomain = session.shop;
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor") || undefined;
    const search = url.searchParams.get("search") || undefined;

    const shop = await prisma.shop.findUnique({ where: { shopDomain } });
    const defaultFields = shop?.defaultFields
      ? JSON.parse(shop.defaultFields)
      : ["description", "seoTitle", "seoDescription", "altText"];

    const response = await admin.graphql(
    `#graphql
    query getProducts($first: Int!, $after: String, $query: String) {
      products(first: $first, after: $after, query: $query) {
        edges {
          cursor
          node {
            id
            title
            productType
            vendor
            status
            featuredImage {
              url
              altText
            }
            seo {
              title
              description
            }
            descriptionHtml
            images(first: 10) {
              edges {
                node {
                  id
                  altText
                }
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }`,
    {
      variables: {
        first: 50,
        after: cursor || null,
        query: search || null,
      },
    },
  );

    const responseJson = await response.json();
    
    if (!responseJson.data?.products) {
      throw new Error("Failed to fetch products from Shopify");
    }
    
    const products = responseJson.data.products;

    return json({
      products: products.edges.map(
        (e: { cursor: string; node: ShopifyProduct }) => ({
          ...e.node,
          cursor: e.cursor,
        }),
      ),
      pageInfo: products.pageInfo,
      defaultFields,
      shopTier: shop?.tier || "free",
      monthlyUsage: shop?.monthlyUsage || 0,
      hasApiKey: !!shop?.byokApiKey,
    });
  } catch (error) {
    console.error("[app.generate] Loader error:", error);
    throw new Response("Failed to load products", {
      status: 500,
      statusText: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const formData = await request.formData();

  const selectedProducts = JSON.parse(
    formData.get("selectedProducts") as string,
  ) as Array<{ id: string; title: string }>;
  const fields = JSON.parse(formData.get("fields") as string) as string[];

  if (!selectedProducts.length || !fields.length) {
    return json({ error: "Select products and fields" }, { status: 400 });
  }

  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) {
    return json({ error: "Shop not found" }, { status: 404 });
  }

  if (!shop.byokApiKey) {
    return json(
      {
        error:
          "Add an API key in Settings before generating content. BulkGenie uses your key to create drafts for review.",
      },
      { status: 400 },
    );
  }

  const tierLimits: Record<string, number> = {
    free: 10,
    starter: 100,
    growth: 500,
    scale: Infinity,
  };
  const limit = tierLimits[shop.tier] || 10;
  if (
    limit !== Infinity &&
    shop.monthlyUsage + selectedProducts.length > limit
  ) {
    return json(
      {
        error: `Usage limit exceeded. You have ${Math.max(0, limit - shop.monthlyUsage)} products remaining this month.`,
      },
      { status: 400 },
    );
  }

  try {
    const job = await prisma.job.create({
      data: {
        shopDomain,
        status: "processing",
        totalProducts: selectedProducts.length,
        generateFields: JSON.stringify(fields),
        aiProvider: shop.aiProvider,
        items: {
          create: selectedProducts.map((p) => ({
            shopifyProductId: p.id,
            productTitle: p.title,
          })),
        },
      },
    });

    await prisma.shop.update({
      where: { shopDomain },
      data: { monthlyUsage: { increment: selectedProducts.length } },
    });

    // Redirect immediately — processing happens via job page polling
    return redirect(`/app/jobs/${job.id}`);
  } catch (error) {
    console.error("[Generate] Error:", error);
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred. Please try again.",
      },
      { status: 500 },
    );
  }
};

export default function GeneratePage() {
  const { products, pageInfo, defaultFields, shopTier, monthlyUsage, hasApiKey } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [selectedFields, setSelectedFields] =
    useState<string[]>(defaultFields);

  const sortedProducts = useMemo(
    () =>
      [...products].sort(
        (a: ShopifyProduct, b: ShopifyProduct) =>
          contentGapScore(b) - contentGapScore(a) ||
          a.title.localeCompare(b.title),
      ),
    [products],
  );

  const resourceName = {
    singular: "product",
    plural: "products",
  };

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(sortedProducts);

  const handleGenerate = useCallback(() => {
    if (!hasApiKey || !selectedResources.length || !selectedFields.length) {
      return;
    }

    const selectedProducts = sortedProducts
      .filter((p: ShopifyProduct) => selectedResources.includes(p.id))
      .map((p: ShopifyProduct) => ({ id: p.id, title: p.title }));

    const formData = new FormData();
    formData.set("selectedProducts", JSON.stringify(selectedProducts));
    formData.set("fields", JSON.stringify(selectedFields));
    submit(formData, { method: "post" });
  }, [hasApiKey, sortedProducts, selectedResources, selectedFields, submit]);

  const tierLimits: Record<string, number> = {
    free: 10,
    starter: 100,
    growth: 500,
    scale: Infinity,
  };
  const limit = tierLimits[shopTier] || 10;
  const remaining =
    limit === Infinity ? Infinity : Math.max(0, limit - monthlyUsage);
  const selectedCount = selectedResources.length;
  const overMonthlyLimit = remaining !== Infinity && selectedCount > remaining;
  const canGenerate =
    hasApiKey &&
    selectedCount > 0 &&
    selectedFields.length > 0 &&
    !overMonthlyLimit;
  const productsWithContentGaps = sortedProducts.filter(
    (product: ShopifyProduct) => contentGapScore(product) > 0,
  ).length;

  const rowMarkup = sortedProducts.map(
    (product: ShopifyProduct, index: number) => {
      const alt = missingAltCount(product);
      const gapScore = contentGapScore(product);
      return (
        <IndexTable.Row
          id={product.id}
          key={product.id}
          selected={selectedResources.includes(product.id)}
          position={index}
        >
          <IndexTable.Cell>
            <InlineStack gap="300" blockAlign="center">
              <Thumbnail
                source={product.featuredImage?.url || ImageIcon}
                alt={product.title}
                size="small"
              />
              <BlockStack gap="100">
                <Text as="span" variant="bodyMd" fontWeight="semibold">
                  {product.title}
                </Text>
                {gapScore > 0 && (
                  <Badge tone="attention">Needs content</Badge>
                )}
              </BlockStack>
            </InlineStack>
          </IndexTable.Cell>
          <IndexTable.Cell>
            {product.seo.title ? (
              <Text as="span" variant="bodyMd" truncate>
                {product.seo.title}
              </Text>
            ) : (
              <Badge tone="warning">Missing</Badge>
            )}
          </IndexTable.Cell>
          <IndexTable.Cell>
            {product.seo.description ? (
              <Text as="span" variant="bodyMd" truncate>
                {product.seo.description.substring(0, 60)}...
              </Text>
            ) : (
              <Badge tone="warning">Missing</Badge>
            )}
          </IndexTable.Cell>
          <IndexTable.Cell>
            {alt.total === 0 ? (
              <Text as="span" tone="subdued">
                No images
              </Text>
            ) : alt.missing > 0 ? (
              <Badge tone="warning">
                {`${alt.missing}/${alt.total} missing`}
              </Badge>
            ) : (
              <Badge tone="success">
                {`${alt.total}/${alt.total} done`}
              </Badge>
            )}
          </IndexTable.Cell>
        </IndexTable.Row>
      );
    },
  );

  return (
    <Page title="Generate Content" backAction={{ url: "/app" }}>
      <BlockStack gap="500">
        {!hasApiKey && (
          <Banner
            tone="warning"
            title="Add an API key to generate drafts"
            action={{ content: "Add API key", url: "/app/settings" }}
          >
            <p>
              Choose Anthropic, OpenAI, Mistral, or Kimi. BulkGenie will create
              draft product content for review before anything is published.
            </p>
          </Banner>
        )}

        {actionData?.error && (
          <Banner tone="critical" title="Generation failed">
            <p>{actionData.error}</p>
          </Banner>
        )}

        {isSubmitting && (
          <Banner tone="info">
            Creating your review job. Generation continues on the next screen.
          </Banner>
        )}

        {overMonthlyLimit && (
          <Banner tone="critical" title="Selected products exceed your monthly limit">
            <p>
              You selected {selectedCount} products, but only {remaining} product
              generations remain this month.
            </p>
          </Banner>
        )}

        {remaining !== Infinity && remaining < 20 && (
          <Banner tone="warning">
            You have {remaining} product generations remaining this month.
            {shopTier === "free" && " Upgrade your plan for more."}
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Choose fields for this batch
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Products with missing descriptions, SEO titles, meta
                  descriptions, or image alt text are shown first.{" "}
                  {productsWithContentGaps} products on this page need content.
                </Text>
                <ChoiceList
                  allowMultiple
                  title=""
                  choices={[
                    { label: "Product Description", value: "description" },
                    { label: "SEO Title", value: "seoTitle" },
                    { label: "Meta Description", value: "seoDescription" },
                    { label: "Image Alt Text", value: "altText" },
                  ]}
                  selected={selectedFields}
                  onChange={setSelectedFields}
                />
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card padding="0">
              <IndexTable
                resourceName={resourceName}
                itemCount={products.length}
                selectedItemsCount={
                  allResourcesSelected ? "All" : selectedResources.length
                }
                onSelectionChange={handleSelectionChange}
                headings={[
                  { title: "Product" },
                  { title: "SEO Title" },
                  { title: "Meta Description" },
                  { title: "Alt Text" },
                ]}
                promotedBulkActions={[
                  {
                    content: `Generate Drafts (${selectedResources.length})`,
                    onAction: handleGenerate,
                    disabled: !canGenerate,
                  },
                ]}
              >
                {rowMarkup}
              </IndexTable>
            </Card>
          </Layout.Section>

          {pageInfo.hasNextPage && (
            <Layout.Section>
              <InlineStack align="center">
                <Button url={`/app/generate?cursor=${pageInfo.endCursor}`}>
                  Load More Products
                </Button>
              </InlineStack>
            </Layout.Section>
          )}
        </Layout>
      </BlockStack>
    </Page>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  
  let errorMessage = "An unexpected error occurred";
  
  if (isRouteErrorResponse(error)) {
    errorMessage = error.statusText || error.data;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  return (
    <Page title="Generate Content" backAction={{ url: "/app" }}>
      <Banner tone="critical" title="Error loading products">
        <p>{errorMessage}</p>
      </Banner>
      <BlockStack gap="400">
        <Button url="/app">Return to Dashboard</Button>
      </BlockStack>
    </Page>
  );
}
