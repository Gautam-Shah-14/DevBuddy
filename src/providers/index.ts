import { getConfig, type ProviderName } from "../lib/config.js";
import { OllamaProvider } from "./ollama.js";
import { OpenAiProvider } from "./openai.js";
import { AnthropicProvider } from "./anthropic.js";
import type { ChatProvider } from "./types.js";

export type { ChatProvider, ChatMessage, ToolCall, ToolSpec, StreamChatOptions, StreamChatResult, RetryInfo } from "./types.js";
export { ProviderError } from "./types.js";

/** `providerOverride` lets callers pick the provider from an effective,
 *  project-config-aware value instead of the user's raw ~/.devbuddy/config.json. */
export function getProvider(providerOverride?: ProviderName): ChatProvider {
  const provider = providerOverride ?? getConfig().provider;
  switch (provider) {
    case "openai":
      return new OpenAiProvider();
    case "anthropic":
      return new AnthropicProvider();
    case "ollama":
    default:
      return new OllamaProvider();
  }
}
