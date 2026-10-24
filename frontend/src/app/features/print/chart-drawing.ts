import type { Box, Segment } from './pagination';

/**
 * Relevé de ce qu'il faut dessiner pour reproduire l'arbre affiché : les
 * cartes et anneaux d'union (éléments recopiés tels quels) et les traits de
 * liaison (redessinés en SVG). Coordonnées relatives au coin de l'arbre.
 */
export interface ChartDrawing {
  size: { width: number; height: number };
  cards: HTMLElement[];
  cardBoxes: Box[];
  marks: HTMLElement[];
  markBoxes: Box[];
  segments: Segment[];
}

export function measureChart(chart: HTMLElement): ChartDrawing {
  const origin = chart.getBoundingClientRect();
  const rect = (element: Element): Box => {
    const r = element.getBoundingClientRect();
    return {
      left: r.left - origin.left,
      top: r.top - origin.top,
      right: r.right - origin.left,
      bottom: r.bottom - origin.top,
    };
  };
  const all = (selector: string) => [...chart.querySelectorAll<HTMLElement>(selector)];
  const segments: Segment[] = [];
  const vertical = (x: number, y1: number, y2: number) => segments.push({ x1: x, y1, x2: x, y2 });
  const horizontal = (y: number, x1: number, x2: number) => segments.push({ x1, y1: y, x2, y2: y });

  for (const line of all('.vertical-line')) {
    const box = rect(line);
    vertical((box.left + box.right) / 2, box.top, box.bottom);
  }
  for (const cell of all('td.line-left')) {
    const box = rect(cell);
    vertical(box.right, box.top, box.bottom);
  }
  for (const cell of all('td.line-top')) {
    const box = rect(cell);
    horizontal(box.top + 0.5, box.left, box.right);
  }
  for (const cell of all('td.line-bottom')) {
    const box = rect(cell);
    horizontal(box.bottom - 0.5, box.left, box.right);
  }
  // Traits prolongés jusqu'aux cartes (pseudo-éléments ::before / ::after).
  for (const node of all('.node-center.line-above')) {
    const box = rect(node);
    const height = parseFloat(getComputedStyle(node, '::before').height) || 0;
    vertical((box.left + box.right) / 2, box.top, box.top + height);
  }
  for (const node of all('.node-center.line-below')) {
    const box = rect(node);
    const height = parseFloat(getComputedStyle(node, '::after').height) || 0;
    vertical((box.left + box.right) / 2, box.bottom - height, box.bottom);
  }

  const cards = all('app-person-card');
  const marks = all('.union-icon');
  return {
    size: { width: chart.offsetWidth, height: chart.offsetHeight },
    cards,
    cardBoxes: cards.map(rect),
    marks,
    markBoxes: marks.map(rect),
    segments,
  };
}

/** Copie d'un élément de l'arbre, positionnée dans une page. */
export function placedCopy(element: HTMLElement, box: Box, offset: { x: number; y: number }): HTMLElement {
  const copy = element.cloneNode(true) as HTMLElement;
  Object.assign(copy.style, {
    position: 'absolute',
    left: `${box.left - offset.x}px`,
    top: `${box.top - offset.y}px`,
    // Un pixel de marge en largeur et une hauteur libre : le zoom de la page
    // peut arrondir le texte différemment et le faire passer à la ligne.
    width: `${box.right - box.left + 1}px`,
    minHeight: `${box.bottom - box.top}px`,
    margin: '0',
    maxWidth: 'none',
  });
  return copy;
}
