/** A minimal fixture: one subcommand with two options. Used for the README before/after comparison against help2man. */
import { Command } from 'commander';

export const program = new Command();
program.name('tool').description('a demo tool').version('1.0.0');

program
  .command('build')
  .description('build the project')
  .option('-w, --watch', 'watch for changes')
  .option('-o, --output <dir>', 'output directory', 'dist')
  .action(() => {});
