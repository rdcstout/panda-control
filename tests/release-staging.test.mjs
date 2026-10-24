import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const projectRoot = new URL('..', import.meta.url).pathname;
const script = join(projectRoot, 'scripts', 'stage-release-assets.sh');

test('release staging creates byte-identical stable assets and checksums on Unix Bash', {
  skip: process.platform === 'win32' ? 'The release staging utility is a Unix shell script.' : false,
}, async () => {
  const stage = await mkdtemp(join(tmpdir(), 'panda-control-stage-test-'));
  const version = '9.8.7';
  const assets = [
    [`Panda-Control-${version}-macOS-arm64.dmg`, 'Panda-Control-macOS-arm64.dmg'],
    [`Panda-Control-${version}-Windows-x64.exe`, 'Panda-Control-Windows-x64.exe'],
    [`Panda-Control-${version}-Linux-x86_64.AppImage`, 'Panda-Control-Linux-x86_64.AppImage'],
    [`Panda-Control-${version}-Linux-amd64.deb`, 'Panda-Control-Linux-amd64.deb'],
  ];

  for (const [versioned] of assets) {
    await writeFile(join(stage, versioned), `fixture:${versioned}\n`);
  }

  await execFileAsync('/bin/bash', [script, stage], {
    env: { ...process.env, PANDA_VERSION: version },
  });

  for (const [versioned, stable] of assets) {
    assert.deepEqual(
      await readFile(join(stage, stable)),
      await readFile(join(stage, versioned)),
      `${stable} must be byte-identical to ${versioned}`,
    );
  }

  const checksums = await readFile(join(stage, 'SHA256SUMS.txt'), 'utf8');
  for (const [versioned, stable] of assets) {
    assert.match(checksums, new RegExp(`${versioned.replaceAll('.', '\\.')}$`, 'm'));
    assert.match(checksums, new RegExp(`${stable.replaceAll('.', '\\.')}$`, 'm'));
  }
});
