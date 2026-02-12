import { useCallback } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
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
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  // Ensure shop record exists
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

  return json({
    shop,
    recentJobs,
  });
};

export default function Index() {
  const { shop, recentJobs } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

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

  const jobRows = recentJobs.map((job) => [
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

  return (
    <Page>
      <TitleBar title="BulkGenie AI" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <InlineGrid columns={3} gap="400">
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
                    {limit === Infinity
                      ? "Unlimited"
                      : `${Math.max(0, limit - shop.monthlyUsage)}`}
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
                    Start New Job
                  </Button>
                </InlineStack>

                {recentJobs.length === 0 ? (
                  <EmptyState
                    heading="No jobs yet"
                    image=""
                  >
                    <p>
                      Select products and generate AI content to get started.
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
