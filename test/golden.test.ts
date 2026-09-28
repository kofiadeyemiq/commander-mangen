import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { generateManPages } from '../src/generate.ts';
import { program as kitchenSink } from './fixtures/kitchen-sink.ts';

const goldenDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'golden');

test('generated pages match the reviewed golden files byte-for-byte', async () => {
  const pages = generateManPages(kitchenSink, { date: 'September 28, 2026' });
  assert.ok(pages.length > 0);
  for (const page of pages) {
    const goldenPath = path.join(goldenDir, `${page.name}.${page.section}`);
    const expected = await readFile(goldenPath, 'utf8');
    assert.equal(page.content, expected, `mismatch for ${page.name}.${page.section} (${goldenPath})`);
  }
});
