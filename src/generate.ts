import type { Argument, Command, Help, Option } from 'commander';

import { ManGenError } from './errors.ts';
import { bold, escapeFlag, escapeText, italic, sh, th, tp, wrap } from './roff.ts';

/** An extra, user-supplied section (EXAMPLES, ENVIRONMENT, AUTHOR, ...). */
export interface ManSection {
  /** Section heading, e.g. "EXAMPLES". Upper-cased in the output. */
  heading: string;
  /**
   * Section body. By default it is treated as prose: blank lines split it
   * into paragraphs, and each paragraph's internal newlines are collapsed
   * to spaces before roff-escaping.
   *
   * Set `preformatted: true` to keep line breaks as-is (for command
   * examples) — each line is still roff-escaped, just not reflowed.
   */
  body: string;
  preformatted?: boolean;
}

export interface ManGenOptions {
  /** Man section number. Default 1. */
  section?: number;
  /** `.TH` manual field, e.g. "User Commands". Default "User Commands". */
  manual?: string;
  /** `.TH` source field. Default "<program name> <program version>", or just the name if no version is set. */
  source?: string;
  /**
   * `.TH` date field, e.g. "September 2026". Default: today, formatted the same way.
   * Pass a fixed value for reproducible output (tests, checked-in generated pages).
   */
  date?: string;
  /** Include a SEE ALSO section cross-referencing parent/sibling/child pages. Default true. */
  seeAlso?: boolean;
  /** Extra sections appended to the top-level (program) page. */
  extraSections?: ManSection[];
  /**
   * Extra sections appended to a specific command's page, keyed by the
   * command's path relative to the program, space-separated (e.g. "build",
   * "build watch"). The empty string ("") targets the top-level page, same
   * as `extraSections` (both are applied, in order, if given).
   */
  extraSectionsByCommand?: Record<string, ManSection[]>;
}

export interface ManPage {
  /** Page name without the section suffix, e.g. "tool-build". */
  name: string;
  section: number;
  /** Full roff source. */
  content: string;
}

interface ResolvedOptions {
  section: number;
  manual: string;
  source: string;
  date: string;
  seeAlso: boolean;
  extraSections: ManSection[];
  extraSectionsByCommand: Record<string, ManSection[]>;
}

/**
 * Generate one man page per command in `program`'s tree: a top-level page
 * plus one per (recursively nested, non-hidden) subcommand.
 *
 * Reads the tree entirely through commander's public API
 * (`Command#commands`/`#options`/`#registeredArguments`, `Command#createHelp()`
 * and the resulting `Help`'s `visible*`/`*Term`/`*Description` methods) —
 * nothing here reaches into commander's private fields, so a command or
 * option marked hidden is excluded the same way it is from `--help`.
 */
export function generateManPages(program: Command, options: ManGenOptions = {}): ManPage[] {
  const programName = program.name();
  if (!programName) {
    throw new ManGenError('program.name() is empty; call program.name(...) before generating man pages');
  }

  const resolved: ResolvedOptions = {
    section: options.section ?? 1,
    manual: options.manual ?? 'User Commands',
    source: options.source ?? defaultSource(program, programName),
    date: options.date ?? defaultDate(),
    seeAlso: options.seeAlso ?? true,
    extraSections: options.extraSections ?? [],
    extraSectionsByCommand: options.extraSectionsByCommand ?? {},
  };

  const pages: ManPage[] = [];
  walk(program, [], programName, resolved, pages);
  return pages;
}

