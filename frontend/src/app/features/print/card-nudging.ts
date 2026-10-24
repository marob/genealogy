import type { Box, Segment } from './pagination';

/**
 * Moves the cards that overlap a page cut so that they fit entirely on one
 * page, while keeping lines straight and connected.
 *
 * - Horizontal shift: the card's whole vertical drop (down to the horizontal
 *   line joining it to its family) moves with it, and the horizontal line is
 *   stretched or shortened. A jog is only drawn when the drop directly joins
 *   two cards.
 * - The side chosen is first the one where the card's family is (the line
 *   it hangs from), then the shortest move.
 * - A card blocked by its neighbour may push it (block move).
 * - Vertical shift: the drop is stretched or shortened, as long as a visible
 *   line remains.
 * A move that would overlap another card or another cut is rejected: the
 * card then stays cut.
 */

/** Gap left between a moved card and the cut or the neighbouring card. */
const MARGIN = 4;
/** Tolerance for detecting lines or edges that touch. */
const TOUCH = 2;
/** Minimum length of a shortened vertical line. */
const MIN_LINE = 6;
/** Maximum number of cards moved together. */
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

/** Vertical drop from the edge of a card down to its junction. */
interface Chain {
  x: number;
  /** Y coordinate at the card edge. */
  edge: number;
  /** Y coordinate of the junction (horizontal line or another card). */
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

/** Drops starting from the top and bottom of a card. */
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

/** Horizontal line a drop ends on. */
function isJunction(line: Segment, chain: Chain): boolean {
  if (!isHorizontal(line) || !near(line.y1, chain.end)) {
    return false;
  }
  return chain.x >= Math.min(line.x1, line.x2) - TOUCH && chain.x <= Math.max(line.x1, line.x2) + TOUCH;
}

/**
 * Position of a card's family: centre of the horizontal line its drop ends on
 * (middle of the siblings, where the parents' line comes down).
 */
function familyAnchor(lines: Lines, chain: Chain): number | undefined {
  const xs = lines.flatMap((line) =>
    line && isJunction(line, chain) ? [Math.min(line.x1, line.x2), Math.max(line.x1, line.x2)] : [],
  );
  return xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : undefined;
}

/** Card (other than `except`) a drop ends on, if any. */
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

const copyLines = (lines: Lines): Lines => lines.map((line) => (line ? { ...line } : null));

/** Whether the shifted cards of the block stay on the sheet, between cuts and clear of the other cards. */
function fitsX(nextBoxes: Box[], block: Set<number>, cuts: Cuts, size: Size): boolean {
  return [...block].every((i) => {
    const box = nextBoxes[i]!;
    if (box.left < 0 || box.right > size.width || cuts.x.some((cut) => box.left < cut && cut < box.right)) {
      return false;
    }
    return nextBoxes.every((other, j) => block.has(j) || separated(box, other, 'x'));
  });
}

/** Replaces a direct line between two cards with a jog halfway. */
function jogChain(nextLines: Lines, chain: Chain, dx: number): void {
  const middle = (chain.edge + chain.end) / 2;
  chain.segments.forEach((segment) => (nextLines[segment] = null));
  nextLines.push(
    { x1: chain.x, y1: chain.end, x2: chain.x, y2: middle },
    { x1: chain.x, y1: middle, x2: chain.x + dx, y2: middle },
    { x1: chain.x + dx, y1: middle, x2: chain.x + dx, y2: chain.edge },
  );
}

/**
 * Moves the end of a horizontal line found at `from` to `to`, or stretches the
 * line so that it reaches `to`.
 */
function stretchHorizontal(line: Segment, from: number, to: number): void {
  if (near(line.x1, from)) {
    line.x1 = to;
  } else if (near(line.x2, from)) {
    line.x2 = to;
  } else if (to < Math.min(line.x1, line.x2)) {
    if (line.x1 < line.x2) line.x1 = to;
    else line.x2 = to;
  } else if (to > Math.max(line.x1, line.x2)) {
    if (line.x1 > line.x2) line.x1 = to;
    else line.x2 = to;
  }
}

/** Shifts a drop, and stretches the horizontal junction line so that it follows. */
function shiftChain(lines: Lines, nextLines: Lines, chain: Chain, dx: number): void {
  for (const segment of chain.segments) {
    const line = nextLines[segment]!;
    nextLines[segment] = { ...line, x1: line.x1 + dx, x2: line.x2 + dx };
  }
  lines.forEach((line, index) => {
    if (line && isJunction(line, chain)) {
      stretchHorizontal(nextLines[index]!, chain.x, chain.x + dx);
    }
  });
}

/** Whether a drop's family lies in another page column than the card's centre. */
function awayFromFamily(lines: Lines, chain: Chain, center: number, cuts: Cuts): boolean {
  const column = (x: number) => cuts.x.filter((cut) => cut <= x).length;
  const anchor = familyAnchor(lines, chain);
  return anchor !== undefined && column(anchor) !== column(center);
}

/**
 * Reroutes the lines of a block of cards shifted by `dx`, counting the jogs
 * drawn and the drops left away from their family.
 */
function rerouteX(
  boxes: Box[],
  nextBoxes: Box[],
  lines: Lines,
  block: Set<number>,
  dx: number,
  cuts: Cuts,
): { lines: Lines; jogs: number; away: number } {
  const nextLines = copyLines(lines);
  let jogs = 0;
  let away = 0;
  const moved = new Set<number>();
  for (const i of block) {
    const { above, below } = chainsOf(lines, boxes[i]!);
    const center = (nextBoxes[i]!.left + nextBoxes[i]!.right) / 2;
    for (const chain of [...above, ...below]) {
      if (chain.segments.some((segment) => moved.has(segment))) {
        continue;
      }
      chain.segments.forEach((segment) => moved.add(segment));
      if (cardAt(boxes, chain, block) !== undefined && chain.segments.length > 0) {
        jogs++;
        jogChain(nextLines, chain, dx);
        continue;
      }
      if (awayFromFamily(lines, chain, center, cuts)) {
        away++;
      }
      shiftChain(lines, nextLines, chain, dx);
    }
  }
  return { lines: nextLines, jogs, away };
}

/** Horizontal shift of a block of cards, or `undefined` if impossible. */
function moveX(
  boxes: Box[],
  lines: Lines,
  block: Set<number>,
  dx: number,
  cuts: Cuts,
  size: Size,
): Candidate | undefined {
  const nextBoxes = boxes.map((box, i) => (block.has(i) ? shifted(box, dx, 0) : box));
  if (!fitsX(nextBoxes, block, cuts, size)) {
    return undefined;
  }
  const rerouted = rerouteX(boxes, nextBoxes, lines, block, dx, cuts);
  return {
    boxes: nextBoxes,
    lines: rerouted.lines,
    score: [rerouted.jogs, rerouted.away, block.size, Math.abs(dx)],
  };
}

/** Block of cards pushed by `index` during a shift of `dx`. */
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

/** Vertical shift of a card, or `undefined` if impossible. */
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
  const nextLines = copyLines(lines);
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

/** Cards directly joined to those of the block by a vertical line (no horizontal line). */
function linkedBlock(boxes: Box[], lines: Lines, block: Set<number>): Set<number> | undefined {
  const linked = new Set(block);
  for (let grown = true; grown;) {
    grown = false;
    for (const i of linked) {
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

/** Vertical segments of the same line as `start`, marked as `seen`. */
function collectVerticalLine(start: Segment, vertical: Segment[], seen: Set<Segment>): Segment[] {
  const group = [start];
  seen.add(start);
  // The traversal also visits segments added along the way.
  for (const line of group) {
    for (const other of vertical) {
      if (seen.has(other) || !near(other.x1, line.x1)) {
        continue;
      }
      if ([other.y1, other.y2].some((y) => near(y, line.y1) || near(y, line.y2))) {
        group.push(other);
        seen.add(other);
      }
    }
  }
  return group;
}

/**
 * Aligns the segments of a single vertical line: they come from different
 * tree elements and may differ by one pixel, which shows when printed.
 */
export function alignVerticalChains(segments: Segment[]): Segment[] {
  const lines = segments.map((segment) => ({ ...segment }));
  const vertical = lines.filter(isVertical);
  const seen = new Set<Segment>();
  for (const start of vertical) {
    if (seen.has(start)) {
      continue;
    }
    const group = collectVerticalLine(start, vertical, seen);
    const longest = group.reduce((a, b) => (Math.abs(b.y2 - b.y1) > Math.abs(a.y2 - a.y1) ? b : a), start);
    for (const line of group) {
      line.x1 = longest.x1;
      line.x2 = longest.x1;
    }
  }
  return lines;
}

/** Candidate with the best score (the first one on a tie). */
function bestOf(candidates: (Candidate | undefined)[]): Candidate | undefined {
  let best: Candidate | undefined;
  for (const candidate of candidates) {
    if (candidate && (!best || better(candidate.score, best.score))) {
      best = candidate;
    }
  }
  return best;
}

/** Best horizontal move of a card overlapping a vertical cut, if any. */
function nudgeX(boxes: Box[], lines: Lines, index: number, cuts: Cuts, size: Size): Candidate | undefined {
  const box = boxes[index]!;
  const cutX = cuts.x.find((cut) => box.left < cut && cut < box.right);
  if (cutX === undefined) {
    return undefined;
  }
  const candidates = [cutX - box.right - MARGIN, cutX - box.left + MARGIN].flatMap((dx) => {
    // Alone (or pushing its neighbours), then with the cards joined to it by a
    // direct line, to avoid a jog.
    const pushed = pushedBlock(boxes, index, dx);
    const linked = pushed && linkedBlock(boxes, lines, pushed);
    return [pushed, linked].map((block) => block && moveX(boxes, lines, block, dx, cuts, size));
  });
  return bestOf(candidates);
}

/** Best vertical move of a card overlapping a horizontal cut, if any. */
function nudgeY(boxes: Box[], lines: Lines, index: number, cuts: Cuts, size: Size): Candidate | undefined {
  const box = boxes[index]!;
  const cutY = cuts.y.find((cut) => box.top < cut && cut < box.bottom);
  if (cutY === undefined) {
    return undefined;
  }
  return bestOf(
    [cutY - box.bottom - MARGIN, cutY - box.top + MARGIN].map((dy) => moveY(boxes, lines, index, dy, cuts, size)),
  );
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
    const movedX = nudgeX(boxes, lines, index, cuts, size);
    if (movedX) {
      ({ boxes, lines } = movedX);
    }
    const movedY = nudgeY(boxes, lines, index, cuts, size);
    if (movedY) {
      ({ boxes, lines } = movedY);
    }
  }
  return {
    cards: boxes,
    segments: lines.filter((line): line is Segment => !!line && (line.x1 !== line.x2 || line.y1 !== line.y2)),
  };
}
