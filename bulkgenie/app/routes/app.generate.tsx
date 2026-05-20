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
import {
  scoreProductContent,
  catalogGapSummary,
  type ProductForScoring,
} from "../services/scoring";

interface ShopifyProduct extends ProductForScoring {
  id: string;
  title: string;
  productType: string;
  vendor: string;
  status: string;
  cursor: string;
  featuredImage: { url: string; altText: string | null } | null;
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
  const [showGapsOnly, setShowGapsOnly] = useState(false);

  const sortedProducts = useMemo(
    () =>
      [...products].sort(
        (a: ShopifyProduct, b: ShopifyProduct) =>
          scoreProductContent(b).score - scoreProductContent(a).score ||
          a.title.localeCompare(b.title),
      ),
    [products],
  );

  const filteredProducts = useMemo(
    () =>
      showGapsOnly
        ? sortedProducts.filter((p: ShopifyProduct) => scoreProductContent(p).score > 0)
        : sortedProducts,
    [sortedProducts, showGapsOnly],
  );

  const gapSummary = useMemo(
    () => catalogGapSummary(sortedProducts.map(scoreProductContent)),
    [sortedProducts],
  );

  const resourceName = {
    singular: "product",
    plural: "products",
  };

  const { selectedResources, allResourcesSelected, handleSelectionChange, clearSelection } =
    useIndexResourceState(filteredProducts);

  const handleToggleGapsFilter = useCallback(
    (value: boolean) => {
      clearSelection();
      setShowGapsOnly(value);
    },
    [clearSelection],
  );

  const handleGenerate = useCallback(() => {
    if (!hasApiKey || !selectedResources.length || !selectedFields.length) {
      return;
    }

    const selectedProducts = filteredProducts
      .filter((p: ShopifyProduct) => selectedResources.includes(p.id))
      .map((p: ShopifyProduct) => ({ id: p.id, title: p.title }));

    const formData = new FormData();
    formData.set("selectedProducts", JSON.stringify(selectedProducts));
    formData.set("fields", JSON.stringify(selectedFields));
    submit(formData, { method: "post" });
  }, [hasApiKey, filteredProducts, selectedResources, selectedFields, submit]);

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

