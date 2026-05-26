export type IssueType =
  | "missing_seo_title"
  | "missing_meta_description"
  | "missing_alt_text"
  | "thin_description"
  | "duplicate_description"
  | "duplicate_seo_title"
  | "duplicate_meta_description"
  | "seo_title_too_long"
  | "seo_title_too_short"
  | "meta_desc_too_long"
  | "meta_desc_too_short"
  | "missing_product_type"
  | "no_tags";

export type Severity = "low" | "medium" | "high";

export interface DetectedIssue {
  shopifyProductId: string;
  productTitle: string;
  imageId?: string;
  issueType: IssueType;
  fieldName: string;
  currentValue?: string;
  severity: Severity;
}

export interface ScanProduct {
  id: string;
  title: string;
  descriptionHtml?: string;
  productType?: string;
  vendor?: string;
  tags?: string[];
  seo?: { title?: string; description?: string };
  images?: Array<{ id: string; altText?: string; url?: string }>;
}

const SEO_TITLE_MAX = 70;
const SEO_TITLE_MIN = 30;
const META_DESC_MAX = 160;
const META_DESC_MIN = 70;
const THIN_DESCRIPTION_CHARS = 100;

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

export function detectIssues(products: ScanProduct[]): DetectedIssue[] {
  const issues: DetectedIssue[] = [];

  // Build frequency maps for duplicate detection
  const descriptionCount = new Map<string, number>();
  const seoTitleCount = new Map<string, number>();
  const metaDescCount = new Map<string, number>();

  for (const p of products) {
    const desc = p.descriptionHtml ? normalize(stripHtml(p.descriptionHtml)) : "";
    const seoTitle = p.seo?.title ? normalize(p.seo.title) : "";
    const metaDesc = p.seo?.description ? normalize(p.seo.description) : "";

    if (desc.length >= THIN_DESCRIPTION_CHARS) {
      descriptionCount.set(desc, (descriptionCount.get(desc) ?? 0) + 1);
    }
    if (seoTitle) seoTitleCount.set(seoTitle, (seoTitleCount.get(seoTitle) ?? 0) + 1);
    if (metaDesc) metaDescCount.set(metaDesc, (metaDescCount.get(metaDesc) ?? 0) + 1);
  }

  for (const p of products) {
    const desc = p.descriptionHtml ? stripHtml(p.descriptionHtml) : "";
    const seoTitle = p.seo?.title ?? "";
    const metaDesc = p.seo?.description ?? "";

    // Missing / thin description
    if (desc.length === 0) {
      issues.push({
        shopifyProductId: p.id,
        productTitle: p.title,
        issueType: "thin_description",
        fieldName: "description",
        currentValue: "",
        severity: "high",
      });
    } else if (desc.length < THIN_DESCRIPTION_CHARS) {
      issues.push({
        shopifyProductId: p.id,
        productTitle: p.title,
        issueType: "thin_description",
        fieldName: "description",
        currentValue: desc.substring(0, 200),
        severity: "medium",
      });
    }

    // Duplicate description
    if (desc.length >= THIN_DESCRIPTION_CHARS) {
      const key = normalize(desc);
      if ((descriptionCount.get(key) ?? 0) > 1) {
        issues.push({
          shopifyProductId: p.id,
          productTitle: p.title,
          issueType: "duplicate_description",
          fieldName: "description",
          currentValue: desc.substring(0, 200),
          severity: "medium",
        });
      }
    }

    // Missing SEO title
    if (!seoTitle) {
      issues.push({
        shopifyProductId: p.id,
        productTitle: p.title,
        issueType: "missing_seo_title",
        fieldName: "seoTitle",
        currentValue: "",
        severity: "high",
      });
    } else {
      // SEO title length checks
      if (seoTitle.length > SEO_TITLE_MAX) {
        issues.push({
          shopifyProductId: p.id,
          productTitle: p.title,
          issueType: "seo_title_too_long",
          fieldName: "seoTitle",
          currentValue: seoTitle,
          severity: "medium",
        });
      } else if (seoTitle.length < SEO_TITLE_MIN) {
        issues.push({
          shopifyProductId: p.id,
          productTitle: p.title,
          issueType: "seo_title_too_short",
          fieldName: "seoTitle",
          currentValue: seoTitle,
          severity: "low",
        });
      }

      // Duplicate SEO title
      const key = normalize(seoTitle);
      if ((seoTitleCount.get(key) ?? 0) > 1) {
        issues.push({
          shopifyProductId: p.id,
          productTitle: p.title,
          issueType: "duplicate_seo_title",
          fieldName: "seoTitle",
          currentValue: seoTitle,
          severity: "high",
        });
      }
    }

    // Missing meta description
    if (!metaDesc) {
      issues.push({
        shopifyProductId: p.id,
        productTitle: p.title,
        issueType: "missing_meta_description",
        fieldName: "seoDescription",
        currentValue: "",
        severity: "high",
      });
    } else {
      // Meta desc length checks
      if (metaDesc.length > META_DESC_MAX) {
        issues.push({
          shopifyProductId: p.id,
          productTitle: p.title,
          issueType: "meta_desc_too_long",
          fieldName: "seoDescription",
          currentValue: metaDesc,
          severity: "medium",
        });
      } else if (metaDesc.length < META_DESC_MIN) {
        issues.push({
          shopifyProductId: p.id,
          productTitle: p.title,
          issueType: "meta_desc_too_short",
          fieldName: "seoDescription",
          currentValue: metaDesc,
          severity: "low",
        });
      }

      // Duplicate meta description
      const key = normalize(metaDesc);
      if ((metaDescCount.get(key) ?? 0) > 1) {
        issues.push({
          shopifyProductId: p.id,
          productTitle: p.title,
          issueType: "duplicate_meta_description",
          fieldName: "seoDescription",
          currentValue: metaDesc,
          severity: "medium",
        });
      }
    }

    // Missing image alt text (one issue per image missing alt)
    if (p.images) {
      for (const img of p.images) {
        if (!img.altText || img.altText.trim() === "") {
          issues.push({
            shopifyProductId: p.id,
            productTitle: p.title,
            imageId: img.id,
            issueType: "missing_alt_text",
            fieldName: "altText",
            currentValue: "",
            severity: "medium",
          });
        }
      }
    }

    // Missing product type
    if (!p.productType || p.productType.trim() === "") {
      issues.push({
        shopifyProductId: p.id,
        productTitle: p.title,
        issueType: "missing_product_type",
        fieldName: "productType",
        currentValue: "",
        severity: "low",
      });
    }

    // No tags
    if (!p.tags || p.tags.length === 0) {
      issues.push({
        shopifyProductId: p.id,
        productTitle: p.title,
        issueType: "no_tags",
        fieldName: "tags",
        currentValue: "",
        severity: "low",
      });
    }
  }

  return issues;
}

