import { resolve, relative, isAbsolute } from "node:path";

export class SandboxViolation extends Error {}

/**
 * Resolves a user/model-supplied path against the project root and guarantees
 * the result stays inside it. Throws SandboxViolation on any attempt to
 * escape (via absolute paths, .., or symlinked traversal patterns).
 */
export function resolveInSandbox(projectRoot: string, targetPath: string): string {
  const root = resolve(projectRoot);
  const resolved = isAbsolute(targetPath) ? resolve(targetPath) : resolve(root, targetPath);

  const rel = relative(root, resolved);
  if (rel === "" ) return resolved;
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new SandboxViolation(
      `Path "${targetPath}" resolves outside the project directory (${root}). DevBuddy only operates within the current project.`
    );
  }
  return resolved;
}
