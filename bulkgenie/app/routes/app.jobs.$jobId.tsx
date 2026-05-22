import { useState, useEffect, useCallback } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  useLoaderData,
  useSubmit,
  useRevalidator,
  useActionData,
  useRouteError,
  isRouteErrorResponse,
} from "@remix-run/react";
import {
  Page,
  Card,
  BlockStack,
  Text,
  Button,
  InlineStack,
  Badge,
  TextField,
  ProgressBar,
  Banner,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  updateProductInShopify,
  fetchProductFromShopify,
} from "../services/shopify/products";
import { getAIProvider } from "../services/ai/factory";
import { sanitizeGeneratedContent } from "../services/ai/provider";
import {
  isFatalProviderSetupError,
  normalizeJobError,
} from "../services/jobs/errors";

interface JobItemData {
  id: string;
  shopifyProductId: string;
  productTitle: string;
  status: string;
  originalDescription: string | null;
  originalSeoTitle: string | null;
  originalSeoDesc: string | null;
  originalAltTexts: string | null;
  generatedDescription: string | null;
  generatedSeoTitle: string | null;
  generatedSeoDesc: string | null;
  generatedAltTexts: string | null;
  editedDescription: string | null;
  editedSeoTitle: string | null;
  editedSeoDesc: string | null;
  editedAltTexts: string | null;
  errorMessage: string | null;
}

function parseAltTextMap(value: string | null | undefined) {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === "string" && typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, "").trim();
}

async function buildImageAltTextUpdates(
  accessToken: string,
  shopDomain: string,
  productGid: string,
  altTextsJson: string | null | undefined,
) {
  const altTexts = Object.fromEntries(
    Object.entries(parseAltTextMap(altTextsJson)).map(([key, value]) => [
      key,
      sanitizeGeneratedContent(value),
    ]),
  );
  if (!Object.keys(altTexts).length) return undefined;

  const product = await fetchProductFromShopify(
    accessToken,
    shopDomain,
    productGid,
  );

  const edges =
    product.images?.edges as
      | Array<{ node: { id: string; altText?: string | null } }>
      | undefined;

  const updates =
    edges
      ?.map((edge, index) => {
        const altText = altTexts[edge.node.id] ?? altTexts[`img_${index}`];
        if (typeof altText !== "string") return null;
        return { imageId: edge.node.id, altText };
      })
      .filter(
        (update): update is { imageId: string; altText: string } =>
          Boolean(update),
      ) || [];

  return updates.length ? updates : undefined;
}

async function claimNextPendingItem(jobId: string) {
  const pendingItem = await prisma.jobItem.findFirst({
    where: { jobId, status: "pending" },
    orderBy: { createdAt: "asc" },
  });

  if (!pendingItem) return null;

  const claimed = await prisma.jobItem.updateMany({
    where: { id: pendingItem.id, status: "pending" },
    data: { status: "processing" },
  });

  return claimed.count === 1 ? pendingItem : null;
}

