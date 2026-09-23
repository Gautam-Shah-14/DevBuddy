import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { requestPermission } from "../lib/permissions.js";
import { resolveInSandbox } from "../lib/sandbox.js";
import { formatDiff } from "../lib/diff.js";
import type { ToolDefinition } from "./types.js";

export const readFileTool: ToolDefinition = {
  name: "read_file",
  description: "Read the full contents of a file within the current project.",
  parameters: {
    type: "object",
    properties: { path: { type: "string", description: "Path relative to the project root" } },
    required: ["path"],
  },
  async execute(args, ctx) {
    const path = resolveInSandbox(ctx.projectRoot, String(args.path));
    if (!existsSync(path)) return `Error: file not found: ${args.path}`;
    return readFileSync(path, "utf-8");
  },
};

export const writeFileTool: ToolDefinition = {
  name: "write_file",
  description: "Create or overwrite a file within the current project with the given content.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path relative to the project root" },
      content: { type: "string", description: "Full file content to write" },
    },
    required: ["path", "content"],
  },
  async execute(args, ctx) {
    const path = resolveInSandbox(ctx.projectRoot, String(args.path));
    const isNew = !existsSync(path);
    const newContent = String(args.content);
    const oldContent = isNew ? "" : readFileSync(path, "utf-8");
    await requestPermission({
      category: "write",
      description: `${isNew ? "Create" : "Overwrite"} file: ${args.path}`,
      diff: formatDiff(oldContent, newContent),
    });
    ctx.memory.addCheckpoint(ctx.sessionId, "write_file", String(args.path), !isNew, isNew ? null : oldContent);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, newContent);
    return `Wrote ${newContent.length} bytes to ${args.path}`;
  },
};

export const editFileTool: ToolDefinition = {
  name: "edit_file",
  description:
    "Replace an exact string occurrence in a file with a new string. The old_string must match exactly once.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path relative to the project root" },
      old_string: { type: "string", description: "Exact text to find" },
      new_string: { type: "string", description: "Text to replace it with" },
    },
    required: ["path", "old_string", "new_string"],
  },
  async execute(args, ctx) {
    const path = resolveInSandbox(ctx.projectRoot, String(args.path));
    if (!existsSync(path)) return `Error: file not found: ${args.path}`;
    const content = readFileSync(path, "utf-8");
    const oldStr = String(args.old_string);
    const occurrences = content.split(oldStr).length - 1;
    if (occurrences === 0) return `Error: old_string not found in ${args.path}`;
    if (occurrences > 1) return `Error: old_string matches ${occurrences} times in ${args.path}, must be unique`;

    const newContent = content.replace(oldStr, String(args.new_string));
    await requestPermission({ category: "write", description: `Edit file: ${args.path}`, diff: formatDiff(content, newContent) });
    ctx.memory.addCheckpoint(ctx.sessionId, "edit_file", String(args.path), true, content);
    writeFileSync(path, newContent);
    return `Edited ${args.path}`;
  },
};

export const deleteFileTool: ToolDefinition = {
  name: "delete_file",
  description: "Delete a file within the current project.",
  parameters: {
    type: "object",
    properties: { path: { type: "string", description: "Path relative to the project root" } },
    required: ["path"],
  },
  async execute(args, ctx) {
    const path = resolveInSandbox(ctx.projectRoot, String(args.path));
    if (!existsSync(path)) return `Error: file not found: ${args.path}`;
    const content = readFileSync(path, "utf-8");
    await requestPermission({
      category: "delete",
      description: `Delete file: ${args.path}`,
      diff: formatDiff(content, ""),
    });
    ctx.memory.addCheckpoint(ctx.sessionId, "delete_file", String(args.path), true, content);
    rmSync(path);
    return `Deleted ${args.path}`;
  },
};
