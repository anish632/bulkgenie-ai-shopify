import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { syncTierFromSubscription } from "../services/billing/plans";

type AppSubscriptionWebhookPayload = {
  app_subscription?: {
    name?: string | null;
    status?: string | null;
  };
  appSubscription?: {
    name?: string | null;
    status?: string | null;
  };
  name?: string | null;
  status?: string | null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, topic, shop } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  try {
    const subscriptionPayload = payload as AppSubscriptionWebhookPayload;
    const subscription =
      subscriptionPayload.app_subscription ||
      subscriptionPayload.appSubscription ||
      subscriptionPayload;

    await db.shop.upsert({
      where: { shopDomain: shop },
      update: {
        tier: syncTierFromSubscription(subscription),
      },
      create: {
        shopDomain: shop,
        tier: syncTierFromSubscription(subscription),
      },
    });
  } catch (error) {
    console.error(
      "[webhooks.app_subscriptions.update] Error syncing subscription:",
      error,
    );
  }

  return new Response(null, { status: 200 });
};
