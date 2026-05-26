export interface ScanSummaryEmailParams {
  to: string;
  shopDomain: string;
  productsScanned: number;
  issuesFound: number;
  fixesReady: number;
  issueBreakdown: Array<{ label: string; count: number }>;
  approvalUrl: string;
}

// Sends the weekly scan summary via the Resend API (no SDK dependency).
// Requires RESEND_API_KEY and SCAN_EMAIL_FROM env vars.
export async function sendScanSummaryEmail(
  params: ScanSummaryEmailParams,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return; // email is optional; skip silently if not configured

  const from =
    process.env.SCAN_EMAIL_FROM ?? "BulkGenie AI <noreply@bulkgenie.dasgroupllc.com>";

  const subject = `Your Shopify catalog has ${params.fixesReady} SEO fix${params.fixesReady === 1 ? "" : "es"} ready — BulkGenie`;

  const breakdownRows = params.issueBreakdown
    .slice(0, 5)
    .map(
      ({ label, count }) =>
        `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;">${label}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${count}</td></tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#333;margin:0;padding:0;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
        <tr><td style="background:#008060;padding:24px 32px;">
          <h1 style="color:#fff;margin:0;font-size:20px;">BulkGenie AI — Weekly Catalog Scan</h1>
          <p style="color:rgba(255,255,255,.8);margin:4px 0 0;font-size:14px;">${params.shopDomain}</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="font-size:16px;margin:0 0 24px;">Your weekly catalog scan is complete. Here's what we found:</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr>
              <td style="background:#f0faf6;border-radius:6px;padding:16px 20px;text-align:center;width:33%;">
                <div style="font-size:32px;font-weight:700;color:#008060;">${params.productsScanned}</div>
                <div style="font-size:13px;color:#666;margin-top:4px;">Products scanned</div>
              </td>
              <td width="12"></td>
              <td style="background:#fff3f0;border-radius:6px;padding:16px 20px;text-align:center;width:33%;">
                <div style="font-size:32px;font-weight:700;color:#c0392b;">${params.issuesFound}</div>
                <div style="font-size:13px;color:#666;margin-top:4px;">Issues found</div>
              </td>
              <td width="12"></td>
              <td style="background:#f0f5ff;border-radius:6px;padding:16px 20px;text-align:center;width:33%;">
                <div style="font-size:32px;font-weight:700;color:#0052cc;">${params.fixesReady}</div>
                <div style="font-size:13px;color:#666;margin-top:4px;">AI fixes ready</div>
              </td>
            </tr>
          </table>

          ${
            breakdownRows
              ? `<h3 style="font-size:14px;font-weight:600;margin:0 0 8px;color:#555;text-transform:uppercase;letter-spacing:.5px;">Top issue types</h3>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:6px;overflow:hidden;margin-bottom:24px;">
            ${breakdownRows}
          </table>`
              : ""
          }

          <a href="${params.approvalUrl}" style="display:inline-block;background:#008060;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:15px;font-weight:600;">Review fixes in BulkGenie →</a>

          <p style="font-size:13px;color:#999;margin:24px 0 0;">Every fix is staged for your approval — nothing is published without your review. To disable these emails, visit Settings in BulkGenie.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const textBody = [
    `BulkGenie AI — Weekly Catalog Scan`,
    `Store: ${params.shopDomain}`,
    ``,
    `Products scanned: ${params.productsScanned}`,
    `Issues found:     ${params.issuesFound}`,
    `AI fixes ready:   ${params.fixesReady}`,
    ``,
    `Top issues:`,
    ...params.issueBreakdown.slice(0, 5).map(({ label, count }) => `  ${label}: ${count}`),
    ``,
    `Review fixes: ${params.approvalUrl}`,
  ].join("\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject,
      html,
      text: textBody,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
}
