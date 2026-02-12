import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Badge,
  Banner,
  IndexTable,
  InlineStack,
  Button,
  Collapsible,
  Box,
  Divider,
  ProgressBar,
} from "@shopify/polaris";
import { useState } from "react";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { updateProductInShopify } from "../services/shopify/products";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const jobId = params.id;

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      items: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!job || job.shopDomain !== session.shop) {
    throw new Response("Job not found", { status: 404 });
  }

  return json({ job });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const jobId = params.id!;

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { items: true },
  });

  if (!job || job.shopDomain !== session.shop) {
    throw new Response("Job not found", { status: 404 });
  }

  if (intent === "publish_all") {
    const fields = JSON.parse(job.generateFields) as string[];
    const generatedItems = job.items.filter(
      (item) => item.status === "generated",
    );

    for (const item of generatedItems) {
      try {
        const data: {
          descriptionHtml?: string;
          seoTitle?: string;
          seoDescription?: string;
          imageAltTexts?: Array<{ imageId: string; altText: string }>;
        } = {};

        if (fields.includes("description") && item.generatedDescription) {
          data.descriptionHtml = item.generatedDescription;
        }
        if (fields.includes("seoTitle") && item.generatedSeoTitle) {
          data.seoTitle = item.generatedSeoTitle;
        }
        if (fields.includes("seoDescription") && item.generatedSeoDesc) {
          data.seoDescription = item.generatedSeoDesc;
        }
        if (fields.includes("altText") && item.generatedAltTexts) {
          const altTexts = JSON.parse(item.generatedAltTexts) as Record<
            string,
            string
          >;
          data.imageAltTexts = Object.entries(altTexts).map(
            ([_key, altText]) => ({
              imageId: _key,
              altText,
            }),
          );
        }

        const dbSession = await prisma.session.findFirst({
          where: { shop: job.shopDomain },
        });
        if (!dbSession) throw new Error("No session found");

        await updateProductInShopify(
          dbSession.accessToken,
          job.shopDomain,
          item.shopifyProductId,
          data,
        );

        await prisma.jobItem.update({
          where: { id: item.id },
          data: { status: "published" },
        });

        await new Promise((resolve) => setTimeout(resolve, 250));
      } catch (error) {
        await prisma.jobItem.update({
          where: { id: item.id },
          data: {
            status: "failed",
            errorMessage:
              error instanceof Error
                ? error.message
                : "Failed to publish to Shopify",
          },
        });
      }
    }

    return redirect(`/app/jobs/${jobId}`);
  }

  if (intent === "publish_item") {
    const itemId = formData.get("itemId") as string;
    const item = job.items.find((i) => i.id === itemId);
    if (!item) return json({ error: "Item not found" }, { status: 404 });

    const fields = JSON.parse(job.generateFields) as string[];
    const data: {
      descriptionHtml?: string;
      seoTitle?: string;
      seoDescription?: string;
    } = {};

    if (fields.includes("description") && item.generatedDescription) {
      data.descriptionHtml = item.generatedDescription;
    }
    if (fields.includes("seoTitle") && item.generatedSeoTitle) {
      data.seoTitle = item.generatedSeoTitle;
    }
    if (fields.includes("seoDescription") && item.generatedSeoDesc) {
      data.seoDescription = item.generatedSeoDesc;
    }

    const dbSession = await prisma.session.findFirst({
      where: { shop: job.shopDomain },
    });
    if (!dbSession)
      return json({ error: "No session found" }, { status: 500 });

    try {
      await updateProductInShopify(
        dbSession.accessToken,
        job.shopDomain,
        item.shopifyProductId,
        data,
      );

      await prisma.jobItem.update({
        where: { id: item.id },
        data: { status: "published" },
      });
    } catch (error) {
      return json(
        {
          error:
            error instanceof Error ? error.message : "Failed to publish",
        },
        { status: 500 },
      );
    }

    return redirect(`/app/jobs/${jobId}`);
  }

  return json({ error: "Unknown action" }, { status: 400 });
};

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "pending":
      return <Badge>Pending</Badge>;
    case "processing":
      return <Badge tone="attention">Processing</Badge>;
    case "generated":
      return <Badge tone="info">Ready to Review</Badge>;
    case "approved":
      return <Badge tone="info">Approved</Badge>;
    case "published":
      return <Badge tone="success">Published</Badge>;
    case "failed":
      return <Badge tone="critical">Failed</Badge>;
    case "skipped":
      return <Badge>Skipped</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

function JobStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "pending":
      return <Badge>Pending</Badge>;
    case "processing":
      return <Badge tone="attention">Processing...</Badge>;
    case "completed":
      return <Badge tone="success">Completed</Badge>;
    case "failed":
      return <Badge tone="critical">Failed</Badge>;
    case "paused":
      return <Badge tone="warning">Paused</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

