export interface ToolCall {
  /** Provider-assigned call id. Required to match a tool result back to its call
   *  (OpenAI's tool_call_id, Anthropic's tool_use_id). Ollama doesn't need one. */
  id?: string;
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
  /** For role "tool": the id of the ToolCall this message is a result for. */
  tool_call_id?: string;
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

export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
}

export interface StreamChatResult {
  content: string;
  toolCalls: ToolCall[];
  /** Exact token counts when the provider reports them (Ollama always does; not every OpenAI-compatible endpoint does). */
  usage?: TokenUsage;
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
