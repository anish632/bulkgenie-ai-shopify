import { useCallback, useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useActionData, useRouteError, isRouteErrorResponse } from "@remix-run/react";
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
  InlineGrid,
  Divider,
  List,
  ChoiceList,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  PLANS,
  TRIAL_DAYS,
  getManagedPricingUrl,
  syncTierFromSubscription,
} from "../services/billing/plans";

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

    // Query Shopify for active subscriptions to sync tier
    let confirmationMessage: string | null = null;
    const activeSubscription = await getActiveSubscription(
      admin,
      confirmedPlan || undefined,
    );

    if (confirmedPlan) {
      // Merchant returning from Shopify billing confirmation
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
        const updatedShop = await prisma.shop.findUnique({
          where: { shopDomain },
        });
        return json({
          shop: updatedShop || shop,
          confirmationMessage,
          activeSubscription,
        });
      } else if (plan && !activeSubscription) {
        // Merchant declined the charge — don't update tier
        confirmationMessage = "Subscription was not confirmed. Your plan has not changed.";
      }
    } else if (chargeId) {
      const syncedTier = syncTierFromSubscription(activeSubscription);
      if (syncedTier !== shop.tier) {
        await prisma.shop.update({
          where: { shopDomain },
          data: { tier: syncedTier },
        });
        shop.tier = syncedTier;
      }
      confirmationMessage = activeSubscription
        ? "Subscription updated. Your plan has been synced from Shopify."
        : "Plan selection completed. Your current plan is Free.";
    } else {
      // Sync local tier with Shopify subscription state
      const syncedTier = syncTierFromSubscription(activeSubscription);
      if (syncedTier !== shop.tier) {
        await prisma.shop.update({
          where: { shopDomain },
          data: { tier: syncedTier },
        });
        shop.tier = syncedTier;
      }
    }

    // Reset usage if billing cycle has passed (30 days)
    const now = new Date();
    const resetDate = new Date(shop.usageResetDate);
    const daysSinceReset = Math.floor(
      (now.getTime() - resetDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysSinceReset >= 30) {
      await prisma.shop.update({
        where: { shopDomain },
        data: { monthlyUsage: 0, usageResetDate: now },
      });
      shop.monthlyUsage = 0;
      shop.usageResetDate = now;
    }

    return json({ shop, confirmationMessage, activeSubscription });
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
                    price {
                      amount
                      currencyCode
                    }
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
      const preferredSubscription = subscriptions.find(
        (subscription: { name: string }) =>
          subscription.name.toLowerCase().includes(preferredPlanId),
      );
      if (preferredSubscription) {
        return preferredSubscription;
      }
    }
    return subscriptions.length > 0 ? subscriptions[0] : null;
  } catch (error) {
    console.error("[billing] Failed to query active subscriptions:", error);
    return null;
  }
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { redirect, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "subscribe") {
    const planId = formData.get("planId") as string;
    const plan = PLANS.find((p) => p.id === planId);

    if (!plan) {
      return json({ error: "Unknown plan" }, { status: 400 });
    }

    return redirect(getManagedPricingUrl(session.shop), { target: "_top" });
  }

  return json({ error: "Unknown action" }, { status: 400 });
};

