# Release checklist

## Personal fork distribution

This checkout builds `irsdl-personal.unique-window-colors` by default, including
local `npm run package:vsix -- --out <path>` builds. Never distribute a fork under
the upstream `stuart.unique-window-colors` identity: Marketplace updates for that
ID can replace it. Keep the personal ID stable between reviewed releases.

- [ ] Run `npm test` and `npx tsc --noEmit` before packaging.
- [ ] Verify all locked dependencies against the [dependency policy](AGENTS.md#dependency-policy),
      including support, release age, and zero known vulnerabilities.
- [ ] Run `npm run deps:check` and resolve the blockers in
      [the dependency review](DEPENDENCY_REVIEW.md) before installing or packaging.
- [ ] Build with **Build personal extension**, or package locally and run the
      extension-host smoke test below before distribution.
- [ ] Inspect the VSIX's `extension/package.json` and `extension.vsixmanifest`:
      publisher must be `irsdl-personal`, name/ID `unique-window-colors`.
- [ ] Include the README's migration steps for users of old upstream-identity
      VSIX files. Those installations cannot be renamed by a repository change.

The remaining registry checklist describes the inherited upstream release
process. It is not the personal fork's distribution path. The Open VSX workflow
is restricted to the original repository and requires the `stuart` identity.

## Purpose

Publish the foreground-contrast and unified inactive-bar fixes while preserving
custom workspace backgrounds. This checklist owns release mechanics only; color
behavior is owned by `src/color_model.ts` and its tests.

## Release invariants

- Existing activity-bar and active-title strings remain byte-for-byte unchanged
  during upgrade. Saved inactive-title and status values migrate automatically
  to the activity-bar background for opaque workspaces.
- Every foreground generated for an opaque background clears WCAG AA (4.5:1)
  against that exact background; translucent backgrounds retain their existing
  foreground.
- No vividness setting, OKLCH/APCA runtime, or parallel palette implementation.
- Publishing credentials stay outside the repository and its history.

## Before packaging

- [ ] Verify the [dependency policy](AGENTS.md#dependency-policy), including
      support, release age, and any documented security-fix exception.
- [ ] Run `npm run deps:check`; do not proceed while it fails.
- [ ] Run `npm ci --ignore-scripts` from a clean checkout.
- [ ] Run `npm test`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm audit` and resolve all findings, including runtime, development,
      and transitive dependencies at every severity.
- [ ] Confirm the GitHub `CI` workflow is green on the release commit.
- [ ] Review `git diff` and update the version and changelog.

## Package and registry dry runs

- [ ] Re-check the current official VS Code Marketplace and Open VSX publishing
      documentation; authentication requirements can change:
      [VS Code Marketplace](https://code.visualstudio.com/api/working-with-extensions/publishing-extension),
      [Open VSX](https://github.com/EclipseFdn/open-vsx.org/wiki/Publishing-Extensions).
- [ ] Run `npm run package:vsix -- --out <path>` without publishing and inspect
      its file list.
- [ ] Install the VSIX into an isolated VS Code profile and run an automated
      extension-host migration test before any registry write:
      `scripts/smoke_extension_host.sh [path/to/extension.vsix]`. It opens a real
      window against a deliberately awkward 1.2.10 settings.json, proves the bar
      layout migrates without Reset, then closes it cleanly to exercise shutdown
      cleanup. Unit tests stub the `vscode` module and cannot cover either path.
- [ ] Confirm the canonical publisher/namespace is `stuart` in both registries.
- [ ] Keep the duplicate `stuartcrobinson` Open VSX namespace cleanup separate
      from the release itself.
- [x] Operator confirmed the Open VSX account is linked to the matching Eclipse
      account and the Open VSX Publisher Agreement is signed.
- [x] Reuse the existing repository Actions secret named `OVSX_TOKEN`. The
      workflow maps it to the CLI's supported `OVSX_PAT` environment variable and
      never places the token on the command line. GitHub does not expose secret
      values, so the next publish remains the definitive token-validity check.

## Publish

- [ ] Supply Marketplace and Open VSX credentials through the local environment
      or the registry's supported federated workflow; never write tokens to a
      tracked file.
- [ ] Use Microsoft Entra workload identity federation for automated Marketplace
      publishing; Azure DevOps global PATs retire on December 1, 2026.
- [ ] Publish a GitHub release whose tag exactly matches `v<package version>`;
      `.github/workflows/publish_ovsx.yml` will test, package, retain, and publish
      that exact VSIX to Open VSX.
- [ ] Publish that same retained VSIX to the VS Code Marketplace.
- [ ] Verify the version and extension identity from both public registry pages.
- [ ] Tag the exact published commit and record the registry URLs in the release.
