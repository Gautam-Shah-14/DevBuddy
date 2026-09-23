export interface ToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_name?: string;
}

export interface ToolSpec {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: unknown;
  };
}

export interface StreamChatOptions {
  model: string;
  messages: ChatMessage[];
  tools?: ToolSpec[];
  onToken?: (token: string) => void;
}

export interface StreamChatResult {
  content: string;
  toolCalls: ToolCall[];
}

export class ProviderError extends Error {}

/**
 * A pluggable AI backend. DevBuddy always ships with a working Ollama
 * provider (local, no API key); other providers (OpenAI-compatible
 * endpoints, Anthropic, etc.) implement the same interface so the rest of
 * the agent (tool-calling loop, memory, CLI) never needs to know which one
 * is active.
 */
export interface ChatProvider {
  readonly name: string;
  checkConnection(): Promise<boolean>;
  listModels(): Promise<string[]>;
  streamChat(opts: StreamChatOptions): Promise<StreamChatResult>;
}
