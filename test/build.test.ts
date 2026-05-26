import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { buildManifest, slugifyToId, verifyManifest, writeBundleManifest } from "../src/build.js";
import type { BuildOptions, Manifest } from "../src/types.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const SAMPLE = `${here}/../fixtures/sample-bundle`;

function makeOpts(over: Partial<BuildOptions["bundle"]> = {}): BuildOptions {
  return {
    bundle: {
      id: "sample-bundle",
      subject: "Sample bundle for tests",
      purpose: "rag-citation-pack",
      created_at: "2026-05-27T08:00:00Z",
      creator: "test@kineticgain.com",
      ...over
    }
  };
}

describe("slugifyToId", () => {
  it("lowercases and replaces non-alnum with dashes", () => {
    expect(slugifyToId("Vendor Policy v3.pdf")).toBe("vendor-policy-v3");
    expect(slugifyToId("source_A.json")).toBe("source-a");
  });
  it("trims leading/trailing dashes", () => {
    expect(slugifyToId("---foo---.md")).toBe("foo");
  });
  it("returns 'item' for an empty result", () => {
    expect(slugifyToId(".---")).toBe("item");
  });
});

describe("buildManifest", () => {
  it("produces a v0.1 manifest with one item per file under content/", () => {
    const m = buildManifest(SAMPLE, makeOpts());
    expect(m.evidence_bundle_version).toBe("0.1");
    expect(m.items).toHaveLength(3);
    for (const it of m.items) {
      expect(it.path.startsWith("content/")).toBe(true);
      expect(it.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(it.size_bytes).toBeGreaterThan(0);
    }
  });

  it("derives item id from filename, infers media type from extension", () => {
    const m = buildManifest(SAMPLE, makeOpts());
    const policy = m.items.find((x) => x.id === "source-policy");
    expect(policy).toBeDefined();
    expect(policy?.media_type).toBe("text/markdown");
    const nested = m.items.find((x) => x.path === "content/sub/nested.txt");
    expect(nested?.media_type).toBe("text/plain");
  });

  it("respects opts.itemIds override", () => {
    const m = buildManifest(SAMPLE, {
      ...makeOpts(),
      itemIds: { "source-policy.md": "policy-pdf" }
    });
    expect(m.items.some((x) => x.id === "policy-pdf")).toBe(true);
  });

  it("threads itemMetadata into items", () => {
    const m = buildManifest(SAMPLE, {
      ...makeOpts(),
      itemMetadata: {
        "source-policy": {
          source_uri: "https://example.com/p.pdf",
          retrieved_at: "2026-05-27T07:00:00Z",
          description: "ACME vendor policy"
        }
      }
    });
    const policy = m.items.find((x) => x.id === "source-policy");
    expect(policy?.source_uri).toBe("https://example.com/p.pdf");
    expect(policy?.description).toBe("ACME vendor policy");
  });

  it("includes relationships + provenance + signature when supplied", () => {
    const m = buildManifest(SAMPLE, {
      ...makeOpts(),
      relationships: [{ subject: "source-policy", predicate: "cites", object: "answer-summary" }],
      provenance: { agent_card_uri: "https://example.com/agent.json", model: "gpt-4o-mini" },
      signature: { algorithm: "ed25519", signer: "ci@example.com", value: "AAAA" }
    });
    expect(m.relationships?.[0].predicate).toBe("cites");
    expect(m.provenance?.model).toBe("gpt-4o-mini");
    expect(m.signature?.algorithm).toBe("ed25519");
  });

  it("respects skip", () => {
    const m = buildManifest(SAMPLE, { ...makeOpts(), skip: ["sub"] });
    expect(m.items.some((x) => x.path.startsWith("content/sub"))).toBe(false);
  });

  it("throws on invalid bundle.id", () => {
    expect(() => buildManifest(SAMPLE, makeOpts({ id: "Invalid ID!" }))).toThrow();
  });

  it("throws when content/ is missing", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ebb-"));
    try {
      expect(() => buildManifest(tmp, makeOpts())).toThrow(/content\/ directory/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("throws when content/ is empty", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ebb-"));
    mkdirSync(join(tmp, "content"));
    try {
      expect(() => buildManifest(tmp, makeOpts())).toThrow(/no files under content\//);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("disambiguates duplicate-derived ids with a -2 suffix", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ebb-"));
    mkdirSync(join(tmp, "content"));
    mkdirSync(join(tmp, "content", "a"));
    mkdirSync(join(tmp, "content", "b"));
    writeFileSync(join(tmp, "content", "a", "x.md"), "hello a");
    writeFileSync(join(tmp, "content", "b", "x.md"), "hello b");
    try {
      const m = buildManifest(tmp, makeOpts());
      const ids = m.items.map((x) => x.id).sort();
      expect(ids).toHaveLength(2);
      expect(ids[0]).not.toBe(ids[1]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("verifyManifest", () => {
  it("returns [] when every file matches sha256", () => {
    const m = buildManifest(SAMPLE, makeOpts());
    expect(verifyManifest(SAMPLE, m)).toEqual([]);
  });

  it("returns the failing item id when content was tampered with", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ebb-"));
    mkdirSync(join(tmp, "content"));
    writeFileSync(join(tmp, "content", "x.md"), "before");
    const m = buildManifest(tmp, makeOpts());
    writeFileSync(join(tmp, "content", "x.md"), "after — tampered");
    try {
      const failures = verifyManifest(tmp, m);
      expect(failures.length).toBe(1);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("returns the failing id when an item file is deleted", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ebb-"));
    mkdirSync(join(tmp, "content"));
    writeFileSync(join(tmp, "content", "x.md"), "hi");
    const m = buildManifest(tmp, makeOpts());
    rmSync(join(tmp, "content", "x.md"));
    try {
      expect(verifyManifest(tmp, m).length).toBe(1);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("writeBundleManifest", () => {
  it("writes manifest.json next to content/", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ebb-"));
    mkdirSync(join(tmp, "content"));
    writeFileSync(join(tmp, "content", "a.md"), "hi");
    try {
      writeBundleManifest(tmp, makeOpts());
      const written = JSON.parse(readFileSync(join(tmp, "manifest.json"), "utf8")) as Manifest;
      expect(written.evidence_bundle_version).toBe("0.1");
      expect(written.items).toHaveLength(1);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
