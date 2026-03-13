import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { payload, session, topic, shop } = await authenticate.webhook(request);
    console.log(`Received ${topic} webhook for ${shop}`);

    const current = payload.current as string[];
    if (session) {
      await db.session.update({   
        where: {
          id: session.id
        },
        data: {
          scope: current.toString(),
        },
      });
    }
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("[webhooks.app.scopes_update] Error:", error);
    // Return 200 to acknowledge receipt even on error to avoid Shopify retries
    return new Response(null, { status: 200 });
  }
};
