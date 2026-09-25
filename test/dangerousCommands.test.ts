import { test } from "node:test";
import assert from "node:assert/strict";
import { detectHardlineCommand } from "../src/lib/dangerousCommands.js";

function blocked(command: string, descriptionSubstring?: string): void {
  const result = detectHardlineCommand(command);
  assert.ok(result, `expected "${command}" to be hardline-blocked, but it wasn't`);
  if (descriptionSubstring) assert.match(result!, new RegExp(descriptionSubstring, "i"));
}

function allowed(command: string): void {
  const result = detectHardlineCommand(command);
  assert.equal(result, null, `expected "${command}" NOT to be hardline-blocked, but got: ${result}`);
}

test("blocks recursive-force delete of the root filesystem, in its common variants", () => {
  blocked("rm -rf /", "root filesystem");
  blocked("rm -fr /", "root filesystem");
  blocked("rm -r -f /", "root filesystem");
  blocked("rm --recursive --force /", "root filesystem");
  blocked("rm -rf /*", "root filesystem");
  blocked("sudo rm -rf /", "root filesystem");
});

test("blocks recursive-force delete of the home directory or a bare system directory", () => {
  blocked("rm -rf ~", "home directory");
  blocked("rm -rf $HOME", "home directory");
  blocked("rm -rf ${HOME}/", "home directory");
  blocked("rm -rf /etc", "system directory");
  blocked("rm -rf /usr/", "system directory");
});

test("does NOT block ordinary, scoped destructive commands", () => {
  allowed("rm -rf ./node_modules");
  allowed("rm -rf build/");
  allowed("rm -rf /tmp/my-scratch-dir");
  allowed("rm -rf dist");
  allowed("rm file.txt");
  allowed("rm -rf /etc/myapp.conf"); // a file *inside* /etc, not the bare directory
});

test("quoted prose that merely mentions a dangerous command is never blocked", () => {
  allowed('echo "never run rm -rf / on this machine"');
  allowed('git commit -m "docs: warn against rm -rf /"');
});

test("blocks formatting or overwriting a disk device", () => {
  blocked("mkfs.ext4 /dev/sda1", "format a filesystem");
  blocked("mkfs /dev/sdb", "format a filesystem");
  blocked("dd if=/dev/zero of=/dev/sda", "raw data");
  blocked("dd if=/dev/zero of=/dev/sda bs=1M", "raw data");
  blocked("cat image.iso > /dev/sdb", "disk device");
});

test("does NOT block dd/redirects that don't target a raw disk device", () => {
  allowed("dd if=backup.img of=restore.img");
  allowed("echo hello > output.txt");
});

test("blocks a fork bomb and shutdown/reboot commands", () => {
  blocked(":(){ :|:& };:", "fork bomb");
  blocked("shutdown -h now", "shut down or reboot");
  blocked("reboot", "shut down or reboot");
  blocked("systemctl poweroff", "shut down or reboot");
  blocked("init 6", "shut down or reboot");
  blocked("kill -1", "every process");
});

test("does NOT block a normal, targeted kill", () => {
  allowed("kill -9 1234");
  allowed("kill 5678");
});

test("a hardline pattern still matches when chained after a harmless command", () => {
  blocked("npm test && rm -rf /", "root filesystem");
  blocked("cd /tmp; rm -rf ~", "home directory");
});
