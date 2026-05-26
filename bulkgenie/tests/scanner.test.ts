import { describe, it, expect } from "vitest";
import {
  detectIssues,
  stripHtml,
  AI_FIXABLE_ISSUES,
  LOW_RISK_ISSUES,
} from "../app/services/catalog/scanner";
import type { ScanProduct, DetectedIssue } from "../app/services/catalog/scanner";

function makeProduct(overrides: Partial<ScanProduct> = {}): ScanProduct {
  return {
    id: "gid://shopify/Product/1",
    title: "Test Product",
    descriptionHtml: "<p>A detailed product description that is long enough to pass the thin-content check and has more than one hundred characters in it.</p>",
    productType: "Apparel",
    vendor: "ACME",
    tags: ["tag1"],
    seo: {
      title: "Test Product by ACME — Best Quality Guaranteed",
      description: "Buy the test product today. Great quality, fast shipping, and a 30-day money-back guarantee on every order.",
    },
    images: [{ id: "img1", altText: "Front view of test product", url: "https://cdn.shopify.com/img1.jpg" }],
    ...overrides,
  };
}

describe("stripHtml", () => {
  it("removes HTML tags and normalises whitespace", () => {
    expect(stripHtml("<p>Hello <strong>world</strong></p>")).toBe("Hello world");
    expect(stripHtml("<br/><p> </p>")).toBe("");
  });
});

describe("detectIssues — clean product", () => {
  it("returns no issues for a fully populated product", () => {
    const issues = detectIssues([makeProduct()]);
    expect(issues).toHaveLength(0);
  });
});

describe("detectIssues — SEO title", () => {
  it("flags missing_seo_title when seo.title is empty", () => {
    const issues = detectIssues([makeProduct({ seo: { title: "", description: "Good meta." } })]);
    expect(issues.some((i) => i.issueType === "missing_seo_title")).toBe(true);
  });

  it("flags seo_title_too_long when title > 70 chars", () => {
    const longTitle = "A".repeat(71);
    const issues = detectIssues([makeProduct({ seo: { title: longTitle, description: "Good meta." } })]);
    expect(issues.some((i) => i.issueType === "seo_title_too_long")).toBe(true);
  });

  it("flags seo_title_too_short when title is present but < 30 chars", () => {
    const issues = detectIssues([makeProduct({ seo: { title: "Short", description: "Good meta." } })]);
    expect(issues.some((i) => i.issueType === "seo_title_too_short")).toBe(true);
  });

  it("does not flag missing_seo_title for a title that is too long", () => {
    const longTitle = "A".repeat(80);
    const issues = detectIssues([makeProduct({ seo: { title: longTitle, description: "Good meta." } })]);
    expect(issues.some((i) => i.issueType === "missing_seo_title")).toBe(false);
  });
});

describe("detectIssues — meta description", () => {
  it("flags missing_meta_description when seo.description is empty", () => {
    const issues = detectIssues([makeProduct({ seo: { title: "A Valid SEO Title Here", description: "" } })]);
    expect(issues.some((i) => i.issueType === "missing_meta_description")).toBe(true);
  });

  it("flags meta_desc_too_long when description > 160 chars", () => {
    const issues = detectIssues([
      makeProduct({ seo: { title: "A Valid SEO Title Here", description: "X".repeat(161) } }),
    ]);
    expect(issues.some((i) => i.issueType === "meta_desc_too_long")).toBe(true);
  });

  it("flags meta_desc_too_short when description is present but < 70 chars", () => {
    const issues = detectIssues([
      makeProduct({ seo: { title: "A Valid SEO Title Here", description: "Short." } }),
    ]);
    expect(issues.some((i) => i.issueType === "meta_desc_too_short")).toBe(true);
  });
});

describe("detectIssues — description", () => {
  it("flags thin_description with high severity when description is empty", () => {
    const issues = detectIssues([makeProduct({ descriptionHtml: "" })]);
    const issue = issues.find((i) => i.issueType === "thin_description");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("high");
  });

  it("flags thin_description with medium severity when description < 100 chars", () => {
    const issues = detectIssues([makeProduct({ descriptionHtml: "<p>Too short.</p>" })]);
    const issue = issues.find((i) => i.issueType === "thin_description");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("medium");
  });

  it("does not flag thin_description when description is long enough", () => {
    const longDesc = "<p>" + "Word ".repeat(30) + "</p>";
    const issues = detectIssues([makeProduct({ descriptionHtml: longDesc })]);
    expect(issues.some((i) => i.issueType === "thin_description")).toBe(false);
  });
});

describe("detectIssues — alt text", () => {
  it("flags missing_alt_text for each image missing alt text", () => {
    const product = makeProduct({
      images: [
        { id: "img1", altText: "", url: "https://cdn.shopify.com/img1.jpg" },
        { id: "img2", altText: "Has alt", url: "https://cdn.shopify.com/img2.jpg" },
        { id: "img3", altText: "", url: "https://cdn.shopify.com/img3.jpg" },
      ],
    });
    const issues = detectIssues([product]);
    const altIssues = issues.filter((i) => i.issueType === "missing_alt_text");
    expect(altIssues).toHaveLength(2);
    expect(altIssues[0].imageId).toBe("img1");
    expect(altIssues[1].imageId).toBe("img3");
  });
});

