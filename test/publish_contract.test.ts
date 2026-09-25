import { equal, ok } from 'assert';
import { readFileSync } from 'fs';
import { describe, it } from 'node:test';

interface ExtensionManifest {
  name?: string;
  publisher?: string;
  displayName?: string;
  scripts?: Record<string, string>;
  license?: string;
  version?: string;
}

describe('registry publish contract', () => {
  const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as ExtensionManifest;
  const openVsxWorkflow = readFileSync('.github/workflows/publish_ovsx.yml', 'utf8');
  const personalWorkflow = readFileSync('.github/workflows/personal_build.yml', 'utf8');

  it('keeps local and personal builds on a stable identity separate from upstream updates', () => {
    equal(`${manifest.publisher}.${manifest.name}`, 'irsdl-personal.unique-window-colors');
    equal(manifest.displayName, 'Window Colors (Personal)');
  });

  it('packages the checked-in identity without bypassing the regression checks', () => {
    equal(manifest.scripts?.['vscode:prepublish'], 'npm run deps:check && npm test && npm run compile');
    ok(personalWorkflow.includes('npm run package:vsix -- --out'));
    equal(personalWorkflow.includes('manifest.publisher ='), false);
    equal(personalWorkflow.includes("manifest.scripts['vscode:prepublish'] ="), false);
  });

  it('declares the extension license required by Open VSX', () => {
    equal(manifest.license, 'MIT');
  });

  it('uses a publishable semantic version', () => {
    equal(/^\d+\.\d+\.\d+$/.test(manifest.version || ''), true);
  });

  it('publishes releases through the canonical pre-existing namespace', () => {
    ok(openVsxWorkflow.includes("github.repository == 'stuartcrobinson/unique-window-colors'"));
    ok(openVsxWorkflow.includes("p.publisher !== 'stuart' || p.name !== 'unique-window-colors'"));
    ok(openVsxWorkflow.includes('release:'));
    ok(openVsxWorkflow.includes('OVSX_PAT: ${{ secrets.OVSX_TOKEN }}'));
    equal(openVsxWorkflow.includes('secrets.OVSX_PAT'), false);
    ok(openVsxWorkflow.includes('ovsx publish'));
    ok(openVsxWorkflow.includes('github.event.release.tag_name'));
    equal(openVsxWorkflow.includes('create-namespace'), false);
  });
});
