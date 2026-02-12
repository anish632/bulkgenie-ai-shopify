import { useCallback, useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit, useActionData } from "@remix-run/react";
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

const TRIAL_DAYS = 3;

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    annualPrice: 0,
    productsPerMonth: 10,
    features: [
      "10 products/month",
      "Cloud AI generation",
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
      "Cloud AI generation",
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
      "Cloud AI generation",
      "Bring Your Own Key",
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
      "Premium AI models",
      "Bring Your Own Key",
      "Brand voice training",
      "All content fields",
      "Priority support",
    ],
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const url = new URL(request.url);
  const confirmedPlan = url.searchParams.get("confirmed");

  const shop = await prisma.shop.upsert({
    where: { shopDomain },
    update: {},
    create: { shopDomain },
  });

  // Handle return from Shopify billing confirmation
  let confirmationMessage: string | null = null;
  if (confirmedPlan) {
    const plan = PLANS.find((p) => p.id === confirmedPlan);
    if (plan) {
      await prisma.shop.update({
        where: { shopDomain },
        data: { tier: confirmedPlan },
      });
      confirmationMessage = `Successfully subscribed to ${plan.name} plan!`;
      // Re-fetch shop after update
      const updatedShop = await prisma.shop.findUnique({
        where: { shopDomain },
      });
      return json({
        shop: updatedShop || shop,
        confirmationMessage,
      });
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

  return json({ shop, confirmationMessage });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "subscribe") {
    const planId = formData.get("planId") as string;
    const interval = formData.get("interval") as string || "EVERY_30_DAYS";
    const plan = PLANS.find((p) => p.id === planId);

    if (!plan || plan.price === 0) {
      // Downgrade to free — cancel existing subscription
      await prisma.shop.update({
        where: { shopDomain },
        data: { tier: "free" },
      });
      return json({ success: true, message: "Downgraded to Free plan" });
    }

    const isAnnual = interval === "ANNUAL";
    const price = isAnnual ? plan.annualPrice : plan.price;
    const planLabel = `BulkGenie AI ${plan.name} (${isAnnual ? "Annual" : "Monthly"})`;

    // Create Shopify billing subscription
    const response = await admin.graphql(
      `#graphql
      mutation createSubscription($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $trialDays: Int, $test: Boolean) {
        appSubscriptionCreate(
          name: $name
          lineItems: $lineItems
          returnUrl: $returnUrl
          trialDays: $trialDays
          test: $test
        ) {
          appSubscription {
            id
          }
          confirmationUrl
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          name: planLabel,
          lineItems: [
            {
              plan: {
                appRecurringPricingDetails: {
                  price: {
                    amount: price,
                    currencyCode: "USD",
                  },
                  interval,
                },
              },
            },
          ],
          returnUrl: `https://${shopDomain}/admin/apps/bulkgenie/app/billing?confirmed=${planId}`,
          trialDays: TRIAL_DAYS,
          test: process.env.NODE_ENV !== "production",
        },
      },
    );

    const responseJson = await response.json();
    const { appSubscriptionCreate } = responseJson.data!;

    if (appSubscriptionCreate.userErrors?.length) {
      return json(
        { error: appSubscriptionCreate.userErrors[0].message },
        { status: 400 },
      );
    }

    // Redirect merchant to Shopify's confirmation page
    return redirect(appSubscriptionCreate.confirmationUrl);
  }

  return json({ error: "Unknown action" }, { status: 400 });
};

export default function BillingPage() {
  const { shop, confirmationMessage } = useLoaderData<typeof loader>();
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
                          {plan.price > currentPlan.price
                            ? "Start Free Trial"
                            : "Downgrade"}
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
