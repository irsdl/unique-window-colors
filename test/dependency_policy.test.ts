import { deepEqual, equal, ok, rejects } from 'assert';
import { describe, it } from 'node:test';
import { resolve } from 'path';
import { readFileSync } from 'fs';

// Exercise the actual bootstrap implementation, without registry access.
const { evaluatePackage, checkLockfile, MINIMUM_AGE_MS } = require(resolve('scripts/check-dependencies.js'));
const now = Date.parse('2026-09-25T12:00:00Z');
const locked = { version: '1.0.0', resolved: 'https://registry.npmjs.org/example/-/example-1.0.0.tgz', integrity: 'sha512-test' };
const metadata = (age = MINIMUM_AGE_MS) => ({
  time: { '1.0.0': new Date(now - age).toISOString() },
  versions: { '1.0.0': { repository: { url: 'https://github.com/example/example' }, dist: { integrity: 'sha512-test' } } },
  maintainers: [{ name: 'example' }],
});
const securityPolicy = { securityFixExceptions: { 'example@1.0.0': {
  fixedVersion: '1.0.0', affectedVersions: '<1.0.0',
  advisory: 'https://github.com/example/example/security/advisories/GHSA-aaaa-bbbb-cccc',
  reason: 'Fixes a documented vulnerability.',
} } };

describe('dependency policy enforcement', () => {
  it('enforces the exact 31-day boundary', () => {
    deepEqual(evaluatePackage('example', locked, metadata(), {}, now).errors, []);
    ok(evaluatePackage('example', locked, metadata(MINIMUM_AGE_MS - 1), {}, now).errors.length);
  });

  it('allows a documented security fix only for its exact version', () => {
    deepEqual(evaluatePackage('example', locked, metadata(1000), securityPolicy, now).errors, []);
    const wrongVersion = { securityFixExceptions: { 'example@0.9.0': securityPolicy.securityFixExceptions['example@1.0.0'] } };
    ok(evaluatePackage('example', locked, metadata(1000), wrongVersion, now).errors.length);
  });

  it('does not let a security exception bypass deprecation, support, or integrity checks', () => {
    const data = metadata(1000);
    Object.assign(data.versions['1.0.0'], { deprecated: 'Unmaintained' });
    const policy = { ...securityPolicy, unsupportedPackages: { example: { reason: 'Archived' } } };
    const result = evaluatePackage('example', { ...locked, integrity: 'sha512-wrong' }, data, policy, now);
    equal(result.errors.length, 3);
  });

  it('rejects missing and future dates even with an exception', () => {
    for (const date of ['invalid', '2026-10-01T00:00:00Z']) {
      const data = metadata();
      data.time['1.0.0'] = date;
      ok(evaluatePackage('example', locked, data, securityPolicy, now).errors.length);
    }
  });

  it('limits maintenance exceptions to approved versions, development dependencies, and dates', () => {
    const data = metadata();
    Object.assign(data.versions['1.0.0'], { deprecated: 'Unmaintained' });
    const exception = {
      approvedBy: 'Repository owner', approvedAt: '2026-09-25T00:00:00Z',
      expiresAt: '2026-10-15T18:53:40.922Z', reason: 'Wait for replacement release maturity.',
    };
    const policy = {
      maintenanceExceptions: { 'example@1.0.0': exception },
      unsupportedPackages: { example: { reason: 'Archived' } },
    };
    const development = { ...locked, dev: true };
    deepEqual(evaluatePackage('example', development, data, policy, now).errors, []);
    equal(evaluatePackage('example', development, data, policy, now).maintenanceException, exception);
    ok(evaluatePackage('example', locked, data, policy, now).errors.length, 'runtime is never waived');
    ok(evaluatePackage('example', development, data, policy, Date.parse(exception.approvedAt) - 1).errors.length);
    ok(evaluatePackage('example', development, data, policy, Date.parse(exception.expiresAt)).errors.length);
    ok(evaluatePackage('different', development, data, policy, now).errors.length, 'other packages are not waived');
    const otherVersion = { maintenanceExceptions: { 'example@0.9.0': exception } };
    ok(evaluatePackage('example', development, data, otherVersion, now).errors.length);
    ok(evaluatePackage('example', { ...development, integrity: 'wrong' }, data, policy, now).errors.length);
    const young = metadata(1000);
    Object.assign(young.versions['1.0.0'], { deprecated: 'Unmaintained' });
    ok(evaluatePackage('example', development, young, policy, now).errors.length, 'release age is not waived');
    exception.expiresAt = 'invalid';
    ok(evaluatePackage('example', development, data, policy, now).errors.length);
  });

  it('rejects unreviewable sources and missing integrity', () => {
    for (const resolved of ['http://registry.npmjs.org/file.tgz', 'https://other.example/file.tgz', 'file:../local']) {
      ok(evaluatePackage('example', { ...locked, resolved }, metadata(), {}, now).errors.length);
    }
    ok(evaluatePackage('example', { ...locked, integrity: undefined }, metadata(), {}, now).errors.length);
  });

  it('checks nested, optional, and development packages and fails closed on network errors', async () => {
    const lock = { packages: { '': {},
      'node_modules/example': locked,
      'node_modules/parent/node_modules/example': { ...locked, dev: true, optional: true },
    } };
    let requests = 0;
    const results = await checkLockfile(lock, {}, async () => { requests++; throw new Error('offline'); }, now);
    equal(requests, 1);
    equal(results.length, 2);
    ok(results.every((result: { errors: string[] }) => result.errors.length));
    await rejects(checkLockfile({ packages: { '': {} } }, {}, async () => metadata(), now));
  });

  it('runs the gate before each CI install and local packaging', () => {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
    equal(manifest.scripts['deps:check'],
      'node scripts/check-dependencies.js && npm audit --include=prod --include=dev --include=optional --audit-level=info');
    ok(manifest.scripts['vscode:prepublish'].startsWith('npm run deps:check && '));
    for (const file of ['ci.yml', 'personal_build.yml', 'publish_ovsx.yml']) {
      const workflow = readFileSync(`.github/workflows/${file}`, 'utf8');
      // Every job with an install must check first; do not accept a gate in an unrelated job.
      const jobs = workflow.split(/^  [a-z][a-z-]*:\s*$/m).slice(1);
      for (const job of jobs.filter((text: string) => text.includes('npm ci'))) {
        ok(job.indexOf('npm run deps:check') >= 0, file);
        ok(job.indexOf('npm run deps:check') < job.indexOf('npm ci'), file);
        equal(/npm ci(?! --ignore-scripts)/.test(job), false, file);
      }
    }
  });
});
