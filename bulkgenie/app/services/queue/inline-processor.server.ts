import prisma from "../../db.server";
import { getAIProvider } from "../ai/factory";
import { fetchProductFromShopify } from "../shopify/products";

/**
 * Process a content generation job synchronously (inline).
 * Used as a fallback when Redis/BullMQ is unavailable,
 * or for small jobs that don't need background processing.
 */
export async function processJobInline(jobId: string): Promise<void> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      items: {
        where: { status: "pending" },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!job) throw new Error(`Job ${jobId} not found`);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: job.shopDomain },
  });
  if (!shop) throw new Error(`Shop ${job.shopDomain} not found`);

  await prisma.job.update({
    where: { id: jobId },
    data: { status: "processing" },
  });

  const provider = getAIProvider(shop);
  const fields = JSON.parse(job.generateFields) as Array<
    "description" | "seoTitle" | "seoDescription" | "altText"
  >;

  const session = await prisma.session.findFirst({
    where: { shop: job.shopDomain },
  });
  if (!session) {
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "failed" },
    });
    throw new Error("No active session found for shop. Try re-opening the app.");
  }

  for (const item of job.items) {
    try {
      await prisma.jobItem.update({
        where: { id: item.id },
        data: { status: "processing" },
      });

      const product = await fetchProductFromShopify(
        session.accessToken,
        job.shopDomain,
        item.shopifyProductId,
      );

      // Store original content for undo
      const imageAltTexts =
        product.images?.edges?.reduce(
          (
            acc: Record<string, string>,
            edge: { node: { altText?: string } },
            i: number,
          ) => {
            acc[`img_${i}`] = edge.node.altText || "";
            return acc;
          },
          {} as Record<string, string>,
        ) || {};

      await prisma.jobItem.update({
        where: { id: item.id },
        data: {
          originalDescription: product.descriptionHtml || "",
          originalSeoTitle: product.seo?.title || "",
          originalSeoDesc: product.seo?.description || "",
          originalAltTexts: JSON.stringify(imageAltTexts),
        },
      });

      // Generate AI content
      const result = await provider.generate({
        productTitle: product.title,
        productType: product.productType || undefined,
        vendor: product.vendor || undefined,
        tags: product.tags || [],
        existingDescription: product.descriptionHtml || undefined,
        imageUrls:
          product.images?.edges?.map(
            (e: { node: { url: string } }) => e.node.url,
          ) || [],
        brandVoice: shop.brandVoice || undefined,
        targetLanguage: shop.targetLanguage || "en",
        descriptionLength:
          (shop.descriptionLength as "short" | "medium" | "long") || "medium",
        fieldsToGenerate: fields,
      });

      // Store generated content (NOT published yet — merchant reviews first)
      await prisma.jobItem.update({
        where: { id: item.id },
        data: {
          status: "generated",
          generatedDescription: result.description || null,
          generatedSeoTitle: result.seoTitle || null,
          generatedSeoDesc: result.seoDescription || null,
          generatedAltTexts: result.altTexts
            ? JSON.stringify(result.altTexts)
            : null,
        },
      });

      await prisma.job.update({
        where: { id: jobId },
        data: { processedCount: { increment: 1 } },
      });

      // Rate limiting delay between products
      await new Promise((resolve) => setTimeout(resolve, 250));
    } catch (error) {
      console.error(
        `[InlineProcessor] Failed to process item ${item.id}:`,
        error,
      );

      await prisma.jobItem.update({
        where: { id: item.id },
        data: {
          status: "failed",
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
        },
      });

      await prisma.job.update({
        where: { id: jobId },
        data: {
          failedCount: { increment: 1 },
          processedCount: { increment: 1 },
        },
      });
    }
  }

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "completed",
      completedAt: new Date(),
    },
  });
}
