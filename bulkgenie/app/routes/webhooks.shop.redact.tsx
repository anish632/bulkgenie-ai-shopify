import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  // Clean up all shop data
  await db.shop.deleteMany({ where: { shopDomain: shop } });
  await db.job.deleteMany({ where: { shopDomain: shop } });

  return new Response();
};
