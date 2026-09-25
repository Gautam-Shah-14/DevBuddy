const SYSTEM_DIRS = "etc|usr|bin|sbin|lib|lib64|boot|var|root|home";
const ROOT_PATH = /^\/+\*?$/;
const HOME_PATH = /^(~|\$home|\$\{home\})\/?\*?$/i;
const SYSTEM_DIR_PATH = new RegExp(`^/(${SYSTEM_DIRS})/?\\*?$`, "i");

/** Strips a leading `sudo [flags]` (or `env [VAR=val ...]`) prefix so `sudo rm -rf /`
 *  and `env FOO=1 rm -rf /` are still recognized as an `rm` command in "command position". */
function stripRunnerPrefix(segment: string): string {
  return segment
    .replace(/^sudo(\s+-\S+)*\s+/i, "")
    .replace(/^env(\s+\w+=\S*)*\s+/i, "");
}

function isRecursiveForceDelete(segment: string, isTargetDangerous: (path: string) => boolean): boolean {
  const match = segment.match(/^rm\s+((?:-\S+\s+)+)(\S+)\s*$/i);
  if (!match) return false;
  const flags = match[1].toLowerCase();
  const hasRecursive = /-[a-z]*r/.test(flags) || flags.includes("--recursive");
  const hasForce = /-[a-z]*f/.test(flags) || flags.includes("--force");
  return hasRecursive && hasForce && isTargetDangerous(match[2]);
}

/** Rules matched against the start of a shell segment ("command position"), so quoted
 *  prose mentioning a command name (`echo "never run rm -rf /"`) never trips them - the
 *  segment there starts with "echo", not "rm". */
const COMMAND_POSITION_RULES: { test: (segment: string) => boolean; description: string }[] = [
  { test: (s) => isRecursiveForceDelete(s, (p) => ROOT_PATH.test(p)), description: "recursively delete the root filesystem" },
  { test: (s) => isRecursiveForceDelete(s, (p) => HOME_PATH.test(p)), description: "recursively delete the home directory" },
  {
    test: (s) => isRecursiveForceDelete(s, (p) => SYSTEM_DIR_PATH.test(p)),
    description: "recursively delete a system directory",
  },
  { test: (s) => /^mkfs(\.\w+)?\b/i.test(s), description: "format a filesystem (mkfs)" },
  {
    test: (s) => /^dd\b.*\bof=\/dev\/(sd|nvme|hd|mmcblk|vd|xvd)[a-z0-9]*/i.test(s),
    description: "write raw data directly over a disk device (dd)",
  },
  { test: (s) => /^(shutdown|reboot|halt|poweroff)\b/i.test(s), description: "shut down or reboot the machine" },
  { test: (s) => /^init\s+[06]\b/.test(s), description: "shut down or reboot the machine (init 0/6)" },
  {
    test: (s) => /^systemctl\s+(poweroff|reboot|halt|kexec)\b/i.test(s),
    description: "shut down or reboot the machine (systemctl)",
  },
  { test: (s) => /^kill\s+(-\S+\s+)*-1\b/.test(s), description: "send a signal to every process on the machine (kill -1)" },
];

function stripQuoted(command: string): string {
  return command.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, "");
}

/** Rules with no command-name token to anchor to (a redirect's `>` sits mid-command; a fork
 *  bomb is a function definition) - checked against a quote-masked copy of the whole command
 *  instead, so quoted prose (`echo "cat f > /dev/sda"`) can't trip them. */
const POSITIONLESS_RULES: { pattern: RegExp; description: string }[] = [
  { pattern: />\s*\/dev\/(sd|nvme|hd|mmcblk|vd|xvd)[a-z0-9]*\b/i, description: "redirect output directly onto a disk device" },
  { pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, description: "a fork bomb" },
];

const SEGMENT_SPLIT = /;|\n|&&|\|\||\|(?!\|)|`|\$\(/g;

/**
 * Checks a shell command against a small, fixed set of universally
 * catastrophic operations - wiping the root/home/a system directory,
 * formatting or overwriting a disk, a fork bomb, shutting the machine down -
 * that should never run regardless of user approval, "remember for this
 * session", or `--yes`. Returns a human description of what matched, or
 * null if nothing did. Most commands, including ordinary destructive-but-
 * scoped ones like `rm -rf ./build` or `rm -rf /tmp/scratch`, don't match
 * anything here and still go through the normal approval prompt as before -
 * this is a narrow, unconditional floor under that prompt, not a
 * replacement for it.
 */
export function detectHardlineCommand(command: string): string | null {
  const segments = command.split(SEGMENT_SPLIT).map((s) => s.trim()).filter(Boolean);
  for (const rawSegment of segments) {
    const segment = stripRunnerPrefix(rawSegment);
    for (const rule of COMMAND_POSITION_RULES) {
      if (rule.test(segment)) return rule.description;
    }
  }
  const masked = stripQuoted(command);
  for (const rule of POSITIONLESS_RULES) {
    if (rule.pattern.test(masked)) return rule.description;
  }
  return null;
}
