#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import type { Command } from 'commander';

import { writeManPages } from './write.ts';
import type { ManGenOptions } from './generate.ts';

class CliError extends Error {}

function usage(): string {
  return [
    'Usage: commander-mangen <module> --out <dir> [options]',
    '',
    'Import <module> (running its top-level code) and generate one roff man',
    "page per command in the exported commander Command tree.",
    '',
    'The module must export a Command that has NOT had .parse() called on it —',
    'export the program object itself, e.g.:',
    '',
    '  export const program = new Command()...;',
    '  // do not call program.parse() here',
    '',
    'Options:',
    '  --export <name>    named export holding the Command',
    '                      (default: tries "program", then the default export)',
    '  --out <dir>         directory to write pages into (required)',
    '  --section <n>        man section number (default: 1)',
    '  --manual <text>     manual name shown in the page header (default: "User Commands")',
    '  --source <text>     source shown in the page header (default: "<name> <version>")',
    '  --date <text>        date shown in the page header (default: today, "Month YYYY")',
    '  --no-see-also        omit the SEE ALSO cross-reference section',
    '  -h, --help           show this help',
    '',
    'Exit codes: 0 success, 2 could not generate pages.',
  ].join('\n');
}

interface Args {
  module: string | undefined;
  export: string | undefined;
  out: string | undefined;
  section: number | undefined;
  manual: string | undefined;
  source: string | undefined;
  date: string | undefined;
  seeAlso: boolean;
  help: boolean;
}

function requireValue(argv: string[], i: number, flag: string): string {
  const v = argv[i];
  if (v === undefined) throw new CliError(`${flag} expects a value`);
  return v;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    module: undefined,
    export: undefined,
    out: undefined,
    section: undefined,
    manual: undefined,
    source: undefined,
    date: undefined,
    seeAlso: true,
    help: false,
  };
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    switch (a) {
      case '-h':
      case '--help':
        args.help = true;
        break;
      case '--export':
        args.export = requireValue(argv, ++i, '--export');
        break;
      case '--out':
        args.out = requireValue(argv, ++i, '--out');
        break;
      case '--section': {
        const raw = requireValue(argv, ++i, '--section');
        const n = Number(raw);
        if (!Number.isInteger(n)) throw new CliError(`--section expects an integer, got "${raw}"`);
        args.section = n;
        break;
      }
      case '--manual':
        args.manual = requireValue(argv, ++i, '--manual');
        break;
      case '--source':
        args.source = requireValue(argv, ++i, '--source');
        break;
      case '--date':
        args.date = requireValue(argv, ++i, '--date');
        break;
      case '--no-see-also':
        args.seeAlso = false;
        break;
      default:
        if (a.startsWith('-') && a !== '-') throw new CliError(`Unknown option "${a}"`);
        positionals.push(a);
    }
  }

  if (positionals.length > 1) {
    throw new CliError(`Unexpected extra argument "${positionals[1]}"`);
  }
  args.module = positionals[0];
  return args;
}

/**
 * Duck-typed check rather than `instanceof Command`: the module being
 * introspected may resolve its own, separately installed copy of commander,
 * in which case its Command instances would fail an `instanceof` check
 * against ours even though the shape — and the public API this tool relies
 * on — is identical.
 */
function isCommandLike(value: unknown): value is Command {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['name'] === 'function' &&
    typeof v['opts'] === 'function' &&
    typeof v['createHelp'] === 'function' &&
    Array.isArray(v['commands']) &&
    Array.isArray(v['options']) &&
    Array.isArray(v['registeredArguments'])
  );
}

async function loadCommand(modulePath: string, exportName: string | undefined): Promise<Command> {
  const resolved = path.isAbsolute(modulePath) ? modulePath : path.resolve(process.cwd(), modulePath);
  let mod: Record<string, unknown>;
  try {
    mod = (await import(pathToFileURL(resolved).href)) as Record<string, unknown>;
  } catch (err) {
    throw new CliError(`could not import "${modulePath}": ${(err as Error).message}`);
  }

  const candidates = exportName ? [exportName] : ['program', 'default'];
  for (const name of candidates) {
    const value = mod[name];
    if (isCommandLike(value)) return value;
  }
  throw new CliError(
    `no commander Command export found (tried: ${candidates.join(', ')}). ` +
      'Export the Command instance without calling .parse() on it, ' +
      'e.g. "export const program = new Command()...".',
  );
}

async function main(): Promise<number> {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error((err as Error).message);
    console.error();
    console.error(usage());
    return 2;
  }

  if (args.help) {
    console.log(usage());
    return 0;
  }
  if (!args.module) {
    console.error('missing <module> argument');
    console.error();
    console.error(usage());
    return 2;
  }
  if (!args.out) {
    console.error('--out <dir> is required');
    console.error();
    console.error(usage());
    return 2;
  }

  let program: Command;
  try {
    program = await loadCommand(args.module, args.export);
  } catch (err) {
    console.error(`commander-mangen: ${(err as Error).message}`);
    return 2;
  }

  const genOptions: ManGenOptions = { seeAlso: args.seeAlso };
  if (args.section !== undefined) genOptions.section = args.section;
  if (args.manual !== undefined) genOptions.manual = args.manual;
  if (args.source !== undefined) genOptions.source = args.source;
  if (args.date !== undefined) genOptions.date = args.date;

  try {
    const pages = await writeManPages(program, { ...genOptions, outDir: args.out });
    for (const page of pages) {
      console.log(path.join(args.out, `${page.name}.${page.section}`));
    }
    return 0;
  } catch (err) {
    console.error(`commander-mangen: ${(err as Error).message}`);
    return 2;
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err);
    process.exit(2);
  },
);
