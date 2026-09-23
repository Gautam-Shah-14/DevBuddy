import { getConfig } from "../lib/config.js";
import {
  ProviderError,
  type ChatMessage,
  type ChatProvider,
  type StreamChatOptions,
  type StreamChatResult,
  type ToolCall,
  type ToolSpec,
} from "./types.js";

const ANTHROPIC_VERSION = "2023-06-01";

interface AnthropicModelsResponse {
  data: { id: string }[];
}

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

interface AnthropicRequestMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

interface AnthropicSseEvent {
  type: string;
  index?: number;
  content_block?: { type: string; id?: string; name?: string };
  delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string };
  message?: { usage?: { input_tokens?: number; output_tokens?: number } };
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message: string };
}

/** Converts DevBuddy's neutral ChatMessage[] into Anthropic's Messages API
 *  shape: system messages are pulled out into a top-level `system` string,
 *  assistant tool calls become tool_use blocks, and tool results become
 *  user messages carrying tool_result blocks keyed by tool_use_id. */
function toAnthropicRequest(messages: ChatMessage[]): { system: string; messages: AnthropicRequestMessage[] } {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  const out: AnthropicRequestMessage[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;

    if (m.role === "assistant") {
      const blocks: AnthropicContentBlock[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const tc of m.tool_calls ?? []) {
        blocks.push({ type: "tool_use", id: tc.id ?? tc.function.name, name: tc.function.name, input: tc.function.arguments });
      }
      out.push({ role: "assistant", content: blocks.length ? blocks : m.content });
      continue;
    }

    if (m.role === "tool") {
      out.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: m.tool_call_id ?? m.tool_name ?? "", content: m.content }],
      });
      continue;
    }

    out.push({ role: "user", content: m.content });
  }
  return { system, messages: out };
}

function toAnthropicTools(tools: ToolSpec[] | undefined): unknown[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
}

/**
 * Talks to Anthropic's Messages API (api.anthropic.com/v1/messages) directly
 * over fetch/SSE - no SDK dependency, matching the other providers' style.
 * Requires an API key (devbuddy provider set-key anthropic <key>).
 */
export class AnthropicProvider implements ChatProvider {
  readonly name = "anthropic";

  private baseUrl(): string {
    return getConfig().anthropicBaseUrl.replace(/\/+$/, "");
  }

  private headers(): Record<string, string> {
    const { anthropicApiKey } = getConfig();
    if (!anthropicApiKey) {
      throw new ProviderError(
        `No API key set for the anthropic provider. Set one with: devbuddy provider set-key anthropic <key>`
      );
    }
    return {
      "Content-Type": "application/json",
      "x-api-key": anthropicApiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    };
  }

  async checkConnection(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl()}/models`, { headers: this.headers() });
      return res.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    const res = await fetch(`${this.baseUrl()}/models`, { headers: this.headers() });
    if (!res.ok) {
      throw new ProviderError(`Failed to list models: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as AnthropicModelsResponse;
    return data.data.map((m) => m.id);
  }

  async streamChat({ model, messages, tools, onToken }: StreamChatOptions): Promise<StreamChatResult> {
    const { system, messages: anthropicMessages } = toAnthropicRequest(messages);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl()}/messages`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          model,
          system: system || undefined,
          messages: anthropicMessages,
          tools: toAnthropicTools(tools),
          max_tokens: 8192,
          stream: true,
        }),
      });
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
    // Anthropic streams each content block independently, keyed by index;
    // tool_use blocks arrive as incremental partial_json fragments.
    const blockKinds = new Map<number, "text" | "tool_use">();
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
        if (!payload) continue;

        const event = JSON.parse(payload) as AnthropicSseEvent;
        if (event.type === "error" || event.error) {
          throw new ProviderError(event.error?.message ?? "Anthropic stream error");
        }

        if (event.type === "message_start" && event.message?.usage) {
          usage = { promptTokens: event.message.usage.input_tokens, completionTokens: event.message.usage.output_tokens };
        }
        if (event.type === "message_delta" && event.usage) {
          usage = {
            promptTokens: usage?.promptTokens ?? event.usage.input_tokens,
            completionTokens: event.usage.output_tokens ?? usage?.completionTokens,
          };
        }

        if (event.type === "content_block_start" && event.index !== undefined && event.content_block) {
          if (event.content_block.type === "tool_use") {
            blockKinds.set(event.index, "tool_use");
            toolCallAccum.set(event.index, {
              id: event.content_block.id ?? "",
              name: event.content_block.name ?? "",
              args: "",
            });
          } else {
            blockKinds.set(event.index, "text");
          }
        }

        if (event.type === "content_block_delta" && event.index !== undefined && event.delta) {
          if (event.delta.type === "text_delta" && event.delta.text) {
            full += event.delta.text;
            onToken?.(event.delta.text);
          } else if (event.delta.type === "input_json_delta" && event.delta.partial_json !== undefined) {
            const existing = toolCallAccum.get(event.index);
            if (existing) existing.args += event.delta.partial_json;
          }
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