export default function JobDetailPage() {
  const { job } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isPublishing = navigation.state === "submitting";

  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleExpand = (itemId: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const generatedCount = job.items.filter(
    (i) => i.status === "generated",
  ).length;
  const publishedCount = job.items.filter(
    (i) => i.status === "published",
  ).length;
  const failedCount = job.items.filter((i) => i.status === "failed").length;
  const progress =
    job.totalProducts > 0
      ? Math.round((job.processedCount / job.totalProducts) * 100)
      : 0;

  const fields = JSON.parse(job.generateFields) as string[];

  const handlePublishAll = () => {
    const formData = new FormData();
    formData.set("intent", "publish_all");
    submit(formData, { method: "post" });
  };

  const handlePublishItem = (itemId: string) => {
    const formData = new FormData();
    formData.set("intent", "publish_item");
    formData.set("itemId", itemId);
    submit(formData, { method: "post" });
  };

  return (
    <Page
      title={`Job Results`}
      subtitle={`${job.totalProducts} product${job.totalProducts !== 1 ? "s" : ""} · Created ${new Date(job.createdAt).toLocaleString()}`}
      backAction={{ url: "/app/generate" }}
      primaryAction={
        generatedCount > 0
          ? {
              content: `Publish All (${generatedCount})`,
              onAction: handlePublishAll,
              loading: isPublishing,
            }
          : undefined
      }
    >
      <BlockStack gap="500">
        {/* Job status summary */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text as="h2" variant="headingMd">
                Status
              </Text>
              <JobStatusBadge status={job.status} />
            </InlineStack>

            <ProgressBar progress={progress} size="small" />

            <InlineStack gap="400">
              <Text as="span" variant="bodySm" tone="subdued">
                {job.processedCount} / {job.totalProducts} processed
              </Text>
              {generatedCount > 0 && (
                <Text as="span" variant="bodySm" tone="success">
                  {generatedCount} ready to publish
                </Text>
              )}
              {publishedCount > 0 && (
                <Text as="span" variant="bodySm" tone="success">
                  {publishedCount} published
                </Text>
              )}
              {failedCount > 0 && (
                <Text as="span" variant="bodySm" tone="critical">
                  {failedCount} failed
                </Text>
              )}
            </InlineStack>

            <Text as="p" variant="bodySm" tone="subdued">
              Fields: {fields.join(", ")} · Provider: {job.aiProvider}
            </Text>
          </BlockStack>
        </Card>

        {/* Error banner for all-failed jobs */}
        {failedCount === job.totalProducts && job.status === "completed" && (
          <Banner tone="critical" title="All items failed">
            <p>
              Check your AI provider settings. Make sure you have a valid API
              key configured in Settings.
            </p>
          </Banner>
        )}

        {/* Item results */}
        <Layout>
          <Layout.Section>
            <Card padding="0">
              <IndexTable
                resourceName={{ singular: "product", plural: "products" }}
                itemCount={job.items.length}
                headings={[
                  { title: "Product" },
                  { title: "Status" },
                  { title: "Actions" },
                ]}
                selectable={false}
              >
                {job.items.map((item, index) => (
                  <IndexTable.Row
                    id={item.id}
                    key={item.id}
                    position={index}
                  >
                    <IndexTable.Cell>
                      <Button
                        variant="plain"
                        onClick={() => toggleExpand(item.id)}
                      >
                        {item.productTitle}
                      </Button>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <StatusBadge status={item.status} />
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <InlineStack gap="200">
                        {item.status === "generated" && (
                          <Button
                            size="slim"
                            onClick={() => handlePublishItem(item.id)}
                            loading={isPublishing}
                          >
                            Publish
                          </Button>
                        )}
                        {item.status === "failed" && item.errorMessage && (
                          <Text as="span" variant="bodySm" tone="critical">
                            {item.errorMessage.substring(0, 80)}
                          </Text>
                        )}
                      </InlineStack>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Expanded item details */}
        {job.items
          .filter((item) => expandedItems.has(item.id))
          .map((item) => (
            <Card key={`detail-${item.id}`}>
              <BlockStack gap="400">
                <Text as="h3" variant="headingMd">
                  {item.productTitle}
                </Text>

                {item.generatedDescription && (
                  <BlockStack gap="200">
                    <Text as="h4" variant="headingSm">
                      Description
                    </Text>
                    <Box
                      padding="300"
                      background="bg-surface-secondary"
                      borderRadius="200"
                    >
                      <div
                        dangerouslySetInnerHTML={{
                          __html: item.generatedDescription,
                        }}
                      />
                    </Box>
                  </BlockStack>
                )}

                {item.generatedSeoTitle && (
                  <BlockStack gap="200">
                    <Text as="h4" variant="headingSm">
                      SEO Title
                    </Text>
                    <Box
                      padding="300"
                      background="bg-surface-secondary"
                      borderRadius="200"
                    >
                      <Text as="p" variant="bodyMd">
                        {item.generatedSeoTitle}
                      </Text>
                    </Box>
                  </BlockStack>
                )}

                {item.generatedSeoDesc && (
                  <BlockStack gap="200">
                    <Text as="h4" variant="headingSm">
                      Meta Description
                    </Text>
                    <Box
                      padding="300"
                      background="bg-surface-secondary"
                      borderRadius="200"
                    >
                      <Text as="p" variant="bodyMd">
                        {item.generatedSeoDesc}
                      </Text>
                    </Box>
                  </BlockStack>
                )}

                {item.generatedAltTexts && (
                  <BlockStack gap="200">
                    <Text as="h4" variant="headingSm">
                      Image Alt Texts
                    </Text>
                    <Box
                      padding="300"
                      background="bg-surface-secondary"
                      borderRadius="200"
                    >
                      {Object.entries(
                        JSON.parse(item.generatedAltTexts) as Record<
                          string,
                          string
                        >,
                      ).map(([key, text]) => (
                        <Text as="p" variant="bodySm" key={key}>
                          <strong>{key}:</strong> {text}
                        </Text>
                      ))}
                    </Box>
                  </BlockStack>
                )}

                {item.errorMessage && (
                  <Banner tone="critical">
                    <p>{item.errorMessage}</p>
                  </Banner>
                )}

                <Divider />

                <InlineStack gap="200">
                  {item.status === "generated" && (
                    <Button onClick={() => handlePublishItem(item.id)}>
                      Publish to Shopify
                    </Button>
                  )}
                  {item.status === "published" && (
                    <Badge tone="success">Published</Badge>
                  )}
                </InlineStack>
              </BlockStack>
            </Card>
          ))}
      </BlockStack>
    </Page>
  );
}
