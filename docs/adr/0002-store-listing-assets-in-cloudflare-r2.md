# ADR 0002: Store Listing Assets in Cloudflare R2

## Status

Accepted on 2026-08-18.

## Context

Before this decision, Standard Vehicle Listings stored Public Media and Review Evidence in Vercel Blob.
Provider client tokens, URLs, download URLs, pathnames, and ETags crossed the browser, API, database, and public rendering boundaries.
Marliket already operates its authoritative API on Cloudflare Workers, and later Listing categories need the same media subsystem.
Keeping that contract would increase future provider migration cost and preserve a second production storage control plane.

Public Media and private Review Evidence have different access and delivery requirements.
Public Media benefits from a Cloudflare custom domain, immutable caching, WAF controls, and zero public egress fees.
Review Evidence requires a private origin and narrowly authorized short-lived access.
Current file limits are small enough for streaming through the Worker without approaching Cloudflare request limits.

## Decision

Marliket will store Listing Public Media and Review Evidence in separate Cloudflare R2 buckets in each environment.
The authoritative Worker will accept authenticated raw upload streams and write them through native R2 bindings.
The browser will not receive R2 S3 credentials, presigned upload URLs, or reusable storage tokens.
R2 conditional writes and SHA-256 validation will enforce object immutability and intent integrity.

PostgreSQL will store a server-generated object key, R2 object version, ETag, content type, size, SHA-256, collection, ownership, and lifecycle state.
PostgreSQL will not store durable public URLs or private download URLs.
Public Media URLs will be derived from an environment-specific custom-domain base URL.
Review Evidence will be read through a five-minute application-signed Worker capability carried only in a path-scoped HttpOnly cookie.

The migration is a clean cutover.
Existing Vercel Blob Listing assets will not be copied or dual-read.
Every target database must have zero Listing Asset rows or receive an explicitly approved non-production reset before migration.

Cloudflare Images transformations are not part of this decision.
They may be added later without changing the R2 object identity or Listing Revision contract.

## Consequences

The Listing media boundary is independent from Vercel Blob response shapes and URLs.
Marliket must operate six R2 buckets and three public media domains across development, preview, and production.
The Worker handles upload bandwidth and must preserve streaming behavior.
Private reads depend on a separate signing secret, a path-scoped HttpOnly cookie, and a raw byte-serving route.
The Pro console uses XHR for upload progress because the typed JSON client is not a suitable raw upload-progress transport.

The cutover removes simple rollback to Vercel Blob after the database migration.
Preview verification must therefore prove upload, retry, private read, public delivery, and deletion before production promotion.
Provider resource creation requires Wrangler authentication to the Cloudflare account pinned in the Worker configuration.

The current product and HTTP contract lives in `docs/prds/standard-vehicle-listing.md`, while deployment and rollback procedures live in `docs/runbooks/preview-environments.md`.
