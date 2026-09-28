import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after } from 'node:test';

const cliPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.ts');
const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'simple.ts');

const dirs: string[] = [];
const generatedFiles: string[] = [];
after(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  await Promise.all(generatedFiles.map((f) => rm(f, { force: true })));
});

function run(args: string[]): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [cliPath, ...args], { encoding: 'utf8', stdio: 'pipe' });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status: number | null; stdout: string; stderr: string };
    return { status: e.status ?? 1, stdout: e.stdout, stderr: e.stderr };
  }
}

test('exits 0 and writes pages on success', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'commander-mangen-cli-'));
  dirs.push(outDir);

  const result = run([fixture, '--out', outDir, '--date', 'September 28, 2026']);
  assert.equal(result.status, 0, result.stderr);
  const files = (await readdir(outDir)).sort();
  assert.deepEqual(files, ['tool-build.1', 'tool.1']);
  assert.match(result.stdout, /tool\.1/);
  assert.match(result.stdout, /tool-build\.1/);
});

test('exits 2 when the module cannot be imported', () => {
  const result = run(['./does/not/exist.ts', '--out', '/tmp/wont-be-used']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /could not import/);
});

test('exits 2 when the module has no Command export', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'commander-mangen-cli-'));
  dirs.push(base);
  const modulePath = path.join(base, 'no-export.ts');
  await writeFile(modulePath, 'export const notAProgram = 42;\n', 'utf8');

  const result = run([modulePath, '--out', path.join(base, 'out')]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /no commander Command export found/);
});

test('exits 2 when --out is missing', () => {
  const result = run([fixture]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--out <dir> is required/);
});

test('exits 0 and prints usage for --help', () => {
  const result = run(['--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage: commander-mangen/);
});

test('--export picks a named export other than "program"', async () => {
  // Written under the package's own fixtures dir (not the system tmpdir) so
  // its `import 'commander'` resolves against this package's node_modules.
  const fixturesDir = path.dirname(fixture);
  const modulePath = path.join(fixturesDir, 'named-export.generated.ts');
  const outDir = await mkdtemp(path.join(tmpdir(), 'commander-mangen-cli-'));
  dirs.push(outDir);
  generatedFiles.push(modulePath);

  await writeFile(
    modulePath,
    [
      "import { Command } from 'commander';",
      "export const cli = new Command();",
      "cli.name('widget').description('a widget tool');",
    ].join('\n'),
    'utf8',
  );

  const result = run([modulePath, '--export', 'cli', '--out', outDir, '--date', 'September 28, 2026']);
  assert.equal(result.status, 0, result.stderr);
  const files = await readdir(outDir);
  assert.deepEqual(files, ['widget.1']);
});
