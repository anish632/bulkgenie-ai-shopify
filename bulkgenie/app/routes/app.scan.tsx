import { useState, useCallback } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  useLoaderData,
  useSubmit,
  useNavigation,
  useActionData,
  useRevalidator,
} from "@remix-run/react";
import {
  Page,
  Card,
  BlockStack,
  Text,
  Button,
  InlineStack,
  Badge,
  Banner,
  EmptyState,
  IndexTable,
  useIndexResourceState,
  Truncate,
  TextField,
  Modal,
  DataTable,
  Divider,
  InlineGrid,
  Select,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ISSUE_LABELS, LOW_RISK_ISSUES } from "../services/catalog/scanner";
import type { IssueType } from "../services/catalog/scanner";
import { updateProductInShopify } from "../services/shopify/products";

// Suppress unused import warning — LOW_RISK_ISSUES used indirectly via constants export
void LOW_RISK_ISSUES;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const url = new URL(request.url);
  const filterStatus = url.searchParams.get("status") ?? "pending";
  const filterType = url.searchParams.get("type") ?? "";

  const latestReport = await prisma.scanReport.findFirst({
    where: { shopDomain },
    orderBy: { createdAt: "desc" },
  });

  if (!latestReport) {
    return json({
      report: null as null,
      issues: [] as never[],
      filterStatus,
      filterType,
      counts: {} as Record<string, number>,
    });
  }

  const whereClause: { scanReportId: string; status?: string; issueType?: string } = {
    scanReportId: latestReport.id,
  };
  if (filterStatus && filterStatus !== "all") whereClause.status = filterStatus;
  if (filterType) whereClause.issueType = filterType;

  const issues = await prisma.scanIssue.findMany({
    where: whereClause,
    orderBy: [{ severity: "asc" }, { issueType: "asc" }],
    take: 200,
  });

  const statusCounts = await prisma.scanIssue.groupBy({
    by: ["status"],
    where: { scanReportId: latestReport.id },
    _count: { status: true },
  });
  const counts: Record<string, number> = Object.fromEntries(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (statusCounts as any[]).map((r) => [r.status, r._count.status]),
  );

  return json({ report: latestReport, issues, filterStatus, filterType, counts });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  switch (intent) {
    case "approve": {
      const issueId = formData.get("issueId") as string;
      const editedValue = (formData.get("editedValue") as string) || null;
      await prisma.scanIssue.updateMany({
        where: { id: issueId, scanReport: { shopDomain } },
        data: { status: "approved", editedValue },
      });
      await syncReportCounts(issueId);
      return json({ ok: true });
    }

    case "reject": {
      const issueId = formData.get("issueId") as string;
      await prisma.scanIssue.updateMany({
        where: { id: issueId, scanReport: { shopDomain } },
        data: { status: "rejected" },
      });
      await syncReportCounts(issueId);
      return json({ ok: true });
    }

    case "bulk_approve": {
      const ids = JSON.parse(formData.get("issueIds") as string) as string[];
      await prisma.scanIssue.updateMany({
        where: { id: { in: ids }, scanReport: { shopDomain } },
        data: { status: "approved" },
      });
      if (ids[0]) await syncReportCounts(ids[0]);
      return json({ ok: true, approved: ids.length });
    }

    case "bulk_reject": {
      const ids = JSON.parse(formData.get("issueIds") as string) as string[];
      await prisma.scanIssue.updateMany({
        where: { id: { in: ids }, scanReport: { shopDomain } },
        data: { status: "rejected" },
      });
      if (ids[0]) await syncReportCounts(ids[0]);
      return json({ ok: true, rejected: ids.length });
    }

    case "publish_approved": {
      const scanReportId = formData.get("scanReportId") as string;
      const report = await prisma.scanReport.findFirst({
        where: { id: scanReportId, shopDomain },
      });
      if (!report) return json({ error: "Report not found" }, { status: 404 });

      const approved = await prisma.scanIssue.findMany({
        where: { scanReportId, status: "approved" },
      });
      if (!approved.length) return json({ ok: true, published: 0 });

      const sess = await prisma.session.findFirst({
        where: { shop: shopDomain, isOnline: false },
        orderBy: { id: "desc" },
      });
      if (!sess?.accessToken) {
        return json({ error: "No offline session found" }, { status: 500 });
      }

      const byProduct = new Map<string, typeof approved>();
      for (const issue of approved) {
        const list = byProduct.get(issue.shopifyProductId) ?? [];
        list.push(issue);
        byProduct.set(issue.shopifyProductId, list);
      }

      let published = 0;
      for (const [productId, productIssues] of byProduct) {
        const updateData: {
          descriptionHtml?: string;
          seoTitle?: string;
          seoDescription?: string;
          imageAltTexts?: Array<{ imageId: string; altText: string }>;
        } = {};

        for (const issue of productIssues) {
          const value = issue.editedValue ?? issue.proposedValue;
          if (!value) continue;
          if (issue.fieldName === "description") updateData.descriptionHtml = value;
          if (issue.fieldName === "seoTitle") updateData.seoTitle = value;
          if (issue.fieldName === "seoDescription") updateData.seoDescription = value;
          if (issue.fieldName === "altText" && issue.imageId) {
            updateData.imageAltTexts = [
              ...(updateData.imageAltTexts ?? []),
              { imageId: issue.imageId, altText: value },
            ];
          }
        }

        try {
          await updateProductInShopify(sess.accessToken, shopDomain, productId, updateData);
          await prisma.scanIssue.updateMany({
            where: { scanReportId, shopifyProductId: productId, status: "approved" },
            data: { status: "published" },
          });
          published++;
        } catch (err) {
          console.error(`[scan] publish failed for ${productId}:`, err);
        }

        await new Promise((r) => setTimeout(r, 250));
      }

      const publishedCount = await prisma.scanIssue.count({
        where: { scanReportId, status: "published" },
      });
      await prisma.scanReport.update({
        where: { id: scanReportId },
        data: { publishedCount },
      });

      return json({ ok: true, published });
    }

    case "run_scan": {
      const cronSecret = process.env.CRON_SECRET ?? "";
      const appUrl = process.env.SHOPIFY_APP_URL ?? "https://bulkgenie.dasgroupllc.com";
      fetch(`${appUrl}/api/cron/weekly-scan`, {
        headers: { Authorization: `Bearer ${cronSecret}` },
      }).catch(() => {});
      return json({ ok: true, message: "Scan started in background" });
    }

    default:
      return json({ error: "Unknown intent" }, { status: 400 });
  }
};

