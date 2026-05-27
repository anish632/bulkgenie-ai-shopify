import type { Shop } from "@prisma/client";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  InlineStack,
  Badge,
  Banner,
  ProgressBar,
  Divider,
  List,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { trackEvent } from "../services/demo";
import {
  PLANS,
  TRIAL_DAYS,
  getManagedPricingUrl,
  syncTierFromSubscription,
  getMonthlyLimit,
} from "../services/billing/plans";

function serializeBillingShop(
  shop: Pick<Shop, "tier" | "monthlyUsage" | "usageResetDate">,
) {
  return {
    tier: shop.tier,
    monthlyUsage: shop.monthlyUsage,
    usageResetDate: shop.usageResetDate,
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { admin, session } = await authenticate.admin(request);
    const shopDomain = session.shop;
    const url = new URL(request.url);
    const confirmedPlan = url.searchParams.get("confirmed");
    const chargeId = url.searchParams.get("charge_id");

    const shop = await prisma.shop.upsert({
      where: { shopDomain },
      update: {},
      create: { shopDomain },
    });

    let confirmationMessage: string | null = null;
    const activeSubscription = await getActiveSubscription(
      admin,
      confirmedPlan || undefined,
    );

    if (confirmedPlan) {
      const plan = PLANS.find((p) => p.id === confirmedPlan);
      if (plan && activeSubscription) {
        const syncedTier = syncTierFromSubscription(activeSubscription);
        await prisma.shop.update({
          where: { shopDomain },
          data: { tier: syncedTier },
        });
        confirmationMessage =
          syncedTier === confirmedPlan
            ? `Successfully subscribed to ${plan.name} plan!`
            : "Subscription confirmed. Your plan has been synced from Shopify.";
        trackEvent("subscription_started", { plan: syncedTier, source: "billing_confirmation" });
        const updatedShop = await prisma.shop.findUnique({ where: { shopDomain } });
        return json({
          shop: serializeBillingShop(updatedShop || shop),
          confirmationMessage,
          activeSubscription,
          managedPricingUrl: getManagedPricingUrl(shopDomain),
        });
      } else if (plan && !activeSubscription) {
        confirmationMessage = "Subscription was not confirmed. Your plan has not changed.";
      }
    } else if (chargeId) {
      const syncedTier = syncTierFromSubscription(activeSubscription);
      if (syncedTier !== shop.tier) {
        await prisma.shop.update({ where: { shopDomain }, data: { tier: syncedTier } });
        shop.tier = syncedTier;
      }
      confirmationMessage = activeSubscription
        ? "Subscription updated. Your plan has been synced from Shopify."
        : "Plan selection completed. Your current plan is Free.";
      if (activeSubscription && syncedTier !== "free") {
        trackEvent("subscription_started", { plan: syncedTier, source: "charge_return" });
      }
    } else {
      const syncedTier = syncTierFromSubscription(activeSubscription);
      if (syncedTier !== shop.tier) {
        await prisma.shop.update({ where: { shopDomain }, data: { tier: syncedTier } });
        shop.tier = syncedTier;
      }
    }

    // Reset usage if billing cycle has passed (30 days)
    const now = new Date();
    const daysSinceReset = Math.floor(
      (now.getTime() - new Date(shop.usageResetDate).getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysSinceReset >= 30) {
      await prisma.shop.update({
        where: { shopDomain },
        data: { monthlyUsage: 0, usageResetDate: now },
      });
      shop.monthlyUsage = 0;
      shop.usageResetDate = now;
    }

    trackEvent("paywall_viewed", {
      currentTier: shop.tier,
      hasActiveSubscription: Boolean(activeSubscription),
      source: "billing_page",
    });

    return json({
      shop: serializeBillingShop(shop),
      confirmationMessage,
      activeSubscription,
      managedPricingUrl: getManagedPricingUrl(shopDomain),
    });
  } catch (error) {
    console.error("[app.billing] Loader error:", error);
    throw new Response("Failed to load billing information", {
      status: 500,
      statusText: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

async function getActiveSubscription(
  admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"],
  preferredPlanId?: string,
) {
  try {
    const response = await admin.graphql(
      `#graphql
      query {
        currentAppInstallation {
          activeSubscriptions {
            id
            name
            status
            lineItems {
              plan {
                pricingDetails {
                  ... on AppRecurringPricing {
                    price { amount currencyCode }
                    interval
                  }
                }
              }
            }
          }
        }
      }`,
    );
    const data = await response.json();
    const subscriptions = data.data?.currentAppInstallation?.activeSubscriptions || [];
    if (preferredPlanId) {
      const preferred = subscriptions.find((s: { name: string }) =>
        s.name.toLowerCase().includes(preferredPlanId),
      );
      if (preferred) return preferred;
    }
    return subscriptions.length > 0 ? subscriptions[0] : null;
  } catch (error) {
    console.error("[billing] Failed to query active subscriptions:", error);
    return null;
  }
}

export default function BillingPage() {
  const { shop, confirmationMessage, activeSubscription, managedPricingUrl } =
    useLoaderData<typeof loader>();

  const limit = getMonthlyLimit(shop.tier);
  const usagePercent =
    limit === Infinity ? 0 : Math.round((shop.monthlyUsage / limit) * 100);

  const freePlan = PLANS[0];
  const scalePlan = PLANS[1];
  const isOnFree = shop.tier === "free";
  const isOnScale = shop.tier === "scale";

  return (
    <Page title="Billing & Usage" backAction={{ url: "/app" }}>
      <BlockStack gap="500">
        {confirmationMessage && (
          <Banner tone={confirmationMessage.includes("not confirmed") ? "warning" : "success"}>
            {confirmationMessage}
          </Banner>
        )}

        {/* Current usage */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">Current Usage</Text>
              <Badge tone={isOnScale ? "success" : "info"}>
                {isOnScale ? "Scale Plan" : "Free Plan"}
              </Badge>
            </InlineStack>
            <Text as="p" variant="bodyMd">
              {shop.monthlyUsage} / {limit === Infinity ? "Unlimited" : limit} products this month
            </Text>
            {limit !== Infinity && (
              <ProgressBar progress={Math.min(usagePercent, 100)} size="small" />
            )}
            <Text as="p" variant="bodySm" tone="subdued">
              Usage resets on {new Date(shop.usageResetDate).toLocaleDateString()}
            </Text>
          </BlockStack>
        </Card>

        {/* Plans side-by-side */}
        <Layout>
          <Layout.Section>
            <Text as="h2" variant="headingLg">Plans</Text>
          </Layout.Section>
          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h3" variant="headingMd">{freePlan.name}</Text>
                  {isOnFree && <Badge tone="success">Current</Badge>}
                </InlineStack>
                <Text as="p" variant="headingLg">Free</Text>
                <Text as="p" variant="bodySm" tone="subdued">No credit card required</Text>
                <Divider />
                <List>
                  {freePlan.features.map((f) => (
                    <List.Item key={f}>{f}</List.Item>
                  ))}
                </List>
                {!isOnFree && (
                  <Button url={managedPricingUrl} target="_top" fullWidth>
                    Switch to Free in Shopify
                  </Button>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneHalf">
            <Card background={isOnScale ? "bg-surface-success" : "bg-surface"}>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h3" variant="headingMd">{scalePlan.name}</Text>
                  {isOnScale && <Badge tone="success">Current</Badge>}
                </InlineStack>
                <BlockStack gap="100">
                  <Text as="p" variant="headingLg">${scalePlan.price}/mo</Text>
                  {!isOnScale && (
                    <Badge tone="attention">{`${TRIAL_DAYS}-day free trial`}</Badge>
                  )}
                </BlockStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  Cancel anytime. Billed through Shopify.
                </Text>
                <Divider />
                <List>
                  {scalePlan.features.map((f) => (
                    <List.Item key={f}>{f}</List.Item>
                  ))}
                </List>
                {!isOnScale && (
                  <Button
                    variant="primary"
                    url={managedPricingUrl}
                    target="_top"
                    fullWidth
                  >
                    {activeSubscription ? "Upgrade in Shopify" : "Start Free Trial in Shopify"}
                  </Button>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {isOnScale && (
          <Banner tone="info" title="Your Scale plan is active">
            <p>
              Configure your AI provider key in{" "}
              <a href="/app/settings">Settings</a> to enable AI-generated content.
              Unlimited products — you only pay your provider for tokens used.
            </p>
          </Banner>
        )}
      </BlockStack>
    </Page>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  let errorMessage = "An unexpected error occurred";
  if (isRouteErrorResponse(error)) {
    errorMessage = error.statusText || error.data;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  return (
    <Page title="Billing & Usage" backAction={{ url: "/app" }}>
      <Banner tone="critical" title="Error loading billing information">
        <p>{errorMessage}</p>
      </Banner>
      <BlockStack gap="400">
        <Button url="/app">Return to Dashboard</Button>
      </BlockStack>
    </Page>
  );
}
