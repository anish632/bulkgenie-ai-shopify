export const APP_HANDLE = "bulkgenie-ai";
export const TRIAL_DAYS = 3;

export const PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    annualPrice: 0,
    productsPerMonth: 10,
    features: [
      "10 products/month",
      "Bring your own API key",
      "All content fields",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    price: 19,
    annualPrice: 190,
    productsPerMonth: 100,
    features: [
      "100 products/month",
      "Bring your own API key",
      "All content fields",
      "Priority processing",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    price: 39,
    annualPrice: 390,
    productsPerMonth: 500,
    features: [
      "500 products/month",
      "Bring your own API key",
      "Brand voice training",
      "All content fields",
    ],
  },
  {
    id: "scale",
    name: "Scale",
    price: 79,
    annualPrice: 790,
    productsPerMonth: Infinity,
    features: [
      "Unlimited products",
      "Bring your own API key",
      "Brand voice training",
      "All content fields",
      "Priority support",
    ],
  },
];

export type BillingPlan = (typeof PLANS)[number];

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

export function syncTierFromSubscription(subscription: SubscriptionLike | null) {
  const status = subscription?.status?.toUpperCase();
  if (!subscription || (status && !ACTIVE_SUBSCRIPTION_STATUSES.has(status))) {
    return "free";
  }

  const name = (subscription.name || "").toLowerCase();
  for (const plan of PLANS) {
    if (plan.id !== "free" && name.includes(plan.id)) {
      return plan.id;
    }
  }

  return "free";
}
