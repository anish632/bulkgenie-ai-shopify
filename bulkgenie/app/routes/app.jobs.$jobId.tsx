import { useState, useEffect, useCallback } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  useLoaderData,
  useSubmit,
  useRevalidator,
  useActionData,
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
  TextField,
  ProgressBar,
  Banner,
  Modal,
  useIndexResourceState,
  Thumbnail,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { ImageIcon } from "@shopify/polaris-icons";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { updateProductInShopify } from "../services/shopify/products";
import { processJobInline } from "../services/queue/inline-processor.server";

interface JobItemData {
  id: string;
  shopifyProductId: string;
  productTitle: string;
  status: string;
  originalDescription: string | null;
  originalSeoTitle: string | null;
  originalSeoDesc: string | null;
  generatedDescription: string | null;
  generatedSeoTitle: string | null;
  generatedSeoDesc: string | null;
  editedDescription: string | null;
  editedSeoTitle: string | null;
  editedSeoDesc: string | null;
  errorMessage: string | null;
}

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { jobId } = params;

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!job || job.shopDomain !== session.shop) {
    throw new Response("Job not found", { status: 404 });
  }

  return json({ job });
};

export const action = async ({ params, request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { jobId } = params;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { items: true },
  });

  if (!job || job.shopDomain !== session.shop) {
    return json({ error: "Job not found" }, { status: 404 });
  }

  const shopSession = await prisma.session.findFirst({
    where: { shop: session.shop },
  });
  if (!shopSession) {
    return json({ error: "Session not found" }, { status: 500 });
  }

  switch (intent) {
    case "approve_item": {
      const itemId = formData.get("itemId") as string;
      await prisma.jobItem.update({
        where: { id: itemId },
        data: { status: "approved" },
      });
      return json({ success: true });
    }

    case "approve_all": {
      await prisma.jobItem.updateMany({
        where: { jobId: job.id, status: "generated" },
        data: { status: "approved" },
      });
      return json({ success: true });
    }

    case "edit_item": {
      const itemId = formData.get("itemId") as string;
      const field = formData.get("field") as string;
      const value = formData.get("value") as string;

      const updateData: Record<string, string> = {};
      switch (field) {
        case "description":
          updateData.editedDescription = value;
          break;
        case "seoTitle":
          updateData.editedSeoTitle = value;
          break;
        case "seoDescription":
          updateData.editedSeoDesc = value;
          break;
      }

      await prisma.jobItem.update({
        where: { id: itemId },
        data: updateData,
      });
      return json({ success: true });
    }

    case "publish_approved": {
      const approvedItems = job.items.filter(
        (item) => item.status === "approved",
      );
      let publishedCount = 0;
      const errors: string[] = [];

      for (const item of approvedItems) {
        try {
          const desc =
            item.editedDescription ??
            item.generatedDescription ??
            undefined;
          const seoTitle =
            item.editedSeoTitle ?? item.generatedSeoTitle ?? undefined;
          const seoDesc =
            item.editedSeoDesc ?? item.generatedSeoDesc ?? undefined;

          await updateProductInShopify(
            shopSession.accessToken,
            session.shop,
            item.shopifyProductId,
            {
              descriptionHtml: desc,
              seoTitle: seoTitle,
              seoDescription: seoDesc,
            },
          );

          await prisma.jobItem.update({
            where: { id: item.id },
            data: { status: "published" },
          });
          publishedCount++;

          // Rate limit between Shopify API calls
          await new Promise((resolve) => setTimeout(resolve, 250));
        } catch (error) {
          const msg =
            error instanceof Error ? error.message : "Unknown error";
          errors.push(`${item.productTitle}: ${msg}`);
          await prisma.jobItem.update({
            where: { id: item.id },
            data: { status: "failed", errorMessage: msg },
          });
        }
      }

      return json({
        success: true,
        published: publishedCount,
        errors,
      });
    }

    case "undo_item": {
      const itemId = formData.get("itemId") as string;
      const item = job.items.find((i) => i.id === itemId);
      if (!item || item.status !== "published") {
        return json({ error: "Item not published" }, { status: 400 });
      }

      await updateProductInShopify(
        shopSession.accessToken,
        session.shop,
        item.shopifyProductId,
        {
          descriptionHtml: item.originalDescription || undefined,
          seoTitle: item.originalSeoTitle || undefined,
          seoDescription: item.originalSeoDesc || undefined,
        },
      );

      await prisma.jobItem.update({
        where: { id: itemId },
        data: { status: "generated" },
      });

      return json({ success: true });
    }

    case "regenerate_item": {
      const itemId = formData.get("itemId") as string;
      await prisma.jobItem.update({
        where: { id: itemId },
        data: {
          status: "pending",
          generatedDescription: null,
          generatedSeoTitle: null,
          generatedSeoDesc: null,
          generatedAltTexts: null,
          editedDescription: null,
          editedSeoTitle: null,
          editedSeoDesc: null,
          editedAltTexts: null,
          errorMessage: null,
        },
      });

      // Reset job status and re-process
      await prisma.job.update({
        where: { id: job.id },
        data: { status: "pending" },
      });

      // Fire-and-forget: process inline without blocking the response
      processJobInline(job.id).catch((err) =>
        console.error(`Regeneration failed for job ${job.id}:`, err),
      );

      return json({ success: true });
    }

    case "pause_job": {
      await prisma.job.update({
        where: { id: job.id },
        data: { status: "paused" },
      });
      return json({ success: true });
    }

    case "skip_item": {
      const itemId = formData.get("itemId") as string;
      await prisma.jobItem.update({
        where: { id: itemId },
        data: { status: "skipped" },
      });
      return json({ success: true });
    }

    default:
      return json({ error: "Unknown action" }, { status: 400 });
  }
};

