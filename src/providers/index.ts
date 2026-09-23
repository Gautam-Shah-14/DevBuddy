import { getConfig } from "../lib/config.js";
import { OllamaProvider } from "./ollama.js";
import { OpenAiProvider } from "./openai.js";
import type { ChatProvider } from "./types.js";

export type { ChatProvider, ChatMessage, ToolCall, ToolSpec, StreamChatOptions, StreamChatResult } from "./types.js";
export { ProviderError } from "./types.js";

export function getProvider(): ChatProvider {
  const { provider } = getConfig();
  switch (provider) {
    case "openai":
      return new OpenAiProvider();
    case "ollama":
    default:
      return new OllamaProvider();
  }
}
