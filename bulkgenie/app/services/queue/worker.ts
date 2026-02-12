import { Worker } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@prisma/client";
import { getAIProvider } from "../ai/factory";
import {
  fetchProductFromShopify,
} from "../shopify/products";

const redis = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});
const prisma = new PrismaClient();

const worker = new Worker(
  "content-generation",
  async (bullJob) => {
    const { jobId } = bullJob.data;
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

    // Mark job as processing
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "processing" },
    });

    const provider = getAIProvider(shop);
    const fields = JSON.parse(job.generateFields) as Array<
      "description" | "seoTitle" | "seoDescription" | "altText"
    >;

    let processedInRun = 0;

    for (const item of job.items) {
      // Check if job was paused or cancelled
      const currentJob = await prisma.job.findUnique({
        where: { id: jobId },
      });
      if (currentJob?.status === "paused") break;

      try {
        await prisma.jobItem.update({
          where: { id: item.id },
          data: { status: "processing" },
        });

        // Find a valid session for this shop
        const session = await prisma.session.findFirst({
          where: { shop: job.shopDomain },
        });
        if (!session) throw new Error("No session found for shop");

        // Fetch current product data from Shopify
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
            (shop.descriptionLength as "short" | "medium" | "long") ||
            "medium",
          fieldsToGenerate: fields,
        });

        // Store generated content (NOT published yet)
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

        processedInRun++;
        await prisma.job.update({
          where: { id: jobId },
          data: { processedCount: { increment: 1 } },
        });

        // Update BullMQ progress for real-time UI updates
        const totalProcessed = job.processedCount + processedInRun;
        await bullJob.updateProgress(
          Math.round((totalProcessed / job.totalProducts) * 100),
        );

        // Rate limiting delay between products
        await new Promise((resolve) => setTimeout(resolve, 250));
      } catch (error) {
        await prisma.jobItem.update({
          where: { id: item.id },
          data: {
            status: "failed",
            errorMessage:
              error instanceof Error ? error.message : "Unknown error",
          },
        });

        processedInRun++;
        await prisma.job.update({
          where: { id: jobId },
          data: {
            failedCount: { increment: 1 },
            processedCount: { increment: 1 },
          },
        });
      }
    }

    // Check final status
    const finalJob = await prisma.job.findUnique({ where: { id: jobId } });
    if (finalJob?.status !== "paused") {
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: "completed",
          completedAt: new Date(),
        },
      });
    }
  },
  {
    connection: redis,
    concurrency: 1,
  },
);

worker.on("failed", (job, err) => {
  console.error(`Worker job ${job?.id} failed:`, err);
});

worker.on("completed", (job) => {
  console.log(`Worker job ${job.id} completed`);
});

console.log("BulkGenie AI content generation worker started");

export default worker;