export default function JobReviewPage() {
  const { job } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const revalidator = useRevalidator();
  const shopify = useAppBridge();

  const isProcessing =
    job.status === "processing" || job.status === "pending";
  const progressPercent =
    job.totalProducts > 0
      ? Math.round((job.processedCount / job.totalProducts) * 100)
      : 0;

  // Poll while processing
  useEffect(() => {
    if (!isProcessing) return;
    const interval = setInterval(() => {
      revalidator.revalidate();
    }, 3000);
    return () => clearInterval(interval);
  }, [isProcessing, revalidator]);

  // Show toast on publish
  useEffect(() => {
    if (actionData && "published" in actionData) {
      shopify.toast.show(`Published ${actionData.published} products`);
    }
  }, [actionData, shopify]);

  const [editingCell, setEditingCell] = useState<{
    itemId: string;
    field: string;
    value: string;
  } | null>(null);

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(job.items);

  const handleApproveItem = useCallback(
    (itemId: string) => {
      const formData = new FormData();
      formData.set("intent", "approve_item");
      formData.set("itemId", itemId);
      submit(formData, { method: "post" });
    },
    [submit],
  );

  const handleApproveAll = useCallback(() => {
    const formData = new FormData();
    formData.set("intent", "approve_all");
    submit(formData, { method: "post" });
  }, [submit]);

  const handlePublish = useCallback(() => {
    const formData = new FormData();
    formData.set("intent", "publish_approved");
    submit(formData, { method: "post" });
  }, [submit]);

  const handleRegenerateItem = useCallback(
    (itemId: string) => {
      const formData = new FormData();
      formData.set("intent", "regenerate_item");
      formData.set("itemId", itemId);
      submit(formData, { method: "post" });
    },
    [submit],
  );

  const handleUndoItem = useCallback(
    (itemId: string) => {
      const formData = new FormData();
      formData.set("intent", "undo_item");
      formData.set("itemId", itemId);
      submit(formData, { method: "post" });
    },
    [submit],
  );

  const handleSkipItem = useCallback(
    (itemId: string) => {
      const formData = new FormData();
      formData.set("intent", "skip_item");
      formData.set("itemId", itemId);
      submit(formData, { method: "post" });
    },
    [submit],
  );

  const handleSaveEdit = useCallback(() => {
    if (!editingCell) return;
    const formData = new FormData();
    formData.set("intent", "edit_item");
    formData.set("itemId", editingCell.itemId);
    formData.set("field", editingCell.field);
    formData.set("value", editingCell.value);
    submit(formData, { method: "post" });
    setEditingCell(null);
  }, [editingCell, submit]);

  const handlePause = useCallback(() => {
    const formData = new FormData();
    formData.set("intent", "pause_job");
    submit(formData, { method: "post" });
  }, [submit]);

  const statusBadge = (status: string) => {
    switch (status) {
      case "generated":
        return <Badge tone="info">Generated</Badge>;
      case "approved":
        return <Badge tone="success">Approved</Badge>;
      case "published":
        return <Badge tone="success">Published</Badge>;
      case "processing":
        return <Badge tone="attention">Processing</Badge>;
      case "failed":
        return <Badge tone="critical">Failed</Badge>;
      case "skipped":
        return <Badge>Skipped</Badge>;
      default:
        return <Badge>Pending</Badge>;
    }
  };

  const getDisplayValue = (
    item: JobItemData,
    field: "description" | "seoTitle" | "seoDescription",
  ) => {
    const editedMap = {
      description: item.editedDescription,
      seoTitle: item.editedSeoTitle,
      seoDescription: item.editedSeoDesc,
    };
    const generatedMap = {
      description: item.generatedDescription,
      seoTitle: item.generatedSeoTitle,
      seoDescription: item.generatedSeoDesc,
    };
    return editedMap[field] ?? generatedMap[field] ?? "";
  };

  const approvedCount = job.items.filter(
    (i: JobItemData) => i.status === "approved",
  ).length;
  const generatedCount = job.items.filter(
    (i: JobItemData) => i.status === "generated",
  ).length;
  const publishedCount = job.items.filter(
    (i: JobItemData) => i.status === "published",
  ).length;

  const rowMarkup = job.items.map((item: JobItemData, index: number) => {
    const descValue = getDisplayValue(item, "description");
    const seoTitleValue = getDisplayValue(item, "seoTitle");
    const seoDescValue = getDisplayValue(item, "seoDescription");

    return (
      <IndexTable.Row
        id={item.id}
        key={item.id}
        selected={selectedResources.includes(item.id)}
        position={index}
        tone={
          item.status === "approved" || item.status === "published"
            ? "success"
            : item.status === "failed"
              ? "critical"
              : undefined
        }
      >
        <IndexTable.Cell>
          <InlineStack gap="200" blockAlign="center">
            <Text as="span" variant="bodyMd" fontWeight="semibold">
              {item.productTitle}
            </Text>
            {statusBadge(item.status)}
          </InlineStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {editingCell?.itemId === item.id &&
          editingCell.field === "description" ? (
            <BlockStack gap="200">
              <TextField
                label=""
                value={editingCell.value}
                onChange={(v) =>
                  setEditingCell({ ...editingCell, value: v })
                }
                multiline={3}
                autoComplete="off"
              />
              <InlineStack gap="200">
                <Button size="micro" onClick={handleSaveEdit}>
                  Save
                </Button>
                <Button
                  size="micro"
                  variant="plain"
                  onClick={() => setEditingCell(null)}
                >
                  Cancel
                </Button>
              </InlineStack>
            </BlockStack>
          ) : (
            <div
              style={{ cursor: "pointer" }}
              onClick={() =>
                item.status === "generated" || item.status === "approved"
                  ? setEditingCell({
                      itemId: item.id,
                      field: "description",
                      value: descValue,
                    })
                  : undefined
              }
            >
              <Text as="span" variant="bodyMd" truncate>
                {descValue
                  ? descValue.replace(/<[^>]*>/g, "").substring(0, 100) +
                    (descValue.length > 100 ? "..." : "")
                  : "—"}
              </Text>
            </div>
          )}
        </IndexTable.Cell>
        <IndexTable.Cell>
          {editingCell?.itemId === item.id &&
          editingCell.field === "seoTitle" ? (
            <BlockStack gap="200">
              <TextField
                label=""
                value={editingCell.value}
                onChange={(v) =>
                  setEditingCell({ ...editingCell, value: v })
                }
                autoComplete="off"
              />
              <InlineStack gap="200">
                <Text
                  as="span"
                  variant="bodySm"
                  tone={
                    editingCell.value.length > 70 ? "critical" : "subdued"
                  }
                >
                  {editingCell.value.length}/70
                </Text>
                <Button size="micro" onClick={handleSaveEdit}>
                  Save
                </Button>
                <Button
                  size="micro"
                  variant="plain"
                  onClick={() => setEditingCell(null)}
                >
                  Cancel
                </Button>
              </InlineStack>
            </BlockStack>
          ) : (
            <div
              style={{ cursor: "pointer" }}
              onClick={() =>
                item.status === "generated" || item.status === "approved"
                  ? setEditingCell({
                      itemId: item.id,
                      field: "seoTitle",
                      value: seoTitleValue,
                    })
                  : undefined
              }
            >
              <BlockStack gap="100">
                <Text as="span" variant="bodyMd" truncate>
                  {seoTitleValue || "—"}
                </Text>
                {seoTitleValue && (
                  <Text
                    as="span"
                    variant="bodySm"
                    tone={
                      seoTitleValue.length > 70 ? "critical" : "subdued"
                    }
                  >
                    {`${seoTitleValue.length}/70`}
                  </Text>
                )}
              </BlockStack>
            </div>
          )}
        </IndexTable.Cell>
        <IndexTable.Cell>
          {editingCell?.itemId === item.id &&
          editingCell.field === "seoDescription" ? (
            <BlockStack gap="200">
              <TextField
                label=""
                value={editingCell.value}
                onChange={(v) =>
                  setEditingCell({ ...editingCell, value: v })
                }
                multiline={2}
                autoComplete="off"
              />
              <InlineStack gap="200">
                <Text
                  as="span"
                  variant="bodySm"
                  tone={
                    editingCell.value.length > 160 ? "critical" : "subdued"
                  }
                >
                  {editingCell.value.length}/160
                </Text>
                <Button size="micro" onClick={handleSaveEdit}>
                  Save
                </Button>
                <Button
                  size="micro"
                  variant="plain"
                  onClick={() => setEditingCell(null)}
                >
                  Cancel
                </Button>
              </InlineStack>
            </BlockStack>
          ) : (
            <div
              style={{ cursor: "pointer" }}
              onClick={() =>
                item.status === "generated" || item.status === "approved"
                  ? setEditingCell({
                      itemId: item.id,
                      field: "seoDescription",
                      value: seoDescValue,
                    })
                  : undefined
              }
            >
              <BlockStack gap="100">
                <Text as="span" variant="bodyMd" truncate>
                  {seoDescValue || "—"}
                </Text>
                {seoDescValue && (
                  <Text
                    as="span"
                    variant="bodySm"
                    tone={
                      seoDescValue.length > 160 ? "critical" : "subdued"
                    }
                  >
                    {`${seoDescValue.length}/160`}
                  </Text>
                )}
              </BlockStack>
            </div>
          )}
        </IndexTable.Cell>
        <IndexTable.Cell>
          <InlineStack gap="200">
            {(item.status === "generated" || item.status === "approved") && (
              <>
                {item.status === "generated" && (
                  <Button
                    size="micro"
                    onClick={() => handleApproveItem(item.id)}
                  >
                    Approve
                  </Button>
                )}
                <Button
                  size="micro"
                  variant="plain"
                  onClick={() => handleRegenerateItem(item.id)}
                >
                  Regenerate
                </Button>
                <Button
                  size="micro"
                  variant="plain"
                  onClick={() => handleSkipItem(item.id)}
                >
                  Skip
                </Button>
              </>
            )}
            {item.status === "published" && (
              <Button
                size="micro"
                variant="plain"
                tone="critical"
                onClick={() => handleUndoItem(item.id)}
              >
                Undo
              </Button>
            )}
            {item.status === "failed" && (
              <InlineStack gap="200" blockAlign="center">
                <Text as="span" variant="bodySm" tone="critical">
                  {item.errorMessage?.substring(0, 50)}
                </Text>
                <Button
                  size="micro"
                  onClick={() => handleRegenerateItem(item.id)}
                >
                  Retry
                </Button>
              </InlineStack>
            )}
          </InlineStack>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Page
      title={`Job — ${job.items.length} Products`}
      backAction={{ url: "/app" }}
    >
      <BlockStack gap="500">
        {/* Progress section */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                {isProcessing
                  ? `Processing ${job.processedCount}/${job.totalProducts}...`
                  : job.status === "completed"
                    ? "Complete — Ready for Review"
                    : job.status === "paused"
                      ? "Paused"
                      : `Status: ${job.status}`}
              </Text>
              <InlineStack gap="200">
                {isProcessing && (
                  <Button onClick={handlePause}>Pause</Button>
                )}
                {generatedCount > 0 && (
                  <Button onClick={handleApproveAll}>
                    {`Approve All (${generatedCount})`}
                  </Button>
                )}
                {approvedCount > 0 && (
                  <Button variant="primary" onClick={handlePublish}>
                    {`Publish Approved (${approvedCount})`}
                  </Button>
                )}
              </InlineStack>
            </InlineStack>
            <ProgressBar progress={progressPercent} size="small" />
            <InlineStack gap="400">
              <Text as="span" variant="bodySm" tone="subdued">
                Generated: {generatedCount}
              </Text>
              <Text as="span" variant="bodySm" tone="subdued">
                Approved: {approvedCount}
              </Text>
              <Text as="span" variant="bodySm" tone="subdued">
                Published: {publishedCount}
              </Text>
              <Text as="span" variant="bodySm" tone="subdued">
                Failed: {job.failedCount}
              </Text>
            </InlineStack>
          </BlockStack>
        </Card>

        {/* Action errors */}
        {actionData &&
          "errors" in actionData &&
          (actionData as { errors: string[] }).errors?.length > 0 && (
            <Banner tone="critical" title="Some products failed to publish">
              <ul>
                {(actionData as { errors: string[] }).errors.map(
                  (e: string, i: number) => (
                    <li key={i}>{e}</li>
                  ),
                )}
              </ul>
            </Banner>
          )}

        {/* Spreadsheet grid */}
        <Card padding="0">
          <IndexTable
            resourceName={{ singular: "product", plural: "products" }}
            itemCount={job.items.length}
            selectedItemsCount={
              allResourcesSelected ? "All" : selectedResources.length
            }
            onSelectionChange={handleSelectionChange}
            headings={[
              { title: "Product" },
              { title: "Description" },
              { title: "SEO Title" },
              { title: "Meta Description" },
              { title: "Actions" },
            ]}
          >
            {rowMarkup}
          </IndexTable>
        </Card>
      </BlockStack>
    </Page>
  );
}
