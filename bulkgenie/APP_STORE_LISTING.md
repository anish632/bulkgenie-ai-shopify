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
Bulk-generate product descriptions, SEO titles, meta descriptions & alt text with AI.
```

### App details (max 500 chars)
```
BulkGenie AI generates compelling, SEO-optimized product content across your entire catalog in minutes, not days. Select products, choose what to generate, and review everything in a spreadsheet-style editor before publishing. Nothing goes live without your approval.
```

### Features (3-5 features, max 80 chars each)

**Feature 1:**
```
Bulk-generate descriptions, SEO titles, meta tags & alt text at once
```

**Feature 2:**
```
Review and edit all AI content in a spreadsheet grid before publishing
```

**Feature 3:**
```
SEO-optimized output with live character counts for titles and meta tags
```

**Feature 4:**
```
Train your brand voice so AI writes in your tone across 8 languages
```

**Feature 5:**
```
Full undo support — revert any product to its original content
```

### Demo store URL
*(Leave blank unless you set up a public demo store)*

### Feature media

**Image** (not video — use an image until you record a video):
Upload `listing/screenshots/01-product-selector.png` (1600x900)

### Screenshots (upload in order)

| # | File | Alt text (max 64 chars) |
|---|------|------------------------|
| 1 | `listing/screenshots/01-product-selector.png` | Product selector with bulk checkboxes and field picker |
| 2 | `listing/screenshots/02-review-grid.png` | Spreadsheet review grid with status badges per product |
| 3 | `listing/screenshots/03-inline-editing.png` | Inline editing with live SEO character counter |
| 4 | `listing/screenshots/04-brand-voice-settings.png` | AI provider and brand voice settings page |
| 5 | `listing/screenshots/05-dashboard.png` | Dashboard showing usage stats and recent jobs |
| 6 | `listing/screenshots/06-billing-plans.png` | Four pricing plan cards with usage meter |

---

## PRICING DETAILS

Set up these plans in **Partners > Apps > BulkGenie AI > Distribution > Pricing**:

**Trial:** 3-day free trial on all paid plans (Starter, Growth, Scale)

### Monthly Plans

| Plan | Price | Description |
|------|-------|-------------|
| **Free** | $0/month | 10 products/month, cloud AI, all 4 content fields, full undo support |
| **Starter** | $19/month | 100 products/month, cloud AI, all 4 content fields, priority queue |
| **Growth** | $39/month | 500 products/month, bring your own API key, brand voice training |
| **Scale** | $79/month | Unlimited products, premium AI models, BYOK, priority support |

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
Generate product descriptions and SEO content in bulk with AI
```

### App store search terms (1-5 terms, max 20 chars each)
```
bulk descriptions
AI product content
SEO meta tags
alt text generator
product copywriting
```

### Web search content (optional)

**Title tag (max 60 chars):**
```
BulkGenie AI - Bulk Product Descriptions & SEO for Shopify
```

**Meta description (max 160 chars):**
```
Generate product descriptions, SEO titles, meta descriptions, and image alt text in bulk with AI. Review in a spreadsheet editor, then publish in one click.
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
BulkGenie AI is an embedded Shopify app that bulk-generates product content using AI. It requires no separate account — authentication is handled via Shopify session tokens.

PREREQUISITES:
- The app is installed on dev store: bulkgenie-ai.myshopify.com
- The store has 25+ products with images loaded
- Some products intentionally have missing descriptions and SEO fields

TESTING STEPS:

1. Open BulkGenie AI from the Shopify admin sidebar
2. The Dashboard shows usage stats (Products This Month, Remaining, Plan) and Recent Jobs table
3. Click "Generate Content" in the left navigation
4. The Product Selector page loads with all store products
5. Note the "Missing" badges on products without descriptions or SEO data
6. Select 3-5 products using the checkboxes
7. In the field selector, verify all four fields are checked: Description, SEO Title, Meta Description, Alt Text
8. Click the "Generate Content (N)" button in the bulk action bar
9. You are redirected to the Job Review page
10. Watch the progress bar fill as AI generates content (~2 seconds per product)
11. Once complete, review the spreadsheet grid showing original vs generated content
12. Click any SEO Title cell to edit inline — observe the character counter (e.g. "58/70")
13. Click "Approve" on individual rows, or "Approve All" in the bulk action bar
14. Click "Publish Approved" to write content back to Shopify
15. Open a published product in Shopify admin — verify description, SEO title, meta description, and image alt text were updated
16. Return to the Job Review page and click "Undo" on a published product
17. Verify the product reverts to its original content in Shopify
18. Navigate to Settings — observe AI Provider selection and Brand Voice configuration
19. Navigate to Billing — verify all 4 plan cards display correctly

NOTES:
- AI generation uses Claude by Anthropic (cloud mode)
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
| Screenshot 6 | `listing/screenshots/06-billing-plans.png` | 1600x900 |

### Interactive demo (for Screencast URL)
```
https://anish632.github.io/dasgroupwebsite/apps/bulkgenie-demo/
```