export default function BillingPage() {
  const { shop, confirmationMessage, activeSubscription } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const [billingInterval, setBillingInterval] = useState("EVERY_30_DAYS");

  const isAnnual = billingInterval === "ANNUAL";
  const currentPlan = PLANS.find((p) => p.id === shop.tier) || PLANS[0];
  const limit = currentPlan.productsPerMonth;
  const usagePercent =
    limit === Infinity
      ? 0
      : Math.round((shop.monthlyUsage / limit) * 100);

  const handleSubscribe = useCallback(
    (planId: string) => {
      const formData = new FormData();
      formData.set("intent", "subscribe");
      formData.set("planId", planId);
      formData.set("interval", billingInterval);
      submit(formData, { method: "post" });
    },
    [submit, billingInterval],
  );

  const formatPrice = (plan: typeof PLANS[number]) => {
    if (plan.price === 0) return "Free";
    if (isAnnual) {
      const monthly = Math.round((plan.annualPrice / 12) * 100) / 100;
      return `$${monthly.toFixed(2)}/mo`;
    }
    return `$${plan.price}/mo`;
  };

  return (
    <Page title="Billing & Usage" backAction={{ url: "/app" }}>
      <BlockStack gap="500">
        {confirmationMessage && (
          <Banner tone="success">{confirmationMessage}</Banner>
        )}
        {actionData && "message" in actionData && (
          <Banner tone="success">{actionData.message}</Banner>
        )}
        {actionData && "error" in actionData && (
          <Banner tone="critical">
            {(actionData as { error: string }).error}
          </Banner>
        )}

        {/* Current usage */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                Current Usage
              </Text>
              <Badge tone="info">{`${currentPlan.name} Plan`}</Badge>
            </InlineStack>
            <Text as="p" variant="bodyMd">
              {shop.monthlyUsage} /{" "}
              {limit === Infinity ? "Unlimited" : limit} products this month
            </Text>
            {limit !== Infinity && (
              <ProgressBar progress={Math.min(usagePercent, 100)} size="small" />
            )}
            <Text as="p" variant="bodySm" tone="subdued">
              Usage resets on{" "}
              {new Date(shop.usageResetDate).toLocaleDateString()}
            </Text>
          </BlockStack>
        </Card>

        {/* Plans */}
        <Layout>
          <Layout.Section>
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingLg">
                Plans
              </Text>
              <InlineStack gap="200" blockAlign="center">
                <ChoiceList
                  title=""
                  choices={[
                    { label: "Monthly", value: "EVERY_30_DAYS" },
                    { label: "Annual (save 17%)", value: "ANNUAL" },
                  ]}
                  selected={[billingInterval]}
                  onChange={(v) => setBillingInterval(v[0])}
                />
              </InlineStack>
            </InlineStack>
          </Layout.Section>
          <Layout.Section>
            <InlineGrid columns={4} gap="400">
              {PLANS.map((plan) => {
                const isCurrent = plan.id === shop.tier;
                return (
                  <Card key={plan.id}>
                    <BlockStack gap="300">
                      <InlineStack
                        align="space-between"
                        blockAlign="center"
                      >
                        <Text as="h3" variant="headingMd">
                          {plan.name}
                        </Text>
                        {isCurrent && (
                          <Badge tone="success">Current</Badge>
                        )}
                      </InlineStack>
                      <BlockStack gap="100">
                        <Text as="p" variant="headingLg">
                          {formatPrice(plan)}
                        </Text>
                        {isAnnual && plan.price > 0 && (
                          <Text as="p" variant="bodySm" tone="subdued">
                            {`$${plan.annualPrice}/yr — billed annually`}
                          </Text>
                        )}
                        {plan.price > 0 && (
                          <Badge tone="attention">{`${TRIAL_DAYS}-day free trial`}</Badge>
                        )}
                      </BlockStack>
                      <Divider />
                      <List>
                        {plan.features.map((feature, i) => (
                          <List.Item key={i}>{feature}</List.Item>
                        ))}
                      </List>
                      {!isCurrent && (
                        <Button
                          variant={
                            plan.price > currentPlan.price
                              ? "primary"
                              : undefined
                          }
                          onClick={() => handleSubscribe(plan.id)}
                          fullWidth
                        >
                          {plan.price === 0
                            ? "Choose Free in Shopify"
                            : plan.price > currentPlan.price
                              ? (activeSubscription ? "Upgrade in Shopify" : "Start Free Trial")
                              : "Switch in Shopify"}
                        </Button>
                      )}
                    </BlockStack>
                  </Card>
                );
              })}
            </InlineGrid>
          </Layout.Section>
        </Layout>
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
