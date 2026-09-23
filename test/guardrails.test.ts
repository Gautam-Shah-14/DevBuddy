import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PII_PATTERNS } from "../src/lib/guardrails/patterns.js";
import { GuardrailsEngine, GuardrailsBlocked } from "../src/lib/guardrails/engine.js";
import type { ChatMessage } from "../src/providers/types.js";

function detect(text: string): { type: string; value: string }[] {
  // Mirrors GuardrailsEngine's internal scan via its public "block" path,
  // which surfaces exactly the findings a detector run would produce.
  const engine = new GuardrailsEngine("block");
  try {
    engine.apply([{ role: "user", content: text } as ChatMessage]);
    return [];
  } catch (err) {
    if (err instanceof GuardrailsBlocked) return err.findings;
    throw err;
  }
}

function detectedTypes(text: string): string[] {
  return [...new Set(detect(text).map((f) => f.type))];
}

describe("PII_PATTERNS registry", () => {
  it("has a unique type name per pattern", () => {
    const types = PII_PATTERNS.map((p) => p.type);
    assert.equal(new Set(types).size, types.length);
  });
});

describe("EMAIL detector", () => {
  it("matches a plain email address", () => {
    assert.deepEqual(detectedTypes("contact me at jane.doe@example.com please"), ["EMAIL"]);
  });
});

describe("PHONE detector", () => {
  it("matches a US-style phone number", () => {
    assert.ok(detectedTypes("call 555-123-4567 now").includes("PHONE"));
  });
});

describe("SSN detector", () => {
  it("matches a hyphenated SSN", () => {
    assert.ok(detectedTypes("ssn: 123-45-6789").includes("SSN"));
  });
});

describe("CREDIT_CARD detector (Luhn-validated)", () => {
  it("matches a Luhn-valid test card number", () => {
    assert.ok(detectedTypes("card 4111 1111 1111 1111 on file").includes("CREDIT_CARD"));
  });

  it("rejects a Luhn-invalid digit run of the same length", () => {
    assert.ok(!detectedTypes("card 4111 1111 1111 1112 on file").includes("CREDIT_CARD"));
  });
});

describe("IP_ADDRESS detector", () => {
  it("matches an IPv4 address", () => {
    assert.ok(detectedTypes("server at 192.168.1.10 responded").includes("IP_ADDRESS"));
  });
});

describe("AADHAAR detector (Verhoeff-validated)", () => {
  // 234567890124 has a verified-valid Verhoeff check digit (see conversation notes).
  it("matches a Verhoeff-valid Aadhaar number", () => {
    assert.ok(detectedTypes("aadhaar 2345 6789 0124 on file").includes("AADHAAR"));
  });

  it("rejects an Aadhaar-shaped number with an invalid check digit", () => {
    assert.ok(!detectedTypes("aadhaar 2345 6789 0129 on file").includes("AADHAAR"));
  });

  it("rejects a 12-digit number starting with 0 or 1 (never valid Aadhaar)", () => {
    assert.ok(!detectedTypes("random number 123456789012 here").includes("AADHAAR"));
  });
});

describe("PAN detector (holder-type validated)", () => {
  it("matches a PAN with a valid holder-type character", () => {
    assert.ok(detectedTypes("pan ABCPD1234E on file").includes("PAN"));
  });

  it("rejects a PAN-shaped string with an invalid holder-type character", () => {
    // 4th character 'D' is not a recognized PAN holder-type code.
    assert.ok(!detectedTypes("code ABCDE1234F here").includes("PAN"));
  });
});

describe("GSTIN detector (mod-36 checksum validated)", () => {
  it("matches a known-valid GSTIN", () => {
    assert.ok(detectedTypes("gstin 27AAPFU0939F1ZV registered").includes("GSTIN"));
  });

  it("matches a second independently-known-valid GSTIN", () => {
    assert.ok(detectedTypes("gstin 29AABCU9603R1ZJ registered").includes("GSTIN"));
  });

  it("rejects a GSTIN with a tampered check character", () => {
    assert.ok(!detectedTypes("gstin 27AAPFU0939F1ZX registered").includes("GSTIN"));
  });
});

describe("AWS_ACCESS_KEY detector", () => {
  it("matches an AKIA-prefixed key", () => {
    assert.ok(detectedTypes("key AKIAIOSFODNN7EXAMPLE in use").includes("AWS_ACCESS_KEY"));
  });
});

describe("PRIVATE_KEY detector", () => {
  it("matches a PEM private key block", () => {
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAK...\n-----END RSA PRIVATE KEY-----";
    assert.ok(detectedTypes(pem).includes("PRIVATE_KEY"));
  });
});

