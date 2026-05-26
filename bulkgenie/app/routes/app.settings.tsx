import { useState, useCallback } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useActionData, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Button,
  InlineStack,
  TextField,
  Select,
  ChoiceList,
  RadioButton,
  Banner,
  Checkbox,
  Text,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { encrypt } from "../services/encryption.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    const shopDomain = session.shop;

    const shop = await prisma.shop.upsert({
      where: { shopDomain },
      update: {},
      create: { shopDomain },
    });

    return json({
      shop: {
        ...shop,
        byokApiKey: shop.byokApiKey ? "••••••••" : "",
        weeklyScansEnabled: shop.weeklyScansEnabled ?? false,
        scanEmailRecipient: shop.scanEmailRecipient ?? "",
        scanDayOfWeek: shop.scanDayOfWeek ?? 1,
        autoApplyLowRisk: shop.autoApplyLowRisk ?? false,
      },
    });
  } catch (error) {
    console.error("[app.settings] Loader error:", error);
    throw new Response("Failed to load settings", {
      status: 500,
      statusText: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  switch (intent) {
    case "save_provider": {
      const aiProvider = formData.get("aiProvider") as string;
      const byokApiKey = formData.get("byokApiKey") as string;

      const updateData: Record<string, unknown> = { aiProvider };
      if (byokApiKey && byokApiKey !== "••••••••") {
        updateData.byokApiKey = encrypt(byokApiKey);
      }

      await prisma.shop.update({
        where: { shopDomain },
        data: updateData,
      });

      return json({ success: true, message: "AI provider saved" });
    }

    case "save_brand_voice": {
      const brandVoice = formData.get("brandVoice") as string;

      await prisma.shop.update({
        where: { shopDomain },
        data: { brandVoice: brandVoice || null },
      });

      return json({ success: true, message: "Brand voice updated" });
    }

    case "save_defaults": {
      const targetLanguage = formData.get("targetLanguage") as string;
      const descriptionLength = formData.get("descriptionLength") as string;
      const defaultFields = formData.get("defaultFields") as string;

      await prisma.shop.update({
        where: { shopDomain },
        data: {
          targetLanguage,
          descriptionLength,
          defaultFields,
        },
      });

      return json({ success: true, message: "Defaults updated" });
    }

    case "save_scan_settings": {
      const weeklyScansEnabled = formData.get("weeklyScansEnabled") === "true";
      const scanEmailRecipient = (formData.get("scanEmailRecipient") as string) || null;
      const scanDayOfWeek = parseInt(formData.get("scanDayOfWeek") as string, 10) || 1;
      const autoApplyLowRisk = formData.get("autoApplyLowRisk") === "true";

      await prisma.shop.update({
        where: { shopDomain },
        data: { weeklyScansEnabled, scanEmailRecipient, scanDayOfWeek, autoApplyLowRisk },
      });

      return json({ success: true, message: "Scan settings saved" });
    }

    case "test_key": {
      const aiProvider = formData.get("aiProvider") as string;
      const byokApiKey = formData.get("byokApiKey") as string;

      if (!byokApiKey || byokApiKey === "••••••••") {
        return json({ error: "Enter an API key first" }, { status: 400 });
      }

      try {
        if (aiProvider === "byok_anthropic") {
          const { AnthropicProvider } = await import(
            "../services/ai/anthropic-provider"
          );
          const provider = new AnthropicProvider(
            byokApiKey,
            "claude-haiku-4-5-20251001",
          );
          await provider.generate({
            productTitle: "Test Product",
            fieldsToGenerate: ["seoTitle"],
          });
        } else if (aiProvider === "byok_openai") {
          const { OpenAIProvider } = await import(
            "../services/ai/openai-provider"
          );
          const provider = new OpenAIProvider(byokApiKey);
          await provider.generate({
            productTitle: "Test Product",
            fieldsToGenerate: ["seoTitle"],
          });
        } else if (aiProvider === "byok_kimi") {
          const { OpenAIProvider } = await import(
            "../services/ai/openai-provider"
          );
          const provider = new OpenAIProvider(byokApiKey, "moonshot-v1-8k", "https://api.moonshot.cn/v1");
          await provider.generate({
            productTitle: "Test Product",
            fieldsToGenerate: ["seoTitle"],
          });
        } else if (aiProvider === "byok_mistral") {
          const { OpenAIProvider } = await import(
            "../services/ai/openai-provider"
          );
          const provider = new OpenAIProvider(byokApiKey, "mistral-small-latest", "https://api.mistral.ai/v1");
          await provider.generate({
            productTitle: "Test Product",
            fieldsToGenerate: ["seoTitle"],
          });
        }
        return json({ success: true, message: "API key works!" });
      } catch (error) {
        return json(
          {
            error: `API key test failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
          { status: 400 },
        );
      }
    }

    default:
      return json({ error: "Unknown action" }, { status: 400 });
  }
};

export default function SettingsPage() {
  const { shop } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();

  const initialProvider = shop.aiProvider === "cloud" ? "byok_anthropic" : shop.aiProvider;
  const [aiProvider, setAiProvider] = useState(initialProvider);
  const [byokApiKey, setByokApiKey] = useState(shop.byokApiKey || "");
  const [brandVoice, setBrandVoice] = useState(shop.brandVoice || "");
  const [targetLanguage, setTargetLanguage] = useState(
    shop.targetLanguage || "en",
  );
  const [descriptionLength, setDescriptionLength] = useState(
    shop.descriptionLength || "medium",
  );
  const [defaultFields, setDefaultFields] = useState<string[]>(
    JSON.parse(shop.defaultFields),
  );
  const [weeklyScansEnabled, setWeeklyScansEnabled] = useState(shop.weeklyScansEnabled);
  const [scanEmailRecipient, setScanEmailRecipient] = useState(shop.scanEmailRecipient);
  const [scanDayOfWeek, setScanDayOfWeek] = useState(String(shop.scanDayOfWeek));
  const [autoApplyLowRisk, setAutoApplyLowRisk] = useState(shop.autoApplyLowRisk);

  const handleSaveScanSettings = useCallback(() => {
    const formData = new FormData();
    formData.set("intent", "save_scan_settings");
    formData.set("weeklyScansEnabled", String(weeklyScansEnabled));
    formData.set("scanEmailRecipient", scanEmailRecipient);
    formData.set("scanDayOfWeek", scanDayOfWeek);
    formData.set("autoApplyLowRisk", String(autoApplyLowRisk));
    submit(formData, { method: "post" });
  }, [weeklyScansEnabled, scanEmailRecipient, scanDayOfWeek, autoApplyLowRisk, submit]);

  const handleSaveProvider = useCallback(() => {
    const formData = new FormData();
    formData.set("intent", "save_provider");
    formData.set("aiProvider", aiProvider);
    formData.set("byokApiKey", byokApiKey);
    submit(formData, { method: "post" });
  }, [aiProvider, byokApiKey, submit]);

  const handleTestKey = useCallback(() => {
    const formData = new FormData();
    formData.set("intent", "test_key");
    formData.set("aiProvider", aiProvider);
    formData.set("byokApiKey", byokApiKey);
    submit(formData, { method: "post" });
  }, [aiProvider, byokApiKey, submit]);

  const handleSaveBrandVoice = useCallback(() => {
    const formData = new FormData();
    formData.set("intent", "save_brand_voice");
    formData.set("brandVoice", brandVoice);
    submit(formData, { method: "post" });
  }, [brandVoice, submit]);

  const handleSaveDefaults = useCallback(() => {
    const formData = new FormData();
    formData.set("intent", "save_defaults");
    formData.set("targetLanguage", targetLanguage);
    formData.set("descriptionLength", descriptionLength);
    formData.set("defaultFields", JSON.stringify(defaultFields));
    submit(formData, { method: "post" });
  }, [targetLanguage, descriptionLength, defaultFields, submit]);

  return (
    <Page title="Settings" backAction={{ url: "/app" }}>
      <BlockStack gap="500">
        {actionData && "message" in actionData && (
          <Banner
            tone="success"
            onDismiss={() => {}}
          >
            {actionData.message}
          </Banner>
        )}
        {actionData && "error" in actionData && (
          <Banner
            tone="critical"
            onDismiss={() => {}}
          >
            {(actionData as { error: string }).error}
          </Banner>
        )}

        <Layout>
          {/* AI Provider Section */}
          <Layout.AnnotatedSection
            title="AI Provider"
            description="Use your own provider key to generate product content drafts."
          >
            <Card>
              <BlockStack gap="400">
                <Banner tone="info" title="One-time setup before your first batch">
                  <p>
                    Paste a provider key, test it, then save. The key is
                    encrypted before storage and used when you generate product
                    descriptions, SEO copy, and image alt text.
                  </p>
                </Banner>
                <RadioButton
                  label="Anthropic (Claude)"
                  helpText="Uses Claude models for high-quality product content."
                  checked={aiProvider === "byok_anthropic"}
                  id="byok_anthropic"
                  name="aiProvider"
                  onChange={() => setAiProvider("byok_anthropic")}
                />
                <RadioButton
                  label="OpenAI (GPT)"
                  helpText="Uses GPT models for product content generation."
                  checked={aiProvider === "byok_openai"}
                  id="byok_openai"
                  name="aiProvider"
                  onChange={() => setAiProvider("byok_openai")}
                />
                <RadioButton
                  label="Mistral AI"
                  helpText="Uses Mistral models with your Mistral API key."
                  checked={aiProvider === "byok_mistral"}
                  id="byok_mistral"
                  name="aiProvider"
                  onChange={() => setAiProvider("byok_mistral")}
                />
                <RadioButton
                  label="Kimi (Moonshot AI)"
                  helpText="Uses Kimi models via Moonshot AI API."
                  checked={aiProvider === "byok_kimi"}
                  id="byok_kimi"
                  name="aiProvider"
                  onChange={() => setAiProvider("byok_kimi")}
                />

                <BlockStack gap="300">
                  <TextField
                    label="API Key"
                    value={byokApiKey}
                    onChange={setByokApiKey}
                    type="password"
                    autoComplete="off"
                    placeholder={aiProvider === "byok_anthropic" ? "sk-ant-..." : "sk-..."}
                    helpText={
                      aiProvider === "byok_anthropic"
                        ? "Get your key at console.anthropic.com. Your key is encrypted before storage."
                        : aiProvider === "byok_mistral"
                          ? "Get your key at console.mistral.ai. Your key is encrypted before storage."
                          : aiProvider === "byok_kimi"
                            ? "Get your key at platform.moonshot.cn. Your key is encrypted before storage."
                            : "Get your key at platform.openai.com. Your key is encrypted before storage."
                    }
                  />
                  <InlineStack gap="200">
                    <Button onClick={handleTestKey}>Test Key</Button>
                  </InlineStack>
                </BlockStack>

                <Button variant="primary" onClick={handleSaveProvider}>
                  Save Provider
                </Button>
              </BlockStack>
            </Card>
          </Layout.AnnotatedSection>

          {/* Brand Voice Section */}
          <Layout.AnnotatedSection
            title="Brand Voice"
            description="Describe your brand's tone and style. The AI will match this voice when generating content."
          >
            <Card>
              <BlockStack gap="400">
                <TextField
                  label="Brand Voice Instructions"
                  value={brandVoice}
                  onChange={setBrandVoice}
                  multiline={4}
                  autoComplete="off"
                  placeholder="Write in a friendly, casual tone. Our brand is playful but professional. Avoid jargon. Use short sentences."
                  helpText="Tip: Be specific. Include examples of words to use or avoid."
                />
                <Button variant="primary" onClick={handleSaveBrandVoice}>
                  Save Brand Voice
                </Button>
              </BlockStack>
            </Card>
          </Layout.AnnotatedSection>

          {/* Defaults Section */}
          <Layout.AnnotatedSection
            title="Defaults"
            description="Set default preferences for content generation."
          >
            <Card>
              <BlockStack gap="400">
                <Select
                  label="Language"
                  options={[
                    { label: "English", value: "en" },
                    { label: "Spanish", value: "es" },
                    { label: "French", value: "fr" },
                    { label: "German", value: "de" },
                    { label: "Japanese", value: "ja" },
                    { label: "Portuguese", value: "pt" },
                    { label: "Italian", value: "it" },
                    { label: "Chinese (Simplified)", value: "zh" },
                  ]}
                  value={targetLanguage}
                  onChange={setTargetLanguage}
                />
                <Select
                  label="Description Length"
                  options={[
                    { label: "Short (~100 words)", value: "short" },
                    { label: "Medium (~200 words)", value: "medium" },
                    { label: "Long (~300 words)", value: "long" },
                  ]}
                  value={descriptionLength}
                  onChange={setDescriptionLength}
                />
                <ChoiceList
                  allowMultiple
                  title="Default Fields to Generate"
                  choices={[
                    { label: "Product Description", value: "description" },
                    { label: "SEO Title", value: "seoTitle" },
                    { label: "Meta Description", value: "seoDescription" },
                    { label: "Image Alt Text", value: "altText" },
                  ]}
                  selected={defaultFields}
                  onChange={setDefaultFields}
                />
                <Button variant="primary" onClick={handleSaveDefaults}>
                  Save Defaults
                </Button>
              </BlockStack>
            </Card>
          </Layout.AnnotatedSection>

          {/* Weekly Scan Settings */}
          <Layout.AnnotatedSection
            title="Weekly SEO Scan"
            description="Automatically scan your full catalog each week for SEO issues and generate AI-drafted fixes for your review."
          >
            <Card>
              <BlockStack gap="400">
                <Checkbox
                  label="Enable weekly catalog scan"
                  helpText="BulkGenie will scan your entire catalog once a week and stage AI fixes for your approval."
                  checked={weeklyScansEnabled}
                  onChange={setWeeklyScansEnabled}
                />

                <Select
                  label="Scan day"
                  options={[
                    { label: "Monday", value: "1" },
                    { label: "Tuesday", value: "2" },
                    { label: "Wednesday", value: "3" },
                    { label: "Thursday", value: "4" },
                    { label: "Friday", value: "5" },
                    { label: "Saturday", value: "6" },
                    { label: "Sunday", value: "0" },
                  ]}
                  value={scanDayOfWeek}
                  onChange={setScanDayOfWeek}
                  disabled={!weeklyScansEnabled}
                  helpText="The cron job always runs on Mondays at 09:00 UTC. Set this to match your preference; adjust the cron schedule in vercel.json if needed."
                />

                <TextField
                  label="Email summary recipient"
                  value={scanEmailRecipient}
                  onChange={setScanEmailRecipient}
                  type="email"
                  autoComplete="email"
                  placeholder="you@yourstore.com"
                  helpText="Receive a weekly summary email when fixes are ready. Requires RESEND_API_KEY env var. Leave blank to disable."
                  disabled={!weeklyScansEnabled}
                />

                <BlockStack gap="200">
                  <Checkbox
                    label="Auto-apply low-risk fixes"
                    helpText="Low-risk fields (missing SEO title, missing meta description, missing alt text) will be published automatically without approval."
                    checked={autoApplyLowRisk}
                    onChange={setAutoApplyLowRisk}
                    disabled={!weeklyScansEnabled}
                  />
                  {autoApplyLowRisk && (
                    <Text as="p" variant="bodySm" tone="caution">
                      Auto-apply is enabled. Fixes for missing SEO titles, meta descriptions, and image alt text will be published without review.
                    </Text>
                  )}
                </BlockStack>

                <Button variant="primary" onClick={handleSaveScanSettings}>
                  Save Scan Settings
                </Button>
              </BlockStack>
            </Card>
          </Layout.AnnotatedSection>
        </Layout>
      </BlockStack>
    </Page>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  
  let errorMessage = "An unexpected error occurred";
  
  if (isRouteErrorResponse(error)) {
    errorMessage = error.statusText || error.data;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  return (
    <Page title="Settings" backAction={{ url: "/app" }}>
      <Banner tone="critical" title="Error loading settings">
        <p>{errorMessage}</p>
      </Banner>
      <BlockStack gap="400">
        <Button url="/app">Return to Dashboard</Button>
      </BlockStack>
    </Page>
  );
}
