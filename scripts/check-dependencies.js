#!/usr/bin/env node
'use strict';

// Bootstrap check: only Node built-ins, so CI can run it BEFORE npm ci.
// Registry metadata cannot establish reputation or ongoing support by itself;
// maintainer review in DEPENDENCY_REVIEW.md remains required.
const fs = require('node:fs');
const path = require('node:path');
const MINIMUM_AGE_MS = 31 * 24 * 60 * 60 * 1000;

function evaluatePackage(name, locked, metadata, policy, now) {
  const errors = [];
  const version = metadata.versions?.[locked.version];
  const published = metadata.time?.[locked.version];
  const publishedMs = Date.parse(published);
  const repository = version?.repository?.url || version?.repository
    || metadata.repository?.url || metadata.repository || version?.homepage;
  const exception = policy.securityFixExceptions?.[`${name}@${locked.version}`];
  let securityFixException;

  if (!version) errors.push('Exact locked version is missing from registry metadata');
  if (!Number.isFinite(publishedMs) || publishedMs > now) {
    errors.push('Missing, invalid, or future publication date');
  } else if (now - publishedMs < MINIMUM_AGE_MS) {
    if (exception?.fixedVersion === locked.version
      && /^https:\/\/github\.com\/.+\/GHSA-[a-z0-9-]+$/.test(exception.advisory)
      && typeof exception.affectedVersions === 'string' && exception.affectedVersions.trim()
      && typeof exception.reason === 'string' && exception.reason.trim()) {
      securityFixException = exception;
    } else {
      errors.push('Release is less than 31 days old without a documented security fix');
    }
  }
  if (version?.deprecated || locked.deprecated) {
    errors.push(`Deprecated: ${version?.deprecated || locked.deprecated}`);
  }
  if (policy.unsupportedPackages?.[name]) {
    errors.push(`Unsupported: ${policy.unsupportedPackages[name].reason}`);
  }
  if (typeof repository !== 'string' || !repository.trim()) {
    errors.push('No upstream repository/homepage to review');
  }
  if (!Array.isArray(metadata.maintainers) || !metadata.maintainers.length) {
    errors.push('No registry maintainer information');
  }
  try {
    const url = new URL(locked.resolved);
    if (url.origin !== 'https://registry.npmjs.org' || url.username || url.password) {
      errors.push('Package source must be the HTTPS npm registry');
    }
  } catch {
    errors.push('Missing or invalid package source');
  }
  if (!locked.integrity || locked.integrity !== version?.dist?.integrity) {
    errors.push('Missing integrity hash or mismatch with registry');
  }
  return { name, version: locked.version, published, repository,
    source: locked.resolved, securityFixException, errors };
}

async function checkLockfile(lock, policy, getMetadata, now = Date.now()) {
  if (!lock.packages || Object.keys(lock.packages).length < 2) {
    throw new Error('Expected a non-empty npm lockfile with a packages inventory');
  }
  const entries = Object.entries(lock.packages).filter(([location]) => location);
  const names = [...new Set(entries.map(([location]) => location.split('node_modules/').pop()))];
  const metadata = new Map();
  // Limit parallel registry requests, retaining failures so none become passes.
  await Promise.all(Array.from({ length: Math.min(6, names.length) }, async () => {
    while (names.length) {
      const name = names.pop();
      try {
        metadata.set(name, { value: await getMetadata(name) });
      } catch (error) {
        metadata.set(name, { error: String(error) });
      }
    }
  }));
  return entries.map(([location, locked]) => {
    const name = location.split('node_modules/').pop();
    const result = metadata.get(name);
    return { location, ...(result.error
      ? { name, version: locked.version, errors: [`Registry lookup failed: ${result.error}`] }
      : evaluatePackage(name, locked, result.value, policy, now)) };
  });
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const policy = JSON.parse(fs.readFileSync(path.join(root, 'dependency-policy.json'), 'utf8'));
  const checkedAt = new Date();
  const results = await checkLockfile(lock, policy, async name => {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }, checkedAt.getTime());
  const failed = results.filter(result => result.errors.length);
  const directory = path.join(root, '.audit-cache');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'dependency-policy.json'), JSON.stringify({
    checkedAt: checkedAt.toISOString(),
    automatedMetadataCheckPassed: !failed.length,
    note: 'Run npm audit separately; reputation and release-line support still require maintainer review.',
    results,
  }, null, 2) + '\n');
  for (const result of failed) {
    console.error(`${result.name}@${result.version}: ${result.errors.join('; ')}`);
  }
  console.log(`Checked ${results.length} locked entries; ${failed.length} failed. Report: .audit-cache/dependency-policy.json`);
  if (failed.length) process.exitCode = 1;
}

module.exports = { evaluatePackage, checkLockfile, MINIMUM_AGE_MS };
if (require.main === module) main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
