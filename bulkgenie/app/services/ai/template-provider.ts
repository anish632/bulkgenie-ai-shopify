import type { AIProvider, GenerateContentInput, GenerateContentOutput } from "./provider";

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1).trimEnd() + "…";
}

function titleCase(str: string): string {
  return str
    .toLowerCase()
    .split(/[\s-_]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function buildDescription(input: GenerateContentInput): string {
  const { productTitle, vendor, productType, tags = [], descriptionLength } = input;

  const typeLabel = productType ? titleCase(productType) : "product";
  const brandLine = vendor ? ` by ${vendor}` : "";

  const topTags = tags
    .filter((t) => t.length > 2 && t.length < 40)
    .slice(0, 3)
    .map((t) => titleCase(t));
  const tagLine =
    topTags.length > 1
      ? ` — featuring ${topTags.slice(0, -1).join(", ")} and ${topTags.at(-1)}`
      : topTags.length === 1
        ? ` — featuring ${topTags[0]}`
        : "";

  const short = `<p>${productTitle}${brandLine} is a quality ${typeLabel}${tagLine}. Built to perform and designed to last.</p>`;

  if (descriptionLength === "short") return short;

  const mid = `${short}<p>Whether you're a first-time buyer or a seasoned enthusiast, ${productTitle} delivers the reliability and performance you expect. Crafted with attention to detail, it's ready for everyday use.</p>`;

  if (descriptionLength === "medium" || !descriptionLength) return mid;

  return `${mid}<p>Explore the full range of features this ${typeLabel} has to offer. From quality construction to thoughtful design, every detail is considered so you can focus on what matters most. Order today with confidence.</p>`;
}

function buildSeoTitle(input: GenerateContentInput): string {
  const { productTitle, vendor, productType } = input;
  const suffix = productType
    ? titleCase(productType)
    : vendor
      ? vendor
      : "";
  const candidate = suffix ? `${productTitle} | ${suffix}` : productTitle;
  return truncate(candidate, 70);
}

function buildSeoDescription(input: GenerateContentInput): string {
  const { productTitle, vendor, productType, tags = [] } = input;
  const typeLabel = productType ? titleCase(productType) : "product";
  const brandPart = vendor ? ` by ${vendor}` : "";
  const tagPart = tags.length ? `. ${titleCase(tags[0])}` : "";
  const candidate = `Shop ${productTitle}${brandPart} — a quality ${typeLabel}${tagPart}. Free shipping on qualifying orders.`;
  return truncate(candidate, 160);
}

function buildAltTexts(input: GenerateContentInput): Record<string, string> {
  const { productTitle, productType, vendor, imageUrls = [] } = input;
  const typeLabel = productType ? ` ${titleCase(productType)}` : "";
  const brandLabel = vendor ? ` by ${vendor}` : "";
  const base = truncate(`${productTitle}${typeLabel}${brandLabel} product image`, 125);

  const result: Record<string, string> = {};
  const count = Math.max(imageUrls.length, 1);
  for (let i = 0; i < count; i++) {
    result[`img_${i}`] = i === 0 ? base : truncate(`${productTitle}${typeLabel} — view ${i + 1}`, 125);
  }
  return result;
}

export class TemplateProvider implements AIProvider {
  name = "template";

  async generate(input: GenerateContentInput): Promise<GenerateContentOutput> {
    const { fieldsToGenerate } = input;
    const result: GenerateContentOutput = {};

    if (fieldsToGenerate.includes("description")) {
      result.description = buildDescription(input);
    }
    if (fieldsToGenerate.includes("seoTitle")) {
      result.seoTitle = buildSeoTitle(input);
    }
    if (fieldsToGenerate.includes("seoDescription")) {
      result.seoDescription = buildSeoDescription(input);
    }
    if (fieldsToGenerate.includes("altText")) {
      result.altTexts = buildAltTexts(input);
    }

    return result;
  }
}
