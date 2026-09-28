import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

import { writeManPages } from '../src/write.ts';
import { program as simple } from './fixtures/simple.ts';

const dirs: string[] = [];
after(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
});

test('writeManPages writes one file per page, named name.section', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'commander-mangen-'));
  dirs.push(outDir);

  const pages = await writeManPages(simple, { outDir, date: 'September 28, 2026' });
  const files = (await readdir(outDir)).sort();
  assert.deepEqual(
    files,
    pages.map((p) => `${p.name}.${p.section}`).sort(),
  );

  for (const page of pages) {
    const written = await readFile(path.join(outDir, `${page.name}.${page.section}`), 'utf8');
    assert.equal(written, page.content);
  }
});

test('writeManPages creates the output directory if missing', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'commander-mangen-'));
  dirs.push(base);
  const outDir = path.join(base, 'nested', 'man1');

  await writeManPages(simple, { outDir, date: 'September 28, 2026' });
  const files = await readdir(outDir);
  assert.ok(files.length > 0);
});
