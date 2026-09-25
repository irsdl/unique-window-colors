# Dependency review — 2026-09-25

**Status: blocked. The current dependency tree does not fully meet the policy.**
No dependency versions or lockfile entries were changed during this review.

## Checks performed

- Queried current npm metadata for all 419 locked entries (411 distinct versions
  of 391 packages), including development, optional, and nested dependencies.
- All sources use `https://registry.npmjs.org`; all integrity hashes match the
  registry. Publication dates were checked for the exact locked versions.
- A fresh full `npm audit` returned zero known vulnerabilities at every severity.
- Three versions younger than 31 days are actual security fixes, documented below.
- The metadata check rejects the three maintenance violations below. A clean
  vulnerability audit does not override those failures.

## Maintenance blockers

| Package | Locked version | Evidence | Dependency path |
| --- | --- | --- | --- |
| `keytar` | 7.9.0 | [Upstream archived since 2022-12-15](https://github.com/atom/node-keytar) | `@vscode/vsce` → `keytar` |
| `prebuild-install` | 7.1.3 | [npm metadata](https://registry.npmjs.org/prebuild-install/7.1.3) explicitly says it is no longer maintained | `@vscode/vsce` → `keytar` → `prebuild-install` |
| `whatwg-encoding` | 3.1.1 | [npm metadata](https://registry.npmjs.org/whatwg-encoding/3.1.1) deprecates it in favor of `@exodus/bytes` | `@vscode/vsce` → `cheerio` → `encoding-sniffer` → `whatwg-encoding` |

Microsoft's [VSCE 4.0.0 release](https://github.com/microsoft/vscode-vsce/releases/tag/v4.0.0)
replaces the dependency paths responsible for these blockers. Its
[npm publication timestamp](https://registry.npmjs.org/@vscode%2fvsce) is
2026-09-14T18:53:40.922Z, so the 31-day waiting period ends at
**2026-10-15T18:53:40.922Z**. It requires Node.js 22 for build tooling.
No security-fix exception has been claimed for this upgrade.

After that date, review VSCE 4 and its newly resolved dependencies before
installing. Also address `ovsx`'s dependency on VSCE 3; simply upgrading the direct
VSCE dependency would retain the old tree under `ovsx`. Use a compatible upstream
OVSX release when available, or separately validate any proposed override. Run
the full policy gate and package/extension-host validation after the transition.
Do not substitute unreviewed packages or omit optional entries from the audit
to make the policy pass.

## Exact-version security exceptions

These exceptions waive release age only. They do not waive vulnerabilities,
deprecation, integrity, source, or support checks. The executable records live in
`dependency-policy.json` and apply only to the named fixed version.

| Version | Published (UTC) | Affected versions in this release line | Evidence |
| --- | --- | --- | --- |
| `fast-uri@3.1.8` | 2026-09-15 07:36:25 | `>=3.0.0 <3.1.8` | [GHSA-hrr3-gc8f-f4qj](https://github.com/fastify/fast-uri/security/advisories/GHSA-hrr3-gc8f-f4qj): host normalization bypass |
| `js-yaml@4.3.2` | 2026-08-26 20:42:48 | `>=4.0.0 <4.3.2` | [GHSA-2883-xcg3-v3hh](https://github.com/nodeca/js-yaml/security/advisories/GHSA-2883-xcg3-v3hh): CPU exhaustion |
| `qs@6.16.0` | 2026-08-29 23:50:15 | `>=2.2.5 <=6.15.3` | [GHSA-4mjr-xmp4-gh2g](https://github.com/ljharb/qs/security/advisories/GHSA-4mjr-xmp4-gh2g): denial of service |

Downgrading these versions to satisfy the waiting period would reintroduce known
vulnerabilities. The remaining locked versions already meet the age requirement.

## Enforcement and review limits

Run `npm run deps:check` before installation. The checker uses only Node built-ins
and fetches fresh registry metadata, so it works without `node_modules`. It
checks every locked entry and fails on unavailable metadata, missing dates,
young releases without a documented fix, deprecation, known unsupported packages,
missing maintainer/source information, and integrity mismatches. A successful
metadata check is followed by a full npm audit with an `info` threshold.

The gate runs before all workflow installs and in `vscode:prepublish`, covering
both local packaging and CI. CI installations disable lifecycle scripts. The
current gate intentionally exits unsuccessfully until the blockers are resolved;
do not remove the gate to release. No new VSIX was packaged during this review.

Each run writes the complete source/version/date inventory and errors to
`.audit-cache/dependency-policy.json`. This generated report is excluded from
Git and from VSIX packages. For an independent audit when the metadata gate has
already failed, run:

```sh
npm audit --package-lock-only --ignore-scripts --include=prod --include=dev --include=optional --audit-level=info
```

Registry metadata and download popularity cannot prove ongoing support or
reputation. The checker is an automated minimum, not a substitute for reviewing
upstream maintenance and the exact release line. In particular, longstanding
runtime dependencies such as `random-seed@0.3.0` and `color@3.2.1` need explicit
support review before claiming full compliance; their age and clean audit alone
do not establish that. Preserve deterministic workspace colors and Node 14
compatibility when considering replacements. No blanket support certification
has been made for all transitive packages.
