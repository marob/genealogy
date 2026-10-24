import { alignVerticalChains, moveCutCards } from './card-nudging';

/**
 * Découpage d'un arbre en pages pour l'impression papier.
 *
 * Les pages forment une grille régulière pour pouvoir être assemblées bord à
 * bord : toutes les pages intérieures sont pleines, seules les pages du bord
 * de l'arbre sont partielles (calées contre leur voisine : la première rangée
 * en bas, la première colonne à droite). La grille est la même pour toute
 * l'arbre (mêmes colonnes à chaque rangée), si bien qu'un trait qui traverse
 * un bord de page se prolonge exactement sur la page voisine. Son décalage est
 * choisi pour que les coupes passent au mieux entre les cartes.
 */

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Tile {
  /** Portion de l'arbre affichée. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Position de cette portion dans la page (calage contre les pages voisines). */
  offsetX: number;
  offsetY: number;
  row: number;
  col: number;
}

/** Espace souhaité entre une coupe et le bord d'une carte (absorbe les arrondis du zoom). */
const GAP = 6;

interface Grid {
  /** Positions de coupe `[0, c1, …, total]`. */
  cuts: number[];
  /** Espace laissé avant le contenu sur la première page. */
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

/** Comparaison lexicographique de deux scores (le plus petit gagne). */
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
 * Grille de coupes le long d'un axe pour des pages de longueur `max` :
 * les coupes sont espacées exactement de `max`, la première page étant
 * partielle. Le décalage retenu produit le moins de pages, puis coupe le
 * moins de cartes possible (`spans` sont leurs intervalles [début, fin]),
 * puis laisse le plus de marge autour des coupes.
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
    // Le moins de pages d'abord (les cartes coupées peuvent ensuite être déplacées).
    const score = [cuts.length, crossings(spans, inner, 0), crossings(spans, inner, GAP), offset];
    if (!best || better(score, best.score)) {
      best = { grid: { cuts, offset }, score };
    }
  }
  return best!.grid;
}

/** Nombre de cartes traversées par les coupes des pages. */
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

/** Pages (ligne par ligne) couvrant un arbre de taille `size` avec des pages de taille `page`. */
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
        // La première rangée / colonne est calée contre la suivante.
        offsetX: col === 0 && columns.cuts.length > 2 ? page.width - width : 0,
        offsetY: row === 0 && rows.cuts.length > 2 ? page.height - (bottom - top) : 0,
        row,
        col,
      });
    }
  }
  return tiles;
}

/** Trait de liaison entre deux cartes, en coordonnées de l'arbre. */
export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface LayoutInput {
  /** Cartes des personnes. */
  cards: Box[];
  /** Petits éléments à reporter tels quels (anneaux d'union…). */
  marks: Box[];
  segments: Segment[];
  size: { width: number; height: number };
  page: { width: number; height: number };
  /** Ne pas produire les pages sans aucune carte. */
  skipEmpty: boolean;
}

interface PageLayout extends Tile {
  /** Indices (dans `LayoutInput`) des éléments visibles sur la page. */
  cards: number[];
  marks: number[];
  segments: number[];
}

export interface Layout {
  pages: PageLayout[];
  /** Cartes et traits après déplacement des cartes qui chevauchaient une coupe. */
  cardBoxes: Box[];
  segments: Segment[];
  /** Cartes qu'aucune coupe n'a pu éviter. */
  cutCards: number;
  /** Pages vides écartées. */
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

/** Découpage en pages et répartition des éléments à dessiner sur chacune. */
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