async function syncReportCounts(issueId: string) {
  const issue = await prisma.scanIssue.findUnique({
    where: { id: issueId },
    select: { scanReportId: true },
  });
  if (!issue) return;
  const [approved, rejected, published] = await Promise.all([
    prisma.scanIssue.count({ where: { scanReportId: issue.scanReportId, status: "approved" } }),
    prisma.scanIssue.count({ where: { scanReportId: issue.scanReportId, status: "rejected" } }),
    prisma.scanIssue.count({ where: { scanReportId: issue.scanReportId, status: "published" } }),
  ]);
  await prisma.scanReport.update({
    where: { id: issue.scanReportId },
    data: { approvedCount: approved, rejectedCount: rejected, publishedCount: published },
  });
}

// ---- UI helpers ----

function severityBadge(severity: string) {
  if (severity === "high") return <Badge tone="critical">High</Badge>;
  if (severity === "medium") return <Badge tone="warning">Medium</Badge>;
  return <Badge tone="info">Low</Badge>;
}

function statusBadge(status: string) {
  switch (status) {
    case "approved": return <Badge tone="success">Approved</Badge>;
    case "rejected": return <Badge tone="critical">Rejected</Badge>;
    case "published": return <Badge tone="success">Published</Badge>;
    case "fix_ready": return <Badge>Fix ready</Badge>;
    case "skipped": return <Badge tone="info">No AI fix</Badge>;
    default: return <Badge tone="attention">Pending</Badge>;
  }
}

