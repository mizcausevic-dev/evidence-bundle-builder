import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

import type { BuildOptions, Manifest, ManifestItem } from "./types.js";

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

const MEDIA_TYPE_BY_EXT: Record<string, string> = {
  ".json": "application/json",
  ".md": "text/markdown",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".html": "text/html",
  ".xml": "application/xml",
  ".yaml": "application/yaml",
  ".yml": "application/yaml"
};

/** Default media type when the extension is unknown. */
const FALLBACK_MEDIA_TYPE = "application/octet-stream";

/** Convert a content/-relative filename to a default item id. Lowercases, replaces non-alnum with `-`, ensures length >= 2 so the result always conforms to ID_PATTERN. */
export function slugifyToId(filename: string): string {
  const base = filename.replace(/\.[A-Za-z0-9]+$/, "");
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length === 0) return "item";
  if (slug.length === 1) return `item-${slug}`;
  return slug;
}

function inferMediaType(filename: string): string {
  return MEDIA_TYPE_BY_EXT[extname(filename).toLowerCase()] ?? FALLBACK_MEDIA_TYPE;
}

function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function listContentFiles(contentDir: string, skip: string[]): string[] {
  const out: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const rel = relative(contentDir, full).split(sep).join("/");
      if (skip.some((s) => rel.includes(s))) continue;
      const st = statSync(full);
      if (st.isDirectory()) visit(full);
      else out.push(full);
    }
  };
  visit(contentDir);
  return out.sort();
}

/**
 * Build a manifest for the given bundle directory. The directory must contain
 * a `content/` subdirectory; every file under it becomes one `items[]` entry.
 */
export function buildManifest(bundleDir: string, opts: BuildOptions): Manifest {
  if (!ID_PATTERN.test(opts.bundle.id)) {
    throw new Error(`bundle.id "${opts.bundle.id}" must match ${ID_PATTERN}`);
  }
  if (!opts.bundle.subject) throw new Error("bundle.subject is required");
  if (!opts.bundle.creator) throw new Error("bundle.creator is required");

  const contentDir = join(bundleDir, "content");
  if (!existsSync(contentDir)) throw new Error(`bundle has no content/ directory at ${contentDir}`);

  const files = listContentFiles(contentDir, opts.skip ?? []);
  const idsSeen = new Set<string>();
  const items: ManifestItem[] = [];

  for (const abs of files) {
    const relInContent = relative(contentDir, abs).split(sep).join("/");
    const path = `content/${relInContent}`;
    const fileName = relInContent;
    const buf = readFileSync(abs);
    const sha256 = sha256Hex(buf);
    const size_bytes = buf.byteLength;

    const overrideId = opts.itemIds?.[fileName];
    const baseId = overrideId ?? slugifyToId(relInContent.replace(/\//g, "-"));
    if (!ID_PATTERN.test(baseId)) {
      throw new Error(`derived item id "${baseId}" (from "${fileName}") must match ${ID_PATTERN}`);
    }
    const id = uniqueId(idsSeen, baseId);
    idsSeen.add(id);

    const enrich = opts.itemMetadata?.[id] ?? opts.itemMetadata?.[fileName] ?? {};
    const item: ManifestItem = {
      id,
      path,
      media_type: enrich.media_type ?? inferMediaType(fileName),
      sha256,
      size_bytes
    };
    if (enrich.source_uri) item.source_uri = enrich.source_uri;
    if (enrich.retrieved_at) item.retrieved_at = enrich.retrieved_at;
    if (enrich.description) item.description = enrich.description;
    if (enrich.labels) item.labels = enrich.labels;
    items.push(item);
  }

  if (items.length === 0) throw new Error("bundle has no files under content/");

  const created_at = opts.bundle.created_at ?? new Date().toISOString();
  const manifest: Manifest = {
    evidence_bundle_version: "0.1",
    bundle: { ...opts.bundle, created_at },
    items
  };
  if (opts.relationships && opts.relationships.length > 0) manifest.relationships = opts.relationships;
  if (opts.provenance) manifest.provenance = opts.provenance;
  if (opts.signature) manifest.signature = opts.signature;

  return manifest;
}

function uniqueId(seen: ReadonlySet<string>, candidate: string): string {
  if (!seen.has(candidate)) return candidate;
  let i = 2;
  while (seen.has(`${candidate}-${i}`)) i += 1;
  return `${candidate}-${i}`;
}

/** Verify every items[].sha256 matches the on-disk file. Returns the failing ids (empty array == verified). */
export function verifyManifest(bundleDir: string, manifest: Manifest): string[] {
  const failures: string[] = [];
  for (const item of manifest.items) {
    const abs = join(bundleDir, item.path);
    if (!existsSync(abs)) {
      failures.push(item.id);
      continue;
    }
    const buf = readFileSync(abs);
    if (sha256Hex(buf) !== item.sha256 || buf.byteLength !== item.size_bytes) failures.push(item.id);
  }
  return failures;
}

/** Build + write `manifest.json` to disk; returns the manifest. */
export function writeBundleManifest(bundleDir: string, opts: BuildOptions): Manifest {
  const manifest = buildManifest(bundleDir, opts);
  writeFileSync(join(bundleDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return manifest;
}
