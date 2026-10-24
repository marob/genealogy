import type { Box, Segment } from './pagination';

/**
 * Déplacement des cartes qui chevauchent une coupe de page, pour qu'elles
 * tiennent entièrement sur une page, en gardant les traits droits et connectés.
 *
 * - Décalage horizontal : toute la descente verticale de la carte (jusqu'au
 *   trait horizontal qui la relie à sa famille) se déplace avec elle et le
 *   trait horizontal est allongé ou raccourci. Un crochet n'est dessiné que si
 *   la descente relie directement deux cartes.
 * - Le côté retenu est d'abord celui où se trouve la famille de la carte
 *   (le trait auquel elle se raccroche), puis le déplacement le plus court.
 * - Une carte bloquée par sa voisine peut la pousser (déplacement en bloc).
 * - Décalage vertical : la descente est allongée ou raccourcie, tant qu'il
 *   reste un trait visible.
 * Un déplacement qui ferait chevaucher une autre carte ou une autre coupe est
 * refusé : la carte reste alors coupée.
 */

/** Espace laissé entre une carte déplacée et la coupe ou la carte voisine. */
const MARGIN = 4;
/** Tolérance pour reconnaître des traits ou bords qui se touchent. */
const TOUCH = 2;
/** Longueur minimale d'un trait vertical raccourci. */
const MIN_LINE = 6;
/** Nombre maximal de cartes déplacées ensemble. */
const MAX_BLOCK = 4;

type Lines = (Segment | null)[];

interface Cuts {
  x: number[];
  y: number[];
}

interface Size {
  width: number;
  height: number;
}

/** Descente verticale depuis le bord d'une carte jusqu'à sa jonction. */
interface Chain {
  x: number;
  /** Ordonnée au bord de la carte. */
  edge: number;
  /** Ordonnée de la jonction (trait horizontal ou autre carte). */
  end: number;
  segments: number[];
}

const isVertical = (line: Segment) => Math.abs(line.x1 - line.x2) < 0.01;
const isHorizontal = (line: Segment) => Math.abs(line.y1 - line.y2) < 0.01;
const near = (a: number, b: number) => Math.abs(a - b) <= TOUCH;

function followChain(lines: Lines, x: number, edge: number, direction: -1 | 1): Chain {
  const segments: number[] = [];
  let current = edge;
  for (;;) {
    const next = lines.findIndex((line, index) => {
      if (!line || segments.includes(index) || !isVertical(line) || !near(line.x1, x)) {
        return false;
      }
      const [low, high] = [Math.min(line.y1, line.y2), Math.max(line.y1, line.y2)];
      return direction < 0 ? near(high, current) && low < current - 0.5 : near(low, current) && high > current + 0.5;
    });
    if (next < 0) {
      return { x, edge, end: current, segments };
    }
    segments.push(next);
    const line = lines[next]!;
    current = direction < 0 ? Math.min(line.y1, line.y2) : Math.max(line.y1, line.y2);
  }
}

/** Descentes partant du haut et du bas d'une carte. */
function chainsOf(lines: Lines, box: Box): { above: Chain[]; below: Chain[] } {
  const starts = (edge: 'top' | 'bottom') => {
    const xs: number[] = [];
    for (const line of lines) {
      if (!line || !isVertical(line) || line.x1 < box.left - TOUCH || line.x1 > box.right + TOUCH) {
        continue;
      }
      const end = edge === 'top' ? Math.max(line.y1, line.y2) : Math.min(line.y1, line.y2);
      if (near(end, box[edge]) && !xs.some((x) => near(x, line.x1))) {
        xs.push(line.x1);
      }
    }
    return xs;
  };
  return {
    above: starts('top').map((x) => followChain(lines, x, box.top, -1)),
    below: starts('bottom').map((x) => followChain(lines, x, box.bottom, 1)),
  };
}

/**
 * Position de la famille d'une carte : centre du trait horizontal auquel
 * aboutit sa descente (milieu de la fratrie, là où descend le trait des parents).
 */
function familyAnchor(lines: Lines, chain: Chain): number | undefined {
  const xs = lines.flatMap((line) => {
    if (!line || !isHorizontal(line) || !near(line.y1, chain.end)) {
      return [];
    }
    const [low, high] = [Math.min(line.x1, line.x2), Math.max(line.x1, line.x2)];
    return chain.x >= low - TOUCH && chain.x <= high + TOUCH ? [low, high] : [];
  });
  return xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : undefined;
}

/** Carte (autre que `except`) à laquelle aboutit une descente, s'il y en a une. */
function cardAt(boxes: Box[], chain: Chain, except: Set<number>): number | undefined {
  const index = boxes.findIndex(
    (box, i) =>
      !except.has(i) &&
      chain.x >= box.left - TOUCH &&
      chain.x <= box.right + TOUCH &&
      (near(box.bottom, chain.end) || near(box.top, chain.end)),
  );
  return index < 0 ? undefined : index;
}