describe("JWT detector", () => {
  it("matches a JWT-shaped token", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    assert.ok(detectedTypes(`auth: ${jwt}`).includes("JWT"));
  });
});

describe("GENERIC_SECRET detector", () => {
  it("matches a password assignment", () => {
    assert.ok(detectedTypes('password: "SuperSecretValue123"').includes("GENERIC_SECRET"));
  });

  it("matches an api_key assignment", () => {
    assert.ok(detectedTypes("api_key=sk_live_abcdef1234567890").includes("GENERIC_SECRET"));
  });
});

describe("GuardrailsEngine - off mode", () => {
  it("returns the same array reference unchanged", () => {
    const engine = new GuardrailsEngine("off");
    const messages: ChatMessage[] = [{ role: "user", content: "email me@example.com" }];
    assert.equal(engine.apply(messages), messages);
  });
});

describe("GuardrailsEngine - mask mode", () => {
  it("masks a PII value and restores it exactly in a later reply", () => {
    const engine = new GuardrailsEngine("mask");
    const [masked] = engine.apply([{ role: "user", content: "my email is a@b.com" }]);
    assert.match(masked.content, /⟦EMAIL_1⟧/);
    assert.doesNotMatch(masked.content, /a@b\.com/);

    const restored = engine.restore(`Got it, I'll use ${masked.content.match(/⟦EMAIL_1⟧/)![0]}.`);
    assert.equal(restored, "Got it, I'll use a@b.com.");
  });

  it("maps the same real value to the same placeholder across calls", () => {
    const engine = new GuardrailsEngine("mask");
    const [first] = engine.apply([{ role: "user", content: "email a@b.com" }]);
    const [second] = engine.apply([{ role: "user", content: "again: a@b.com" }]);
    const placeholder1 = first.content.match(/⟦EMAIL_\d+⟧/)![0];
    const placeholder2 = second.content.match(/⟦EMAIL_\d+⟧/)![0];
    assert.equal(placeholder1, placeholder2);
  });

  it("gives distinct values distinct placeholders of the same type", () => {
    const engine = new GuardrailsEngine("mask");
    const [masked] = engine.apply([{ role: "user", content: "a@b.com and c@d.com" }]);
    assert.match(masked.content, /⟦EMAIL_1⟧/);
    assert.match(masked.content, /⟦EMAIL_2⟧/);
  });

  it("masks multiple messages in one call, independently", () => {
    const engine = new GuardrailsEngine("mask");
    const [m1, m2] = engine.apply([
      { role: "user", content: "email a@b.com" },
      { role: "assistant", content: "noted" },
    ]);
    assert.match(m1.content, /⟦EMAIL_1⟧/);
    assert.equal(m2.content, "noted");
  });

  it("does not mutate the original messages array", () => {
    const engine = new GuardrailsEngine("mask");
    const original: ChatMessage[] = [{ role: "user", content: "email a@b.com" }];
    engine.apply(original);
    assert.equal(original[0].content, "email a@b.com");
  });
});

describe("GuardrailsEngine - block mode", () => {
  it("throws GuardrailsBlocked and sends nothing when PII is present", () => {
    const engine = new GuardrailsEngine("block");
    assert.throws(() => engine.apply([{ role: "user", content: "ssn 123-45-6789" }]), GuardrailsBlocked);
  });

  it("reports the detected type in the thrown error", () => {
    const engine = new GuardrailsEngine("block");
    try {
      engine.apply([{ role: "user", content: "ssn 123-45-6789" }]);
      assert.fail("expected GuardrailsBlocked to be thrown");
    } catch (err) {
      assert.ok(err instanceof GuardrailsBlocked);
      assert.ok(err.findings.some((f) => f.type === "SSN"));
    }
  });

  it("passes through clean content with no PII", () => {
    const engine = new GuardrailsEngine("block");
    const messages: ChatMessage[] = [{ role: "user", content: "hello, how are you?" }];
    assert.equal(engine.apply(messages), messages);
  });
});

describe("GuardrailsEngine - overlapping pattern resolution", () => {
  it("prefers a validated AADHAAR match over the broader unvalidated PHONE shape on the same span", () => {
    // Regression test for the exact bug found during development: an
    // unspaced 12-digit Aadhaar number also fits the loose phone-number
    // shape, and without tie-breaking the wrong (unvalidated) type won.
    assert.deepEqual(detectedTypes("aadhaar 234567890124 here"), ["AADHAAR"]);
  });
});
