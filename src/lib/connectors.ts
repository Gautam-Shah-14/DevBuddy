import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { connectorsFile } from "./project.js";

export interface ConnectorConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

export function loadConnectors(): ConnectorConfig[] {
  const file = connectorsFile();
  if (!existsSync(file)) return [];
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return [];
  }
}

function saveConnectors(connectors: ConnectorConfig[]): void {
  const file = connectorsFile();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(connectors, null, 2));
}

export function addConnector(config: ConnectorConfig): void {
  const connectors = loadConnectors().filter((c) => c.name !== config.name);
  connectors.push(config);
  saveConnectors(connectors);
}

export function removeConnector(name: string): boolean {
  const connectors = loadConnectors();
  const filtered = connectors.filter((c) => c.name !== name);
  if (filtered.length === connectors.length) return false;
  saveConnectors(filtered);
  return true;
}

export function setConnectorEnabled(name: string, enabled: boolean): boolean {
  const connectors = loadConnectors();
  const target = connectors.find((c) => c.name === name);
  if (!target) return false;
  target.enabled = enabled;
  saveConnectors(connectors);
  return true;
}