const separated = (a: Box, b: Box, axis: 'x' | 'y') =>
  axis === 'x'
    ? a.right + MARGIN <= b.left || b.right + MARGIN <= a.left || a.bottom <= b.top || b.bottom <= a.top
    : a.bottom + MARGIN <= b.top || b.bottom + MARGIN <= a.top || a.right <= b.left || b.right <= a.left;

const shifted = (box: Box, dx: number, dy: number): Box => ({
  left: box.left + dx,
  right: box.right + dx,
  top: box.top + dy,
  bottom: box.bottom + dy,
});

interface Candidate {
  boxes: Box[];
  lines: Lines;
  score: number[];
}

function better(score: number[], than: number[]): boolean {
  const index = score.findIndex((value, i) => value !== than[i]);
  return index >= 0 && score[index]! < than[index]!;
}

/** Décalage horizontal d'un bloc de cartes, ou `undefined` s'il est impossible. */
function moveX(
  boxes: Box[],
  lines: Lines,
  block: Set<number>,
  dx: number,
  cuts: Cuts,
  size: Size,
): Candidate | undefined {
  const nextBoxes = boxes.map((box, i) => (block.has(i) ? shifted(box, dx, 0) : box));
  for (const i of block) {
    const box = nextBoxes[i]!;
    if (box.left < 0 || box.right > size.width || cuts.x.some((cut) => box.left < cut && cut < box.right)) {
      return undefined;
    }
    if (nextBoxes.some((other, j) => !block.has(j) && !separated(box, other, 'x'))) {
      return undefined;
    }
  }

  const nextLines: Lines = lines.map((line) => (line ? { ...line } : null));
  let jogs = 0;
  let away = 0;
  const column = (x: number) => cuts.x.filter((cut) => cut <= x).length;
  const moved = new Set<number>();
  for (const i of block) {
    const { above, below } = chainsOf(lines, boxes[i]!);
    const center = (nextBoxes[i]!.left + nextBoxes[i]!.right) / 2;
    for (const chain of [...above, ...below]) {
      if (chain.segments.some((segment) => moved.has(segment))) {
        continue;
      }
      chain.segments.forEach((segment) => moved.add(segment));
      const other = cardAt(boxes, chain, block);
      if (other !== undefined && chain.segments.length > 0) {
        // Trait direct entre deux cartes : crochet à mi-hauteur.
        jogs++;
        const middle = (chain.edge + chain.end) / 2;
        chain.segments.forEach((segment) => (nextLines[segment] = null));
        nextLines.push(
          { x1: chain.x, y1: chain.end, x2: chain.x, y2: middle },
          { x1: chain.x, y1: middle, x2: chain.x + dx, y2: middle },
          { x1: chain.x + dx, y1: middle, x2: chain.x + dx, y2: chain.edge },
        );
        continue;
      }
      const anchor = familyAnchor(lines, chain);
      if (anchor !== undefined && column(anchor) !== column(center)) {
        away++;
      }
      for (const segment of chain.segments) {
        const line = nextLines[segment]!;
        nextLines[segment] = { ...line, x1: line.x1 + dx, x2: line.x2 + dx };
      }
      // Le trait horizontal de jonction suit la descente.
      lines.forEach((line, index) => {
        if (!line || !isHorizontal(line) || !near(line.y1, chain.end)) {
          return;
        }
        const [low, high] = [Math.min(line.x1, line.x2), Math.max(line.x1, line.x2)];
        if (chain.x < low - TOUCH || chain.x > high + TOUCH) {
          return;
        }
        const target = nextLines[index]!;
        const x = chain.x + dx;
        if (near(target.x1, chain.x)) {
          target.x1 = x;
        } else if (near(target.x2, chain.x)) {
          target.x2 = x;
        } else if (x < Math.min(target.x1, target.x2)) {
          if (target.x1 < target.x2) target.x1 = x;
          else target.x2 = x;
        } else if (x > Math.max(target.x1, target.x2)) {
          if (target.x1 > target.x2) target.x1 = x;
          else target.x2 = x;
        }
      });
    }
  }
  return { boxes: nextBoxes, lines: nextLines, score: [jogs, away, block.size, Math.abs(dx)] };
}

/** Bloc de cartes poussées par `index` lors d'un décalage de `dx`. */
function pushedBlock(boxes: Box[], index: number, dx: number): Set<number> | undefined {
  const block = new Set([index]);
  for (let grown = true; grown;) {
    grown = false;
    for (const [j, other] of boxes.entries()) {
      if (block.has(j)) {
        continue;
      }
      const hit = [...block].some((i) => {
        const box = shifted(boxes[i]!, dx, 0);
        const ahead = dx > 0 ? other.left >= boxes[i]!.left : other.right <= boxes[i]!.right;
        return ahead && !separated(box, other, 'x');
      });
      if (hit) {
        block.add(j);
        grown = true;
        if (block.size > MAX_BLOCK) {
          return undefined;
        }
      }
    }
  }
  return block;
}