async function processOneItem(jobId: string, shopDomain: string): Promise<void> {
  const pendingItem = await claimNextPendingItem(jobId);

  if (!pendingItem) {
    const remainingPending = await prisma.jobItem.count({
      where: { jobId, status: "pending" },
    });
    if (remainingPending > 0) return;

    const failedCount = await prisma.jobItem.count({
      where: { jobId, status: "failed" },
    });

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: failedCount > 0 ? "failed" : "completed",
        completedAt: new Date(),
      },
    });
    return;
  }

  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) return;

  const shopSession = await prisma.session.findFirst({
    where: { shop: shopDomain },
  });
  if (!shopSession) return;

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return;
  const fields = JSON.parse(job.generateFields) as Array<
    "description" | "seoTitle" | "seoDescription" | "altText"
  >;

  try {
    const provider = getAIProvider(shop);

    const product = await fetchProductFromShopify(
      shopSession.accessToken,
      shopDomain,
      pendingItem.shopifyProductId,
    );

    // Store original content for undo
    const imageAltTexts =
      product.images?.edges?.reduce(
        (acc: Record<string, string>, edge: { node: { id?: string; altText?: string } }, i: number) => {
          acc[edge.node.id || `img_${i}`] = edge.node.altText || "";
          return acc;
        },
        {} as Record<string, string>,
      ) || {};

    await prisma.jobItem.update({
      where: { id: pendingItem.id },
      data: {
        originalDescription: product.descriptionHtml || "",
        originalSeoTitle: product.seo?.title || "",
        originalSeoDesc: product.seo?.description || "",
        originalAltTexts: JSON.stringify(imageAltTexts),
      },
    });

    const result = await provider.generate({
      productTitle: product.title,
      productType: product.productType || undefined,
      vendor: product.vendor || undefined,
      tags: product.tags || [],
      existingDescription: product.descriptionHtml || undefined,
      imageUrls:
        product.images?.edges?.map((e: { node: { url: string } }) => e.node.url) || [],
      brandVoice: shop.brandVoice || undefined,
      targetLanguage: shop.targetLanguage || "en",
      descriptionLength: (shop.descriptionLength as "short" | "medium" | "long") || "medium",
      fieldsToGenerate: fields,
    });

    await prisma.$transaction([
      prisma.jobItem.update({
        where: { id: pendingItem.id },
        data: {
          status: "generated",
          generatedDescription: result.description || null,
          generatedSeoTitle: result.seoTitle || null,
          generatedSeoDesc: result.seoDescription || null,
          generatedAltTexts: result.altTexts ? JSON.stringify(result.altTexts) : null,
        },
      }),
      prisma.job.update({
        where: { id: jobId },
        data: { processedCount: { increment: 1 } },
      }),
      prisma.shop.update({
        where: { shopDomain },
        data: { monthlyUsage: { increment: 1 } },
      }),
    ]);
  } catch (error) {
    const errMsg = normalizeJobError(error);
    console.error(`[JobLoader] Failed to process item ${pendingItem.id}:`, errMsg);
    await prisma.jobItem.update({
      where: { id: pendingItem.id },
      data: {
        status: "failed",
        errorMessage: errMsg,
      },
    });
    await prisma.job.update({
      where: { id: jobId },
      data: { failedCount: { increment: 1 }, processedCount: { increment: 1 } },
    });

    if (isFatalProviderSetupError(errMsg)) {
      const failedRemaining = await prisma.jobItem.updateMany({
        where: { jobId, status: "pending" },
        data: { status: "failed", errorMessage: errMsg },
      });
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: "failed",
          failedCount: { increment: failedRemaining.count },
          processedCount: { increment: failedRemaining.count },
          completedAt: new Date(),
        },
      });
    }
  }
}

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    const { jobId } = params;

    if (!jobId) {
      throw new Response("Job ID is required", { status: 400 });
    }

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

    // Process one pending item per poll while job is processing
    if (job.status === "processing") {
      await processOneItem(jobId, session.shop);
      // Re-fetch job after processing
      const updatedJob = await prisma.job.findUnique({
        where: { id: jobId },
        include: { items: { orderBy: { createdAt: "asc" } } },
      });
      return json({ job: updatedJob || job });
    }

    return json({ job });
  } catch (error) {
    console.error("[app.jobs.$jobId] Loader error:", error);
    if (error instanceof Response) {
      throw error;
    }
    throw new Response("Failed to load job details", {
      status: 500,
      statusText: error instanceof Error ? error.message : "Unknown error",
    });
  }
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
      const value = sanitizeGeneratedContent(formData.get("value") as string);

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
      // Count previously published items for this shop to detect first-ever publish
      const prevPublishedCount = await prisma.jobItem.count({
        where: {
          status: "published",
          job: { shopDomain: session.shop },
        },
      });

      const approvedItems = job.items.filter(
        (item) => item.status === "approved",
      );
      let publishedCount = 0;
      const errors: string[] = [];

      for (const item of approvedItems) {
        try {
          const generatedDescription =
            sanitizeGeneratedContent(item.generatedDescription) || undefined;
          const generatedSeoTitle =
            sanitizeGeneratedContent(item.generatedSeoTitle) || undefined;
          const generatedSeoDescription =
            sanitizeGeneratedContent(item.generatedSeoDesc) || undefined;
          const editedDescription =
            sanitizeGeneratedContent(item.editedDescription) || undefined;
          const editedSeoTitle =
            sanitizeGeneratedContent(item.editedSeoTitle) || undefined;
          const editedSeoDescription =
            sanitizeGeneratedContent(item.editedSeoDesc) || undefined;
          const desc = editedDescription ?? generatedDescription;
          const seoTitle = editedSeoTitle ?? generatedSeoTitle;
          const seoDesc = editedSeoDescription ?? generatedSeoDescription;
          const imageAltTexts = await buildImageAltTextUpdates(
            shopSession.accessToken,
            session.shop,
            item.shopifyProductId,
            item.editedAltTexts ?? item.generatedAltTexts,
          );

          await updateProductInShopify(
            shopSession.accessToken,
            session.shop,
            item.shopifyProductId,
            {
              descriptionHtml: desc,
              seoTitle: seoTitle,
              seoDescription: seoDesc,
              imageAltTexts,
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

      const isFirstPublish = prevPublishedCount === 0 && publishedCount > 0;
      if (isFirstPublish) {
        console.log(JSON.stringify({ event: "first_reviewed_publish", publishedCount, ts: new Date().toISOString() }));
      }
      return json({
        success: true,
        published: publishedCount,
        errors,
        isFirstPublish,
      });
    }

    case "undo_item": {
      const itemId = formData.get("itemId") as string;
      const item = job.items.find((i) => i.id === itemId);
      if (!item || item.status !== "published") {
        return json({ error: "Item not published" }, { status: 400 });
      }

      const imageAltTexts = await buildImageAltTextUpdates(
        shopSession.accessToken,
        session.shop,
        item.shopifyProductId,
        item.originalAltTexts,
      );

      await updateProductInShopify(
        shopSession.accessToken,
        session.shop,
        item.shopifyProductId,
        {
          descriptionHtml: item.originalDescription || undefined,
          seoTitle: item.originalSeoTitle || undefined,
          seoDescription: item.originalSeoDesc || undefined,
          imageAltTexts,
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

      // Set job back to processing — polling loader will pick it up
      await prisma.job.update({
        where: { id: job.id },
        data: { status: "processing" },
      });

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

  const handleExportCSV = useCallback(() => {
    console.log(JSON.stringify({ event: "seo_gap_report_exported", jobId: job.id, ts: new Date().toISOString() }));
    const headers = ["Product", "Field", "Original Value", "Generated/Edited Value", "Status"];
    const rows: string[][] = [];

    (job.items as JobItemData[]).forEach((item) => {
      const descValue = getDisplayValue(item, "description");
      const seoTitleValue = getDisplayValue(item, "seoTitle");
      const seoDescValue = getDisplayValue(item, "seoDescription");
      const altMap = parseAltTextMap(item.editedAltTexts ?? item.generatedAltTexts);
      const origAltMap = parseAltTextMap(item.originalAltTexts);

      if (descValue) {
        rows.push([item.productTitle, "Description", stripHtml(item.originalDescription || ""), stripHtml(descValue), item.status]);
      }
      if (seoTitleValue) {
        rows.push([item.productTitle, "SEO Title", item.originalSeoTitle || "", seoTitleValue, item.status]);
      }
      if (seoDescValue) {
        rows.push([item.productTitle, "Meta Description", item.originalSeoDesc || "", seoDescValue, item.status]);
      }
      Object.entries(altMap).forEach(([id, suggested], idx) => {
        const original = origAltMap[id] ?? "";
        rows.push([item.productTitle, `Image alt text (${idx + 1})`, original, sanitizeGeneratedContent(suggested), item.status]);
      });
    });

    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `seo-gap-report-${job.id.slice(0, 8)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [job]);

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
    return sanitizeGeneratedContent(editedMap[field] ?? generatedMap[field]);
  };

  const getAltTextSummary = (item: JobItemData) => {
    const altTextMap = parseAltTextMap(
      item.editedAltTexts ?? item.generatedAltTexts,
    );
    const values = Object.values(altTextMap)
      .map((value) => sanitizeGeneratedContent(value))
      .filter(Boolean);
    if (!values.length) return "";

    const firstAltText = values[0];
    return values.length === 1
      ? firstAltText
      : `${values.length} images: ${firstAltText}`;
  };

  const canEditItem = (status: string) =>
    status === "generated" || status === "approved";

  const renderEditableField = (
    item: JobItemData,
    field: "description" | "seoTitle" | "seoDescription",
    label: string,
    value: string,
    characterLimit?: number,
  ) => {
    const isEditing =
      editingCell?.itemId === item.id && editingCell.field === field;
    const displayValue = field === "description" ? stripHtml(value) : value;

    if (isEditing) {
      return (
        <BlockStack gap="200">
          <Text as="p" variant="bodySm" tone="subdued">
            {label}
          </Text>
          <TextField
            label=""
            value={editingCell.value}
            onChange={(v) => setEditingCell({ ...editingCell, value: v })}
            multiline={field === "seoTitle" ? undefined : 3}
            autoComplete="off"
          />
          <InlineStack gap="200" blockAlign="center">
            {characterLimit && (
              <Text
                as="span"
                variant="bodySm"
                tone={
                  editingCell.value.length > characterLimit
                    ? "critical"
                    : "subdued"
                }
              >
                {`${editingCell.value.length}/${characterLimit}`}
              </Text>
            )}
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
      );
    }

    return (
      <div
        style={{
          cursor: canEditItem(item.status) ? "pointer" : "default",
          minWidth: 0,
          overflowWrap: "anywhere",
          whiteSpace: "normal",
        }}
        onClick={() =>
          canEditItem(item.status)
            ? setEditingCell({
                itemId: item.id,
                field,
                value,
              })
            : undefined
        }
      >
        <BlockStack gap="100">
          <InlineStack align="space-between" gap="200" blockAlign="center">
            <Text as="p" variant="bodySm" tone="subdued">
              {label}
            </Text>
            {characterLimit && value && (
              <Text
                as="span"
                variant="bodySm"
                tone={value.length > characterLimit ? "critical" : "subdued"}
              >
                {`${value.length}/${characterLimit}`}
              </Text>
            )}
          </InlineStack>
          <Text as="p" variant="bodyMd">
            {displayValue || "—"}
          </Text>
        </BlockStack>
      </div>
    );
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
  const publishedSuccess =
    actionData &&
    "published" in actionData &&
    Number(actionData.published) > 0;
  const isFirstPublish =
    actionData &&
    "isFirstPublish" in actionData &&
    Boolean((actionData as { isFirstPublish?: boolean }).isFirstPublish);

  // Analytics: fire once when earned review prompt is shown
  useEffect(() => {
    if (isFirstPublish) {
      console.log(JSON.stringify({ event: "review_prompt_shown", ts: new Date().toISOString() }));
    }
  }, [isFirstPublish]);

  const reviewCards = job.items.map((item: JobItemData) => {
    const descValue = getDisplayValue(item, "description");
    const seoTitleValue = getDisplayValue(item, "seoTitle");
    const seoDescValue = getDisplayValue(item, "seoDescription");
    const altTextSummary = getAltTextSummary(item);

    return (
      <Card
        key={item.id}
        padding="400"
        background={
          item.status === "approved" || item.status === "published"
            ? "bg-surface-success"
            : item.status === "failed"
              ? "bg-surface-critical"
              : "bg-surface"
        }
      >
        <BlockStack gap="400">
          <InlineStack align="space-between" blockAlign="start" gap="300">
            <BlockStack gap="100">
              <InlineStack gap="200" blockAlign="center">
                <Text as="h3" variant="headingSm">
                  {item.productTitle}
                </Text>
                {statusBadge(item.status)}
              </InlineStack>
            </BlockStack>
            <InlineStack gap="200">
              {(item.status === "generated" ||
                item.status === "approved") && (
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
                    {item.errorMessage?.substring(0, 80)}
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
          </InlineStack>

          <div
            style={{
              display: "grid",
              gap: "16px",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
              minWidth: 0,
            }}
          >
            {renderEditableField(item, "description", "Description", descValue)}
            <BlockStack gap="300">
              {renderEditableField(
                item,
                "seoTitle",
                "SEO title",
                seoTitleValue,
                70,
              )}
              {renderEditableField(
                item,
                "seoDescription",
                "Meta description",
                seoDescValue,
                160,
              )}
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">
                  Image alt text
                </Text>
                <Text as="p" variant="bodyMd">
                  {altTextSummary || "—"}
                </Text>
              </BlockStack>
            </BlockStack>
          </div>
        </BlockStack>
      </Card>
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
                {publishedCount > 0 && (
                  <Button variant="plain" onClick={handleExportCSV}>
                    Download SEO Gap Report
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

        {/* Earned review prompt — shown only after first-ever publish */}
        {isFirstPublish && (
          <Banner
            tone="success"
            title={`${(actionData as { published: number }).published} products published to Shopify`}
          >
            <BlockStack gap="200">
              <p>
                Check the updated products in Shopify. If the changes look
                right, a quick review helps other merchants find BulkGenie.
              </p>
              <InlineStack>
                <Button
                  url="https://apps.shopify.com/bulkgenie-ai"
                  target="_blank"
                  onClick={() =>
                    console.log(JSON.stringify({ event: "review_click", ts: new Date().toISOString() }))
                  }
                >
                  Write a review
                </Button>
              </InlineStack>
            </BlockStack>
          </Banner>
        )}

        {/* Publish success (non-first — no review prompt) */}
        {publishedSuccess && !isFirstPublish && (
          <Banner
            tone="success"
            title={`${(actionData as { published: number }).published} products published to Shopify`}
          >
            <p>Check the updated products in your Shopify admin.</p>
          </Banner>
        )}

        <BlockStack gap="300">{reviewCards}</BlockStack>
      </BlockStack>
    </Page>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  
  let errorMessage = "An unexpected error occurred";
  let errorStatus = 500;
  
  if (isRouteErrorResponse(error)) {
    errorStatus = error.status;
    errorMessage = error.statusText || error.data;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  return (
    <Page title="Job Error" backAction={{ url: "/app" }}>
      <Banner tone="critical" title={`Error ${errorStatus}`}>
        <p>{errorMessage}</p>
      </Banner>
      <BlockStack gap="400">
        <Button url="/app">Return to Dashboard</Button>
      </BlockStack>
    </Page>
  );
}
