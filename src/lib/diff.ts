import chalk from "chalk";

type DiffOp = { type: "context" | "add" | "remove"; line: string };

const MAX_DIFF_LINES = 400; // guards against pathological diffs on huge/binary-ish files

/**
 * Line-based diff via the classic LCS backtrack. Quadratic in line count, so
 * callers should treat very large files as a special case rather than rely
 * on this scaling - fine for the source-sized files DevBuddy edits.
 */
function diffOps(oldLines: string[], newLines: string[]): DiffOp[] {
  const n = oldLines.length;
  const m = newLines.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        oldLines[i] === newLines[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      ops.push({ type: "context", line: oldLines[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      ops.push({ type: "remove", line: oldLines[i] });
      i++;
    } else {
      ops.push({ type: "add", line: newLines[j] });
      j++;
    }
  }
  while (i < n) ops.push({ type: "remove", line: oldLines[i++] });
  while (j < m) ops.push({ type: "add", line: newLines[j++] });
  return ops;
}

/**
 * Renders a colored, +/- prefixed diff between two full file contents, with
 * a couple of lines of context around each changed run (like `git diff`
 * without the hunk-header bookkeeping). Returns null when there's no
 * difference at all.
 */
export function formatDiff(oldText: string, newText: string, context = 2): string | null {
  if (oldText === newText) return null;

  const oldLines = oldText.length ? oldText.split("\n") : [];
  const newLines = newText.length ? newText.split("\n") : [];

  if (oldLines.length * newLines.length > 4_000_000) {
    const added = newLines.length;
    const removed = oldLines.length;
    return chalk.dim(`(diff too large to render: ${removed} lines removed, ${added} lines added)`);
  }

  const ops = diffOps(oldLines, newLines);

  // Mark every op within `context` lines of a change as worth printing;
  // everything else collapses into a "N omitted" marker, like `git diff`.
  const keep = new Array(ops.length).fill(false);
  ops.forEach((op, idx) => {
    if (op.type === "context") return;
    for (let k = Math.max(0, idx - context); k <= Math.min(ops.length - 1, idx + context); k++) keep[k] = true;
  });

  const out: string[] = [];
  let linesPrinted = 0;
  let idx = 0;
  let truncated = false;
  while (idx < ops.length) {
    if (!keep[idx]) {
      let gap = 0;
      while (idx < ops.length && !keep[idx]) {
        gap++;
        idx++;
      }
      out.push(chalk.dim(`... ${gap} unchanged line${gap === 1 ? "" : "s"} ...`));
      continue;
    }
    if (linesPrinted >= MAX_DIFF_LINES) {
      truncated = true;
      break;
    }
    out.push(renderLine(ops[idx]));
    linesPrinted++;
    idx++;
  }
  if (truncated) out.push(chalk.dim(`... diff truncated at ${MAX_DIFF_LINES} lines ...`));

  return out.join("\n");
}

function renderLine(op: DiffOp): string {
  if (op.type === "add") return chalk.green(`+ ${op.line}`);
  if (op.type === "remove") return chalk.red(`- ${op.line}`);
  return chalk.dim(`  ${op.line}`);
}