/** `ancestors` holds the chain from the program (inclusive) down to `cmd`'s parent; empty for the program itself. */
function walk(
  cmd: Command,
  ancestors: Command[],
  programName: string,
  options: ResolvedOptions,
  pages: ManPage[],
): void {
  const isRoot = ancestors.length === 0;
  const relNames = isRoot ? [] : [...ancestors.slice(1).map((c) => c.name()), cmd.name()];
  const slug = relNames.length === 0 ? programName : `${programName}-${relNames.join('-')}`;
  const pageKey = relNames.join(' ');

  const help = cmd.createHelp();
  // `visibleCommands` also returns a synthetic placeholder for the implicit
  // `help` command, which isn't a real entry in `cmd.commands` and has no
  // page of its own. Keep it for display (COMMANDS section) but exclude it
  // from recursion and from SEE ALSO.
  const visibleListed = help.visibleCommands(cmd);
  const visibleReal = visibleListed.filter((c) => cmd.commands.includes(c));

  const ownExtras = options.extraSectionsByCommand[pageKey] ?? [];
  const extraSections = isRoot ? [...options.extraSections, ...ownExtras] : ownExtras;

  const content = renderPage({
    cmd,
    ancestors,
    slug,
    programName,
    help,
    visibleListed,
    visibleReal,
    extraSections,
    options,
  });

  pages.push({ name: slug, section: options.section, content });

  for (const child of visibleReal) {
    walk(child, [...ancestors, cmd], programName, options, pages);
  }
}

function defaultSource(program: Command, programName: string): string {
  const version = program.version();
  return version ? `${programName} ${version}` : programName;
}

function defaultDate(): string {
  // "Month Day, Year" — one of the few forms mandoc's date parser accepts
  // without a "cannot parse date" warning; "Month Year" alone is not.
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date());
}

/** `<name>`, `[name]`, `<name...>` or `[name...]`, from public Argument properties only. */
function argBracket(arg: Argument): string {
  const name = arg.variadic ? `${arg.name()}...` : arg.name();
  return arg.required ? `<${name}>` : `[${name}]`;
}

interface PageContext {
  cmd: Command;
  ancestors: Command[];
  slug: string;
  programName: string;
  help: Help;
  visibleListed: Command[];
  visibleReal: Command[];
  extraSections: ManSection[];
  options: ResolvedOptions;
}

function renderPage(ctx: PageContext): string {
  const { cmd, ancestors, slug, programName, help, visibleListed, visibleReal, extraSections, options } = ctx;
  const parts: string[] = [];

  parts.push(th(slug, options.section, options.date, options.source, options.manual));
  parts.push(nameSection(cmd, ancestors, programName, slug));
  parts.push(synopsisSection(cmd, ancestors, help, visibleReal.length > 0));

  const description = (cmd.description() || cmd.summary() || '').trim();
  if (description.length > 0) {
    parts.push(`${sh('DESCRIPTION')}\n${wrap(escapeText(description))}`);
  }

  const argsSection = argumentsSection(cmd, help);
  if (argsSection) parts.push(argsSection);

  parts.push(optionsSection(cmd, help));

  if (visibleListed.length > 0) {
    parts.push(commandsSection(visibleListed, help));
  }

  for (const extra of extraSections) {
    parts.push(extraSection(extra));
  }

  if (options.seeAlso) {
    const seeAlso = seeAlsoSection(cmd, ancestors, programName, slug, visibleReal);
    if (seeAlso) parts.push(seeAlso);
  }

  return `${parts.join('\n')}\n`;
}

function nameSection(cmd: Command, ancestors: Command[], programName: string, slug: string): string {
  const aliases = cmd.aliases();
  // An alias renders at the same path as `cmd` with its own name swapped in,
  // e.g. "tool-build" with alias "b" also lists as "tool-b".
  const aliasPrefix = ancestors.length === 0 ? '' : slug.slice(0, slug.length - cmd.name().length);
  const names = [slug, ...aliases.map((a) => `${aliasPrefix}${a}`)];
  const description = (cmd.summary() || cmd.description() || '').trim();
  const nameList = escapeFlag(names.join(', '));
  const line = description.length > 0 ? `${nameList} \\- ${escapeText(description)}` : nameList;
  return `${sh('NAME')}\n${wrap(line)}`;
}

