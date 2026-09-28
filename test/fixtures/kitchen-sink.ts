/**
 * A fixture commander program exercising: nested subcommands, aliases,
 * hidden command/option, required/optional/variadic arguments, choices,
 * defaults, an env-backed option, a negatable option, an executable
 * subcommand declaration, and description text with roff-dangerous
 * characters (a leading quote, a literal backslash, a literal dot).
 *
 * Exported without calling `.parse()`, per commander-mangen's contract.
 */
import { Command, Option } from 'commander';

export const program = new Command();

program
  .name('tool')
  .description("A 'demo' tool.\nSee tool.config.json for defaults.")
  .version('2.3.1');

const build = program
  .command('build')
  .alias('b')
  .summary('build the project')
  .description('Build the project. Reads options from .toolrc if present.')
  .option('-w, --watch', 'watch for changes')
  .option('-o, --output <dir>', 'output directory', 'dist')
  .option('--color', 'use color output', true)
  .option('--no-color', 'disable color output')
  .addOption(
    new Option('-f, --format <type>', 'output format').choices(['esm', 'cjs', 'umd']).default('esm'),
  )
  .addOption(new Option('--token <token>', 'registry auth token').env('TOOL_TOKEN'))
  .argument('<entry>', 'entry file')
  .argument('[extra...]', 'additional source files')
  .action(() => {});

build
  .command('watch')
  .alias('w')
  .description('Watch and rebuild on change')
  .option('-i, --interval <ms>', 'poll interval in milliseconds', '500')
  .action(() => {});

// Hidden option on an otherwise-visible command.
build.addOption(new Option('--debug-internal', 'undocumented debug flag').hideHelp());

// Hidden command: should not get a page and should not appear in COMMANDS.
program
  .command('_internal-diagnostics', { hidden: true })
  .description('internal diagnostics, not for public use')
  .action(() => {});

// A command whose description exercises roff-dangerous characters.
program
  .command('lint')
  .description("'Lint the project.' Uses a backslash path separator like C:\\Users on Windows.")
  .option('--fix', 'automatically fix problems')
  .action(() => {});

// Executable subcommand: implemented as a separate `tool-deploy` binary.
// commander never sees its options.
program.command('deploy [target]', 'deploy the project (implemented as a separate executable)');

program.commandsGroup('Commands:');
