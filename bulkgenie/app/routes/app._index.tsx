import { useCallback, useEffect } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  InlineStack,
  Badge,
  DataTable,
  EmptyState,
  InlineGrid,
  Banner,
  Divider,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { scoreProductContent, catalogGapSummary } from "../services/scoring";
import {
  DEMO_MISSING_ALT_TEXT,
  DEMO_MISSING_META_DESC,
  DEMO_WEAK_TITLES,
  DEMO_MISSING_DETAILS,
  DEMO_TOTAL_PRODUCTS,
  DEMO_REVIEW_ROWS,
  trackEvent,
} from "../services/demo";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { admin, session } = await authenticate.admin(request);
    const shopDomain = session.shop;

    const shop = await prisma.shop.upsert({
      where: { shopDomain },
      update: {},
      create: { shopDomain },
    });

    // Reset usage if billing cycle has passed (30 days)
    const now = new Date();
    const resetDate = new Date(shop.usageResetDate);
    const daysSinceReset = Math.floor(
      (now.getTime() - resetDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysSinceReset >= 30) {
      await prisma.shop.update({
        where: { shopDomain },
        data: { monthlyUsage: 0, usageResetDate: now },
      });
      shop.monthlyUsage = 0;
    }

    // Get recent jobs
    const recentJobs = await prisma.job.findMany({
      where: { shopDomain },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        _count: {
          select: { items: true },
        },
      },
    });

    // Proof metrics from job history (non-critical)
    let proofMetrics = { totalProcessed: 0, totalApproved: 0, totalPublished: 0 };
    try {
      const itemStatusCounts = await prisma.jobItem.groupBy({
        by: ["status"],
        where: { job: { shopDomain } },
        _count: { status: true },
      });
      const statusMap = Object.fromEntries(
        itemStatusCounts.map((r) => [r.status, r._count.status as number]),
      );
      proofMetrics = {
        totalProcessed: Object.values(statusMap).reduce((a, b) => a + b, 0),
        totalApproved: (statusMap["approved"] ?? 0) + (statusMap["published"] ?? 0),
        totalPublished: statusMap["published"] ?? 0,
      };
    } catch {
      // non-critical
    }

    // Fetch first 50 products for catalog health snapshot
    let gapSummary = null;
    try {
      const response = await admin.graphql(
        `#graphql
        query getCatalogHealth($first: Int!) {
          products(first: $first) {
            edges {
              node {
                descriptionHtml
                seo {
                  title
                  description
                }
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
            }
          }
        }`,
        { variables: { first: 50 } },
      );
      const responseJson = await response.json();
      if (responseJson.data?.products?.edges) {
        const gaps = responseJson.data.products.edges.map(
          (e: { node: Parameters<typeof scoreProductContent>[0] }) =>
            scoreProductContent(e.node),
        );
        gapSummary = {
          ...catalogGapSummary(gaps),
          hasMore: responseJson.data.products.pageInfo.hasNextPage,
        };
      }
    } catch {
      // Catalog health is non-critical; proceed without it
    }

    // Server-side analytics
    if (recentJobs.length === 0) {
      if (gapSummary && gapSummary.productsWithGaps > 0) {
        trackEvent("seo_gaps_found", {
          productsWithGaps: gapSummary.productsWithGaps,
          totalProducts: gapSummary.totalProducts,
          source: "dashboard_first_load",
        });
      } else {
        trackEvent("demo_catalog_scan_viewed", {
          demoProducts: DEMO_TOTAL_PRODUCTS,
        });
      }
    }

    return json({
      shop: {
        tier: shop.tier,
        monthlyUsage: shop.monthlyUsage,
      },
      hasApiKey: Boolean(shop.byokApiKey),
      recentJobs,
      gapSummary,
      proofMetrics,
    });
  } catch (error) {
    console.error("[app._index] Loader error:", error);
    throw new Response("Failed to load dashboard data", {
      status: 500,
      statusText: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export default function Index() {
  const { shop, hasApiKey, recentJobs, gapSummary, proofMetrics } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const isFirstSession = recentJobs.length === 0;
  const hasRealGaps = Boolean(gapSummary && gapSummary.productsWithGaps > 0);

  // Client-side analytics (one-time on mount)
  useEffect(() => {
    if (isFirstSession && !hasRealGaps) {
      console.log(JSON.stringify({ event: "demo_catalog_scan_viewed", ts: new Date().toISOString() }));
    }
    if (hasRealGaps) {
      console.log(JSON.stringify({
        event: "seo_gaps_found",
        productsWithGaps: gapSummary?.productsWithGaps,
        totalProducts: gapSummary?.totalProducts,
        ts: new Date().toISOString(),
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentional: page-view analytics fires once on mount

  const handleScanClick = useCallback(() => {
    console.log(JSON.stringify({ event: "scan_catalog_clicked", source: "dashboard_demo", ts: new Date().toISOString() }));
    navigate("/app/generate");
  }, [navigate]);

  const statusBadge = useCallback((status: string) => {
    switch (status) {
      case "completed":
        return <Badge tone="success">Completed</Badge>;
      case "processing":
        return <Badge tone="attention">Processing</Badge>;
      case "failed":
        return <Badge tone="critical">Failed</Badge>;
      case "paused":
        return <Badge tone="warning">Paused</Badge>;
      default:
        return <Badge>Pending</Badge>;
    }
  }, []);

  const tierLimits: Record<string, number> = {
    free: 10,
    starter: 100,
    growth: 500,
    scale: Infinity,
  };

  const limit = tierLimits[shop.tier] || 10;
  const remaining = limit === Infinity ? Infinity : Math.max(0, limit - shop.monthlyUsage);

  const jobRows = recentJobs.map((job: (typeof recentJobs)[0]) => [
    new Date(job.createdAt).toLocaleDateString(),
    job._count.items,
    `${job.processedCount}/${job.totalProducts}`,
    statusBadge(job.status),
    <Button
      key={job.id}
      variant="plain"
      onClick={() => navigate(`/app/jobs/${job.id}`)}
    >
      View
    </Button>,
  ]);

  const demoRows = DEMO_REVIEW_ROWS.map((row) => [
    row.product,
    row.field,
    <Text key={`curr-${row.product}`} as="span" variant="bodySm" tone="subdued">
      {row.currentValue}
    </Text>,
    <Text key={`sugg-${row.product}`} as="span" variant="bodySm">
      {row.suggestedValue}
    </Text>,
  ]);

  return (
    <Page>
      <TitleBar title="BulkGenie AI" />
      <BlockStack gap="500">
        {!hasApiKey && (
          <Banner
            tone="warning"
            title="Add an AI provider key before your first batch"
            action={{ content: "Add API key", url: "/app/settings" }}
          >
            <p>
              BulkGenie uses your own Anthropic, OpenAI, Mistral, or Kimi key.
              The key is encrypted before storage, and generated product copy
              stays in review until you publish it.
            </p>
          </Banner>
        )}

        {/* First-value success state — real gaps found, no jobs started yet */}
        {isFirstSession && hasRealGaps && gapSummary && (
          <Banner
            tone="success"
            title={`We found ${gapSummary.productsWithGaps} product page gaps in your catalog`}
            action={{ content: "Fix content gaps", onAction: handleScanClick }}
          >
            <p>
              Scan your catalog to generate draft fixes for review.
              Every change is staged for your approval before anything is published.
            </p>
          </Banner>
        )}

        {/* Catalog Health (real data) */}
        {gapSummary && gapSummary.productsWithGaps > 0 && (
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    Catalog content gaps
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    {gapSummary.productsWithGaps} of{" "}
                    {gapSummary.totalProducts}
                    {gapSummary.hasMore ? "+" : ""} products checked have
                    missing or weak content
                  </Text>
                </BlockStack>
                <Button
                  variant="primary"
                  onClick={() => navigate("/app/generate")}
                >
                  Fix content gaps
                </Button>
              </InlineStack>
              <Divider />
              <InlineGrid columns={4} gap="400">
                {gapSummary.missingSeoTitleCount > 0 && (
                  <BlockStack gap="100">
                    <Text as="p" variant="headingLg" tone="critical">
                      {gapSummary.missingSeoTitleCount}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Missing SEO title
                    </Text>
                  </BlockStack>
                )}
                {gapSummary.missingSeoDescriptionCount > 0 && (
                  <BlockStack gap="100">
                    <Text as="p" variant="headingLg" tone="critical">
                      {gapSummary.missingSeoDescriptionCount}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Missing meta description
                    </Text>
                  </BlockStack>
                )}
                {(gapSummary.missingDescriptionCount > 0 ||
                  gapSummary.thinDescriptionCount > 0) && (
                  <BlockStack gap="100">
                    <Text as="p" variant="headingLg" tone="caution">
                      {gapSummary.missingDescriptionCount +
                        gapSummary.thinDescriptionCount}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Missing or thin description
                    </Text>
                  </BlockStack>
                )}
                {gapSummary.productsWithMissingAltText > 0 && (
                  <BlockStack gap="100">
                    <Text as="p" variant="headingLg" tone="caution">
                      {gapSummary.productsWithMissingAltText}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Images without alt text
                    </Text>
                  </BlockStack>
                )}
              </InlineGrid>
            </BlockStack>
          </Card>
        )}

        {gapSummary && gapSummary.productsWithGaps === 0 && (
          <Banner tone="success" title="Your catalog looks complete">
            <p>
              All {gapSummary.totalProducts} products checked have descriptions,
              SEO titles, meta descriptions, and image alt text.
            </p>
          </Banner>
        )}

        {/* Demo scan card — shown only when no jobs exist */}
        {isFirstSession && (
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    {hasRealGaps
                      ? "What the review looks like"
                      : "Sample catalog scan"}
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    {hasRealGaps
                      ? "BulkGenie stages every fix for your review — approve or edit before publishing."
                      : "Scan your real catalog to see your actual gaps. This example is based on a typical 86-product store."}
                  </Text>
                </BlockStack>
                {!hasRealGaps && (
                  <Badge tone="info">Sample data</Badge>
                )}
              </InlineStack>

              {!hasRealGaps && (
                <>
                  <InlineGrid columns={4} gap="400">
                    <BlockStack gap="100">
                      <Text as="p" variant="headingLg" tone="caution">
                        {DEMO_MISSING_ALT_TEXT}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Image alt text gaps
                      </Text>
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="p" variant="headingLg" tone="critical">
                        {DEMO_MISSING_META_DESC}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Missing meta descriptions
                      </Text>
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="p" variant="headingLg" tone="critical">
                        {DEMO_WEAK_TITLES}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Weak product titles
                      </Text>
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="p" variant="headingLg" tone="caution">
                        {DEMO_MISSING_DETAILS}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Missing key details
                      </Text>
                    </BlockStack>
                  </InlineGrid>
                  <Divider />
                </>
              )}

              <Text as="h3" variant="headingSm" tone="subdued">
                Review every row before publishing — approve, edit, or skip:
              </Text>

              <DataTable
                columnContentTypes={["text", "text", "text", "text"]}
                headings={["Product", "Field", "Current value", "Suggested value"]}
                rows={demoRows}
              />

              <InlineStack gap="300">
                <Button variant="primary" onClick={handleScanClick}>
                  Scan my catalog
                </Button>
                <Button onClick={handleScanClick}>
                  Find my SEO gaps
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        )}

        <Layout>
          <Layout.Section>
            <InlineGrid columns={proofMetrics.totalPublished > 0 ? 5 : 3} gap="400">
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm" tone="subdued">
                    Products This Month
                  </Text>
                  <Text as="p" variant="headingLg">
                    {shop.monthlyUsage}
                  </Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm" tone="subdued">
                    Remaining
                  </Text>
                  <Text as="p" variant="headingLg">
                    {remaining === Infinity
                      ? "Unlimited"
                      : `${remaining}`}
                  </Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm" tone="subdued">
                    Plan
                  </Text>
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="p" variant="headingLg">
                      {shop.tier.charAt(0).toUpperCase() + shop.tier.slice(1)}
                    </Text>
                    {shop.tier === "free" && (
                      <Button
                        variant="plain"
                        onClick={() => navigate("/app/billing")}
                      >
                        Upgrade
                      </Button>
                    )}
                  </InlineStack>
                </BlockStack>
              </Card>
              {proofMetrics.totalPublished > 0 && (
                <>
                  <Card>
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingSm" tone="subdued">
                        Rows Reviewed
                      </Text>
                      <Text as="p" variant="headingLg">
                        {proofMetrics.totalApproved}
                      </Text>
                    </BlockStack>
                  </Card>
                  <Card>
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingSm" tone="subdued">
                        Changes Published
                      </Text>
                      <Text as="p" variant="headingLg" tone="success">
                        {proofMetrics.totalPublished}
                      </Text>
                    </BlockStack>
                  </Card>
                </>
              )}
            </InlineGrid>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Recent Jobs
                  </Text>
                  <Button
                    variant="primary"
                    onClick={() => navigate("/app/generate")}
                  >
                    Scan &amp; Fix Products
                  </Button>
                </InlineStack>

                {recentJobs.length === 0 ? (
                  <EmptyState
                    heading="No jobs yet"
                    image=""
                    action={{
                      content: hasApiKey
                        ? "Start your first scan"
                        : "Add API key first",
                      url: hasApiKey ? "/app/generate" : "/app/settings",
                    }}
                  >
                    <p>
                      Scan your catalog above to generate review-ready drafts.
                      Each fix stays staged until you approve and publish it.
                    </p>
                  </EmptyState>
                ) : (
                  <DataTable
                    columnContentTypes={[
                      "text",
                      "numeric",
                      "text",
                      "text",
                      "text",
                    ]}
                    headings={[
                      "Date",
                      "Products",
                      "Progress",
                      "Status",
                      "",
                    ]}
                    rows={jobRows}
                  />
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
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
    <Page title="Dashboard Error">
      <Banner tone="critical" title="Error loading dashboard">
        <p>{errorMessage}</p>
      </Banner>
      <BlockStack gap="400">
        <Button url="/app">Refresh</Button>
      </BlockStack>
    </Page>
  );
}
