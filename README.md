# evidence-bundle-builder

TS library + CLI that assembles a spec-conforming `manifest.json` for a directory of evidence files. The **companion stamper** to [`evidence-bundle-spec`](https://github.com/mizcausevic-dev/evidence-bundle-spec) — same relationship as [`prompt-provenance-stamp`](https://github.com/mizcausevic-dev/prompt-provenance-stamp) ↔ [`prompt-provenance-spec`](https://github.com/mizcausevic-dev/prompt-provenance-spec).

> Status: v0.1.0 — Node 20/22 supported, library + CLI.

## What it does

Given a directory laid out like:

```
my-bundle/
  content/
    source-policy.md
    answer-summary.md
    sub/
      nested.txt
```

…it walks `content/` recursively, computes `sha256` + size per file, infers media types from extensions, and emits `manifest.json` conforming to the [Evidence Bundle v0.1](https://github.com/mizcausevic-dev/evidence-bundle-spec) schema:

```jsonc
{
  "evidence_bundle_version": "0.1",
  "bundle":        { "id": "…", "subject": "…", "purpose": "…", "created_at": "…", "creator": "…" },
  "items":         [ { "id": "…", "path": "content/…", "sha256": "…", "size_bytes": 123, … } ],
  "relationships": [ { "subject": "…", "predicate": "cites", "object": "…" } ],
  "provenance":    { "agent_card_uri": "…", … },
  "signature":     { "algorithm": "ed25519", … }
}
```

You supply the bundle metadata + optional relationships / provenance / signature. The builder computes everything that's mechanical (hashes, sizes, ids, paths, media types).

## CLI

```bash
# Build manifest.json from a bundle directory + metadata file
npx evidence-bundle-builder ./my-bundle --meta ./meta.json

# Verify on-disk content/ still matches the manifest's sha256s
npx evidence-bundle-builder ./my-bundle --verify
```

`meta.json` shape:

```jsonc
{
  "bundle": {
    "id": "audit-2026-q2-section-cc7",
    "subject": "SOC2 CC7 evidence",
    "purpose": "compliance-disclosure",
    "creator": "compliance-bot@example.com"
  },
  "relationships": [
    { "subject": "ir-runbook", "predicate": "supersedes", "object": "ir-runbook-v3-archive" }
  ],
  "provenance": {
    "agent_card_uri": "https://example.com/agents/compliance-bot.v2.0.0.json"
  },
  "itemIds":      { "vendor-policy-v3.pdf": "source-policy" },
  "itemMetadata": { "source-policy": { "source_uri": "https://example.com/p.pdf", "description": "Vendor policy v3" } }
}
```

Exit code:
- `0` — manifest built (or verify clean)
- `1` — verify failed
- `2` — usage / I/O error

## Library

```ts
import { buildManifest, verifyManifest, writeBundleManifest } from "evidence-bundle-builder";

const manifest = buildManifest("./my-bundle", {
  bundle: { id: "rag-trace-abc123", subject: "Q4 vendor diligence", purpose: "rag-citation-pack", creator: "research-assistant@1.1.0" },
  relationships: [{ subject: "source-policy", predicate: "cites", object: "answer-summary" }],
  provenance: { otel_trace_id: "5b8aa5a2d2c872e8321cf37308d69df2", model: "gpt-4o-mini" }
});

const failures = verifyManifest("./my-bundle", manifest);
console.log(failures.length === 0 ? "verified" : `tampered: ${failures.join(", ")}`);
```

## Composes with

- [**`evidence-bundle-spec`**](https://github.com/mizcausevic-dev/evidence-bundle-spec) — the schema this writes.
- [**`hash-attestation-rs`**](https://github.com/mizcausevic-dev/hash-attestation-rs) — sign the resulting manifest using ed25519 over canonical JSON.
- [**`prompt-provenance-stamp`**](https://github.com/mizcausevic-dev/prompt-provenance-stamp) — companion stamper for the prompt-provenance side.

## Develop

```
npm install
npm run lint && npm run typecheck && npm run coverage && npm run build
npm run demo
```

## License

[AGPL-3.0-or-later](LICENSE)
