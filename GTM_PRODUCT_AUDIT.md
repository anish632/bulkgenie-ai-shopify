# BulkGenie AI — GTM Product Audit

Updated: 2026-05-19

## Positioning

Primary: Safely fix weak Shopify product pages in bulk — review every row before publishing.

Discovery intents (SEO/AEO/GEO targets):
- shopify bulk product SEO fix
- shopify missing image alt text
- shopify missing meta descriptions
- shopify product page audit tool
- bulk edit shopify product descriptions

## Growth Loop

```
SEO/AEO/GEO page or Shopify marketplace search
  → install or demo view
  → sample catalog SEO scan (visible before first job)
  → merchant scans real catalog
  → SEO gaps found (first-value event)
  → merchant reviews/publishes changes
  → earned review prompt (first publish only)
  → SEO gap report export (shareable artifact)
  → higher trust and conversion
```

## First-Value Answers

| Question | Answer |
|---|---|
| How does a cold user find it? | Shopify marketplace search; SEO/AEO pages targeting "missing alt text shopify" etc. |
| What demo/sample state shows value before setup? | Demo scan card on dashboard (47 alt text gaps, 18 meta desc, 12 weak titles, 9 missing details) |
| What is the first-value event? | gapSummary.productsWithGaps > 0 after first catalog load |
| What proof metric is created? | Products scanned, SEO gaps found, alt text gaps, meta desc gaps, rows approved, changes published |
| When is the earned review prompt shown? | After first-ever reviewed publish (gated by prevPublishedCount === 0 check) |
| What artifact can be shared/exported? | SEO Gap Report CSV (product, field, original, suggested, status) |

## Analytics Events

| Event | Trigger | Location |
|---|---|---|
| `demo_catalog_scan_viewed` | Demo scan card rendered (no jobs yet, no real gaps) | `app._index.tsx` loader + useEffect |
| `scan_catalog_clicked` | "Scan my catalog" or "Find my SEO gaps" CTA clicked | `app._index.tsx` handleScanClick |
| `seo_gaps_found` | Real gapSummary.productsWithGaps > 0 on dashboard load | `app._index.tsx` loader + useEffect |
| `first_reviewed_publish` | First-ever publish action completes | `app.jobs.$jobId.tsx` action |
| `review_prompt_shown` | Earned review banner mounts after first publish | `app.jobs.$jobId.tsx` useEffect |
| `review_click` | "Write a review" button clicked | `app.jobs.$jobId.tsx` onClick |
| `seo_gap_report_exported` | "Download SEO Gap Report" button clicked | `app.jobs.$jobId.tsx` handleExportCSV |
| `paywall_viewed` | Billing page visited | TODO: add to `app.billing.tsx` |
| `subscription_started` | Billing confirmation success | TODO: add to `app.billing.tsx` |

All events currently log structured JSON via `console.log`. Replace with PostHog, Segment, or your analytics provider.

## Demo Scan Data (fixed, deterministic)

Source: `bulkgenie/app/services/demo.ts`

| Metric | Value |
|---|---|
| Sample catalog size | 86 products |
| Products with gaps | 58 |
| Image alt text gaps | 47 |
| Missing meta descriptions | 18 |
| Weak product titles | 12 |
| Missing key details | 9 |

Demo review preview rows (4 samples showing product / field / current / suggested):
1. Merino Wool Sweater — Meta description — (missing) → suggested copy
2. Ceramic Pour-Over Set — Image alt text — (missing) → descriptive alt text
3. Running Shorts — SEO title — "Shorts" → improved title
4. Leather Card Wallet — Product description — (missing) → suggested copy

## Proof Metrics (live, from DB)

Displayed on dashboard stats row when `proofMetrics.totalPublished > 0`:
- Products This Month (from shop.monthlyUsage)
- Remaining (tier limit - usage)
- Plan (shop.tier)
- Rows Reviewed (approved + published items across all jobs)
- Changes Published (published items across all jobs)

## Constraints

- Do not claim ranking improvements.
- Do not publish changes without review.
- Do not invent merchant proof.
- Demo data is labeled "Sample data" and never mixed with real catalog data.
- Review prompt gated to first-ever publish only (not shown on every publish).

## Shopify Partner Dashboard — Manual Steps Remaining

- [ ] Update app listing description to mention demo scan / sample catalog
- [ ] Add screenshots showing: demo scan card, review grid (current vs. suggested), proof metrics, SEO gap report download
- [ ] Update pricing copy to reflect current tier limits
- [ ] Release notes: "Demo scan, proof metrics, earned review trigger, SEO gap report export"
- [ ] Verify app review/submission status if a new submission is required

## Known Gaps / Next Actions

1. Add `paywall_viewed` event to `app.billing.tsx` on page load
2. Add `subscription_started` event to `app.billing.tsx` when `confirmationMessage` includes success
3. Wire `trackEvent` to a real analytics provider (PostHog recommended for Shopify apps)
4. Add `app.generate.tsx` scan page CTA copy: "Find my SEO gaps" → already present as the page heading
5. SEO landing page (deferred until first conversion data exists per CODEX rules)
