import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import chalk from "chalk";
import { loadConnectors, type ConnectorConfig } from "./connectors.js";
import { requestPermission } from "./permissions.js";
import type { ToolDefinition, JsonSchema } from "../tools/types.js";

interface ConnectedServer {
  config: ConnectorConfig;
  client: Client;
}

/**
 * Connects to every enabled MCP connector and wraps each tool the server
 * exposes as a DevBuddy ToolDefinition, namespaced as "mcp__<connector>__<tool>"
 * to avoid colliding with built-ins or other connectors.
 */
export class McpManager {
  private servers: ConnectedServer[] = [];

  async connectAll(projectRoot?: string): Promise<ToolDefinition[]> {
    const connectors = loadConnectors(projectRoot).filter((c) => c.enabled);
    const tools: ToolDefinition[] = [];

    for (const config of connectors) {
      try {
        const client = new Client({ name: "devbuddy", version: "0.1.0" }, { capabilities: {} });
        const transport = new StdioClientTransport({
          command: config.command,
          args: config.args,
          env: config.env,
        });
        await client.connect(transport);
        this.servers.push({ config, client });

        const { tools: serverTools } = await client.listTools();
        for (const tool of serverTools) {
          tools.push(this.wrapTool(config, client, tool.name, tool.description ?? "", tool.inputSchema as JsonSchema));
        }
        console.log(chalk.dim(`Connected to MCP server "${config.name}" (${serverTools.length} tools)`));
      } catch (err) {
        console.error(chalk.yellow(`Failed to connect to MCP server "${config.name}": ${(err as Error).message}`));
      }
    }

    return tools;
  }

  private wrapTool(
    config: ConnectorConfig,
    client: Client,
    toolName: string,
    description: string,
    inputSchema: JsonSchema
  ): ToolDefinition {
    return {
      name: `mcp__${config.name}__${toolName}`,
      description: `[MCP: ${config.name}] ${description}`,
      parameters: inputSchema,
      async execute(args) {
        await requestPermission({
          category: "mcp",
          description: `Call MCP tool ${config.name}/${toolName} with ${JSON.stringify(args)}`,
        });
        const result = await client.callTool({ name: toolName, arguments: args });
        const content = result.content as { type: string; text?: string }[] | undefined;
        if (!content) return JSON.stringify(result);
        return content
          .map((c) => (c.type === "text" ? c.text ?? "" : `[${c.type} content omitted]`))
          .join("\n");
      },
    };
  }

  async disconnectAll(): Promise<void> {
    for (const { client } of this.servers) {
      await client.close().catch(() => {});
    }
    this.servers = [];
  }
}
