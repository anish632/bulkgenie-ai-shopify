export const APP_HANDLE = "bulkgenie-ai";
export const TRIAL_DAYS = 7;

export const PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    productsPerMonth: 10,
    requiresKey: false,
    features: [
      "10 products/month",
      "No API key required",
      "Template-based content",
      "SEO title, meta description, alt text",
      "Review before publishing",
    ],
  },
  {
    id: "scale",
    name: "Scale",
    price: 79,
    productsPerMonth: Infinity,
    requiresKey: true,
    features: [
      "Unlimited products",
      "Bring your own AI key",
      "Anthropic, OpenAI, Mistral, or Kimi",
      "Brand voice training",
      "All content fields",
      "Priority support",
    ],
  },
] as const;

export type BillingPlan = (typeof PLANS)[number];
export type PlanId = (typeof PLANS)[number]["id"];

export type SubscriptionLike = {
  name?: string | null;
  status?: string | null;
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["ACTIVE", "ACCEPTED"]);

export function getStoreHandle(shopDomain: string) {
  return shopDomain.replace(/\.myshopify\.com$/i, "");
}

export function getManagedPricingUrl(shopDomain: string) {
  const storeHandle = encodeURIComponent(getStoreHandle(shopDomain));
  return `https://admin.shopify.com/store/${storeHandle}/charges/${APP_HANDLE}/pricing_plans`;
}

export function syncTierFromSubscription(subscription: SubscriptionLike | null): PlanId {
  const status = subscription?.status?.toUpperCase();
  if (!subscription || (status && !ACTIVE_SUBSCRIPTION_STATUSES.has(status))) {
    return "free";
  }

  const name = (subscription.name || "").toLowerCase();
  if (name.includes("scale")) return "scale";

  return "free";
}

export function getMonthlyLimit(tier: string): number {
  const plan = PLANS.find((p) => p.id === tier);
  return plan?.productsPerMonth ?? 10;
}
