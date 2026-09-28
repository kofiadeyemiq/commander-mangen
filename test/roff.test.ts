import assert from 'node:assert/strict';
import test from 'node:test';

import { escapeFlag, escapeText, wrap } from '../src/roff.ts';

test('escapeText leaves ordinary prose untouched', () => {
  assert.equal(escapeText('watch for changes'), 'watch for changes');
});

test('escapeText does not escape genuine hyphens in prose', () => {
  assert.equal(escapeText('a well-known trick'), 'a well-known trick');
});

test('escapeText guards a leading dot so it is not read as a troff request', () => {
  assert.equal(escapeText('.git directory'), '\\&.git directory');
});

test('escapeText guards a leading apostrophe the same way', () => {
  assert.equal(escapeText("'quoted' at the start"), "\\&'quoted' at the start");
});

test('escapeText does not guard an apostrophe that is not at the start', () => {
  assert.equal(escapeText("it's fine"), "it's fine");
});

test('escapeText escapes a literal backslash as \\e', () => {
  assert.equal(escapeText('path C:\\Users\\me'), 'path C:\\eUsers\\eme');
});

test('escapeText collapses embedded newlines to spaces', () => {
  assert.equal(escapeText('line one\nline two'), 'line one line two');
});

test('escapeText trims surrounding whitespace', () => {
  assert.equal(escapeText('  padded  '), 'padded');
});

test('escapeFlag escapes every hyphen as a minus sign', () => {
  assert.equal(escapeFlag('-o, --output <dir>'), '\\-o, \\-\\-output <dir>');
});

test('escapeFlag escapes a literal backslash before escaping hyphens', () => {
  assert.equal(escapeFlag('a\\-b'), 'a\\e\\-b');
});

test('wrap never exceeds the width except for a single overlong word', () => {
  const text = 'the quick brown fox jumps over the lazy dog and keeps going for a while';
  const wrapped = wrap(text, 20);
  for (const line of wrapped.split('\n')) {
    assert.ok(line.length <= 20, `line too long: "${line}"`);
  }
});

test('wrap preserves every word and their order', () => {
  const text = 'one two three four five six seven eight nine ten';
  const wrapped = wrap(text, 15);
  assert.equal(wrapped.replaceAll('\n', ' '), text);
});

test('wrap does not split a single word longer than the width', () => {
  const wrapped = wrap('supercalifragilisticexpialidocious', 10);
  assert.equal(wrapped, 'supercalifragilisticexpialidocious');
});

test('wrap on short text returns it unchanged (single line)', () => {
  assert.equal(wrap('short text', 70), 'short text');
});
