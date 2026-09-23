import { getConfig } from "./config.js";

export interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: OllamaToolCall[];
  tool_name?: string;
}

interface OllamaChatChunk {
  message?: { role: string; content: string; tool_calls?: OllamaToolCall[] };
  done: boolean;
  error?: string;
}

interface OllamaTagsResponse {
  models: { name: string; size: number; modified_at: string }[];
}

export class OllamaError extends Error {}

function baseUrl(): string {
  return getConfig().host.replace(/\/+$/, "");
}

/** Confirms a local Ollama server is reachable before we try anything else. */
export async function checkConnection(): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl()}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function listModels(): Promise<string[]> {
  const res = await fetch(`${baseUrl()}/api/tags`);
  if (!res.ok) {
    throw new OllamaError(`Failed to list models: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as OllamaTagsResponse;
  return data.models.map((m) => m.name);
}

export interface OllamaToolSpec {
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
  tools?: OllamaToolSpec[];
  onToken?: (token: string) => void;
}

export interface StreamChatResult {
  content: string;
  toolCalls: OllamaToolCall[];
}

/**
 * Streams a chat completion from Ollama. Text tokens are surfaced via
 * onToken as they arrive; any tool_calls the model requests are collected
 * and returned once the stream finishes (Ollama emits them on the final
 * message chunk rather than incrementally).
 */
export async function streamChat({ model, messages, tools, onToken }: StreamChatOptions): Promise<StreamChatResult> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, tools, stream: true }),
    });
  } catch (err) {
    throw new OllamaError(
      `Could not reach Ollama at ${baseUrl()}. Is it running? (try: ollama serve)\n${(err as Error).message}`
    );
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new OllamaError(`Ollama request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let toolCalls: OllamaToolCall[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const chunk = JSON.parse(line) as OllamaChatChunk;
      if (chunk.error) throw new OllamaError(chunk.error);
      const token = chunk.message?.content ?? "";
      if (token) {
        full += token;
        onToken?.(token);
      }
      if (chunk.message?.tool_calls?.length) {
        toolCalls = chunk.message.tool_calls;
      }
    }
  }

  return { content: full, toolCalls };
}
