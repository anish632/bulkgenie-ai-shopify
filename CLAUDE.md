## Shopify App Development Reference

*Reusable patterns for any Shopify app project.*

### Shopify App Checklist (App Store Submission)

- [ ] App Bridge CDN loaded from `cdn.shopify.com/shopifycloud/app-bridge.js` with `data-api-key`
- [ ] Session tokens used for auth (not cookies) — App Bridge auto-injects Bearer tokens
- [ ] HMAC webhook verification with raw body + `crypto.timingSafeEqual`
- [ ] Mandatory GDPR compliance webhooks: `customers/data_request`, `customers/redact`, `shop/redact`
- [ ] `compliance_topics` (not `topics`) in shopify.app.toml for GDPR webhooks
- [ ] Privacy policy URL accessible
- [ ] No unsubstantiated financial claims in screenshots (Shopify AI flags specific dollar amounts)
- [ ] `npx shopify app deploy --force` to sync TOML config to Shopify after webhook changes
- [ ] Dev store with app installed for reviewer testing
- [ ] Testing instructions for reviewers

### Embedded App Setup (index.html)

```html
<script
  data-api-key="YOUR_CLIENT_ID"
  src="https://cdn.shopify.com/shopifycloud/app-bridge.js"
></script>
```

App Bridge v4+ from CDN automatically:
- Detects embedded context
- Injects Bearer session tokens into same-origin fetch calls
- Handles OAuth redirect flows
- Provides navigation and modal APIs

### Session Token Verification (server-side)

```javascript
function verifySessionToken(req, res, next) {
  const authHeader = req.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    // Fallback to ?shop= param for backward compat
    const shop = req.query.shop || req.body?.shop;
    if (shop) { req.shopDomain = shop; return next(); }
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.split(' ')[1];
  const parts = token.split('.');
  if (parts.length !== 3) return res.status(401).json({ error: 'Invalid token' });

  const expectedSig = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(parts[0] + '.' + parts[1])
    .digest('base64url');

  if (expectedSig !== parts[2]) return res.status(401).json({ error: 'Invalid signature' });

  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  if (payload.exp && payload.exp < Date.now() / 1000) return res.status(401).json({ error: 'Expired' });
  if (payload.aud !== process.env.SHOPIFY_API_KEY) return res.status(401).json({ error: 'Invalid audience' });

  req.shopDomain = payload.dest ? new URL(payload.dest).hostname : null;
  req.sessionToken = payload;
  next();
}
```

### Webhook HMAC Verification

```javascript
// Capture raw body in Express
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

// Verify webhook
function verifyWebhook(req, res, next) {
  const hmac = req.get('X-Shopify-Hmac-Sha256');
  if (!hmac || !req.rawBody) return res.status(401).send('Unauthorized');
  const hash = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(req.rawBody)
    .digest('base64');
  if (crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmac))) {
    next();
  } else {
    res.status(401).send('Unauthorized');
  }
}
```

### shopify.app.toml Template

```toml
name = "Your App Name"
client_id = "YOUR_CLIENT_ID"
application_url = "https://your-app.vercel.app"
embedded = true

[access_scopes]
scopes = "read_products,read_orders"

[auth]
redirect_urls = ["https://your-app.vercel.app/auth/callback"]

[webhooks]
api_version = "2024-10"

  [[webhooks.subscriptions]]
  topics = ["orders/create"]
  uri = "/webhooks/orders/create"

  [[webhooks.subscriptions]]
  topics = ["app/uninstalled"]
  uri = "/webhooks/app/uninstalled"

  [[webhooks.subscriptions]]
  compliance_topics = ["customers/data_request", "customers/redact", "shop/redact"]
  uri = "https://your-app.vercel.app/webhooks/compliance"

[pos]
embedded = false
```

### Vercel + Express Serverless Pattern

```
vercel.json rewrites:
  /api/*, /auth/*, /webhooks/* → /api (single serverless function)
  /* → /index.html (SPA fallback)

api/index.js:
  module.exports = require('../server/index.js');

server/index.js:
  const app = express();
  // ... routes ...
  if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT);
  }
  module.exports = app;
```

### Shopify OAuth Flow (Direct, No SDK)

```
1. GET /auth?shop=store.myshopify.com
   → Validate shop domain
   → Generate nonce
   → Redirect to https://SHOP/admin/oauth/authorize?client_id=...&scope=...&redirect_uri=...&state=NONCE

2. GET /auth/callback?shop=...&code=...&hmac=...&state=NONCE
   → POST https://SHOP/admin/oauth/access_token { client_id, client_secret, code }
   → Store access_token in DB
   → Register webhooks
   → Redirect to app
```

### Shopify Billing (Recurring + Usage)

```javascript
// Create charge
POST https://SHOP/admin/api/VERSION/recurring_application_charges.json
{ recurring_application_charge: { name, price, return_url, trial_days, capped_amount, terms } }

// After merchant approves, activate
POST https://SHOP/admin/api/VERSION/recurring_application_charges/CHARGE_ID/activate.json

// Record usage
POST https://SHOP/admin/api/VERSION/recurring_application_charges/CHARGE_ID/usage_charges.json
{ usage_charge: { description, price } }
```

### App Store Screenshot Guidelines

- Resolution: 1600×900
- Avoid specific dollar amounts (Shopify AI flags "unsubstantiated claims")
- Use generic language: "Review pricing opportunities" not "+$840/mo"
- Generate with Puppeteer from HTML mockups for consistency
