# Backend dependency security maintenance — October 21, 2026

The Functions lockfile contained three affected packages: one critical and two
high findings in `npm audit --omit=dev`. Compatible patch updates remove all
three findings. No application logic or Firebase SDK version changed.

## Dependency changes

| Package | Before | After | Consumer |
| --- | --- | --- | --- |
| `@fastify/busboy` | 3.2.0 | 3.2.3 | `firebase-admin` |
| `@grpc/grpc-js` | 1.14.4 | 1.14.6 | Firestore → `google-gax` |
| `proxy-addr` | 2.0.7 | 2.0.8 | `firebase-functions` → Express |

Each version satisfies its existing parent's range. Only these three package
entries changed in `functions/package-lock.json`; `functions/package.json`,
the existing overrides, and the Firebase SDK versions remain unchanged.

Upstream fixes and follow-up patches:

- Busboy: [oversized boundary denial of service](https://github.com/fastify/busboy/security/advisories/GHSA-xjh9-v7x6-24jw),
  [prototype-named header denial of service](https://github.com/fastify/busboy/security/advisories/GHSA-x8mw-p69m-v3mx),
  and [line breaks in multipart names](https://github.com/fastify/busboy/security/advisories/GHSA-gxm5-99cw-xjw9).
  [Version 3.2.3](https://github.com/fastify/busboy/releases/tag/v3.2.3) also fixes a hang after a closing boundary.
- gRPC: [certificate authorization context](https://github.com/grpc/grpc-node/security/advisories/GHSA-m9gg-hp2v-232j)
  and [server error disclosure](https://github.com/grpc/grpc-node/security/advisories/GHSA-f596-whhp-79r4).
  [Version 1.14.6](https://github.com/grpc/grpc-node/releases/tag/%40grpc%2Fgrpc-js%401.14.6)
  includes follow-up fixes for remaining error disclosure paths.
- Proxy address: [IPv4-mapped IPv6 trust subnet spoofing](https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h).

These are dependency findings, not evidence of exploitation in Sherpa.

## Verification

Validation used Node **22.23.2**, matching the configured Node 22 Functions runtime.
A clean install from the original lockfile reproduced the three audit findings.
Five new security regression tests failed against the original packages and
passed after the updates: prototype headers, multipart line breaks, bounded
boundary parsing, forwarded-address spoofing, and gRPC error disclosure.

The installed Firebase SDKs also pass callable HTTP checks for CORS, missing
authentication and malformed requests. Handler checks cover account validation,
request/response contracts, per-user rate limits and reset, and upstream error
mapping. Firestore transactions and Gemini responses use local test doubles;
HTTP and gRPC transport checks bind only to loopback. No production records or
real model requests are involved. The certificate advisory is covered by the
patched version and audit, not by a new TLS integration test.

Final results:

- Clean `npm ci`: 252 packages installed; no engine mismatch.
- Functions syntax check and **21 tests passed**, none skipped.
- Full frontend suite: **540 tests passed**, none skipped.
- Production dependency audit: **0 vulnerabilities**.
- Dependency tree resolves the three patched versions without invalid packages.
- Release asset-map check passes; browser code, styling, icons and release
  identity remain byte-for-byte unchanged in Git.
- `git diff --check` passes.

Repeat with Node 22:

```powershell
node --version
npm --prefix functions ci
npm --prefix functions run check
npm --prefix functions audit --omit=dev
npm --prefix functions ls @fastify/busboy @grpc/grpc-js proxy-addr
node --test --test-concurrency=2 tests/*.test.mjs
node scripts/refresh-release-assets.mjs --check
git diff --check
```

The existing `node-domexception` deprecation warning remains; it is not an audit
finding. Raw local evidence is under ignored `output/backend-security-20261021/`.

## Deployment scope and recovery

Read-only Cloud Functions v1 and v2 inventory requests at **2026-10-21 09:31 UTC**
returned no deployed functions for `wps-sherpa-database`, with no next page or
unreachable regions. This change patches the repository for future backend
deployment; it does not claim to replace a running backend. No billing, secrets,
rules, Firebase configuration or data changes are required or performed.

GitHub Dependabot alert enumeration returned `Dependabot alerts are disabled for
this repository.` The clean npm audit is the verified security result; no claim
is made that GitHub closed alert records.

The frontend stays at **2026.10.21 · Steady Compass**. Its approved motion, icon,
Planner navigation and CSV fixes are outside this diff. A frontend rollback is
unnecessary for these dependency-only changes. Reverting the dependency patch
would restore known vulnerable versions; prefer a further compatible patch if a
new issue is found. Any future Function deployment still follows
[the existing deployment procedure](deployment.md).
