export interface GenerateContentInput {
  productTitle: string;
  productType?: string;
  vendor?: string;
  tags?: string[];
  existingDescription?: string;
  imageUrls?: string[];
  brandVoice?: string;
  targetLanguage?: string;
  descriptionLength?: "short" | "medium" | "long";
  fieldsToGenerate: Array<
    "description" | "seoTitle" | "seoDescription" | "altText"
  >;
}

export interface GenerateContentOutput {
  description?: string;
  seoTitle?: string;
  seoDescription?: string;
  altTexts?: Record<string, string>;
}

export interface AIProvider {
  name: string;
  generate(input: GenerateContentInput): Promise<GenerateContentOutput>;
}

export function productCopyGuardrails(): string {
  return [
    "Product copy guardrails:",
    "- Write as the merchant selling the product, never as BulkGenie.",
    "- Never mention BulkGenie, BulkGenie AI, this app, AI providers, or AI generation in customer-facing copy.",
    "- Do not invent a brand. Use the product vendor only when it is provided and relevant.",
    "- Alt text must describe the visible product image, not the software that generated it.",
  ].join("\n");
}

export function sanitizeGeneratedContent(
  value: string | null | undefined,
): string {
  if (!value) return "";

  return value
    .replace(/\s+(?:by|from|with)\s+BulkGenie(?:\s+AI)?\b/gi, "")
    .replace(/\bBulkGenie(?:\s+AI)?\s*[-–—:|]\s*/gi, "")
    .replace(/\s*[-–—:|]\s*BulkGenie(?:\s+AI)?\b/gi, "")
    .replace(/\bBulkGenie(?:\s+AI)?\b/gi, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([-–—|])\s+/g, " $1 ")
    .replace(/^\s*[-–—|:]\s*/, "")
    .replace(/\s*[-–—|:]\s*$/, "")
    .trim();
}

export function sanitizeGeneratedOutput(
  output: GenerateContentOutput,
): GenerateContentOutput {
  const sanitized: GenerateContentOutput = {};

  if (output.description) {
    sanitized.description = sanitizeGeneratedContent(output.description);
  }
  if (output.seoTitle) {
    sanitized.seoTitle = sanitizeGeneratedContent(output.seoTitle).substring(
      0,
      70,
    );
  }
  if (output.seoDescription) {
    sanitized.seoDescription = sanitizeGeneratedContent(
      output.seoDescription,
    ).substring(0, 160);
  }
  if (output.altTexts) {
    sanitized.altTexts = Object.fromEntries(
      Object.entries(output.altTexts).map(([key, value]) => [
        key,
        sanitizeGeneratedContent(value).substring(0, 125),
      ]),
    );
  }

  return sanitized;
}