function synopsisSection(cmd: Command, ancestors: Command[], help: Help, hasVisibleChildren: boolean): string {
  const nameChain = [...ancestors.map((c) => c.name()), cmd.name()].join(' ');
  const firstAlias = cmd.aliases()[0];
  const namePart = firstAlias ? `${nameChain}|${firstAlias}` : nameChain;

  const hasOptions = help.visibleOptions(cmd).length > 0;
  const argParts = cmd.registeredArguments.map(argBracket);
  const rest = [hasOptions ? `[${italic('options')}]` : '', ...argParts].filter(Boolean).join(' ');
  const subPart = hasVisibleChildren ? `[${italic('command')}]` : '';

  const line = [rest, subPart].filter(Boolean).join(' ');
  const synopsis = `${bold(escapeFlag(namePart))}${line ? ` ${line}` : ''}`;
  return `${sh('SYNOPSIS')}\n${synopsis}`;
}

function argumentsSection(cmd: Command, help: Help): string | undefined {
  const args = help.visibleArguments(cmd);
  if (args.length === 0) return undefined;
  const items = cmd.registeredArguments.map((arg) => {
    const term = bold(escapeFlag(argBracket(arg)));
    const description = escapeText(help.argumentDescription(arg));
    return tp(term, description);
  });
  return `${sh('ARGUMENTS')}\n${items.join('\n')}`;
}

function optionsSection(cmd: Command, help: Help): string {
  const items = help.visibleOptions(cmd).map((option: Option) => {
    const term = bold(escapeFlag(help.optionTerm(option)));
    const description = escapeText(help.optionDescription(option));
    return tp(term, description);
  });
  return `${sh('OPTIONS')}\n${items.join('\n')}`;
}

function commandsSection(visible: Command[], help: Help): string {
  const items = visible.map((child) => {
    // subcommandTerm is "name[|alias][ [options]][ <args>]" — bold just the
    // name/alias, so the term column doesn't come out bold end-to-end.
    const raw = help.subcommandTerm(child);
    const spaceAt = raw.indexOf(' ');
    const namePart = spaceAt === -1 ? raw : raw.slice(0, spaceAt);
    const rest = spaceAt === -1 ? '' : raw.slice(spaceAt);
    const term = `${bold(escapeFlag(namePart))}${escapeFlag(rest)}`;
    const description = escapeText(help.subcommandDescription(child));
    return tp(term, description);
  });
  return `${sh('COMMANDS')}\n${items.join('\n')}`;
}

function extraSection(section: ManSection): string {
  const heading = sh(section.heading.toUpperCase());
  if (section.preformatted) {
    const lines = section.body
      .split('\n')
      .map((line) => escapeText(line))
      .join('\n');
    return `${heading}\n.nf\n${lines}\n.fi`;
  }
  const paragraphs = section.body
    .split(/\n\s*\n/)
    .map((p) => wrap(escapeText(p)))
    .filter((p) => p.length > 0);
  return `${heading}\n${paragraphs.join('\n.PP\n')}`;
}

function seeAlsoSection(
  cmd: Command,
  ancestors: Command[],
  programName: string,
  ownSlug: string,
  ownVisibleChildren: Command[],
): string | undefined {
  const refs = new Set<string>();

  if (ancestors.length > 0) {
    const parent = ancestors[ancestors.length - 1]!;
    const parentRelNames = ancestors.slice(1).map((c) => c.name());
    const parentSlug = parentRelNames.length === 0 ? programName : `${programName}-${parentRelNames.join('-')}`;
    refs.add(parentSlug);

    const parentHelp = parent.createHelp();
    const siblings = parentHelp
      .visibleCommands(parent)
      .filter((c) => parent.commands.includes(c) && c !== cmd);
    for (const sibling of siblings) refs.add(`${parentSlug}-${sibling.name()}`);
  }

  for (const child of ownVisibleChildren) refs.add(`${ownSlug}-${child.name()}`);

  if (refs.size === 0) return undefined;

  const sorted = [...refs].sort();
  const lines = sorted.map((ref, i) => `.BR ${escapeFlag(ref)} (1)${i === sorted.length - 1 ? '' : ','}`);
  return `${sh('SEE ALSO')}\n${lines.join('\n')}`;
}
