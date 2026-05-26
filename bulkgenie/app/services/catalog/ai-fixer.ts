import type { Shop } from "@prisma/client";
import { getAIProvider } from "../ai/factory";
import { sanitizeGeneratedOutput } from "../ai/provider";
import type { DetectedIssue, ScanProduct } from "./scanner";
import { AI_FIXABLE_ISSUES, stripHtml } from "./scanner";

// Returns the proposed fix value string, or null if no fix can be generated.
export async function generateFix(
  shop: Shop,
  product: ScanProduct,
  issue: DetectedIssue,
): Promise<string | null> {
  if (!AI_FIXABLE_ISSUES.has(issue.issueType)) return null;

  const provider = getAIProvider(shop);

  const imageUrls = product.images
    ?.filter((img) => img.url)
    .map((img) => img.url as string) ?? [];

  const baseInput = {
    productTitle: product.title,
    productType: product.productType,
    vendor: product.vendor,
    tags: product.tags,
    existingDescription: product.descriptionHtml
      ? stripHtml(product.descriptionHtml)
      : undefined,
    imageUrls,
    brandVoice: shop.brandVoice ?? undefined,
    targetLanguage: shop.targetLanguage,
    descriptionLength: (shop.descriptionLength as "short" | "medium" | "long"),
  };

  switch (issue.fieldName) {
    case "seoTitle": {
      const raw = await provider.generate({
        ...baseInput,
        fieldsToGenerate: ["seoTitle"],
      });
      const sanitized = sanitizeGeneratedOutput(raw);
      return sanitized.seoTitle ?? null;
    }

    case "seoDescription": {
      const raw = await provider.generate({
        ...baseInput,
        fieldsToGenerate: ["seoDescription"],
      });
      const sanitized = sanitizeGeneratedOutput(raw);
      return sanitized.seoDescription ?? null;
    }

    case "description": {
      const raw = await provider.generate({
        ...baseInput,
        fieldsToGenerate: ["description"],
      });
      const sanitized = sanitizeGeneratedOutput(raw);
      return sanitized.description ?? null;
    }

    case "altText": {
      if (!issue.imageId) return null;
      // Pass only the specific image that needs alt text
      const targetImage = product.images?.find((img) => img.id === issue.imageId);
      const singleImageUrls = targetImage?.url ? [targetImage.url] : imageUrls.slice(0, 1);
      const raw = await provider.generate({
        ...baseInput,
        imageUrls: singleImageUrls,
        fieldsToGenerate: ["altText"],
      });
      const sanitized = sanitizeGeneratedOutput(raw);
      if (!sanitized.altTexts) return null;
      // Return alt text for the specific image, or the first one generated
      return (
        sanitized.altTexts[issue.imageId] ??
        Object.values(sanitized.altTexts)[0] ??
        null
      );
    }

    default:
      return null;
  }
}

// Generate fixes for a batch of issues belonging to the same product.
// Groups by field to avoid redundant AI calls.
export async function generateFixesForProduct(
  shop: Shop,
  product: ScanProduct,
  issues: DetectedIssue[],
): Promise<Map<string, string>> {
  const results = new Map<string, string>(); // issueType+imageId key → proposed value

  // Process each issue individually with a small delay
  for (const issue of issues) {
    const key = issue.imageId
      ? `${issue.issueType}:${issue.imageId}`
      : issue.issueType;

    if (results.has(key)) continue;

    const fix = await generateFix(shop, product, issue);
    if (fix) results.set(key, fix);

    await new Promise((r) => setTimeout(r, 200));
  }

  return results;
}
