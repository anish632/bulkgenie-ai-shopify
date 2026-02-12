import type { Shop } from "@prisma/client";
import type { AIProvider } from "./provider";
import { AnthropicProvider } from "./anthropic-provider";
import { OpenAIProvider } from "./openai-provider";
import { decrypt } from "../encryption.server";

export function getAIProvider(shop: Shop): AIProvider {
  switch (shop.aiProvider) {
    case "cloud":
      return new AnthropicProvider(
        process.env.ANTHROPIC_API_KEY!,
        shop.tier === "scale"
          ? "claude-sonnet-4-5-20250929"
          : "claude-haiku-4-5-20251001",
      );

    case "byok_anthropic": {
      if (!shop.byokApiKey) throw new Error("No API key configured");
      const key = decrypt(shop.byokApiKey);
      return new AnthropicProvider(key, "claude-sonnet-4-5-20250929");
    }

    case "byok_openai": {
      if (!shop.byokApiKey) throw new Error("No API key configured");
      const key = decrypt(shop.byokApiKey);
      return new OpenAIProvider(key);
    }

    case "ondevice":
      throw new Error("On-device inference should not reach the server");

    default:
      return new AnthropicProvider(
        process.env.ANTHROPIC_API_KEY!,
        "claude-haiku-4-5-20251001",
      );
  }
}
