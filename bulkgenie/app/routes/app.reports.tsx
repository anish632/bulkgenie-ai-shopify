import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Card,
  BlockStack,
  Text,
  Button,
  Badge,
  DataTable,
  EmptyState,
  InlineStack,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";

interface ScanReportRow {
  id: string;
  status: string;
  productsScanned: number;
  issuesFound: number;
  fixesGenerated: number;
  approvedCount: number;
  rejectedCount: number;
  publishedCount: number;
  createdAt: Date | string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const reports = (await prisma.scanReport.findMany({
    where: { shopDomain },
    orderBy: { createdAt: "desc" },
    take: 26,
  })) as ScanReportRow[];

  return json({ reports });
};

function statusBadge(status: string) {
  switch (status) {
    case "completed": return <Badge tone="success">Completed</Badge>;
    case "running": return <Badge tone="attention">Running</Badge>;
    case "failed": return <Badge tone="critical">Failed</Badge>;
    default: return <Badge>Pending</Badge>;
  }
}

export default function ReportsPage() {
  const { reports } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const rows = reports.map((r) => [
    new Date(r.createdAt).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }),
    r.productsScanned,
    r.issuesFound,
    r.fixesGenerated,
    r.approvedCount,
    r.rejectedCount,
    r.publishedCount,
    statusBadge(r.status),
    <Button
      key={r.id}
      variant="plain"
      onClick={() => navigate(`/app/scan?reportId=${r.id}`)}
    >
      View
    </Button>,
  ]);

  return (
    <Page title="Scan History" backAction={{ url: "/app/scan" }}>
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  Weekly scan reports
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Each row represents one catalog scan. Enable weekly scans in
                  Settings to run automatically.
                </Text>
              </BlockStack>
              <Button url="/app/scan">Review queue</Button>
            </InlineStack>

            {reports.length === 0 ? (
              <EmptyState heading="No scans yet" image="">
                <p>
                  Run your first scan from the SEO Scan Queue page, or enable
                  weekly scans in Settings.
                </p>
              </EmptyState>
            ) : (
              <DataTable
                columnContentTypes={[
                  "text",
                  "numeric",
                  "numeric",
                  "numeric",
                  "numeric",
                  "numeric",
                  "numeric",
                  "text",
                  "text",
                ]}
                headings={[
                  "Date",
                  "Scanned",
                  "Issues",
                  "Fixes",
                  "Approved",
                  "Rejected",
                  "Published",
                  "Status",
                  "",
                ]}
                rows={rows}
              />
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
