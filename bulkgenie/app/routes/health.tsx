import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const checks: Record<string, string> = {};

  checks.SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY ? "set" : "MISSING";
  checks.SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET ? "set" : "MISSING";
  checks.SHOPIFY_APP_URL = process.env.SHOPIFY_APP_URL || "MISSING";
  checks.TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL ? "set" : "MISSING";
  checks.TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN ? "set" : "MISSING";
  checks.NODE_ENV = process.env.NODE_ENV || "not set";

  // Test the shared prisma instance from db.server
  try {
    const { default: prisma } = await import("../db.server");
    const count = await prisma.session.count();
    checks.database = `OK (${count} sessions)`;
  } catch (e: any) {
    checks.database = `ERROR: ${e.message}`;
  }

  return json(checks);
};
