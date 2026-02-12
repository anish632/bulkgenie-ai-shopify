import { useState, useCallback } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useActionData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  InlineStack,
  TextField,
  Select,
  ChoiceList,
  RadioButton,
  Banner,
  Divider,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { encrypt } from "../services/encryption.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
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
    },
  });
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
      if (
        byokApiKey &&
        byokApiKey !== "••••••••" &&
        (aiProvider === "byok_openai" || aiProvider === "byok_anthropic")
      ) {
        updateData.byokApiKey = encrypt(byokApiKey);
      }
      if (aiProvider === "cloud") {
        updateData.byokApiKey = null;
      }

      await prisma.shop.update({
        where: { shopDomain },
        data: updateData,
      });

      return json({ success: true, message: "AI provider updated" });
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
  const shopifyBridge = useAppBridge();

  const [aiProvider, setAiProvider] = useState(shop.aiProvider);
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

  const isByok =
    aiProvider === "byok_openai" || aiProvider === "byok_anthropic";

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
            description="Choose how AI content is generated. Use BulkGenie AI Cloud or bring your own API key."
          >
            <Card>
              <BlockStack gap="400">
                <RadioButton
                  label="BulkGenie AI Cloud (default)"
                  helpText="Uses our AI infrastructure. Included with your plan."
                  checked={aiProvider === "cloud"}
                  id="cloud"
                  name="aiProvider"
                  onChange={() => setAiProvider("cloud")}
                />
                <RadioButton
                  label="Bring Your Own Key — Anthropic"
                  helpText="Use your own Anthropic API key for Claude models."
                  checked={aiProvider === "byok_anthropic"}
                  id="byok_anthropic"
                  name="aiProvider"
                  onChange={() => setAiProvider("byok_anthropic")}
                />
                <RadioButton
                  label="Bring Your Own Key — OpenAI"
                  helpText="Use your own OpenAI API key for GPT models."
                  checked={aiProvider === "byok_openai"}
                  id="byok_openai"
                  name="aiProvider"
                  onChange={() => setAiProvider("byok_openai")}
                />

                {isByok && (
                  <BlockStack gap="300">
                    <TextField
                      label="API Key"
                      value={byokApiKey}
                      onChange={setByokApiKey}
                      type="password"
                      autoComplete="off"
                      helpText="Your key is encrypted and stored securely."
                    />
                    <InlineStack gap="200">
                      <Button onClick={handleTestKey}>Test Key</Button>
                    </InlineStack>
                  </BlockStack>
                )}

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
        </Layout>
      </BlockStack>
    </Page>
  );
}
