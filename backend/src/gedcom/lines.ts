/**
 * Analyse syntaxique des lignes GEDCOM en arbre de nœuds.
 *
 * Chaque ligne a la forme `niveau [@xref@] TAG [valeur]`. Les lignes de
 * continuation CONC/CONT sont fusionnées dans la valeur de leur parent.
 */

export interface GedcomNode {
  level: number;
  tag: string;
  xref?: string;
  value: string;
  /** Numéro de ligne (1-indexé) dans le fichier, pour les messages d'erreur. */
  line: number;
  children: GedcomNode[];
}

export interface ParsedLines {
  records: GedcomNode[];
  warnings: string[];
}

const LINE = /^\s*(\d{1,2})\s+(?:(@[^@]+@)\s+)?([A-Za-z0-9_]+)(?: (.*))?$/;

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
      warnings.push(`Ligne ${lineNumber} ignorée (format invalide) : « ${raw.slice(0, 80)} »`);
      return;
    }
    const level = Number(match[1]);
    const xref = match[2]?.slice(1, -1);
    const tag = match[3]!.toUpperCase();
    const value = match[4] ?? '';

    if (level === 0) {
      stack.length = 0;
    } else if (level > stack.length) {
      warnings.push(`Ligne ${lineNumber} ignorée (niveau ${level} sans parent).`);
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

/** Premier enfant portant le tag donné. */
export function child(node: GedcomNode | undefined, tag: string): GedcomNode | undefined {
  return node?.children.find((c) => c.tag === tag);
}

/** Tous les enfants portant le tag donné. */
export function children(node: GedcomNode | undefined, tag: string): GedcomNode[] {
  return node?.children.filter((c) => c.tag === tag) ?? [];
}

/** Valeur nettoyée du premier enfant portant le tag donné. */
export function childValue(node: GedcomNode | undefined, tag: string): string | undefined {
  const value = child(node, tag)?.value.trim();
  return value === '' ? undefined : value;
}

/** Extrait l'identifiant d'un pointeur `@I12@` → `I12`. */
export function pointer(value: string | undefined): string | undefined {
  const match = /^\s*@([^@]+)@\s*$/.exec(value ?? '');
  return match?.[1];
}
