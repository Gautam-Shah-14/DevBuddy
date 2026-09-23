import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { connectorsFile, repoConnectorsFile } from "./project.js";

export interface ConnectorConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
  /** Set on connectors read back from a project's committed .devbuddy/connectors.json (team-shared, via git). */
  shared?: boolean;
}

function readConnectorsFile(file: string): ConnectorConfig[] {
  if (!existsSync(file)) return [];
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return [];
  }
}

/**
 * Connectors visible to a project: the user's own ~/.devbuddy/connectors.json
 * (this machine only), plus a project's committed .devbuddy/connectors.json
 * when projectRoot is given (team-shared via git - same-named entries there
 * override the user's own, since that's the point of a shared connector).
 * A shared connector's `env` values are still whatever the committed JSON
 * says - see `devbuddy project init`'s README for why that must never be a
 * literal secret.
 */
export function loadConnectors(projectRoot?: string): ConnectorConfig[] {
  const own = readConnectorsFile(connectorsFile());
  if (!projectRoot) return own;

  const shared = readConnectorsFile(repoConnectorsFile(projectRoot)).map((c) => ({ ...c, shared: true }));
  const byName = new Map<string, ConnectorConfig>();
  for (const c of own) byName.set(c.name, c);
  for (const c of shared) byName.set(c.name, c);
  return [...byName.values()];
}

function saveConnectors(connectors: ConnectorConfig[], projectRoot?: string): void {
  const file = projectRoot ? repoConnectorsFile(projectRoot) : connectorsFile();
  mkdirSync(dirname(file), { recursive: true });
  // `shared` is a read-time marker (which file a connector came from), not a stored field.
  const toWrite = connectors.map(({ shared: _shared, ...rest }) => rest);
  writeFileSync(file, JSON.stringify(toWrite, null, 2));
}

export function addConnector(config: ConnectorConfig, projectRoot?: string): void {
  const connectors = readConnectorsFile(projectRoot ? repoConnectorsFile(projectRoot) : connectorsFile()).filter(
    (c) => c.name !== config.name
  );
  connectors.push(config);
  saveConnectors(connectors, projectRoot);
}

export function removeConnector(name: string, projectRoot?: string): boolean {
  const file = projectRoot ? repoConnectorsFile(projectRoot) : connectorsFile();
  const connectors = readConnectorsFile(file);
  const filtered = connectors.filter((c) => c.name !== name);
  if (filtered.length === connectors.length) return false;
  saveConnectors(filtered, projectRoot);
  return true;
}

export function setConnectorEnabled(name: string, enabled: boolean, projectRoot?: string): boolean {
  const file = projectRoot ? repoConnectorsFile(projectRoot) : connectorsFile();
  const connectors = readConnectorsFile(file);
  const target = connectors.find((c) => c.name === name);
  if (!target) return false;
  target.enabled = enabled;
  saveConnectors(connectors, projectRoot);
  return true;
}
