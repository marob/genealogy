import { alignVerticalChains, moveCutCards } from './card-nudging';

/**
 * Splitting a tree into pages for paper printing.
 *
 * Pages form a regular grid so they can be assembled edge to edge: all inner
 * pages are full, only the pages on the tree's border are partial (aligned
 * against their neighbour: the first row to the bottom, the first column to
 * the right). The grid is the same for the whole tree (same columns in every
 * row), so a line crossing a page edge continues exactly on the neighbouring
 * page. Its offset is chosen so that cuts fall between cards as much as
 * possible.
 */

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Tile {
  /** Displayed portion of the tree. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Position of this portion within the page (aligned against neighbouring pages). */
  offsetX: number;
  offsetY: number;
  row: number;
  col: number;
}

/** Desired gap between a cut and a card edge (absorbs zoom rounding). */
const GAP = 6;

interface Grid {
  /** Cut positions `[0, c1, …, total]`. */
  cuts: number[];
  /** Space left before the content on the first page. */
  offset: number;
}

function crossings(spans: [number, number][], cuts: number[], gap: number): number {
  let count = 0;
  for (const [from, to] of spans) {
    if (cuts.some((cut) => from - gap < cut && cut < to + gap)) {
      count++;
    }
  }
  return count;
}

/** Lexicographic comparison of two scores (lowest wins). */
function better(score: number[], than: number[]): boolean {
  const index = score.findIndex((value, i) => value !== than[i]);
  return index >= 0 && score[index]! < than[index]!;
}

function gridFor(offset: number, total: number, max: number): number[] {
  const cuts = [0];
  for (let cut = max - offset; cut < total; cut += max) {
    cuts.push(cut);
  }
  cuts.push(total);
  return cuts;
}

/**
 * Grid of cuts along one axis for pages of length `max`: cuts are exactly
 * `max` apart, the first page being partial. The chosen offset produces the
 * fewest pages, then cuts as few cards as possible (`spans` are their
 * [start, end] intervals), then leaves the most margin around the cuts.
 */
export function gridCuts(spans: [number, number][], total: number, max: number): Grid {
  if (total <= max) {
    return { cuts: [0, total], offset: 0 };
  }
  const modulo = (value: number) => ((value % max) + max) % max;
  const offsets = new Set([0]);
  for (const [from, to] of spans) {
    for (const edge of [from - GAP, to + GAP, from, to]) {
      offsets.add(modulo(-edge));
    }
  }
  let best: { grid: Grid; score: number[] } | undefined;
  for (const offset of offsets) {
    const cuts = gridFor(offset, total, max);
    const inner = cuts.slice(1, -1);
    // Fewest pages first (cut cards can be moved afterwards).
    const score = [cuts.length, crossings(spans, inner, 0), crossings(spans, inner, GAP), offset];
    if (!best || better(score, best.score)) {
      best = { grid: { cuts, offset }, score };
    }
  }
  return best!.grid;
}

/** Number of cards crossed by page cuts. */
export function countCutCards(cards: Box[], tiles: Tile[]): number {
  return cards.filter((card) =>
    tiles.some(
      (tile) =>
        card.right > tile.x &&
        card.left < tile.x + tile.width &&
        card.bottom > tile.y &&
        card.top < tile.y + tile.height &&
        (card.left < tile.x ||
          card.right > tile.x + tile.width ||
          card.top < tile.y ||
          card.bottom > tile.y + tile.height),
    ),
  ).length;
}

/** Pages (row by row) covering a tree of size `size` with pages of size `page`. */
export function paginate(
  cards: Box[],
  size: { width: number; height: number },
  page: { width: number; height: number },
): Tile[] {
  const rows = gridCuts(
    cards.map((card) => [card.top, card.bottom]),
    size.height,
    page.height,
  );
  const columns = gridCuts(
    cards.map((card) => [card.left, card.right]),
    size.width,
    page.width,
  );
  const tiles: Tile[] = [];
  for (let row = 0; row < rows.cuts.length - 1; row++) {
    const top = rows.cuts[row]!;
    const bottom = rows.cuts[row + 1]!;
    for (let col = 0; col < columns.cuts.length - 1; col++) {
      const left = columns.cuts[col]!;
      const width = columns.cuts[col + 1]! - left;
      tiles.push({
        x: left,
        y: top,
        width,
        height: bottom - top,
        // The first row / column is aligned against the next one.
        offsetX: col === 0 && columns.cuts.length > 2 ? page.width - width : 0,
        offsetY: row === 0 && rows.cuts.length > 2 ? page.height - (bottom - top) : 0,
        row,
        col,
      });
    }
  }
  return tiles;
}

/** Connecting line between two cards, in tree coordinates. */
export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface LayoutInput {
  /** Person cards. */
  cards: Box[];
  /** Small elements copied as is (union rings…). */
  marks: Box[];
  segments: Segment[];
  size: { width: number; height: number };
  page: { width: number; height: number };
  /** Do not produce pages without any card. */
  skipEmpty: boolean;
}

interface PageLayout extends Tile {
  /** Indices (in `LayoutInput`) of the elements visible on the page. */
  cards: number[];
  marks: number[];
  segments: number[];
}

export interface Layout {
  pages: PageLayout[];
  /** Cards and lines after moving the cards that overlapped a cut. */
  cardBoxes: Box[];
  segments: Segment[];
  /** Cards that no cut could avoid. */
  cutCards: number;
  /** Dropped empty pages. */
  skipped: number;
}

function intersects(box: Box, tile: Tile): boolean {
  return box.right > tile.x && box.left < tile.x + tile.width && box.bottom > tile.y && box.top < tile.y + tile.height;
}

function segmentBox(segment: Segment): Box {
  return {
    left: Math.min(segment.x1, segment.x2),
    top: Math.min(segment.y1, segment.y2),
    right: Math.max(segment.x1, segment.x2) + 1,
    bottom: Math.max(segment.y1, segment.y2) + 1,
  };
}

/** Splits into pages and distributes the elements to draw on each one. */
export function layoutPages(input: LayoutInput): Layout {
  const grid = paginate(input.cards, input.size, input.page);
  const moved = moveCutCards(
    input.cards,
    alignVerticalChains(input.segments),
    {
      x: [...new Set(grid.filter((tile) => tile.x > 0).map((tile) => tile.x))],
      y: [...new Set(grid.filter((tile) => tile.y > 0).map((tile) => tile.y))],
    },
    input.size,
  );
  const segmentBoxes = moved.segments.map(segmentBox);
  const indices = (boxes: Box[], tile: Tile) => boxes.flatMap((box, index) => (intersects(box, tile) ? [index] : []));
  const all = grid.map((tile) => ({
    ...tile,
    cards: indices(moved.cards, tile),
    marks: indices(input.marks, tile),
    segments: indices(segmentBoxes, tile),
  }));
  const pages = input.skipEmpty ? all.filter((page) => page.cards.length > 0) : all;
  return {
    pages,
    cardBoxes: moved.cards,
    segments: moved.segments,
    cutCards: countCutCards(moved.cards, grid),
    skipped: all.length - pages.length,
  };
}
