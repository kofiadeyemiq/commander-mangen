/**
 * Minimal roff (man(7)) escaping and macro helpers.
 *
 * Two escaping functions, because roff treats "a literal hyphen used as a
 * command-line flag" and "a hyphen inside ordinary prose" differently:
 *
 * - `escapeFlag` is for text that is itself a run of flags/command names
 *   (SYNOPSIS, the OPTIONS/COMMANDS term column) — every hyphen there is a
 *   minus sign, so it becomes `\-`.
 * - `escapeText` is for free-form prose (descriptions) — hyphens are left
 *   alone (they're genuine hyphens), but a leading `.` or `'` would be
 *   read as a troff request, and a stray backslash would start an escape
 *   sequence, so those are neutralized.
 */

/** Escape a literal backslash so it isn't read as the start of a roff escape sequence. */
function escapeBackslash(str: string): string {
  return str.replaceAll('\\', '\\e');
}

/**
 * Escape free-form text for use inside a roff document (descriptions,
 * summaries, user-supplied section bodies).
 *
 * Collapses embedded newlines to spaces — man page descriptions are laid
 * out with `.TP`/`.PP`, not raw line breaks, and a line break would risk
 * putting arbitrary text at the start of a line where it could be read as
 * a control line.
 */
export function escapeText(str: string): string {
  const collapsed = str.replaceAll(/\s*\n\s*/g, ' ').trim();
  const escaped = escapeBackslash(collapsed);
  // A line starting with `.` or `'` is a troff control line. `\&` is a
  // zero-width character that defuses that without being visible.
  return /^[.']/.test(escaped) ? `\\&${escaped}` : escaped;
}

/**
 * Escape text that consists of flags or command names (SYNOPSIS lines,
 * OPTIONS/COMMANDS term columns). Every literal hyphen is rendered as an
 * escaped minus sign, per man-pages(7): plain `-` can be reflowed or
 * substituted by some viewers, `\-` cannot.
 */
export function escapeFlag(str: string): string {
  const escaped = escapeBackslash(str);
  return escaped.replaceAll('-', '\\-');
}

/** Bold (`\fB`...`\fR`), for flags and command names. */
export function bold(str: string): string {
  return `\\fB${str}\\fR`;
}

/** Italic (`\fI`...`\fR`), for placeholders and option arguments. */
export function italic(str: string): string {
  return `\\fI${str}\\fR`;
}

/** `.TH` title line. `title` is upper-cased per convention. */
export function th(title: string, section: number, date: string, source: string, manual: string): string {
  return `.TH ${quote(title.toUpperCase())} ${quote(String(section))} ${quote(date)} ${quote(source)} ${quote(manual)}`;
}

export function sh(heading: string): string {
  return `.SH ${quote(heading)}`;
}

export function ss(heading: string): string {
  return `.SS ${quote(heading)}`;
}

/** A `.TP` (tagged paragraph) item: a term line followed by its description. */
export function tp(term: string, description: string): string {
  const body = description.trim();
  return body.length > 0 ? `.TP\n${term}\n${wrap(body)}` : `.TP\n${term}`;
}

/** A plain paragraph. */
export function pp(text: string): string {
  return `.PP\n${wrap(text)}`;
}

/**
 * Wrap running prose text across multiple *source* lines at `width`,
 * breaking only at existing spaces.
 *
 * Purely cosmetic: roff fills/reflows ordinary text at render time
 * regardless of input line breaks, so this never changes rendered output.
 * It exists to keep generated `.ps`/`.TP` bodies under the conventional
 * ~80-column source width (`mandoc -T lint` flags longer lines as a STYLE
 * warning). Never call this on a macro argument line (`.TH`, `.TP`'s own
 * term line, `.BR`, …) or on preformatted (`.nf`) content — those are
 * positional/verbatim, and a wrap there would change their meaning.
 */
export function wrap(text: string, width = 70): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (candidate.length > width && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines.join('\n');
}

/** Quote a `.TH` field, escaping any embedded double quote. */
function quote(str: string): string {
  return `"${str.replaceAll('"', '\\(dq')}"`;
}