/** Décalage vertical d'une carte, ou `undefined` s'il est impossible. */
function moveY(boxes: Box[], lines: Lines, index: number, dy: number, cuts: Cuts, size: Size): Candidate | undefined {
  const box = shifted(boxes[index]!, 0, dy);
  if (box.top < 0 || box.bottom > size.height || cuts.y.some((cut) => box.top < cut && cut < box.bottom)) {
    return undefined;
  }
  if (boxes.some((other, j) => j !== index && !separated(box, other, 'y'))) {
    return undefined;
  }
  const { above, below } = chainsOf(lines, boxes[index]!);
  if (above.some((chain) => chain.segments.length > 0 && box.top - chain.end < MIN_LINE)) {
    return undefined;
  }
  if (below.some((chain) => chain.segments.length > 0 && chain.end - box.bottom < MIN_LINE)) {
    return undefined;
  }
  const nextLines: Lines = lines.map((line) => (line ? { ...line } : null));
  for (const [chain, edge] of [
    ...above.map((c) => [c, box.top] as const),
    ...below.map((c) => [c, box.bottom] as const),
  ]) {
    if (chain.segments.length === 0) {
      continue;
    }
    chain.segments.forEach((segment) => (nextLines[segment] = null));
    nextLines.push({ x1: chain.x, y1: chain.end, x2: chain.x, y2: edge });
  }
  const nextBoxes = boxes.map((other, j) => (j === index ? box : other));
  return { boxes: nextBoxes, lines: nextLines, score: [Math.abs(dy)] };
}

/** Cartes reliées directement à celles du bloc par un trait vertical (sans trait horizontal). */
function linkedBlock(boxes: Box[], lines: Lines, block: Set<number>): Set<number> | undefined {
  const linked = new Set(block);
  for (let grown = true; grown;) {
    grown = false;
    for (const i of [...linked]) {
      const { above, below } = chainsOf(lines, boxes[i]!);
      for (const chain of [...above, ...below]) {
        const other = cardAt(boxes, chain, linked);
        if (other !== undefined) {
          linked.add(other);
          grown = true;
        }
      }
    }
    if (linked.size > MAX_BLOCK) {
      return undefined;
    }
  }
  return linked;
}

/**
 * Aligne les tronçons d'un même trait vertical : ils proviennent d'éléments
 * différents de l'arbre et peuvent différer d'un pixel, ce qui se voit à
 * l'impression.
 */
export function alignVerticalChains(segments: Segment[]): Segment[] {
  const lines = segments.map((segment) => ({ ...segment }));
  const vertical = lines.filter(isVertical);
  const seen = new Set<Segment>();
  for (const start of vertical) {
    if (seen.has(start)) {
      continue;
    }
    const group = [start];
    seen.add(start);
    // Le parcours visite aussi les tronçons ajoutés en cours de route.
    for (const line of group) {
      for (const other of vertical) {
        if (seen.has(other) || !near(other.x1, line.x1)) {
          continue;
        }
        const touches = [other.y1, other.y2].some((y) => near(y, line.y1) || near(y, line.y2));
        if (touches) {
          group.push(other);
          seen.add(other);
        }
      }
    }
    const longest = group.reduce((a, b) => (Math.abs(b.y2 - b.y1) > Math.abs(a.y2 - a.y1) ? b : a));
    for (const line of group) {
      line.x1 = longest.x1;
      line.x2 = longest.x1;
    }
  }
  return lines;
}

export function moveCutCards(
  cards: Box[],
  segments: Segment[],
  cuts: Cuts,
  size: Size,
): { cards: Box[]; segments: Segment[] } {
  let boxes = cards.map((card) => ({ ...card }));
  let lines: Lines = segments.map((segment) => ({ ...segment }));

  for (let index = 0; index < boxes.length; index++) {
    const box = boxes[index]!;
    const cutX = cuts.x.find((cut) => box.left < cut && cut < box.right);
    if (cutX !== undefined) {
      let best: Candidate | undefined;
      for (const dx of [cutX - box.right - MARGIN, cutX - box.left + MARGIN]) {
        // Seule (ou en poussant ses voisines), puis avec les cartes qui lui sont
        // reliées par un trait direct, pour éviter un crochet.
        const pushed = pushedBlock(boxes, index, dx);
        const linked = pushed && linkedBlock(boxes, lines, pushed);
        for (const block of [pushed, linked]) {
          const candidate = block && moveX(boxes, lines, block, dx, cuts, size);
          if (candidate && (!best || better(candidate.score, best.score))) {
            best = candidate;
          }
        }
      }
      if (best) {
        ({ boxes, lines } = best);
      }
    }
    const current = boxes[index]!;
    const cutY = cuts.y.find((cut) => current.top < cut && cut < current.bottom);
    if (cutY !== undefined) {
      let best: Candidate | undefined;
      for (const dy of [cutY - current.bottom - MARGIN, cutY - current.top + MARGIN]) {
        const candidate = moveY(boxes, lines, index, dy, cuts, size);
        if (candidate && (!best || better(candidate.score, best.score))) {
          best = candidate;
        }
      }
      if (best) {
        ({ boxes, lines } = best);
      }
    }
  }
  return {
    cards: boxes,
    segments: lines.filter((line): line is Segment => !!line && (line.x1 !== line.x2 || line.y1 !== line.y2)),
  };
}
