export interface ProductForScoring {
  title?: string | null;
  descriptionHtml: string;
  seo: { title: string | null; description: string | null };
  images: { edges: Array<{ node: { id: string; altText: string | null } }> };
}

export interface ProductContentGap {
  hasWeakProductTitle: boolean;
  hasMissingDescription: boolean;
  hasThinDescription: boolean;
  hasMissingSeoTitle: boolean;
  seoTitleTooLong: boolean;
  hasMissingSeoDescription: boolean;
  seoDescriptionTooLong: boolean;
  missingAltTextCount: number;
  totalImageCount: number;
  /** 0 = no issues, 5 = all tracked content areas need attention */
  score: number;
}

export interface CatalogGapSummary {
  totalProducts: number;
  productsWithGaps: number;
  totalGapCount: number;
  weakProductTitleCount: number;
  missingDescriptionCount: number;
  thinDescriptionCount: number;
  missingSeoTitleCount: number;
  seoTitleTooLongCount: number;
  missingSeoDescriptionCount: number;
  seoDescriptionTooLongCount: number;
  productsWithMissingAltText: number;
  missingAltTextCount: number;
}

export const WEAK_PRODUCT_TITLE_CHARS = 20;
export const THIN_DESCRIPTION_CHARS = 100;
export const SEO_TITLE_MAX = 70;
export const SEO_DESCRIPTION_MAX = 160;

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

export function scoreProductContent(product: ProductForScoring): ProductContentGap {
  const productTitle = product.title?.trim() ?? "";
  const hasWeakProductTitle =
    productTitle.length > 0 && productTitle.length < WEAK_PRODUCT_TITLE_CHARS;

  const rawDescription = stripHtml(product.descriptionHtml);
  const hasMissingDescription = rawDescription.length === 0;
  const hasThinDescription =
    !hasMissingDescription && rawDescription.length < THIN_DESCRIPTION_CHARS;

  const hasMissingSeoTitle = !product.seo.title;
  const seoTitleTooLong =
    !hasMissingSeoTitle && (product.seo.title?.length ?? 0) > SEO_TITLE_MAX;

  const hasMissingSeoDescription = !product.seo.description;
  const seoDescriptionTooLong =
    !hasMissingSeoDescription &&
    (product.seo.description?.length ?? 0) > SEO_DESCRIPTION_MAX;

  const totalImageCount = product.images.edges.length;
  const missingAltTextCount = product.images.edges.filter(
    (e) => !e.node.altText,
  ).length;

  const score = [
    hasWeakProductTitle,
    hasMissingDescription || hasThinDescription,
    hasMissingSeoTitle || seoTitleTooLong,
    hasMissingSeoDescription || seoDescriptionTooLong,
    missingAltTextCount > 0,
  ].filter(Boolean).length;

  return {
    hasWeakProductTitle,
    hasMissingDescription,
    hasThinDescription,
    hasMissingSeoTitle,
    seoTitleTooLong,
    hasMissingSeoDescription,
    seoDescriptionTooLong,
    totalImageCount,
    missingAltTextCount,
    score,
  };
}

export function catalogGapSummary(gaps: ProductContentGap[]): CatalogGapSummary {
  const missingAltTextCount = gaps.reduce(
    (total, gap) => total + gap.missingAltTextCount,
    0,
  );
  const weakProductTitleCount = gaps.filter(
    (g) => g.hasWeakProductTitle,
  ).length;
  const missingDescriptionCount = gaps.filter((g) => g.hasMissingDescription)
    .length;
  const thinDescriptionCount = gaps.filter((g) => g.hasThinDescription).length;
  const missingSeoTitleCount = gaps.filter((g) => g.hasMissingSeoTitle).length;
  const seoTitleTooLongCount = gaps.filter((g) => g.seoTitleTooLong).length;
  const missingSeoDescriptionCount = gaps.filter(
    (g) => g.hasMissingSeoDescription,
  ).length;
  const seoDescriptionTooLongCount = gaps.filter(
    (g) => g.seoDescriptionTooLong,
  ).length;

  return {
    totalProducts: gaps.length,
    productsWithGaps: gaps.filter((g) => g.score > 0).length,
    totalGapCount:
      weakProductTitleCount +
      missingDescriptionCount +
      thinDescriptionCount +
      missingSeoTitleCount +
      seoTitleTooLongCount +
      missingSeoDescriptionCount +
      seoDescriptionTooLongCount +
      missingAltTextCount,
    weakProductTitleCount,
    missingDescriptionCount,
    thinDescriptionCount,
    missingSeoTitleCount,
    seoTitleTooLongCount,
    missingSeoDescriptionCount,
    seoDescriptionTooLongCount,
    productsWithMissingAltText: gaps.filter(
      (g) => g.missingAltTextCount > 0,
    ).length,
    missingAltTextCount,
  };
}
