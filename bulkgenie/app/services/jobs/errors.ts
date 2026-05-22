export function normalizeJobError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "Unknown error");
  const lower = message.toLowerCase();

  if (
    lower.includes("credit balance is too low") ||
    lower.includes("insufficient_quota") ||
    lower.includes("quota") ||
    lower.includes("billing")
  ) {
    return "Your AI provider account is out of credits or billing is not active. Add credits or switch providers in Settings, then regenerate.";
  }

  if (
    lower.includes("could not resolve authentication method") ||
    lower.includes("api key") ||
    lower.includes("apikey") ||
    lower.includes("auth token") ||
    lower.includes("unauthorized") ||
    lower.includes("invalid_api_key")
  ) {
    return "Your AI provider key could not be used. Check the provider and API key in Settings, test it, then regenerate.";
  }

  return message.slice(0, 500);
}

export function isFatalProviderSetupError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("out of credits") ||
    lower.includes("billing is not active") ||
    lower.includes("provider key could not be used") ||
    lower.includes("go to settings") ||
    lower.includes("api key")
  );
}
