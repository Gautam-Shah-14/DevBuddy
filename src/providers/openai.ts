import { getConfig } from "../lib/config.js";
import { ProviderError, type ChatMessage, type ChatProvider, type StreamChatOptions, type StreamChatResult, type ToolCall } from "./types.js";
import { fetchWithRetry } from "./retry.js";

/** Converts DevBuddy's neutral ChatMessage[] into OpenAI's wire format:
 *  tool_calls carry stringified arguments and a "type" field, and tool
 *  results reference their call via tool_call_id rather than tool_name. */
function toOpenAiMessages(messages: ChatMessage[]): unknown[] {
  return messages.map((m) => {
    if (m.role === "assistant" && m.tool_calls?.length) {
      return {
        role: "assistant",
        content: m.content || null,
        tool_calls: m.tool_calls.map((tc, idx) => ({
          id: tc.id ?? `call_${idx}`,
          type: "function",
          function: { name: tc.function.name, arguments: JSON.stringify(tc.function.arguments) },
        })),
      };
    }
    if (m.role === "tool") {
      return { role: "tool", content: m.content, tool_call_id: m.tool_call_id ?? m.tool_name };
    }
    return { role: m.role, content: m.content };
  });
}

interface OpenAiModelsResponse {
  data: { id: string }[];
}

interface StreamingToolCallDelta {
  index: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface OpenAiChunk {
  choices?: {
    delta?: { content?: string; tool_calls?: StreamingToolCallDelta[] };
    finish_reason?: string | null;
  }[];
  // Present on the final chunk only when the request set stream_options.include_usage.
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message: string };
}

/**
 * Works against the OpenAI Chat Completions API and any OpenAI-compatible
 * endpoint (OpenRouter, Together, local llama.cpp servers, etc.) by
 * pointing openaiBaseUrl at a different host.
 */
export class OpenAiProvider implements ChatProvider {
  readonly name = "openai";

  private baseUrl(): string {
    return getConfig().openaiBaseUrl.replace(/\/+$/, "");
  }

  private headers(): Record<string, string> {
    const { openaiApiKey } = getConfig();
    if (!openaiApiKey) {
      throw new ProviderError(
        `No API key set for the openai provider. Set one with: devbuddy provider set-key openai <key>`
      );
    }
    return { "Content-Type": "application/json", Authorization: `Bearer ${openaiApiKey}` };
  }

  async checkConnection(): Promise<boolean> {
    try {
      const headers = this.headers(); // throws (no retry) when there's no API key at all
      const res = await fetchWithRetry(() => fetch(`${this.baseUrl()}/models`, { headers }));
      return res.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    const headers = this.headers();
    const res = await fetchWithRetry(() => fetch(`${this.baseUrl()}/models`, { headers }));
    if (!res.ok) {
      throw new ProviderError(`Failed to list models: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as OpenAiModelsResponse;
    return data.data.map((m) => m.id);
  }

  async streamChat({ model, messages, tools, onToken, onRetry }: StreamChatOptions): Promise<StreamChatResult> {
    const headers = this.headers(); // resolved once, outside the retry loop - a missing API key must not be retried
    let res: Response;
    try {
      res = await fetchWithRetry(
        () =>
          fetch(`${this.baseUrl()}/chat/completions`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              model,
              messages: toOpenAiMessages(messages),
              tools,
              stream: true,
              // Ask for exact token usage on the final chunk - most OpenAI-compatible
              // endpoints support this; ones that don't just ignore the field.
              stream_options: { include_usage: true },
            }),
          }),
        { onRetry }
      );
    } catch (err) {
      throw new ProviderError(`Could not reach ${this.baseUrl()}: ${(err as Error).message}`);
    }

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      throw new ProviderError(`Request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    // OpenAI streams tool call arguments as incremental string fragments keyed by index.
    const toolCallAccum = new Map<number, { id: string; name: string; args: string }>();
    let usage: { promptTokens?: number; completionTokens?: number } | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice("data:".length).trim();
        if (payload === "[DONE]") continue;

        const chunk = JSON.parse(payload) as OpenAiChunk;
        if (chunk.error) throw new ProviderError(chunk.error.message);

        if (chunk.usage) {
          usage = { promptTokens: chunk.usage.prompt_tokens, completionTokens: chunk.usage.completion_tokens };
        }

        const delta = chunk.choices?.[0]?.delta;
        if (delta?.content) {
          full += delta.content;
          onToken?.(delta.content);
        }
        for (const tc of delta?.tool_calls ?? []) {
          const existing = toolCallAccum.get(tc.index) ?? { id: "", name: "", args: "" };
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.name += tc.function.name;
          if (tc.function?.arguments) existing.args += tc.function.arguments;
          toolCallAccum.set(tc.index, existing);
        }
      }
    }

    const toolCalls: ToolCall[] = [...toolCallAccum.values()].map((tc) => {
      let args: Record<string, unknown> = {};
      try {
        args = tc.args ? JSON.parse(tc.args) : {};
      } catch {
        // leave args empty if the model produced malformed JSON
      }
      return { id: tc.id || undefined, function: { name: tc.name, arguments: args } };
    });

    return { content: full, toolCalls, usage };
  }
}
