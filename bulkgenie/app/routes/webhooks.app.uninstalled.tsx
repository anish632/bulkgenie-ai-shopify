import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { shop, session, topic } = await authenticate.webhook(request);

    console.log(`Received ${topic} webhook for ${shop}`);

    // Clean up all data for this shop
    if (session) {
      // Delete job items first (foreign key constraint)
      const jobs = await db.job.findMany({
        where: { shopDomain: shop },
        select: { id: true },
      });
      if (jobs.length > 0) {
        await db.jobItem.deleteMany({
          where: { jobId: { in: jobs.map((j) => j.id) } },
        });
      }
      await db.job.deleteMany({ where: { shopDomain: shop } });
      await db.shop.deleteMany({ where: { shopDomain: shop } });
      await db.session.deleteMany({ where: { shop } });
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("[webhooks.app.uninstalled] Error:", error);
    // Return 200 to acknowledge receipt even on error to avoid Shopify retries
    return new Response(null, { status: 200 });
  }
};
