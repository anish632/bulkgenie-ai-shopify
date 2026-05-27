import type { Shop } from "@prisma/client";
import type { AIProvider } from "./provider";
import { AnthropicProvider } from "./anthropic-provider";
import { OpenAIProvider } from "./openai-provider";
import { TemplateProvider } from "./template-provider";
import { decrypt } from "../encryption.server";

export function getAIProvider(shop: Shop): AIProvider {
  // Free tier or no key configured → template-based generation, no API cost
  if (!shop.byokApiKey || shop.tier === "free") {
    return new TemplateProvider();
  }

  const key = decrypt(shop.byokApiKey);

  switch (shop.aiProvider) {
    case "byok_anthropic":
      return new AnthropicProvider(key, "claude-haiku-4-5-20251001");

    case "byok_openai":
      return new OpenAIProvider(key);

    case "byok_kimi":
      return new OpenAIProvider(key, "moonshot-v1-8k", "https://api.moonshot.cn/v1");

    case "byok_mistral":
      return new OpenAIProvider(key, "mistral-small-latest", "https://api.mistral.ai/v1");

    default:
      return new AnthropicProvider(key, "claude-haiku-4-5-20251001");
  }
}
