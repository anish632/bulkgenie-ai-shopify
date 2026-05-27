export type JobFailureCategory =
  | "provider_billing"   // out of credits / quota — fatal, cascade all
  | "provider_auth"      // bad API key / unauthorized — fatal, cascade all
  | "provider_transient" // timeout / network / 5xx — retryable, no cascade
  | "shopify_publish"
  | "generation"
  | "unknown";

export function classifyJobError(error: unknown): {
  category: JobFailureCategory;
  message: string;
} {
  const message = error instanceof Error ? error.message : String(error || "Unknown error");
  const lower = message.toLowerCase();

  // Billing / quota exhaustion — fatal, cascade
  if (
    lower.includes("credit balance is too low") ||
    lower.includes("insufficient_quota") ||
    lower.includes("quota exceeded") ||
    lower.includes("billing") ||
    lower.includes("rate_limit_exceeded")
  ) {
    return {
      category: "provider_billing",
      message:
        "Your AI provider account is out of credits or billing is not active. Add credits or switch providers in Settings, then regenerate.",
    };
  }

  // Auth / key problems — fatal, cascade
  if (
    lower.includes("could not resolve authentication method") ||
    lower.includes("no api key configured") ||
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
      category: "provider_auth",
      message:
        "Your AI provider key could not be used. Check the provider and API key in Settings, test it, then regenerate.",
    };
  }

  // Transient — retryable, do NOT cascade
  if (
    lower.includes("rate limit") ||
    lower.includes("service unavailable") ||
    lower.includes("timeout") ||
    lower.includes("network error") ||
    lower.includes("fetch failed") ||
    lower.includes("econnreset") ||
    lower.includes("econnrefused") ||
    lower.includes("gateway") ||
    lower.includes("502") ||
    lower.includes("503") ||
    lower.includes("504")
  ) {
    return {
      category: "provider_transient",
      message:
        "A transient network or rate-limit error occurred. Retry the failed item.",
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

export function isFatalProviderSetupError(category: JobFailureCategory): boolean {
  return category === "provider_billing" || category === "provider_auth";
}
