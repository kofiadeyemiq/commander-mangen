/**
 * Regression coverage for the wrap-then-guard bug: escaping used to look
 * only at the start of the *original* description string, but `wrap()`
 * can move any word — not just the first — to the start of an output
 * line. A `.`/`'`-prefixed word landing there read as a troff control
 * line, silently dropping the rest of that source line from the rendered
 * page (mandoc: "skipping unknown macro").
 *
 * This generates many synthetic descriptions with dot/quote-prefixed
 * words at random positions and random word lengths (so they land at a
 * variety of wrap offsets, not just suspiciously convenient ones), and
 * checks two independent things against real output:
 *
 *  1. `mandoc -T lint` is clean (no WARNING/ERROR) on the generated page.
 *  2. Every inserted word is still literally present in `mandoc -T ascii`
 *     output — i.e. nothing got silently swallowed as a bogus macro call.
 *
 * Uses a fixed seed so failures are reproducible.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Command, Option } from 'commander';
import test from 'node:test';

import { generateManPages } from '../src/generate.ts';

function which(bin: string): boolean {
  return spawnSync('which', [bin]).status === 0;
}

const hasGroff = which('groff');
const hasMandoc = which('mandoc');

function lint(content: string): string {
  if (hasGroff) {
    return spawnSync('groff', ['-man', '-ww', '-z'], { input: content, encoding: 'utf8' }).stderr.trim();
  }
  const result = spawnSync('mandoc', ['-T', 'lint'], { input: content, encoding: 'utf8' });
  return (result.stdout + result.stderr).trim();
}

function ascii(content: string): string {
  return spawnSync('mandoc', ['-T', 'ascii'], { input: content, encoding: 'utf8' }).stdout;
}

// Small deterministic PRNG (mulberry32) so failures reproduce exactly.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LOREM = [
  'alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel',
  'india', 'juliet', 'kilo', 'lima', 'mike', 'november', 'oscar', 'papa',
  'quebec', 'romeo', 'sierra', 'tango', 'uniform', 'victor', 'whiskey', 'xray',
];

function randomWord(rand: () => number, minLen: number, maxLen: number): string {
  const len = minLen + Math.floor(rand() * (maxLen - minLen + 1));
  let word = '';
  while (word.length < len) word += LOREM[Math.floor(rand() * LOREM.length)];
  return word.slice(0, Math.max(len, 3));
}

/** A description built from filler words with one dangerous (`.`/`'`-prefixed) word inserted at a random position and width. */
function randomDescription(rand: () => number): { text: string; dangerous: string } {
  const fillerCount = 10 + Math.floor(rand() * 15);
  const filler = Array.from({ length: fillerCount }, () => randomWord(rand, 3, 9));
  const prefix = rand() < 0.5 ? '.' : "'";
  const dangerous = prefix + randomWord(rand, 2, 12);
  const position = Math.floor(rand() * (filler.length + 1));
  filler.splice(position, 0, dangerous);
  return { text: filler.join(' '), dangerous };
}

test('random dot/quote-prefixed words at wrap boundaries stay valid roff and stay visible', (t) => {
  if (!hasGroff && !hasMandoc) {
    t.skip('neither groff nor mandoc is installed on this machine; cannot verify roff validity');
    return;
  }

  const rand = mulberry32(0xc0ffee);
  const CASES = 40;
  const cases = Array.from({ length: CASES }, () => randomDescription(rand));

  const program = new Command();
  program.name('proptest').description('property-test fixture').version('1.0.0');
  const cmd = program.command('run').description('run something');
  cases.forEach((c, i) => {
    cmd.addOption(new Option(`--flag-${i} <value>`, c.text));
  });
  cmd.action(() => {});

  const pages = generateManPages(program, { date: 'September 28, 2026' });
  const page = pages.find((p) => p.name === 'proptest-run')!;
  assert.ok(page, 'expected a page for the "run" subcommand');

  const lintOutput = lint(page.content);
  assert.equal(lintOutput, '', `expected zero lint output, got:\n${lintOutput}`);

  const asciiOutput = ascii(page.content);
  for (const { dangerous } of cases) {
    assert.ok(
      asciiOutput.includes(dangerous),
      `dangerous word "${dangerous}" is missing from rendered output — it was likely swallowed as a bogus macro call`,
    );
  }
});