describe("detectIssues — duplicates", () => {
  it("flags duplicate_seo_title for products sharing an SEO title", () => {
    const sharedTitle = "Same SEO Title For Multiple Products Here";
    const products = [
      makeProduct({ id: "gid://shopify/Product/1", seo: { title: sharedTitle, description: "Desc A." } }),
      makeProduct({ id: "gid://shopify/Product/2", seo: { title: sharedTitle, description: "Desc B." } }),
    ];
    const issues = detectIssues(products);
    const dupes = issues.filter((i) => i.issueType === "duplicate_seo_title");
    expect(dupes).toHaveLength(2);
  });

  it("flags duplicate_description when two products share identical descriptions", () => {
    const sharedDesc = "<p>" + "Same content ".repeat(15) + "</p>";
    const products = [
      makeProduct({ id: "gid://shopify/Product/1", descriptionHtml: sharedDesc }),
      makeProduct({ id: "gid://shopify/Product/2", descriptionHtml: sharedDesc }),
    ];
    const issues = detectIssues(products);
    const dupes = issues.filter((i) => i.issueType === "duplicate_description");
    expect(dupes).toHaveLength(2);
  });

  it("does not flag duplicate when only one product has that SEO title", () => {
    const products = [
      makeProduct({ id: "gid://shopify/Product/1", seo: { title: "Unique Title One Here", description: "Desc A long enough to pass." } }),
      makeProduct({ id: "gid://shopify/Product/2", seo: { title: "Unique Title Two Here", description: "Desc B long enough to pass." } }),
    ];
    const issues = detectIssues(products);
    expect(issues.filter((i) => i.issueType === "duplicate_seo_title")).toHaveLength(0);
  });
});

describe("detectIssues — missing attributes", () => {
  it("flags missing_product_type when productType is empty", () => {
    const issues = detectIssues([makeProduct({ productType: "" })]);
    expect(issues.some((i) => i.issueType === "missing_product_type")).toBe(true);
  });

  it("flags no_tags when tags array is empty", () => {
    const issues = detectIssues([makeProduct({ tags: [] })]);
    expect(issues.some((i) => i.issueType === "no_tags")).toBe(true);
  });
});

describe("issue shape", () => {
  it("every detected issue has required fields", () => {
    const product = makeProduct({
      descriptionHtml: "",
      seo: { title: "", description: "" },
      images: [{ id: "img1", altText: "", url: "" }],
      productType: "",
      tags: [],
    });
    const issues = detectIssues([product]);
    for (const issue of issues) {
      expect(issue.shopifyProductId).toBeTypeOf("string");
      expect(issue.productTitle).toBeTypeOf("string");
      expect(issue.issueType).toBeTypeOf("string");
      expect(issue.fieldName).toBeTypeOf("string");
      expect(["low", "medium", "high"]).toContain(issue.severity);
    }
  });
});

describe("AI_FIXABLE_ISSUES / LOW_RISK_ISSUES constants", () => {
  it("AI_FIXABLE_ISSUES contains the key fixable types", () => {
    expect(AI_FIXABLE_ISSUES.has("missing_seo_title")).toBe(true);
    expect(AI_FIXABLE_ISSUES.has("missing_meta_description")).toBe(true);
    expect(AI_FIXABLE_ISSUES.has("missing_alt_text")).toBe(true);
    expect(AI_FIXABLE_ISSUES.has("thin_description")).toBe(true);
  });

  it("AI_FIXABLE_ISSUES does not contain manual-only types", () => {
    expect(AI_FIXABLE_ISSUES.has("missing_product_type")).toBe(false);
    expect(AI_FIXABLE_ISSUES.has("no_tags")).toBe(false);
  });

  it("LOW_RISK_ISSUES is a subset of AI_FIXABLE_ISSUES", () => {
    for (const issueType of LOW_RISK_ISSUES) {
      expect(AI_FIXABLE_ISSUES.has(issueType)).toBe(true);
    }
  });
});

describe("proposed fix data structure", () => {
  it("DetectedIssue for alt text includes imageId", () => {
    const product = makeProduct({
      images: [{ id: "gid://shopify/ProductImage/42", altText: "" }],
    });
    const issues = detectIssues([product]);
    const altIssue = issues.find((i) => i.issueType === "missing_alt_text");
    expect(altIssue?.imageId).toBe("gid://shopify/ProductImage/42");
    expect(altIssue?.fieldName).toBe("altText");
  });

  it("DetectedIssue for description does not include imageId", () => {
    const product = makeProduct({ descriptionHtml: "<p>Short</p>" });
    const issues = detectIssues([product]);
    const descIssue = issues.find((i) => i.issueType === "thin_description");
    expect(descIssue?.imageId).toBeUndefined();
  });
});
