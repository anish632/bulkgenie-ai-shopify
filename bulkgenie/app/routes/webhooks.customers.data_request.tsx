import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook`);
  // BulkGenie AI does not store customer data — respond with 200
  return new Response();
};