interface EditState { issueId: string; value: string }

export default function ScanPage() {
  const { report, issues, filterStatus, filterType, counts } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const { revalidate } = useRevalidator();

  const [editState, setEditState] = useState<EditState | null>(null);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);

  const isSubmitting = navigation.state === "submitting";

  const { selectedResources, allResourcesSelected, handleSelectionChange, clearSelection } =
    useIndexResourceState(issues as Array<{ id: string }>);

  const handleApprove = useCallback(
    (issueId: string, editedValue?: string) => {
      const fd = new FormData();
      fd.set("intent", "approve");
      fd.set("issueId", issueId);
      if (editedValue !== undefined) fd.set("editedValue", editedValue);
      submit(fd, { method: "post" });
      setEditState(null);
    },
    [submit],
  );

  const handleReject = useCallback(
    (issueId: string) => {
      const fd = new FormData();
      fd.set("intent", "reject");
      fd.set("issueId", issueId);
      submit(fd, { method: "post" });
    },
    [submit],
  );

  const handleBulkApprove = useCallback(() => {
    const fd = new FormData();
    fd.set("intent", "bulk_approve");
    fd.set("issueIds", JSON.stringify(selectedResources));
    submit(fd, { method: "post" });
    clearSelection();
  }, [selectedResources, submit, clearSelection]);

  const handleBulkReject = useCallback(() => {
    const fd = new FormData();
    fd.set("intent", "bulk_reject");
    fd.set("issueIds", JSON.stringify(selectedResources));
    submit(fd, { method: "post" });
    clearSelection();
  }, [selectedResources, submit, clearSelection]);

  const handlePublish = useCallback(() => {
    if (!report) return;
    const fd = new FormData();
    fd.set("intent", "publish_approved");
    fd.set("scanReportId", report.id);
    submit(fd, { method: "post" });
    setPublishConfirmOpen(false);
  }, [report, submit]);

  const handleRunScan = useCallback(() => {
    const fd = new FormData();
    fd.set("intent", "run_scan");
    submit(fd, { method: "post" });
    setTimeout(revalidate, 3000);
  }, [submit, revalidate]);

  const approvedCount = counts?.approved ?? 0;

  // Filter controls — change URL params directly (simple full-page nav)
  const handleStatusChange = useCallback((value: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("status", value);
    if (filterType) url.searchParams.set("type", filterType);
    window.location.href = url.toString();
  }, [filterType]);

  const handleTypeChange = useCallback((value: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("status", filterStatus);
    if (value) url.searchParams.set("type", value);
    else url.searchParams.delete("type");
    window.location.href = url.toString();
  }, [filterStatus]);

  const issueTypeOptions = [
    { label: "All types", value: "" },
    ...Object.entries(ISSUE_LABELS).map(([value, label]) => ({ label, value })),
  ];

  const statusOptions = [
    { label: "All statuses", value: "all" },
    { label: "Pending", value: "pending" },
    { label: "Fix ready", value: "fix_ready" },
    { label: "Approved", value: "approved" },
    { label: "Rejected", value: "rejected" },
    { label: "Published", value: "published" },
  ];

  const rowMarkup = (issues as Array<{
    id: string;
    productTitle: string;
    issueType: string;
    severity: string;
    currentValue: string | null;
    proposedValue: string | null;
    editedValue: string | null;
    status: string;
    fieldName: string;
    imageId: string | null;
  }>).map((issue, index) => {
    const isEditing = editState?.issueId === issue.id;
    const displayValue = issue.editedValue ?? issue.proposedValue ?? "";

    return (
      <IndexTable.Row
        id={issue.id}
        key={issue.id}
        selected={selectedResources.includes(issue.id)}
        position={index}
      >
        <IndexTable.Cell>
          <Text as="span" variant="bodyMd" fontWeight="semibold">
            <Truncate>{issue.productTitle}</Truncate>
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <BlockStack gap="100">
            <Text as="span" variant="bodySm">
              {ISSUE_LABELS[issue.issueType as IssueType] ?? issue.issueType}
            </Text>
            {severityBadge(issue.severity)}
          </BlockStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" variant="bodySm" tone="subdued">
            <Truncate>{issue.currentValue || "—"}</Truncate>
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {isEditing && editState ? (
            <TextField
              label=""
              labelHidden
              value={editState.value}
              onChange={(v) => setEditState({ issueId: issue.id, value: v })}
              multiline={issue.fieldName === "description" ? 3 : 1}
              autoComplete="off"
              autoFocus
            />
          ) : (
            <Text as="span" variant="bodySm">
              <Truncate>{displayValue || "—"}</Truncate>
            </Text>
          )}
        </IndexTable.Cell>
        <IndexTable.Cell>{statusBadge(issue.status)}</IndexTable.Cell>
        <IndexTable.Cell>
          {issue.status !== "published" && issue.status !== "rejected" && (
            <InlineStack gap="200">
              {isEditing && editState ? (
                <>
                  <Button
                    size="micro"
                    variant="primary"
                    onClick={() => handleApprove(issue.id, editState.value)}
                    disabled={isSubmitting}
                  >
                    Save &amp; Approve
                  </Button>
                  <Button size="micro" onClick={() => setEditState(null)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  {(issue.status === "fix_ready" || issue.status === "approved") && (
                    <Button
                      size="micro"
                      onClick={() =>
                        setEditState({ issueId: issue.id, value: displayValue })
                      }
                    >
                      Edit
                    </Button>
                  )}
                  {issue.status !== "approved" && (
                    <Button
                      size="micro"
                      variant="primary"
                      onClick={() => handleApprove(issue.id)}
                      disabled={isSubmitting || !issue.proposedValue}
                    >
                      Approve
                    </Button>
                  )}
                  <Button
                    size="micro"
                    tone="critical"
                    onClick={() => handleReject(issue.id)}
                    disabled={isSubmitting}
                  >
                    Reject
                  </Button>
                </>
              )}
            </InlineStack>
          )}
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  if (!report) {
    return (
      <Page
        title="SEO Scan Queue"
        backAction={{ url: "/app" }}
        primaryAction={{
          content: "Run scan now",
          onAction: handleRunScan,
          loading: isSubmitting,
        }}
      >
        <EmptyState
          heading="No scans yet"
          image=""
          action={{ content: "Run scan now", onAction: handleRunScan }}
        >
          <p>
            Enable weekly scans in Settings, or run a manual scan to detect SEO
            issues across your catalog.
          </p>
        </EmptyState>
      </Page>
    );
  }

  const publishedCount =
    "published" in
    (actionData && typeof actionData === "object" ? actionData : {})
      ? (actionData as unknown as { published: number }).published
      : null;

  return (
    <Page
      title="SEO Scan Queue"
      backAction={{ url: "/app" }}
      primaryAction={{
        content: "Run scan now",
        onAction: handleRunScan,
        loading:
          isSubmitting &&
          (navigation.formData?.get("intent") as string) === "run_scan",
      }}
      secondaryActions={[{ content: "History", url: "/app/reports" }]}
    >
      <BlockStack gap="500">
        {actionData && "message" in actionData && (
          <Banner tone="success">
            {(actionData as { message: string }).message}
          </Banner>
        )}
        {actionData && "error" in actionData && (
          <Banner tone="critical">
            {(actionData as { error: string }).error}
          </Banner>
        )}
        {publishedCount !== null && publishedCount > 0 && (
          <Banner tone="success">
            Published {publishedCount} product update{publishedCount === 1 ? "" : "s"} to Shopify.
          </Banner>
        )}

        {/* Scan summary card */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="050">
                <Text as="h2" variant="headingMd">Latest scan</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {new Date(report.createdAt).toLocaleDateString(undefined, {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                  {report.status === "running" && " — running…"}
                </Text>
              </BlockStack>
              {approvedCount > 0 && (
                <Button
                  variant="primary"
                  onClick={() => setPublishConfirmOpen(true)}
                  loading={
                    isSubmitting &&
                    (navigation.formData?.get("intent") as string) ===
                      "publish_approved"
                  }
                >
                  {`Publish ${approvedCount} approved fix${approvedCount === 1 ? "" : "es"}`}
                </Button>
              )}
            </InlineStack>
            <Divider />
            <InlineGrid columns={4} gap="400">
              <BlockStack gap="100">
                <Text as="p" variant="headingLg">{report.productsScanned}</Text>
                <Text as="p" variant="bodySm" tone="subdued">Products scanned</Text>
              </BlockStack>
              <BlockStack gap="100">
                <Text as="p" variant="headingLg">{report.issuesFound}</Text>
                <Text as="p" variant="bodySm" tone="subdued">Issues found</Text>
              </BlockStack>
              <BlockStack gap="100">
                <Text as="p" variant="headingLg">{report.fixesGenerated}</Text>
                <Text as="p" variant="bodySm" tone="subdued">AI fixes generated</Text>
              </BlockStack>
              <BlockStack gap="100">
                <Text as="p" variant="headingLg">{report.publishedCount}</Text>
                <Text as="p" variant="bodySm" tone="subdued">Published</Text>
              </BlockStack>
            </InlineGrid>
          </BlockStack>
        </Card>

        {/* Filters + issues table */}
        <Card padding="0">
          <BlockStack gap="0">
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #e1e3e5" }}>
              <InlineStack gap="300" blockAlign="center">
                <div style={{ minWidth: 160 }}>
                  <Select
                    label="Status"
                    options={statusOptions}
                    value={filterStatus === "all" ? "all" : filterStatus}
                    onChange={handleStatusChange}
                    labelInline
                  />
                </div>
                <div style={{ minWidth: 220 }}>
                  <Select
                    label="Issue type"
                    options={issueTypeOptions}
                    value={filterType}
                    onChange={handleTypeChange}
                    labelInline
                  />
                </div>
                {(filterStatus !== "pending" || filterType) && (
                  <Button
                    variant="plain"
                    onClick={() => { window.location.href = "/app/scan"; }}
                  >
                    Clear filters
                  </Button>
                )}
              </InlineStack>
            </div>

            <IndexTable
              resourceName={{ singular: "issue", plural: "issues" }}
              itemCount={issues.length}
              selectedItemsCount={
                allResourcesSelected ? "All" : selectedResources.length
              }
              onSelectionChange={handleSelectionChange}
              headings={[
                { title: "Product" },
                { title: "Issue" },
                { title: "Current value" },
                { title: "Proposed fix" },
                { title: "Status" },
                { title: "Actions" },
              ]}
              bulkActions={[
                { content: "Approve selected", onAction: handleBulkApprove },
                { content: "Reject selected", onAction: handleBulkReject },
              ]}
              emptyState={
                <EmptyState heading="No issues in this view" image="">
                  <p>Try changing the filters above.</p>
                </EmptyState>
              }
            >
              {rowMarkup}
            </IndexTable>
          </BlockStack>
        </Card>

        <Modal
          open={publishConfirmOpen}
          onClose={() => setPublishConfirmOpen(false)}
          title="Publish approved fixes"
          primaryAction={{
            content: "Publish to Shopify",
            onAction: handlePublish,
          }}
          secondaryActions={[
            { content: "Cancel", onAction: () => setPublishConfirmOpen(false) },
          ]}
        >
          <Modal.Section>
            <Text as="p">
              This will publish {approvedCount} approved fix
              {approvedCount === 1 ? "" : "es"} to your live Shopify store. Are
              you sure?
            </Text>
          </Modal.Section>
        </Modal>
      </BlockStack>
    </Page>
  );
}
