# BulkGenie AI — Shopify App Store Listing (Field-by-Field)

> Copy each value below into the corresponding field in
> **Partners > Apps > BulkGenie AI > App Listing**.

---

## BASIC APP INFORMATION

### App name (max 30 chars)
```
BulkGenie AI
```

### App icon
Upload: `listing/app-icon.png` (1200x1200 PNG)

### App category
- **Primary category:** Store management > Operations > Bulk editor

### Primary category details
- **Editable resources:** Products
- **Actions:** Bulk edit, SEO updates

### Languages
- English

---

## APP STORE LISTING CONTENT

### App introduction (max 100 chars)
```
Find and fix weak Shopify product pages in bulk.
```

### App details (max 500 chars)
```
BulkGenie AI scans your catalog for missing SEO titles, meta descriptions, image alt text, thin descriptions, and duplicate product copy, then lets you review and publish fixes in a spreadsheet-style editor. Select the products with gaps, generate draft content using your own AI provider key, review every draft before anything changes in Shopify, and undo published changes whenever you need to.
```

### Features (3-5 features, max 80 chars each)

**Feature 1:**
```
Find missing SEO titles, meta descriptions, and image alt text
```

**Feature 2:**
```
Score product pages and surface thin or missing descriptions
```

**Feature 3:**
```
Review every draft before publishing — nothing changes without approval
```

**Feature 4:**
```
Keep product copy consistent with your brand voice across 8 languages
```

**Feature 5:**
```
Undo published product and SEO changes when needed
```

### Demo store URL
*(Leave blank unless you set up a public demo store)*

### Feature media

**Image** (not video — use an image until you record a video):
Upload `listing/screenshots/01-product-selector.png` (1600x900)

### Screenshots (upload in order)

| # | File | Alt text (max 64 chars) |
|---|------|------------------------|
| 1 | `listing/screenshots/01-product-selector.png` | Find SEO coverage gaps |
| 2 | `listing/screenshots/02-review-grid.png` | Score weak product pages |
| 3 | `listing/screenshots/03-inline-editing.png` | Review before publishing |
| 4 | `listing/screenshots/04-brand-voice-settings.png` | Keep brand voice consistent |
| 5 | `listing/screenshots/05-dashboard.png` | Undo bulk changes |
| 6 | `listing/screenshots/06-content-quality.png` | Catalog content coverage |

---

## PRICING DETAILS

Set up these plans in **Partners > Apps > BulkGenie AI > Distribution > Pricing**:

**Trial:** 3-day free trial on all paid plans (Starter, Growth, Scale)

### Monthly Plans

| Plan | Price | Description |
|------|-------|-------------|
| **Free** | $0/month | 10 products/month, bring your own API key, all 4 content fields, undo support |
| **Starter** | $19/month | 100 products/month, bring your own API key, all 4 content fields, priority processing |
| **Growth** | $39/month | 500 products/month, bring your own API key, brand voice, all 4 content fields |
| **Scale** | $79/month | Unlimited products, bring your own API key, brand voice, priority support |

### Annual Plans (17% off)

| Plan | Annual Price | Effective Monthly |
|------|-------------|-------------------|
| **Starter** | $190/year | $15.83/mo |
| **Growth** | $390/year | $32.50/mo |
| **Scale** | $790/year | $65.83/mo |

---

## APP DISCOVERY CONTENT

### App card subtitle (max 62 chars)
```
Scan your catalog and fix missing SEO content in bulk
```

### App store search terms (1-5 terms, max 20 chars each)
```
bulk product SEO
catalog SEO fix
SEO meta tags
image alt text
product copy
```

### Web search content (optional)

**Title tag (max 60 chars):**
```
BulkGenie AI - Fix Shopify Product Page SEO in Bulk
```

**Meta description (max 160 chars):**
```
Scan your Shopify catalog for missing SEO titles, meta descriptions, and image alt text. Review fixes before publishing. Undo changes anytime.
```

---

## INSTALL REQUIREMENTS

### Sales channel requirements
```
My app doesn't require the Shopify Online Store or Shopify POS
```
*(BulkGenie AI works entirely through the Admin API — no theme extensions, no storefront scripts)*

