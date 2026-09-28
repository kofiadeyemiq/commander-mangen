import assert from 'node:assert/strict';
import test from 'node:test';
import { Command } from 'commander';

import { generateManPages } from '../src/generate.ts';
import { ManGenError } from '../src/errors.ts';
import { program as kitchenSink } from './fixtures/kitchen-sink.ts';

const FIXED = { date: 'September 28, 2026' };

test('generates one page per visible command, nested included', () => {
  const pages = generateManPages(kitchenSink, FIXED);
  const names = pages.map((p) => p.name).sort();
  assert.deepEqual(names, ['tool', 'tool-build', 'tool-build-watch', 'tool-deploy', 'tool-lint']);
});

test('every page uses the requested section number', () => {
  const pages = generateManPages(kitchenSink, { ...FIXED, section: 6 });
  assert.ok(pages.every((p) => p.section === 6));
  assert.ok(pages.every((p) => /^\.TH "[A-Z-]+" "6" /.test(p.content)));
});

test('a hidden command gets no page', () => {
  const pages = generateManPages(kitchenSink, FIXED);
  assert.ok(!pages.some((p) => p.name.includes('internal-diagnostics')));
});

test('a hidden command does not appear in its parent COMMANDS section', () => {
  const pages = generateManPages(kitchenSink, FIXED);
  const top = pages.find((p) => p.name === 'tool')!;
  assert.ok(!top.content.includes('internal-diagnostics'));
});

test('a hidden option does not appear in its command OPTIONS section', () => {
  const pages = generateManPages(kitchenSink, FIXED);
  const build = pages.find((p) => p.name === 'tool-build')!;
  assert.ok(!build.content.includes('debug-internal'));
});

test('an alias is listed in NAME alongside the primary name', () => {
  const pages = generateManPages(kitchenSink, FIXED);
  const build = pages.find((p) => p.name === 'tool-build')!;
  assert.match(build.content, /tool\\-build, tool\\-b \\- build the project/);
});

test('a required argument renders angle-bracketed, an optional variadic one square-bracketed with an ellipsis', () => {
  const pages = generateManPages(kitchenSink, FIXED);
  const build = pages.find((p) => p.name === 'tool-build')!;
  assert.match(build.content, /\\fB<entry>\\fR/);
  assert.match(build.content, /\\fB\[extra\.\.\.\]\\fR/);
});

test('option choices are rendered', () => {
  const pages = generateManPages(kitchenSink, FIXED);
  const build = pages.find((p) => p.name === 'tool-build')!;
  assert.match(build.content, /choices: "esm", "cjs", "umd"/);
});

test('an option default is rendered', () => {
  const pages = generateManPages(kitchenSink, FIXED);
  const build = pages.find((p) => p.name === 'tool-build')!;
  assert.match(build.content, /default: "dist"/);
});

test('an env-backed option shows its environment variable', () => {
  const pages = generateManPages(kitchenSink, FIXED);
  const build = pages.find((p) => p.name === 'tool-build')!;
  assert.match(build.content, /env: TOOL_TOKEN/);
});

test('a negatable option (--no-x) is rendered as its own OPTIONS entry', () => {
  const pages = generateManPages(kitchenSink, FIXED);
  const build = pages.find((p) => p.name === 'tool-build')!;
  assert.match(build.content, /\\fB\\-\\-no\\-color\\fR/);
});

test('a nested subcommand gets its own page named with hyphenated ancestry', () => {
  const pages = generateManPages(kitchenSink, FIXED);
  const watch = pages.find((p) => p.name === 'tool-build-watch')!;
  assert.match(watch.content, /SYNOPSIS.*\n\\fBtool build watch\|w\\fR/);
});

test('SEE ALSO cross-references parent, siblings and children', () => {
  const pages = generateManPages(kitchenSink, FIXED);
  const build = pages.find((p) => p.name === 'tool-build')!;
  assert.match(build.content, /\.BR tool \(1\)/); // parent
  assert.match(build.content, /\.BR tool\\-build\\-watch \(1\)/); // own child
  assert.match(build.content, /\.BR tool\\-lint \(1\)/); // sibling
});

test('seeAlso: false omits the SEE ALSO section entirely', () => {
  const pages = generateManPages(kitchenSink, { ...FIXED, seeAlso: false });
  assert.ok(pages.every((p) => !p.content.includes('SEE ALSO')));
});

test('an executable subcommand declaration renders NAME/SYNOPSIS/DESCRIPTION only, no ARGUMENTS section', () => {
  const pages = generateManPages(kitchenSink, FIXED);
  const deploy = pages.find((p) => p.name === 'tool-deploy')!;
  assert.match(deploy.content, /\.SH "DESCRIPTION"\ndeploy the project/);
  assert.ok(!deploy.content.includes('ARGUMENTS'));
});

test('extraSections are appended to the top-level page only', () => {
  const pages = generateManPages(kitchenSink, {
    ...FIXED,
    extraSections: [{ heading: 'Author', body: 'kofiadeyemiq' }],
  });
  const top = pages.find((p) => p.name === 'tool')!;
  const build = pages.find((p) => p.name === 'tool-build')!;
  assert.match(top.content, /\.SH "AUTHOR"\nkofiadeyemiq/);
  assert.ok(!build.content.includes('AUTHOR'));
});

test('extraSectionsByCommand targets a specific subcommand page', () => {
  const pages = generateManPages(kitchenSink, {
    ...FIXED,
    extraSectionsByCommand: { build: [{ heading: 'Examples', body: 'tool build src/main.ts' }] },
  });
  const build = pages.find((p) => p.name === 'tool-build')!;
  const top = pages.find((p) => p.name === 'tool')!;
  assert.match(build.content, /\.SH "EXAMPLES"\ntool build src\/main\.ts/);
  assert.ok(!top.content.includes('EXAMPLES'));
});

test('a preformatted extra section preserves line breaks under .nf/.fi', () => {
  const pages = generateManPages(kitchenSink, {
    ...FIXED,
    extraSections: [{ heading: 'Examples', body: 'tool build a.ts\ntool build b.ts', preformatted: true }],
  });
  const top = pages.find((p) => p.name === 'tool')!;
  assert.match(top.content, /\.nf\ntool build a\.ts\ntool build b\.ts\n\.fi/);
});

test('rejects a program with no name', () => {
  const nameless = new Command();
  assert.throws(() => generateManPages(nameless), ManGenError);
});
