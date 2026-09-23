import { PII_PATTERNS } from "./patterns.js";
import type { ChatMessage } from "../../providers/types.js";

export type GuardrailsMode = "off" | "mask" | "block";

export interface PiiFinding {
  type: string;
  value: string;
}

export class GuardrailsBlocked extends Error {
  constructor(public findings: PiiFinding[]) {
    const types = [...new Set(findings.map((f) => f.type))].join(", ");
    super(`Blocked: detected PII/secrets (${types}) in content that would be sent to the AI provider.`);
  }
}

interface RawMatch extends PiiFinding {
  start: number;
  end: number;
  validated: boolean;
  patternIndex: number;
}

/**
 * Some patterns' shapes overlap (e.g. a 12-digit Aadhaar number also fits
 * the broad phone-number shape). When two patterns match the identical
 * span, prefer whichever has a structural validator (Verhoeff/Luhn/holder
 * code) over a bare shape match, since a validated match is much higher
 * confidence; break remaining ties by longer match, then pattern order.
 */
function resolveOverlaps(matches: RawMatch[]): RawMatch[] {
  const sorted = [...matches].sort((a, b) => {
    if (a.validated !== b.validated) return a.validated ? -1 : 1;
    const lengthDiff = b.end - b.start - (a.end - a.start);
    if (lengthDiff !== 0) return lengthDiff;
    return a.patternIndex - b.patternIndex;
  });

  const accepted: RawMatch[] = [];
  for (const candidate of sorted) {
    const overlaps = accepted.some((a) => candidate.start < a.end && a.start < candidate.end);
    if (!overlaps) accepted.push(candidate);
  }
  return accepted;
}

function scanText(text: string): PiiFinding[] {
  const matches: RawMatch[] = [];
  PII_PATTERNS.forEach((pattern, patternIndex) => {
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(text))) {
      const value = match[0];
      if (!pattern.validate || pattern.validate(value)) {
        matches.push({
          type: pattern.type,
          value,
          start: match.index,
          end: match.index + value.length,
          validated: Boolean(pattern.validate),
          patternIndex,
        });
      }
      if (!pattern.regex.global) break;
    }
  });
  return resolveOverlaps(matches).map(({ type, value }) => ({ type, value }));
}

/**
 * Scans outgoing messages for PII/secrets before they leave the machine in
 * a request to an AI provider. In "mask" mode, matches are replaced with
 * stable placeholders (the same value always maps to the same placeholder
 * for the lifetime of this engine/session) and restored in the model's
 * response before it's shown to the user or stored. In "block" mode, a
 * turn whose outgoing content contains PII is refused entirely - nothing
 * is sent.
 *
 * Local tools (read_file, etc.) are never restricted by this - the agent
 * can still freely read/edit files containing PII. The engine only guards
 * the boundary where content is about to be sent to the AI provider.
 */
export class GuardrailsEngine {
  private valueToPlaceholder = new Map<string, string>();
  private placeholderToValue = new Map<string, string>();
  private typeCounters = new Map<string, number>();

  constructor(public readonly mode: GuardrailsMode) {}

  private placeholderFor(finding: PiiFinding): string {
    const existing = this.valueToPlaceholder.get(finding.value);
    if (existing) return existing;
    const count = (this.typeCounters.get(finding.type) ?? 0) + 1;
    this.typeCounters.set(finding.type, count);
    const placeholder = `⟦${finding.type}_${count}⟧`; // ⟦TYPE_n⟧
    this.valueToPlaceholder.set(finding.value, placeholder);
    this.placeholderToValue.set(placeholder, finding.value);
    return placeholder;
  }

  private maskText(text: string): string {
    const findings = scanText(text);
    let masked = text;
    // Replace longest values first so overlapping matches don't corrupt shorter ones.
    for (const finding of [...findings].sort((a, b) => b.value.length - a.value.length)) {
      masked = masked.split(finding.value).join(this.placeholderFor(finding));
    }
    return masked;
  }

  restore(text: string): string {
    let restored = text;
    for (const [placeholder, value] of this.placeholderToValue) {
      restored = restored.split(placeholder).join(value);
    }
    return restored;
  }

  /**
   * Applies this engine's mode to a full outgoing message array, returning
   * a new array safe to send to the provider. Throws GuardrailsBlocked in
   * "block" mode if any message contains PII. Returns the input unchanged
   * (same reference) when mode is "off".
   */
  apply(messages: ChatMessage[]): ChatMessage[] {
    if (this.mode === "off") return messages;

    if (this.mode === "block") {
      const findings = messages.flatMap((m) => scanText(m.content));
      if (findings.length > 0) throw new GuardrailsBlocked(findings);
      return messages;
    }

    return messages.map((m) => ({ ...m, content: this.maskText(m.content) }));
  }
}