  const rowMarkup = filteredProducts.map(
    (product: ShopifyProduct, index: number) => {
      const gap = scoreProductContent(product);
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
                <InlineStack gap="100" wrap>
                  {gap.hasWeakProductTitle && (
                    <Badge tone="critical" size="small">Weak title</Badge>
                  )}
                  {gap.hasMissingDescription && (
                    <Badge tone="critical" size="small">No description</Badge>
                  )}
                  {gap.hasThinDescription && (
                    <Badge tone="attention" size="small">Thin description</Badge>
                  )}
                </InlineStack>
              </BlockStack>
            </InlineStack>
          </IndexTable.Cell>
          <IndexTable.Cell>
            {gap.hasMissingSeoTitle ? (
              <Badge tone="warning">Missing</Badge>
            ) : gap.seoTitleTooLong ? (
              <Badge tone="attention">Too long</Badge>
            ) : (
              <Text as="span" variant="bodyMd" truncate>
                {product.seo.title}
              </Text>
            )}
          </IndexTable.Cell>
          <IndexTable.Cell>
            {gap.hasMissingSeoDescription ? (
              <Badge tone="warning">Missing</Badge>
            ) : gap.seoDescriptionTooLong ? (
              <Badge tone="attention">Too long</Badge>
            ) : (
              <Text as="span" variant="bodyMd" truncate>
                {product.seo.description?.substring(0, 60)}...
              </Text>
            )}
          </IndexTable.Cell>
          <IndexTable.Cell>
            {gap.totalImageCount === 0 ? (
              <Text as="span" tone="subdued">
                No images
              </Text>
            ) : gap.missingAltTextCount > 0 ? (
              <Badge tone="warning">
                {`${gap.missingAltTextCount}/${gap.totalImageCount} missing`}
              </Badge>
            ) : (
              <Badge tone="success">
                {`${gap.totalImageCount}/${gap.totalImageCount} done`}
              </Badge>
            )}
          </IndexTable.Cell>
        </IndexTable.Row>
      );
    },
  );

  return (
    <Page title="Scan & Fix Product Pages" backAction={{ url: "/app" }}>
      <BlockStack gap="500">
        {!hasApiKey && (
          <Banner
            tone="warning"
            title="Add an API key to generate draft content"
            action={{ content: "Add API key", url: "/app/settings" }}
          >
            <p>
              Choose Anthropic, OpenAI, Mistral, or Kimi. BulkGenie creates
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

        {/* Catalog Health Summary */}
        {gapSummary.totalProducts > 0 && (
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    Catalog content coverage
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    {gapSummary.productsWithGaps > 0
                      ? `${gapSummary.productsWithGaps} of ${gapSummary.totalProducts} products checked need attention`
                      : `All ${gapSummary.totalProducts} products checked look complete`}
                  </Text>
                </BlockStack>
                {gapSummary.productsWithGaps > 0 && (
                  <Button
                    variant={showGapsOnly ? "plain" : "secondary"}
                    onClick={() => handleToggleGapsFilter(!showGapsOnly)}
                  >
                    {showGapsOnly
                      ? "Show all products"
                      : `Show ${gapSummary.productsWithGaps} with gaps`}
                  </Button>
                )}
              </InlineStack>
              {gapSummary.productsWithGaps > 0 && (
                <InlineStack gap="400" wrap>
                  {gapSummary.missingDescriptionCount > 0 && (
                    <Text as="span" variant="bodySm" tone="subdued">
                      <Text as="span" variant="bodySm" fontWeight="semibold" tone="critical">
                        {gapSummary.missingDescriptionCount}
                      </Text>{" "}
                      missing description
                    </Text>
                  )}
                  {gapSummary.thinDescriptionCount > 0 && (
                    <Text as="span" variant="bodySm" tone="subdued">
                      <Text as="span" variant="bodySm" fontWeight="semibold" tone="caution">
                        {gapSummary.thinDescriptionCount}
                      </Text>{" "}
                      thin description
                    </Text>
                  )}
                  {gapSummary.weakProductTitleCount > 0 && (
                    <Text as="span" variant="bodySm" tone="subdued">
                      <Text as="span" variant="bodySm" fontWeight="semibold" tone="critical">
                        {gapSummary.weakProductTitleCount}
                      </Text>{" "}
                      weak product title
                    </Text>
                  )}
                  {gapSummary.missingSeoTitleCount > 0 && (
                    <Text as="span" variant="bodySm" tone="subdued">
                      <Text as="span" variant="bodySm" fontWeight="semibold" tone="critical">
                        {gapSummary.missingSeoTitleCount}
                      </Text>{" "}
                      missing SEO title
                    </Text>
                  )}
                  {gapSummary.missingSeoDescriptionCount > 0 && (
                    <Text as="span" variant="bodySm" tone="subdued">
                      <Text as="span" variant="bodySm" fontWeight="semibold" tone="critical">
                        {gapSummary.missingSeoDescriptionCount}
                      </Text>{" "}
                      missing meta description
                    </Text>
                  )}
                  {gapSummary.productsWithMissingAltText > 0 && (
                    <Text as="span" variant="bodySm" tone="subdued">
                      <Text as="span" variant="bodySm" fontWeight="semibold" tone="caution">
                        {gapSummary.missingAltTextCount}
                      </Text>{" "}
                      image alt text gaps
                    </Text>
                  )}
                </InlineStack>
              )}
            </BlockStack>
          </Card>
        )}

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Choose fields for this batch
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Products missing descriptions, SEO titles, meta descriptions,
                  or image alt text are sorted to the top.
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
                itemCount={filteredProducts.length}
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
                emptyState={
                  showGapsOnly ? (
                    <Text as="p" variant="bodyMd" tone="subdued">
                      No products with content gaps found in this batch.
                    </Text>
                  ) : undefined
                }
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
    <Page title="Scan & Fix Product Pages" backAction={{ url: "/app" }}>
      <Banner tone="critical" title="Error loading products">
        <p>{errorMessage}</p>
      </Banner>
      <BlockStack gap="400">
        <Button url="/app">Return to Dashboard</Button>
      </BlockStack>
    </Page>
  );
}
