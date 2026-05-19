// Fixed demo catalog data — used when no real jobs exist to show first-time merchants what BulkGenie finds.
// Never mixed with real catalog data. Always shown with a "Sample data" label.

export interface DemoReviewRow {
  product: string;
  field: string;
  currentValue: string;
  suggestedValue: string;
}

export const DEMO_TOTAL_PRODUCTS = 86;
export const DEMO_MISSING_ALT_TEXT = 47;
export const DEMO_MISSING_META_DESC = 18;
export const DEMO_WEAK_TITLES = 12;
export const DEMO_MISSING_DETAILS = 9;
export const DEMO_PRODUCTS_WITH_GAPS = 58;

export const DEMO_REVIEW_ROWS: DemoReviewRow[] = [
  {
    product: "Merino Wool Sweater",
    field: "Meta description",
    currentValue: "(missing)",
    suggestedValue:
      "Soft 100% merino wool sweater in 8 colors. Machine washable, itch-free finish. Perfect for layering year-round.",
  },
  {
    product: "Ceramic Pour-Over Set",
    field: "Image alt text",
    currentValue: "(missing)",
    suggestedValue:
      "White ceramic pour-over coffee dripper set with glass carafe on wooden stand",
  },
  {
    product: "Running Shorts",
    field: "SEO title",
    currentValue: "Shorts",
    suggestedValue:
      "Men's Lightweight Running Shorts with Liner — Moisture-Wicking",
  },
  {
    product: "Leather Card Wallet",
    field: "Product description",
    currentValue: "(missing)",
    suggestedValue:
      "Slim full-grain leather card wallet. Holds 6 cards and folded bills. Develops a natural patina over time.",
  },
];

// Structured event logger — replace console.log with your analytics provider (PostHog, Segment, etc.)
export function trackEvent(
  event: string,
  props?: Record<string, unknown>,
): void {
  console.log(JSON.stringify({ event, ...props, ts: new Date().toISOString() }));
}
