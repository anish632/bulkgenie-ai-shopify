export type JobFailureCategory =
  | "provider_setup"
  | "shopify_publish"
  | "network"
  | "generation"
  | "unknown";

export function classifyJobError(error: unknown): {
  category: JobFailureCategory;
  message: string;
} {
  const message = error instanceof Error ? error.message : String(error || "Unknown error");
  const lower = message.toLowerCase();

  if (
    lower.includes("credit balance is too low") ||
    lower.includes("insufficient_quota") ||
    lower.includes("quota") ||
    lower.includes("billing") ||
    lower.includes("rate limit") ||
    lower.includes("service unavailable") ||
    lower.includes("timeout") ||
    lower.includes("network error") ||
    lower.includes("fetch failed") ||
    lower.includes("gateway")
  ) {
    return {
      category: "provider_setup",
      message:
        "Your AI provider account is out of credits or billing is not active. Add credits or switch providers in Settings, then regenerate.",
    };
  }

  if (
    lower.includes("could not resolve authentication method") ||
    lower.includes("api key") ||
    lower.includes("apikey") ||
    lower.includes("auth token") ||
    lower.includes("unauthorized") ||
    lower.includes("invalid_api_key") ||
    lower.includes("forbidden") ||
    lower.includes("access denied") ||
    lower.includes("permission")
  ) {
    return {
      category: "provider_setup",
      message:
        "Your AI provider key could not be used. Check the provider and API key in Settings, test it, then regenerate.",
    };
  }

  if (
    lower.includes("shopify") ||
    lower.includes("publish") ||
    lower.includes("mutation") ||
    lower.includes("resource not found")
  ) {
    return {
      category: "shopify_publish",
      message:
        "Shopify rejected the publish step. Check the product data, permissions, and publish flow, then retry.",
    };
  }

  if (
    lower.includes("invalid") ||
    lower.includes("parse") ||
    lower.includes("json") ||
    lower.includes("schema")
  ) {
    return {
      category: "generation",
      message:
        "The model output or content shape was not usable. Retry with a smaller field set or better source data.",
    };
  }

  return {
    category: "unknown",
    message: message.slice(0, 500),
  };
}

export function isFatalProviderSetupError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("out of credits") ||
    lower.includes("billing is not active") ||
    lower.includes("provider key could not be used") ||
    lower.includes("go to settings") ||
    lower.includes("api key") ||
    lower.includes("unauthorized") ||
    lower.includes("forbidden") ||
    lower.includes("access denied")
  );
}
