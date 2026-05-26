# Security Policy

`evidence-bundle-builder` is a pure-transform library and CLI: it reads files from a bundle directory and emits a JSON manifest. No network listener, no remote fetch, no execution of user-supplied code.

The bundle may contain sensitive evidence (audit artifacts, RAG sources, redacted disclosures). The manifest itself includes file paths, sha256 hashes, and metadata you supply — be deliberate about where you ship the bundle.

The optional `signature` block carries a base64 signature value but **does not** itself sign. You must invoke an external signer (e.g. `hash-attestation-rs`) and place the resulting value into the manifest.

## Supported versions

Only the latest tagged release is supported.

## Reporting a vulnerability

Please use GitHub Security Advisories for private disclosure:

- [Open a security advisory](https://github.com/mizcausevic-dev/evidence-bundle-builder/security/advisories/new)

Do not file public issues for security reports.
