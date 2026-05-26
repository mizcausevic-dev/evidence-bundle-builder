// Build a spec-conforming manifest.json for an evidence bundle.
// Spec: https://github.com/mizcausevic-dev/evidence-bundle-spec

export type BundlePurpose =
  | "rag-citation-pack"
  | "audit-evidence"
  | "compliance-disclosure"
  | "incident-response"
  | "due-diligence"
  | "regulatory-submission"
  | "other";

export type RelationshipPredicate =
  | "cites"
  | "supersedes"
  | "derived-from"
  | "contradicts"
  | "summarizes"
  | "redaction-of";

export type SignatureAlgorithm = "ed25519" | "bls12-381-aggregate";

export interface BundleMeta {
  id: string;
  subject: string;
  purpose?: BundlePurpose;
  created_at?: string;
  creator: string;
  expires_at?: string;
  labels?: Record<string, string>;
}

export interface ManifestItem {
  id: string;
  path: string;
  media_type: string;
  sha256: string;
  size_bytes: number;
  source_uri?: string;
  retrieved_at?: string;
  description?: string;
  labels?: Record<string, string>;
}

export interface Relationship {
  subject: string;
  predicate: RelationshipPredicate;
  object: string;
  note?: string;
}

export interface Provenance {
  agent_card_uri?: string;
  tool_card_uri?: string;
  prompt_provenance_uri?: string;
  otel_trace_id?: string;
  model?: string;
  retrieval_query?: string;
}

export interface Signature {
  algorithm: SignatureAlgorithm;
  signer: string;
  value: string;
  signed_at?: string;
}

export interface Manifest {
  evidence_bundle_version: "0.1";
  bundle: BundleMeta;
  items: ManifestItem[];
  relationships?: Relationship[];
  provenance?: Provenance;
  signature?: Signature;
}

/** Per-item metadata the caller supplies, indexed by item id. */
export type ItemMetadata = Record<
  string,
  Partial<Pick<ManifestItem, "media_type" | "source_uri" | "retrieved_at" | "description" | "labels">>
>;

export interface BuildOptions {
  bundle: BundleMeta;
  relationships?: Relationship[];
  provenance?: Provenance;
  signature?: Signature;
  /** Per-item enrichment. Keyed by item id (derived from filename when not supplied via `itemIds`). */
  itemMetadata?: ItemMetadata;
  /** Override the id derived from a filename (e.g. `{ "vendor-policy-v3.pdf": "source-policy" }`). */
  itemIds?: Record<string, string>;
  /** Skip files matching these substrings (paths are relative to content/). */
  skip?: string[];
}
