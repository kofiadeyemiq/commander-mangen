/**
 * Plain-JS checks against the built package, so they run on every Node version
 * in `engines` — the TypeScript suite needs type stripping and only runs on 24+.
 *
 *   npm run build && node --test test/smoke.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after } from 'node:test';
import { Command } from 'commander';

const { generateManPages, writeManPages } = await import('../dist/index.js');

const dirs = [];
after(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
});

function simpleProgram() {
  const program = new Command();
  program.name('tool').description('a demo tool').version('1.0.0');
  program
    .command('build')
    .description('build the project')
    .option('-w, --watch', 'watch for changes')
    .option('-o, --output <dir>', 'output directory', 'dist')
    .action(() => {});
  return program;
}

test('generateManPages produces a page per command from dist', () => {
  const pages = generateManPages(simpleProgram(), { date: 'September 28, 2026' });
  const names = pages.map((p) => p.name).sort();
  assert.deepEqual(names, ['tool', 'tool-build']);
  const build = pages.find((p) => p.name === 'tool-build');
  assert.match(build.content, /\\fB\\-w, \\-\\-watch\\fR/);
  assert.match(build.content, /output directory \(default: "dist"\)/);
});

test('writeManPages writes files from dist', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'commander-mangen-smoke-'));
  dirs.push(outDir);
  await writeManPages(simpleProgram(), { outDir, date: 'September 28, 2026' });
  const files = (await readdir(outDir)).sort();
  assert.deepEqual(files, ['tool-build.1', 'tool.1']);
});

test('the built CLI binary runs end to end', async () => {
  // Written under this package's own directory (not the system tmpdir) so
  // its `import 'commander'` resolves against this package's node_modules.
  const packageDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const base = await mkdtemp(path.join(packageDir, 'smoke-tmp-'));
  dirs.push(base);
  const modulePath = path.join(base, 'program.mjs');
  await writeFile(
    modulePath,
    [
      "import { Command } from 'commander';",
      'export const program = new Command();',
      "program.name('tool').description('a demo tool').version('1.0.0');",
      "program.command('build').description('build the project').option('-w, --watch', 'watch for changes');",
    ].join('\n'),
    'utf8',
  );

  const outDir = path.join(base, 'man');
  const cliPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');
  const stdout = execFileSync(
    process.execPath,
    [cliPath, modulePath, '--out', outDir, '--date', 'September 28, 2026'],
    { encoding: 'utf8' },
  );
  assert.match(stdout, /tool\.1/);
  const content = await readFile(path.join(outDir, 'tool.1'), 'utf8');
  assert.match(content, /\.TH "TOOL"/);
});
