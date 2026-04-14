import type { Shop } from "@prisma/client";
import type { AIProvider } from "./provider";
import { AnthropicProvider } from "./anthropic-provider";
import { OpenAIProvider } from "./openai-provider";
import { decrypt } from "../encryption.server";

export function getAIProvider(shop: Shop): AIProvider {
  if (!shop.byokApiKey) {
    throw new Error(
      "No API key configured. Go to Settings to add your API key (Anthropic, OpenAI, or Mistral).",
    );
  }

  const key = decrypt(shop.byokApiKey);

  switch (shop.aiProvider) {
    case "byok_anthropic":
      return new AnthropicProvider(key, "claude-sonnet-4-5-20250929");

    case "byok_openai":
      return new OpenAIProvider(key);

    case "byok_kimi":
      return new OpenAIProvider(key, "moonshot-v1-8k", "https://api.moonshot.cn/v1");

    case "byok_mistral":
      return new OpenAIProvider(key, "mistral-small-latest", "https://api.mistral.ai/v1");

    default:
      return new AnthropicProvider(key, "claude-sonnet-4-5-20250929");
  }
}
