import { getConfig } from "./config.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OllamaChatChunk {
  message?: { role: string; content: string };
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

export interface StreamChatOptions {
  model: string;
  messages: ChatMessage[];
  onToken: (token: string) => void;
}

/** Streams a chat completion from Ollama, calling onToken for each piece of text. */
export async function streamChat({ model, messages, onToken }: StreamChatOptions): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: true }),
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
        onToken(token);
      }
    }
  }

  return full;
}
