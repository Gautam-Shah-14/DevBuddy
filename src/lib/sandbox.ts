import { resolve, relative, isAbsolute, dirname, join } from "node:path";
import { existsSync, realpathSync } from "node:fs";

export class SandboxViolation extends Error {}

function assertInside(root: string, candidate: string, originalInput: string): void {
  const rel = relative(root, candidate);
  if (rel === "") return;
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new SandboxViolation(
      `Path "${originalInput}" resolves outside the project directory (${root}). DevBuddy only operates within the current project.`
    );
  }
}

/**
 * Resolves a path to its real, symlink-free form, without requiring it to
 * exist - walks up to the nearest existing ancestor, resolves that, and
 * rejoins the (still-lexical) remainder. This matters for a new file about
 * to be created (write_file), which doesn't exist yet but whose containing
 * directory might itself be a symlink.
 */
function realOrLexicalPath(p: string): string {
  if (existsSync(p)) {
    try {
      return realpathSync.native(p);
    } catch {
      return p; // e.g. a broken symlink - fall through to the lexical path
    }
  }
  const parent = dirname(p);
  if (parent === p) return p; // reached the filesystem root
  return join(realOrLexicalPath(parent), p.slice(parent.length + 1));
}

/**
 * Resolves a user/model-supplied path against the project root and guarantees
 * the result stays inside it. Throws SandboxViolation on any attempt to
 * escape via absolute paths, "..", or a symlink inside the project that
 * points outside it (checked separately below - path.resolve/relative are
 * purely lexical and never look at the filesystem, so a symlink passes the
 * first check regardless of where it actually points).
 */
export function resolveInSandbox(projectRoot: string, targetPath: string): string {
  const root = resolve(projectRoot);
  const resolved = isAbsolute(targetPath) ? resolve(targetPath) : resolve(root, targetPath);
  assertInside(root, resolved, targetPath);

  const realRoot = realOrLexicalPath(root);
  const realResolved = realOrLexicalPath(resolved);
  assertInside(realRoot, realResolved, targetPath);

  return resolved;
}
