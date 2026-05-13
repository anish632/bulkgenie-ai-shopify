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
Bulk-generate SEO product descriptions, meta descriptions, titles & image alt text.
```

### App details (max 500 chars)
```
BulkGenie AI helps Shopify merchants update product descriptions, SEO titles, meta descriptions, and image alt text in bulk. Pick products, generate draft copy with your API key, review in a spreadsheet-style grid, then publish only the rows you approve. Undo keeps original content recoverable.
```

### Features (3-5 features, max 80 chars each)

**Feature 1:**
```
Find products missing SEO titles, meta descriptions, or image alt text
```

**Feature 2:**
```
Generate descriptions, SEO titles, meta descriptions, and alt text in bulk
```

**Feature 3:**
```
Review drafts and edit product/SEO copy before publishing
```

**Feature 4:**
```
Set brand voice so drafts match your tone across 8 languages
```

**Feature 5:**
```
Undo published product copy and SEO changes when needed
```

### Demo store URL
*(Leave blank unless you set up a public demo store)*

### Feature media

**Image** (not video — use an image until you record a video):
Upload `listing/screenshots/01-product-selector.png` (1600x900)

### Screenshots (upload in order)

| # | File | Alt text (max 64 chars) |
|---|------|------------------------|
| 1 | `listing/screenshots/01-product-selector.png` | Find products missing SEO fields |
| 2 | `listing/screenshots/02-review-grid.png` | Review generated copy before publishing |
| 3 | `listing/screenshots/03-inline-editing.png` | Edit SEO titles with live limits |
| 4 | `listing/screenshots/04-brand-voice-settings.png` | Bring your API key and brand voice |
| 5 | `listing/screenshots/05-dashboard.png` | Track generation usage and jobs |
| 6 | `listing/screenshots/06-content-quality.png` | See SEO content coverage gaps |

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
Bulk-generate Shopify product descriptions and SEO copy
```

### App store search terms (1-5 terms, max 20 chars each)
```
bulk product SEO
AI descriptions
SEO meta tags
image alt text
product copy
```

### Web search content (optional)

**Title tag (max 60 chars):**
```
BulkGenie AI - Bulk Product Descriptions & Shopify SEO
```

**Meta description (max 160 chars):**
```
Generate Shopify product descriptions, SEO titles, meta descriptions, and image alt text in bulk. Review drafts, approve rows, and undo when needed.
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
3. Navigate to Settings and confirm an AI provider API key is saved
4. Click "Generate Content" in the left navigation
5. The Product Selector page loads with products missing content shown first
6. Note the "Missing" badges on products without descriptions or SEO data
7. Select 3-5 products using the checkboxes
8. In the field selector, verify all four fields are checked: Description, SEO Title, Meta Description, Alt Text
9. Click the "Generate Drafts (N)" button in the bulk action bar
10. You are redirected to the Job Review page
11. Watch the progress bar fill as AI generates content (~2 seconds per product)
12. Once complete, review the spreadsheet grid showing generated descriptions, SEO copy, and image alt text
13. Click any SEO Title cell to edit inline — observe the character counter (e.g. "58/70")
14. Click "Approve" on individual rows, or "Approve All" in the bulk action bar
15. Click "Publish Approved" to write content back to Shopify
16. Open a published product in Shopify admin — verify description, SEO title, meta description, and image alt text were updated
17. Return to the Job Review page and click "Undo" on a published product
18. Verify the product reverts to its original content in Shopify
19. Navigate to Settings — observe AI Provider selection and Brand Voice configuration
20. Navigate to Billing — verify all 4 plan cards display correctly

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
