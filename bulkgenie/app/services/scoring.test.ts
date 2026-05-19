import { describe, it, expect } from "vitest";
import {
  stripHtml,
  scoreProductContent,
  catalogGapSummary,
  THIN_DESCRIPTION_CHARS,
  SEO_TITLE_MAX,
  SEO_DESCRIPTION_MAX,
  type ProductForScoring,
} from "./scoring";

function makeProduct(overrides: Partial<{
  descriptionHtml: string;
  seoTitle: string | null;
  seoDescription: string | null;
  images: Array<{ id: string; altText: string | null }>;
}>): ProductForScoring {
  const images = overrides.images ?? [{ id: "img_1", altText: "A product" }];
  return {
    descriptionHtml: overrides.descriptionHtml ?? "<p>A detailed description of this great product. It covers all key features, benefits, materials, and use cases so shoppers have everything they need to make an informed purchase decision.</p>",
    seo: {
      title: "seoTitle" in overrides ? overrides.seoTitle ?? null : "Good SEO Title",
      description: "seoDescription" in overrides ? overrides.seoDescription ?? null : "A clear meta description under 160 chars.",
    },
    images: {
      edges: images.map((img) => ({ node: img })),
    },
  };
}

describe("stripHtml", () => {
  it("removes HTML tags and trims", () => {
    expect(stripHtml("<p>Hello <b>World</b></p>")).toBe("Hello World");
  });

  it("returns empty string for empty input", () => {
    expect(stripHtml("")).toBe("");
  });

  it("handles nested tags", () => {
    expect(stripHtml("<div><p>Text</p></div>")).toBe("Text");
  });
});

describe("scoreProductContent", () => {
  it("returns score 0 for a fully complete product", () => {
    const product = makeProduct({});
    const gap = scoreProductContent(product);
    expect(gap.score).toBe(0);
    expect(gap.hasMissingDescription).toBe(false);
    expect(gap.hasThinDescription).toBe(false);
    expect(gap.hasMissingSeoTitle).toBe(false);
    expect(gap.hasMissingSeoDescription).toBe(false);
    expect(gap.missingAltTextCount).toBe(0);
  });

  it("flags missing description", () => {
    const gap = scoreProductContent(makeProduct({ descriptionHtml: "" }));
    expect(gap.hasMissingDescription).toBe(true);
    expect(gap.hasThinDescription).toBe(false);
    expect(gap.score).toBeGreaterThanOrEqual(1);
  });

  it("flags thin description", () => {
    const shortText = "Short.";
    expect(shortText.length).toBeLessThan(THIN_DESCRIPTION_CHARS);
    const gap = scoreProductContent(makeProduct({ descriptionHtml: `<p>${shortText}</p>` }));
    expect(gap.hasMissingDescription).toBe(false);
    expect(gap.hasThinDescription).toBe(true);
    expect(gap.score).toBeGreaterThanOrEqual(1);
  });

  it("does not flag thin description when content is adequate", () => {
    const longText = "A".repeat(THIN_DESCRIPTION_CHARS);
    const gap = scoreProductContent(makeProduct({ descriptionHtml: `<p>${longText}</p>` }));
    expect(gap.hasThinDescription).toBe(false);
  });

  it("flags missing SEO title", () => {
    const gap = scoreProductContent(makeProduct({ seoTitle: null }));
    expect(gap.hasMissingSeoTitle).toBe(true);
    expect(gap.score).toBeGreaterThanOrEqual(1);
  });

  it("flags SEO title that is too long", () => {
    const longTitle = "A".repeat(SEO_TITLE_MAX + 1);
    const gap = scoreProductContent(makeProduct({ seoTitle: longTitle }));
    expect(gap.hasMissingSeoTitle).toBe(false);
    expect(gap.seoTitleTooLong).toBe(true);
    expect(gap.score).toBeGreaterThanOrEqual(1);
  });

  it("does not flag SEO title at exact limit", () => {
    const exactTitle = "A".repeat(SEO_TITLE_MAX);
    const gap = scoreProductContent(makeProduct({ seoTitle: exactTitle }));
    expect(gap.seoTitleTooLong).toBe(false);
  });

  it("flags missing meta description", () => {
    const gap = scoreProductContent(makeProduct({ seoDescription: null }));
    expect(gap.hasMissingSeoDescription).toBe(true);
    expect(gap.score).toBeGreaterThanOrEqual(1);
  });

  it("flags meta description that is too long", () => {
    const longDesc = "A".repeat(SEO_DESCRIPTION_MAX + 1);
    const gap = scoreProductContent(makeProduct({ seoDescription: longDesc }));
    expect(gap.hasMissingSeoDescription).toBe(false);
    expect(gap.seoDescriptionTooLong).toBe(true);
    expect(gap.score).toBeGreaterThanOrEqual(1);
  });

  it("flags images missing alt text", () => {
    const gap = scoreProductContent(makeProduct({
      images: [
        { id: "img_1", altText: "Has alt" },
        { id: "img_2", altText: null },
      ],
    }));
    expect(gap.missingAltTextCount).toBe(1);
    expect(gap.totalImageCount).toBe(2);
    expect(gap.score).toBeGreaterThanOrEqual(1);
  });

  it("returns score 0 when product has no images", () => {
    const gap = scoreProductContent(makeProduct({ images: [] }));
    expect(gap.missingAltTextCount).toBe(0);
    expect(gap.totalImageCount).toBe(0);
  });

  it("returns max score 4 for completely empty product", () => {
    const gap = scoreProductContent(makeProduct({
      descriptionHtml: "",
      seoTitle: null,
      seoDescription: null,
      images: [{ id: "img_1", altText: null }],
    }));
    expect(gap.score).toBe(4);
  });
});

describe("catalogGapSummary", () => {
  it("returns zeros for empty input", () => {
    const summary = catalogGapSummary([]);
    expect(summary.totalProducts).toBe(0);
    expect(summary.productsWithGaps).toBe(0);
  });

  it("counts products with gaps correctly", () => {
    const gapProduct = scoreProductContent(makeProduct({ seoTitle: null }));
    const cleanProduct = scoreProductContent(makeProduct({}));
    const summary = catalogGapSummary([gapProduct, cleanProduct, gapProduct]);
    expect(summary.totalProducts).toBe(3);
    expect(summary.productsWithGaps).toBe(2);
    expect(summary.missingSeoTitleCount).toBe(2);
  });

  it("aggregates all gap types", () => {
    const gaps = [
      scoreProductContent(makeProduct({ descriptionHtml: "" })),
      scoreProductContent(makeProduct({ seoTitle: null })),
      scoreProductContent(makeProduct({ seoDescription: null })),
      scoreProductContent(makeProduct({ images: [{ id: "i", altText: null }] })),
    ];
    const summary = catalogGapSummary(gaps);
    expect(summary.missingDescriptionCount).toBe(1);
    expect(summary.missingSeoTitleCount).toBe(1);
    expect(summary.missingSeoDescriptionCount).toBe(1);
    expect(summary.productsWithMissingAltText).toBe(1);
    expect(summary.productsWithGaps).toBe(4);
  });
});
