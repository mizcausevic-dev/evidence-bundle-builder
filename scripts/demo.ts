import { rmSync, copyFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

import { buildManifest, verifyManifest } from "../src/build.js";

const here = dirname(fileURLToPath(import.meta.url));
const SAMPLE = join(here, "..", "fixtures", "sample-bundle");

function copyTree(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src)) {
    const s = join(src, entry);
    const d = join(dst, entry);
    if (statSync(s).isDirectory()) copyTree(s, d);
    else copyFileSync(s, d);
  }
}

const tmp = join(tmpdir(), `ebb-demo-${process.pid}`);
try {
  copyTree(SAMPLE, tmp);
  const m = buildManifest(tmp, {
    bundle: {
      id: "demo-bundle",
      subject: "Demo bundle",
      purpose: "rag-citation-pack",
      created_at: "2026-05-27T08:00:00Z",
      creator: "demo@kineticgain.com"
    },
    relationships: [
      { subject: "source-policy", predicate: "cites", object: "answer-summary" }
    ],
    itemMetadata: {
      "source-policy": { description: "ACME vendor AI-use policy, version 3." }
    }
  });
  console.log(`built manifest with ${m.items.length} items`);
  for (const it of m.items) console.log(`  ${it.id.padEnd(20)} ${it.size_bytes.toString().padStart(6)}b  ${it.sha256.slice(0, 12)}…  ${it.path}`);
  const failures = verifyManifest(tmp, m);
  console.log(`verify: ${failures.length === 0 ? "ok" : `fail (${failures.join(", ")})`}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
