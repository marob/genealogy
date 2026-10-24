/**
 * Parses GEDCOM lines into a tree of nodes.
 *
 * Each line has the form `level [@xref@] TAG [value]`. CONC/CONT continuation
 * lines are merged into the value of their parent.
 */

export interface GedcomNode {
  level: number;
  tag: string;
  xref?: string;
  value: string;
  /** Line number (1-based) in the file, for error messages. */
  line: number;
  children: GedcomNode[];
}

export interface ParsedLines {
  records: GedcomNode[];
  warnings: string[];
}

const LINE = /^\s*(\d{1,2})\s+(?:(@[^@]+@)\s+)?(\w+)(?: (.*))?$/;

export function parseLines(text: string): ParsedLines {
  const records: GedcomNode[] = [];
  const warnings: string[] = [];
  const stack: GedcomNode[] = [];

  text.split(/\r\n|\r|\n/).forEach((raw, index) => {
    const lineNumber = index + 1;
    if (raw.trim() === '') {
      return;
    }
    const match = LINE.exec(raw);
    if (!match) {
      warnings.push(`Line ${lineNumber} ignored (invalid format): "${raw.slice(0, 80)}"`);
      return;
    }
    const level = Number(match[1]);
    const xref = match[2]?.slice(1, -1);
    const tag = match[3]!.toUpperCase();
    const value = match[4] ?? '';

    if (level === 0) {
      stack.length = 0;
    } else if (level > stack.length) {
      warnings.push(`Line ${lineNumber} ignored (level ${level} without a parent).`);
      return;
    } else {
      stack.length = level;
    }
    const parent = stack.at(-1);

    if (parent && (tag === 'CONC' || tag === 'CONT')) {
      parent.value += (tag === 'CONT' ? '\n' : '') + value;
      return;
    }

    const node: GedcomNode = { level, tag, value, line: lineNumber, children: [] };
    if (xref !== undefined) {
      node.xref = xref;
    }
    if (parent) {
      parent.children.push(node);
    } else {
      records.push(node);
    }
    stack.push(node);
  });

  return { records, warnings };
}

/** First child with the given tag. */
export function child(node: GedcomNode | undefined, tag: string): GedcomNode | undefined {
  return node?.children.find((c) => c.tag === tag);
}

/** All children with the given tag. */
export function children(node: GedcomNode | undefined, tag: string): GedcomNode[] {
  return node?.children.filter((c) => c.tag === tag) ?? [];
}

/** Trimmed value of the first child with the given tag. */
export function childValue(node: GedcomNode | undefined, tag: string): string | undefined {
  const value = child(node, tag)?.value.trim();
  return value === '' ? undefined : value;
}

/** Extracts the identifier from a pointer `@I12@` → `I12`. */
export function pointer(value: string | undefined): string | undefined {
  const match = /^\s*@([^@]+)@\s*$/.exec(value ?? '');
  return match?.[1];
}
