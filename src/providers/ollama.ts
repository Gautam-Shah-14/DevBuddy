import { getConfig } from "../lib/config.js";
import { ProviderError, type ChatProvider, type StreamChatOptions, type StreamChatResult, type ToolCall } from "./types.js";
import { fetchWithRetry } from "./retry.js";

interface OllamaChatChunk {
  message?: { role: string; content: string; tool_calls?: ToolCall[] };
  done: boolean;
  error?: string;
  // Present on the final chunk (done: true) - exact token counts for this turn.
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaTagsResponse {
  models: { name: string; size: number; modified_at: string }[];
}

export class OllamaProvider implements ChatProvider {
  readonly name = "ollama";

  private baseUrl(): string {
    return getConfig().host.replace(/\/+$/, "");
  }

  async checkConnection(): Promise<boolean> {
    try {
      const res = await fetchWithRetry(() => fetch(`${this.baseUrl()}/api/tags`));
      return res.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    const res = await fetchWithRetry(() => fetch(`${this.baseUrl()}/api/tags`));
    if (!res.ok) {
      throw new ProviderError(`Failed to list models: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as OllamaTagsResponse;
    return data.models.map((m) => m.name);
  }

  async streamChat({ model, messages, tools, onToken, onRetry }: StreamChatOptions): Promise<StreamChatResult> {
    let res: Response;
    try {
      res = await fetchWithRetry(
        () =>
          fetch(`${this.baseUrl()}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model, messages, tools, stream: true }),
          }),
        { onRetry }
      );
    } catch (err) {
      throw new ProviderError(
        `Could not reach Ollama at ${this.baseUrl()}. Is it running? (try: ollama serve)\n${(err as Error).message}`
      );
    }

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      throw new ProviderError(`Ollama request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    let toolCalls: ToolCall[] = [];
    let usage: { promptTokens?: number; completionTokens?: number } | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        const chunk = JSON.parse(line) as OllamaChatChunk;
        if (chunk.error) throw new ProviderError(chunk.error);
        const token = chunk.message?.content ?? "";
        if (token) {
          full += token;
          onToken?.(token);
        }
        if (chunk.message?.tool_calls?.length) {
          toolCalls = chunk.message.tool_calls;
        }
        if (chunk.done && (chunk.prompt_eval_count !== undefined || chunk.eval_count !== undefined)) {
          usage = { promptTokens: chunk.prompt_eval_count, completionTokens: chunk.eval_count };
        }
      }
    }

    return { content: full, toolCalls, usage };
  }
}
