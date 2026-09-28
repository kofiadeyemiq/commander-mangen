/**
 * Minimal end-to-end usage demo: build a small commander program, generate
 * its man pages, and print the one for the `build` subcommand — the same
 * page shown in the README's before/after comparison.
 *
 *   node examples/generate.ts
 */
import { Command } from 'commander';
import { generateManPages } from '../src/index.ts';

const program = new Command();
program.name('tool').description('a demo tool').version('1.0.0');

program
  .command('build')
  .description('build the project')
  .option('-w, --watch', 'watch for changes')
  .option('-o, --output <dir>', 'output directory', 'dist')
  .action(() => {});

const pages = generateManPages(program, { date: 'September 28, 2026' });
const build = pages.find((p) => p.name === 'tool-build')!;
console.log(build.content);
