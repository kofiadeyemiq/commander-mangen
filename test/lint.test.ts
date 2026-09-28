/**
 * Verifies every generated page is clean roff: zero warnings from a real
 * roff/man linter. Prefers `groff -man -ww -z` (warns, produces no output on
 * stdout, exits 0 on clean input); falls back to `mandoc -T lint` (prints
 * nothing on clean input) if groff isn't installed. Skips loudly, rather
 * than silently passing, if neither is available.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { generateManPages } from '../src/generate.ts';
import { program as kitchenSink } from './fixtures/kitchen-sink.ts';
import { program as simple } from './fixtures/simple.ts';

function which(bin: string): boolean {
  return spawnSync('which', [bin]).status === 0;
}

const hasGroff = which('groff');
const hasMandoc = which('mandoc');

function lint(content: string): { clean: boolean; output: string } {
  if (hasGroff) {
    // `-z`: suppress formatted output, just report warnings/errors to stderr.
    const result = spawnSync('groff', ['-man', '-ww', '-z'], { input: content, encoding: 'utf8' });
    const output = result.stderr.trim();
    return { clean: output.length === 0, output };
  }
  if (hasMandoc) {
    const result = spawnSync('mandoc', ['-T', 'lint'], { input: content, encoding: 'utf8' });
    const output = (result.stdout + result.stderr).trim();
    return { clean: output.length === 0, output };
  }
  throw new Error('unreachable: caller must check hasGroff || hasMandoc first');
}

test('every kitchen-sink page lints clean', (t) => {
  if (!hasGroff && !hasMandoc) {
    t.skip('neither groff nor mandoc is installed on this machine; cannot verify roff validity');
    return;
  }
  const pages = generateManPages(kitchenSink, { date: 'September 28, 2026' });
  for (const page of pages) {
    const { clean, output } = lint(page.content);
    assert.ok(clean, `${page.name}.${page.section} produced lint output:\n${output}`);
  }
});

test('the simple fixture page lints clean', (t) => {
  if (!hasGroff && !hasMandoc) {
    t.skip('neither groff nor mandoc is installed on this machine; cannot verify roff validity');
    return;
  }
  const pages = generateManPages(simple, { date: 'September 28, 2026' });
  for (const page of pages) {
    const { clean, output } = lint(page.content);
    assert.ok(clean, `${page.name}.${page.section} produced lint output:\n${output}`);
  }
});
