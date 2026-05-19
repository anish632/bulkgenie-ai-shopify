export interface ProductForScoring {
  descriptionHtml: string;
  seo: { title: string | null; description: string | null };
  images: { edges: Array<{ node: { id: string; altText: string | null } }> };
}

export interface ProductContentGap {
  hasMissingDescription: boolean;
  hasThinDescription: boolean;
  hasMissingSeoTitle: boolean;
  seoTitleTooLong: boolean;
  hasMissingSeoDescription: boolean;
  seoDescriptionTooLong: boolean;
  missingAltTextCount: number;
  totalImageCount: number;
  /** 0 = no issues, 4 = all four content areas need attention */
  score: number;
}

export interface CatalogGapSummary {
  totalProducts: number;
  productsWithGaps: number;
  missingDescriptionCount: number;
  thinDescriptionCount: number;
  missingSeoTitleCount: number;
  missingSeoDescriptionCount: number;
  productsWithMissingAltText: number;
}

export const THIN_DESCRIPTION_CHARS = 100;
export const SEO_TITLE_MAX = 70;
export const SEO_DESCRIPTION_MAX = 160;

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

export function scoreProductContent(product: ProductForScoring): ProductContentGap {
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
    hasMissingDescription || hasThinDescription,
    hasMissingSeoTitle || seoTitleTooLong,
    hasMissingSeoDescription || seoDescriptionTooLong,
    missingAltTextCount > 0,
  ].filter(Boolean).length;

  return {
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
  return {
    totalProducts: gaps.length,
    productsWithGaps: gaps.filter((g) => g.score > 0).length,
    missingDescriptionCount: gaps.filter((g) => g.hasMissingDescription).length,
    thinDescriptionCount: gaps.filter((g) => g.hasThinDescription).length,
    missingSeoTitleCount: gaps.filter((g) => g.hasMissingSeoTitle).length,
    missingSeoDescriptionCount: gaps.filter(
      (g) => g.hasMissingSeoDescription,
    ).length,
    productsWithMissingAltText: gaps.filter(
      (g) => g.missingAltTextCount > 0,
    ).length,
  };
}
