import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { fetchAllProductsForScan } from "../services/shopify/products";
import { detectIssues, ISSUE_LABELS, AI_FIXABLE_ISSUES } from "../services/catalog/scanner";
import { generateFix } from "../services/catalog/ai-fixer";
import { sendScanSummaryEmail } from "../services/email/scan-summary";

const MAX_AI_FIXES_PER_RUN = 100;
const APP_URL = process.env.SHOPIFY_APP_URL ?? "https://bulkgenie.dasgroupllc.com";

// Vercel cron invokes this route via GET with an Authorization header.
export async function loader({ request }: LoaderFunctionArgs) {
  if (!verifyCronSecret(request)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const shops = await prisma.shop.findMany({
    where: { weeklyScansEnabled: true },
  });

  const results: Array<{ shop: string; status: string; issues?: number }> = [];

  for (const shop of shops) {
    try {
      await runScanForShop(shop.shopDomain);
      results.push({ shop: shop.shopDomain, status: "ok" });
    } catch (err) {
      console.error(`[cron] scan failed for ${shop.shopDomain}:`, err);
      results.push({
        shop: shop.shopDomain,
        status: "error",
      });
    }
  }

  return json({ scanned: results.length, results });
}

function verifyCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // allow unauthenticated in dev (no secret set)
  const auth = request.headers.get("Authorization");
  return auth === `Bearer ${secret}`;
}

async function runScanForShop(shopDomain: string): Promise<void> {
  // Skip if a scan already ran in the last 6 days (prevent double-runs)
  const recentScan = await prisma.scanReport.findFirst({
    where: {
      shopDomain,
      createdAt: { gte: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000) },
      status: { in: ["completed", "running"] },
    },
  });
  if (recentScan) return;

  const report = await prisma.scanReport.create({
    data: { shopDomain, status: "running" },
  });

  try {
    // Get the offline access token from session storage
    const session = await prisma.session.findFirst({
      where: { shop: shopDomain, isOnline: false },
      orderBy: { id: "desc" },
    });
    if (!session?.accessToken) {
      await prisma.scanReport.update({
        where: { id: report.id },
        data: { status: "failed", errorMessage: "No offline session found", completedAt: new Date() },
      });
      return;
    }

    // Fetch all products for scan (up to 500)
    const products = await fetchAllProductsForScan(session.accessToken, shopDomain, 500);

    // Run issue detection
    const rawIssues = detectIssues(products);

    // Persist issues
    if (rawIssues.length > 0) {
      await prisma.scanIssue.createMany({
        data: rawIssues.map((issue) => ({
          scanReportId: report.id,
          shopifyProductId: issue.shopifyProductId,
          productTitle: issue.productTitle,
          imageId: issue.imageId ?? null,
          issueType: issue.issueType,
          fieldName: issue.fieldName,
          currentValue: issue.currentValue ?? null,
          severity: issue.severity,
          status: AI_FIXABLE_ISSUES.has(issue.issueType) ? "pending" : "skipped",
        })),
      });
    }

    await prisma.scanReport.update({
      where: { id: report.id },
      data: { productsScanned: products.length, issuesFound: rawIssues.length },
    });

    // Build product map for fast lookup during fix generation
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Fetch the shop record (with AI provider / key) for fix generation
    const shopRecord = await prisma.shop.findUnique({ where: { shopDomain } });
    if (!shopRecord?.byokApiKey) {
      // Can't generate fixes without an API key; mark complete without fixes
      await prisma.scanReport.update({
        where: { id: report.id },
        data: { status: "completed", completedAt: new Date() },
      });
      await maybeEmail(shopRecord, report.id, shopDomain, products.length, rawIssues.length, 0);
      return;
    }

    // Generate AI fixes — high severity first, capped at MAX_AI_FIXES_PER_RUN
    const fixableIssues = rawIssues
      .filter((i) => AI_FIXABLE_ISSUES.has(i.issueType))
      .sort((a, b) => {
        const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
        return (order[a.severity] ?? 1) - (order[b.severity] ?? 1);
      })
      .slice(0, MAX_AI_FIXES_PER_RUN);

    let fixesGenerated = 0;

    for (const issue of fixableIssues) {
      const product = productMap.get(issue.shopifyProductId);
      if (!product) continue;

      const proposed = await generateFix(shopRecord, product, issue);
      if (!proposed) continue;

      await prisma.scanIssue.updateMany({
        where: {
          scanReportId: report.id,
          shopifyProductId: issue.shopifyProductId,
          issueType: issue.issueType,
          imageId: issue.imageId ?? null,
        },
        data: { proposedValue: proposed, status: "fix_ready" },
      });

      fixesGenerated++;
      await new Promise((r) => setTimeout(r, 250));
    }

    await prisma.scanReport.update({
      where: { id: report.id },
      data: { fixesGenerated, status: "completed", completedAt: new Date() },
    });

    await maybeEmail(shopRecord, report.id, shopDomain, products.length, rawIssues.length, fixesGenerated);
  } catch (err) {
    await prisma.scanReport.update({
      where: { id: report.id },
      data: {
        status: "failed",
        errorMessage: err instanceof Error ? err.message : String(err),
        completedAt: new Date(),
      },
    });
    throw err;
  }
}

async function maybeEmail(
  shop: Awaited<ReturnType<typeof prisma.shop.findUnique>>,
  reportId: string,
  shopDomain: string,
  productsScanned: number,
  issuesFound: number,
  fixesGenerated: number,
) {
  const recipient = shop?.scanEmailRecipient;
  if (!recipient || !issuesFound) return;

  // Build issue breakdown
  const issues = await prisma.scanIssue.findMany({
    where: { scanReportId: reportId },
    select: { issueType: true },
  });
  const counts = new Map<string, number>();
  for (const { issueType } of issues) {
    counts.set(issueType, (counts.get(issueType) ?? 0) + 1);
  }
  const breakdown = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([issueType, count]) => ({
      label: ISSUE_LABELS[issueType as keyof typeof ISSUE_LABELS] ?? issueType,
      count,
    }));

  await sendScanSummaryEmail({
    to: recipient,
    shopDomain,
    productsScanned,
    issuesFound,
    fixesReady: fixesGenerated,
    issueBreakdown: breakdown,
    approvalUrl: `${APP_URL}/app/scan`,
  });
}
