# Changelog

## v0.1.0 — 2026-05-27

- Initial release: assemble a spec-conforming `manifest.json` for an evidence bundle directory.
- Library API: `buildManifest(bundleDir, opts)` → `Manifest`; `verifyManifest(bundleDir, manifest)` → failing-id list; `writeBundleManifest(bundleDir, opts)` writes to disk; `slugifyToId(filename)` helper.
- Mechanical fields auto-computed: `sha256`, `size_bytes`, `media_type` (inferred from extension), default `id` (slug from filename), default `created_at` (now()). Caller supplies `bundle` meta + optional `relationships` / `provenance` / `signature` / `itemIds` / `itemMetadata`.
- Recursive walk of `content/`; duplicate-id disambiguation with `-2`, `-3`, … suffixes; `--skip` substring filter.
- CLI: `evidence-bundle-builder <bundle-dir>` with `--meta <meta.json>` (build mode) or `--verify` (re-hash and compare against existing manifest). Exit 1 on verify mismatch.
- Companion stamper to `evidence-bundle-spec`. Pairs with `hash-attestation-rs` for ed25519 signing.
- Node 20/22 CI (lint, typecheck, coverage, build, demo, `npm audit`), AGPL-3.0-or-later, Dependabot.
