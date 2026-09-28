import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Command } from 'commander';

import { generateManPages, type ManGenOptions, type ManPage } from './generate.ts';

export interface WriteManPagesOptions extends ManGenOptions {
  /** Directory to write pages into. Created (recursively) if it doesn't exist. */
  outDir: string;
}

/**
 * Generate man pages for `program`'s command tree and write each one to
 * `${outDir}/${page.name}.${page.section}`. Returns the same `ManPage[]`
 * `generateManPages` would.
 */
export async function writeManPages(program: Command, options: WriteManPagesOptions): Promise<ManPage[]> {
  const { outDir, ...genOptions } = options;
  const pages = generateManPages(program, genOptions);
  await mkdir(outDir, { recursive: true });
  await Promise.all(
    pages.map((page) => writeFile(path.join(outDir, `${page.name}.${page.section}`), page.content, 'utf8')),
  );
  return pages;
}
