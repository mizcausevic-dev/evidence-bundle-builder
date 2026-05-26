#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { buildManifest, verifyManifest } from "./build.js";
import type { BuildOptions, Manifest } from "./types.js";

type Mode = "build" | "verify";

interface Args {
  mode: Mode;
  bundleDir?: string;
  meta?: string;
  out?: string;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { mode: "build", help: false };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") args.help = true;
    else if (a === "--verify") args.mode = "verify";
    else if (a === "--meta") args.meta = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (!a.startsWith("-")) positional.push(a);
    else throw new Error(`Unknown option: ${a}`);
  }
  if (positional[0]) args.bundleDir = positional[0];
  return args;
}

const HELP = `evidence-bundle-builder — assemble or verify a spec-conforming evidence-bundle manifest

Usage:
  # build  manifest.json from a bundle directory + metadata file
  evidence-bundle-builder <bundle-dir> --meta meta.json [--out manifest.json]

  # verify on-disk content/ matches an existing manifest's sha256s
  evidence-bundle-builder <bundle-dir> --verify

\`<bundle-dir>\` must contain a \`content/\` subdirectory. \`meta.json\` shape:

  {
    "bundle":        { "id": "…", "subject": "…", "purpose": "…", "creator": "…" },
    "relationships": [ … ],
    "provenance":    { … },
    "itemIds":       { "vendor-policy-v3.pdf": "source-policy" },
    "itemMetadata":  { "source-policy": { "source_uri": "…", "description": "…" } }
  }

Exit codes:
  0 — manifest built (build mode), or verified clean (verify mode)
  1 — verify failed (sha256 mismatch on at least one item)
  2 — usage / I/O error`;

export function run(argv: string[]): number {
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
    return 2;
  }
  if (args.help || !args.bundleDir) {
    process.stdout.write(`${HELP}\n`);
    return args.help ? 0 : 2;
  }

  if (args.mode === "verify") {
    let manifest: Manifest;
    try {
      manifest = JSON.parse(readFileSync(join(args.bundleDir, "manifest.json"), "utf8")) as Manifest;
    } catch (e) {
      process.stderr.write(`error reading manifest.json: ${(e as Error).message}\n`);
      return 2;
    }
    const failures = verifyManifest(args.bundleDir, manifest);
    if (failures.length === 0) {
      process.stdout.write(`ok — ${manifest.items.length}/${manifest.items.length} items verified\n`);
      return 0;
    }
    process.stderr.write(`fail — ${failures.length}/${manifest.items.length} mismatch: ${failures.join(", ")}\n`);
    return 1;
  }

  if (!args.meta) {
    process.stderr.write(`--meta <path> is required in build mode\n`);
    return 2;
  }

  let opts: BuildOptions;
  try {
    opts = JSON.parse(readFileSync(args.meta, "utf8")) as BuildOptions;
  } catch (e) {
    process.stderr.write(`error reading --meta: ${(e as Error).message}\n`);
    return 2;
  }

  let manifest: Manifest;
  try {
    manifest = buildManifest(args.bundleDir, opts);
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
    return 2;
  }

  const out = args.out ?? join(args.bundleDir, "manifest.json");
  writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  process.stdout.write(`wrote ${out} — ${manifest.items.length} items\n`);
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  try {
    process.exit(run(process.argv.slice(2)));
  } catch (e) {
    process.stderr.write(`fatal: ${(e as Error).message}\n`);
    process.exit(2);
  }
}