---

## SUPPORT & CONTACT

### Preferred support channel
- **Support email address:** `anishdasmail@gmail.com`

### Resources
- **Privacy policy URL:** `https://anish632.github.io/dasgroupwebsite/apps/privacy/`

---

## CONTACT INFORMATION

### Merchant review email
```
anishdasmail@gmail.com
```

### App submission email
```
anishdasmail@gmail.com
```

---

## APP TESTING INFORMATION

### Test account
```
My app doesn't require an account to use it
```
*(BulkGenie AI authenticates via Shopify session tokens — no separate login needed)*

### Screencast URL
```
https://anish632.github.io/dasgroupwebsite/apps/bulkgenie-demo/
```

### Testing instructions (max 2800 chars)
```
BulkGenie AI is an embedded Shopify app that scans product pages for content gaps and generates fixes using AI. It requires no separate account — authentication is handled via Shopify session tokens.

PREREQUISITES:
- The app is installed on dev store: bulkgenie-ai.myshopify.com
- The store has 25+ products with images loaded
- Some products intentionally have missing descriptions, SEO fields, and image alt text

TESTING STEPS:

1. Open BulkGenie AI from the Shopify admin sidebar
2. The Dashboard shows a "Catalog content gaps" section listing how many products have missing SEO titles, meta descriptions, thin descriptions, and images without alt text
3. Stat cards show: Products This Month, Remaining (plan limit), and Plan tier
4. Click "Fix content gaps" to open the Scan & Fix page
5. The page loads with a "Catalog content coverage" summary at the top: total products checked, specific gap counts for each field type
6. Note the "Show X with gaps" filter button — click it to see only products with content issues
7. Products with missing descriptions show "No description" (red) or "Thin description" (orange) badges
8. SEO Title and Meta Description columns show "Missing" (warning) or "Too long" (attention) badges
9. Navigate to Settings and confirm an AI provider API key is saved
10. Select 3-5 products with content gaps using the checkboxes
11. Verify all four fields are checked: Description, SEO Title, Meta Description, Alt Text
12. Click the "Generate Drafts (N)" button in the bulk action bar
13. You are redirected to the Job Review page
14. Watch the progress bar fill as AI generates content (~2 seconds per product)
15. Once complete, review the spreadsheet grid showing generated descriptions, SEO copy, and image alt text
16. Click any SEO Title cell to edit inline — observe the character counter (e.g. "58/70")
17. Click "Approve" on individual rows, or "Approve All" in the bulk action bar
18. Click "Publish Approved" to write content back to Shopify
19. Open a published product in Shopify admin — verify description, SEO title, meta description, and image alt text were updated
20. Return to the Job Review page and click "Undo" on a published product
21. Verify the product reverts to its original content in Shopify
22. Navigate to Settings — observe AI Provider selection and Brand Voice configuration
23. Navigate to Billing — verify all 4 plan cards display correctly

NOTES:
- AI generation uses the merchant-selected provider with a merchant-provided API key
- No theme modifications are made — the app only reads/writes product data via Admin API
- All GDPR compliance webhooks are implemented and return 200 OK
```

---

## ASSET FILE LOCATIONS

| Asset | Path | Dimensions |
|-------|------|------------|
| App icon | `listing/app-icon.png` | 1200x1200 |
| Screenshot 1 | `listing/screenshots/01-product-selector.png` | 1600x900 |
| Screenshot 2 | `listing/screenshots/02-review-grid.png` | 1600x900 |
| Screenshot 3 | `listing/screenshots/03-inline-editing.png` | 1600x900 |
| Screenshot 4 | `listing/screenshots/04-brand-voice-settings.png` | 1600x900 |
| Screenshot 5 | `listing/screenshots/05-dashboard.png` | 1600x900 |
| Screenshot 6 | `listing/screenshots/06-content-quality.png` | 1600x900 |

### Interactive demo (for Screencast URL)
```
https://anish632.github.io/dasgroupwebsite/apps/bulkgenie-demo/
```