export const ISSUE_LABELS: Record<IssueType, string> = {
  missing_seo_title: "Missing SEO title",
  missing_meta_description: "Missing meta description",
  missing_alt_text: "Missing image alt text",
  thin_description: "Thin or missing description",
  duplicate_description: "Duplicate description",
  duplicate_seo_title: "Duplicate SEO title",
  duplicate_meta_description: "Duplicate meta description",
  seo_title_too_long: "SEO title too long",
  seo_title_too_short: "SEO title too short",
  meta_desc_too_long: "Meta description too long",
  meta_desc_too_short: "Meta description too short",
  missing_product_type: "Missing product type",
  no_tags: "No tags",
};

// Issues that have an AI-fixable field
export const AI_FIXABLE_ISSUES = new Set<IssueType>([
  "missing_seo_title",
  "seo_title_too_long",
  "seo_title_too_short",
  "duplicate_seo_title",
  "missing_meta_description",
  "meta_desc_too_long",
  "meta_desc_too_short",
  "duplicate_meta_description",
  "thin_description",
  "duplicate_description",
  "missing_alt_text",
]);

// Low-risk issues safe for auto-apply (no product content)
export const LOW_RISK_ISSUES = new Set<IssueType>([
  "missing_seo_title",
  "missing_meta_description",
  "missing_alt_text",
  "seo_title_too_short",
  "meta_desc_too_short",
]);
