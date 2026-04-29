import type { LinksFunction, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";

const SITE_URL = "https://bulkgenie.dasgroupllc.com";

const featureCards = [
  {
    title: "Bulk-generate four content types",
    body: "Generate product descriptions, SEO titles, meta descriptions, and image alt text in one workflow instead of editing products one by one.",
  },
  {
    title: "Review before publishing",
    body: "Nothing has to go live automatically. Merchants can review generated output in a spreadsheet-style grid before approving changes.",
  },
  {
    title: "Keep SEO constraints visible",
    body: "Character counts and field-aware formatting help teams stay inside practical SEO ranges while editing AI output.",
  },
  {
    title: "Train brand voice",
    body: "BulkGenie can be configured to generate product content in a more consistent store voice across large catalogs.",
  },
  {
    title: "Undo published changes",
    body: "The app keeps reversibility in mind so merchants can revert content if a generation pass needs to be rolled back.",
  },
  {
    title: "Scale across catalogs",
    body: "The workflow is designed for stores that need batch operations, repeatability, and review discipline rather than isolated copy experiments.",
  },
];

const answerCards = [
  {
    title: "What BulkGenie is",
    body: "BulkGenie is a Shopify app for batch-generating and reviewing product content with AI.",
  },
  {
    title: "Who it is for",
    body: "It is built for merchants and operators managing large product catalogs, SEO cleanup, and content refreshes.",
  },
  {
    title: "Why merchants use it",
    body: "The product reduces repetitive catalog work while keeping review, approval, and reversibility in the merchant workflow.",
  },
];

const workflowSteps = [
  {
    title: "Select products",
    body: "Choose the products that need content refreshes, SEO cleanup, or missing-field generation.",
  },
  {
    title: "Choose output fields",
    body: "Generate descriptions, SEO titles, meta descriptions, alt text, or a combination of those fields.",
  },
  {
    title: "Review in a grid",
    body: "Inspect generated output in a spreadsheet-style review workflow with inline editing and visible status.",
  },
  {
    title: "Approve and publish",
    body: "Publish approved changes in bulk and use undo support when a product needs to be restored.",
  },
];

const faqItems = [
  {
    question: "What kinds of product content can BulkGenie generate?",
    answer:
      "BulkGenie is designed to generate product descriptions, SEO titles, meta descriptions, and image alt text for Shopify catalogs.",
  },
  {
    question: "Does BulkGenie publish changes automatically?",
    answer:
      "The workflow emphasizes review before publish. Merchants can inspect output in a spreadsheet-style editor before approving bulk changes.",
  },
  {
    question: "Why does undo support matter?",
    answer:
      "Catalog-wide AI changes need reversibility. Undo support makes it safer to run large generation jobs without treating every batch as permanent.",
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return null;
};

export const links: LinksFunction = () => [
  {
    rel: "canonical",
    href: SITE_URL,
  },
];

export const meta: MetaFunction = () => [
  { title: "BulkGenie AI | Bulk Product Descriptions and SEO for Shopify" },
  {
    name: "description",
    content:
      "BulkGenie AI generates product descriptions, SEO titles, meta descriptions, and image alt text in bulk for Shopify stores, with review before publish and undo support.",
  },
  {
    name: "keywords",
    content:
      "Shopify bulk editor, bulk product descriptions, Shopify SEO app, AI product content, meta description generator, alt text generator, catalog content automation",
  },
  {
    name: "robots",
    content: "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1",
  },
  {
    property: "og:title",
    content: "BulkGenie AI | Bulk Product Descriptions and SEO for Shopify",
  },
  {
    property: "og:description",
    content:
      "Generate and review Shopify product descriptions, SEO titles, meta descriptions, and alt text in one bulk workflow.",
  },
  {
    property: "og:type",
    content: "website",
  },
  {
    property: "og:url",
    content: SITE_URL,
  },
  {
    name: "twitter:card",
    content: "summary_large_image",
  },
];

export default function LandingPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "BulkGenie AI",
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "Shopify content and SEO automation",
        operatingSystem: "Web",
        url: SITE_URL,
        description:
          "BulkGenie AI generates product descriptions, SEO titles, meta descriptions, and image alt text in bulk for Shopify stores.",
        creator: {
          "@type": "Organization",
          name: "DAS Group LLC",
          url: "https://dasgroupllc.com/",
        },
        featureList: [
          "Bulk product content generation",
          "Spreadsheet-style review grid",
          "SEO title and meta description support",
          "Brand voice configuration",
          "Undo support for published changes",
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: faqItems.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <style dangerouslySetInnerHTML={{ __html: landingStyles }} />

      <div className="page-shell">
        <nav className="nav">
          <div className="container nav-inner">
            <a href="/" className="brand">
              <span className="brand-mark">BG</span>
              <span>BulkGenie AI</span>
            </a>

            <div className="nav-links">
              <a href="#features">Features</a>
              <a href="#workflow">Workflow</a>
              <a href="#faq">FAQ</a>
              <a href="mailto:support@dasgroupllc.com" className="nav-cta">
                Contact
              </a>
            </div>
          </div>
        </nav>

        <main>
          <section className="hero">
            <div className="container hero-grid">
              <div className="hero-copy">
                <div className="eyebrow">Shopify content operations</div>
                <h1>Bulk product descriptions and SEO content, reviewed before publish.</h1>
                <p className="hero-subtitle">
                  BulkGenie AI helps Shopify merchants generate product descriptions, SEO titles,
                  meta descriptions, and image alt text across large catalogs without giving up
                  review control.
                </p>

                <div className="hero-actions">
                  <a
                    href="mailto:support@dasgroupllc.com?subject=Install%20BulkGenie%20AI"
                    className="button button-primary"
                  >
                    Request install
                  </a>
                  <a href="#workflow" className="button button-secondary">
                    See the workflow
                  </a>
                </div>

                <div className="proof-row">
                  <span className="proof-chip">Bulk generation</span>
                  <span className="proof-chip">Spreadsheet review</span>
                  <span className="proof-chip">SEO-aware editing</span>
                  <span className="proof-chip">Undo support</span>
                </div>
              </div>

              <div className="hero-panel">
                <div className="hero-card">
                  <div className="panel-label">Why merchants install it</div>
                  <div className="panel-item">
                    <strong>Catalog work scales poorly by hand</strong>
                    <span>BulkGenie compresses repetitive product-copy work into a single reviewable batch workflow.</span>
                  </div>
                  <div className="panel-item">
                    <strong>Review stays in the loop</strong>
                    <span>Generated content can be checked and edited before it becomes live product content.</span>
                  </div>
                  <div className="panel-item">
                    <strong>Reversibility matters</strong>
                    <span>Undo support makes large generation jobs safer for real stores.</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="section">
            <div className="container">
              <div className="section-header">
                <div className="eyebrow">Direct Answers</div>
                <h2>What BulkGenie is, who it helps, and what makes it useful.</h2>
                <p>
                  The page uses answer-oriented language so merchants, reviewers, search systems,
                  and AI agents can understand the product quickly.
                </p>
              </div>

              <div className="card-grid">
                {answerCards.map((item) => (
                  <article key={item.title} className="info-card">
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section id="features" className="section section-muted">
            <div className="container">
              <div className="section-header">
                <div className="eyebrow">Features</div>
                <h2>Built for real catalog operations, not one-off AI copy prompts.</h2>
                <p>
                  BulkGenie is strongest when merchants need batch workflows, review discipline,
                  and SEO-aware editing across many products.
                </p>
              </div>

              <div className="card-grid">
                {featureCards.map((item) => (
                  <article key={item.title} className="info-card">
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section id="workflow" className="section">
            <div className="container">
              <div className="section-header">
                <div className="eyebrow">Workflow</div>
                <h2>Four steps from product selection to published content.</h2>
                <p>
                  The product is designed to keep the merchant in control while removing repetitive
                  catalog work.
                </p>
              </div>

              <div className="stacked-sections">
                {workflowSteps.map((item, index) => (
                  <article key={item.title} className="product-row">
                    <div className="product-number">{String(index + 1).padStart(2, "0")}</div>
                    <div>
                      <h3>{item.title}</h3>
                      <p>{item.body}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="section section-muted" id="faq">
            <div className="container">
              <div className="section-header">
                <div className="eyebrow">FAQ</div>
                <h2>Common questions merchants ask before installing.</h2>
                <p>
                  These questions help clarify how the bulk workflow works and why review and undo
                  support matter.
                </p>
              </div>

              <div className="stacked-sections">
                {faqItems.map((item, index) => (
                  <article key={item.question} className="product-row">
                    <div className="product-number">{String(index + 1).padStart(2, "0")}</div>
                    <div>
                      <h3>{item.question}</h3>
                      <p>{item.answer}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="section">
            <div className="container cta-card">
              <div>
                <div className="eyebrow">Outcome</div>
                <h2>Refresh more of your catalog without turning bulk edits into bulk risk.</h2>
                <p>
                  BulkGenie helps merchants move faster on content and SEO work while preserving
                  review control inside the workflow.
                </p>
              </div>

              <a
                href="mailto:support@dasgroupllc.com?subject=BulkGenie%20AI%20demo"
                className="button button-primary"
              >
                Request install
              </a>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}

const landingStyles = `
  :root {
    --page-bg: #f5f1e8;
    --surface: #ffffff;
    --surface-muted: #f7f4ee;
    --text: #1d2423;
    --text-muted: #5e6664;
    --border: #d7d1c6;
    --accent: #0f766e;
    --accent-dark: #115e59;
    --highlight: #d97706;
    --shadow: 0 1px 0 rgba(29, 36, 35, 0.05), 0 18px 46px rgba(29, 36, 35, 0.08);
  }

  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  body {
    font-family: "Inter", "Avenir Next", "Segoe UI", sans-serif;
    background:
      radial-gradient(circle at top left, rgba(217, 119, 6, 0.16), transparent 28%),
      radial-gradient(circle at top right, rgba(15, 118, 110, 0.14), transparent 26%),
      var(--page-bg);
    color: var(--text);
    line-height: 1.5;
  }

  a {
    color: inherit;
  }

  .page-shell {
    min-height: 100vh;
  }

  .container {
    width: min(1120px, calc(100vw - 32px));
    margin: 0 auto;
  }

  .nav {
    position: sticky;
    top: 0;
    z-index: 20;
    backdrop-filter: blur(14px);
    background: rgba(245, 241, 232, 0.9);
    border-bottom: 1px solid rgba(215, 209, 198, 0.9);
  }

  .nav-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 74px;
    gap: 24px;
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    font-size: 16px;
    font-weight: 800;
    text-decoration: none;
  }

  .brand-mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: 12px;
    background: linear-gradient(135deg, var(--accent), var(--highlight));
    color: #fff;
    font-size: 13px;
  }

  .nav-links {
    display: flex;
    align-items: center;
    gap: 20px;
  }

  .nav-links a {
    text-decoration: none;
    color: var(--text-muted);
    font-size: 14px;
    font-weight: 600;
  }

  .nav-links a:hover {
    color: var(--text);
  }

  .nav-cta {
    padding: 10px 16px;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--border);
  }

  .hero {
    padding: 78px 0 48px;
  }

  .hero-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.16fr) minmax(300px, 0.84fr);
    gap: 28px;
    align-items: stretch;
  }

  .hero-copy,
  .hero-card,
  .info-card,
  .product-row,
  .cta-card {
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: var(--shadow);
  }

  .hero-copy {
    padding: 40px;
    border-radius: 30px;
  }

  .hero-copy h1 {
    font-size: clamp(2.5rem, 5vw, 4.8rem);
    line-height: 0.98;
    letter-spacing: -0.05em;
    max-width: 11ch;
  }

  .hero-subtitle {
    margin-top: 20px;
    max-width: 60ch;
    font-size: 1.08rem;
    color: var(--text-muted);
  }

  .eyebrow {
    display: inline-flex;
    align-items: center;
    padding: 8px 12px;
    border-radius: 999px;
    border: 1px solid rgba(15, 118, 110, 0.18);
    background: rgba(15, 118, 110, 0.08);
    color: var(--accent-dark);
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    margin-bottom: 18px;
  }

  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 28px;
  }

  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 46px;
    padding: 0 18px;
    border-radius: 12px;
    border: 1px solid transparent;
    text-decoration: none;
    font-weight: 700;
    font-size: 14px;
  }

  .button-primary {
    background: var(--accent);
    color: #fff;
  }

  .button-primary:hover {
    background: var(--accent-dark);
  }

  .button-secondary {
    background: var(--surface);
    border-color: var(--border);
    color: var(--text);
  }

  .proof-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 28px;
  }

  .proof-chip {
    display: inline-flex;
    align-items: center;
    min-height: 36px;
    padding: 0 12px;
    border-radius: 999px;
    background: var(--surface-muted);
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
  }

  .hero-panel {
    display: flex;
  }

  .hero-card {
    width: 100%;
    border-radius: 30px;
    padding: 28px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 18px;
  }

  .panel-label {
    font-size: 0.82rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
  }

  .panel-item {
    padding: 18px;
    border-radius: 18px;
    background: var(--surface-muted);
  }

  .panel-item strong,
  .info-card h3,
  .product-row h3,
  .section-header h2,
  .cta-card h2 {
    display: block;
    font-size: 1.22rem;
    margin-bottom: 8px;
    letter-spacing: -0.03em;
  }

  .panel-item span,
  .info-card p,
  .product-row p,
  .section-header p,
  .cta-card p {
    color: var(--text-muted);
    line-height: 1.7;
  }

  .section {
    padding: 0 0 28px;
  }

  .section-muted {
    padding-top: 20px;
  }

  .section-header {
    margin-bottom: 22px;
    max-width: 820px;
  }

  .section-header h2 {
    font-size: clamp(2rem, 4vw, 3.3rem);
    line-height: 1.02;
    margin-bottom: 12px;
  }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 18px;
  }

  .info-card,
  .product-row {
    border-radius: 24px;
  }

  .info-card {
    padding: 24px;
  }

  .stacked-sections {
    display: grid;
    gap: 16px;
  }

  .product-row {
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    gap: 18px;
    padding: 24px;
    align-items: start;
  }

  .product-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 54px;
    border-radius: 18px;
    background: rgba(15, 118, 110, 0.08);
    color: var(--accent-dark);
    font-size: 1rem;
    font-weight: 800;
  }

  .cta-card {
    border-radius: 30px;
    padding: 30px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 20px;
    align-items: center;
    background: linear-gradient(135deg, rgba(15, 118, 110, 0.08), rgba(217, 119, 6, 0.08)), var(--surface);
  }

  @media (max-width: 940px) {
    .hero-grid,
    .card-grid,
    .cta-card {
      grid-template-columns: 1fr;
    }

    .nav-inner {
      flex-direction: column;
      align-items: flex-start;
      padding: 16px 0;
    }
  }

  @media (max-width: 680px) {
    .container {
      width: min(calc(100vw - 24px), 1120px);
    }

    .hero-copy,
    .hero-card,
    .info-card,
    .product-row,
    .cta-card {
      padding: 22px;
    }

    .product-row {
      grid-template-columns: 1fr;
    }

    .nav-links {
      flex-wrap: wrap;
    }
  }
`;
