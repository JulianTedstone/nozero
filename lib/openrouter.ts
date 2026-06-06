import "server-only";

import {
  createOpenRouter,
  type OpenRouterProviderOptions,
} from "@openrouter/ai-sdk-provider";

const defaultModel = process.env.OPENROUTER_MODEL || "x-ai/grok-4.1-fast";

// Lazily constructed so importing this module (e.g. during the production build's
// page-data collection) doesn't require OPENROUTER_API_KEY — it's a server-only
// runtime var, not present at build time.
let client: ReturnType<typeof createOpenRouter> | null = null;
function getOpenRouter() {
  if (!client) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is not configured");
    }
    client = createOpenRouter({
      apiKey,
      compatibility: "strict",
    });
  }
  return client;
}

export function getOpenRouterModel() {
  return getOpenRouter().chat(defaultModel);
}

function supportsReasoningEffort(model: string) {
  // Grok models via OpenRouter reject the reasoning.effort payload.
  return !model.startsWith("x-ai/");
}

export function getOpenRouterProviderOptions(user?: string): {
  openrouter: OpenRouterProviderOptions;
} {
  return {
    openrouter: {
      ...(supportsReasoningEffort(defaultModel)
        ? {
            reasoning: {
              enabled: true,
              effort: "high",
            },
          }
        : {}),
      ...(user ? { user } : {}),
    },
  };
}
