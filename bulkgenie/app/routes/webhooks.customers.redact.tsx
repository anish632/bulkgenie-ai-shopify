import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { topic } = await authenticate.webhook(request);
    console.log(`Received ${topic} webhook`);
    // BulkGenie AI does not store customer data — nothing to redact
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("[webhooks.customers.redact] Error:", error);
    // Return 200 to acknowledge receipt even on error to avoid Shopify retries
    return new Response(null, { status: 200 });
  }
};
