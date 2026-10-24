import { countCutCards, gridCuts, layoutPages, paginate } from './pagination';

describe('gridCuts', () => {
  it('does not cut what fits on one page', () => {
    expect(gridCuts([[10, 50]], 80, 100)).toEqual({ cuts: [0, 80], offset: 0 });
  });

  it('spaces cuts exactly one page apart, the first page being partial', () => {
    const { cuts, offset } = gridCuts([[0, 10]], 350, 100);
    for (let i = 2; i < cuts.length - 1; i++) {
      expect(cuts[i]! - cuts[i - 1]!).toBe(100);
    }
    expect(cuts[1]).toBe(100 - offset);
    expect(cuts.at(-1)).toBe(350);
  });

  it('shifts the grid so that cuts fall between cards', () => {
    // Rows of 80-high cards every 100, with 20 of space: a shifted 100 grid
    // cuts through the gaps.
    const spans: [number, number][] = Array.from({ length: 5 }, (_, i) => [i * 100, i * 100 + 80]);
    const { cuts } = gridCuts(spans, 480, 100);
    expect(spans.filter(([from, to]) => cuts.some((cut) => from < cut && cut < to))).toEqual([]);
  });

  it('cuts as few cards as possible when no grid avoids them all', () => {
    const spans: [number, number][] = [
      [0, 60],
      [65, 125],
      [130, 190],
      [30, 90],
      [95, 155],
      [160, 220],
    ];
    const { cuts } = gridCuts(spans, 220, 100);
    const cut = spans.filter(([from, to]) => cuts.some((position) => from < position && position < to));
    expect(cut.length).toBeLessThanOrEqual(2);
  });
});

describe('paginate', () => {
  it('aligns the first row to the bottom and the first column to the right', () => {
    const tiles = paginate(
      [
        { left: 0, top: 0, right: 40, bottom: 20 },
        { left: 150, top: 150, right: 190, bottom: 170 },
      ],
      { width: 190, height: 170 },
      { width: 100, height: 100 },
    );
    const first = tiles[0]!;
    expect(first.offsetX + first.width).toBe(100);
    expect(first.offsetY + first.height).toBe(100);
    for (const tile of tiles.filter((t) => t.row > 0 || t.col > 0)) {
      expect(tile.offsetX === 0 || tile.col === 0).toBe(true);
      expect(tile.offsetY === 0 || tile.row === 0).toBe(true);
    }
    // Inner pages are full: only the last row and the last column are partial.
    const rows = Math.max(...tiles.map((t) => t.row));
    for (const tile of tiles.filter((t) => t.row > 0 && t.row < rows)) {
      expect(tile.height).toBe(100);
    }
  });

  it('uses the same columns in every row for a grid assembly', () => {
    const tiles = paginate(
      [
        { left: 0, top: 0, right: 40, bottom: 20 },
        { left: 120, top: 150, right: 160, bottom: 170 },
        { left: 230, top: 300, right: 270, bottom: 320 },
      ],
      { width: 300, height: 320 },
      { width: 100, height: 100 },
    );
    const columnsOf = (row: number) => tiles.filter((t) => t.row === row).map((t) => [t.x, t.width, t.offsetX]);
    const rows = Math.max(...tiles.map((t) => t.row));
    for (let row = 1; row <= rows; row++) {
      expect(columnsOf(row)).toEqual(columnsOf(0));
    }
  });

  it('does not align a single page', () => {
    expect(paginate([], { width: 50, height: 50 }, { width: 100, height: 100 })).toEqual([
      { x: 0, y: 0, width: 50, height: 50, offsetX: 0, offsetY: 0, row: 0, col: 0 },
    ]);
  });
});

describe('countCutCards', () => {
  it('counts the cards straddling two pages', () => {
    const tile = { y: 0, height: 100, offsetX: 0, offsetY: 0, row: 0 };
    const tiles = [
      { ...tile, x: 0, width: 100, col: 0 },
      { ...tile, x: 100, width: 100, col: 1 },
    ];
    expect(
      countCutCards(
        [
          { left: 10, top: 10, right: 50, bottom: 50 },
          { left: 80, top: 10, right: 120, bottom: 50 },
        ],
        tiles,
      ),
    ).toBe(1);
  });
});

describe('layoutPages', () => {
  const input = {
    cards: [
      { left: 0, top: 0, right: 40, bottom: 20 },
      { left: 0, top: 160, right: 40, bottom: 180 },
    ],
    marks: [{ left: 45, top: 5, right: 50, bottom: 10 }],
    segments: [{ x1: 20, y1: 20, x2: 20, y2: 160 }],
    size: { width: 100, height: 180 },
    page: { width: 100, height: 70 },
  };

  it('distributes cards, markers and lines across pages', () => {
    const layout = layoutPages({ ...input, skipEmpty: false });
    expect(layout.pages.length).toBeGreaterThanOrEqual(3);
    const withCard = layout.pages.filter((page) => page.cards.length > 0);
    expect(withCard.map((page) => page.cards)).toEqual([[0], [1]]);
    expect(layout.pages[0]!.marks).toEqual([0]);
    expect(layout.pages.every((page) => page.segments.includes(0))).toBe(true);
    expect(layout.cutCards).toBe(0);
  });

  it('can drop pages without cards', () => {
    const all = layoutPages({ ...input, skipEmpty: false });
    const kept = layoutPages({ ...input, skipEmpty: true });
    expect(kept.pages.every((page) => page.cards.length > 0)).toBe(true);
    expect(kept.skipped).toBe(all.pages.length - kept.pages.length);
    expect(kept.skipped).toBeGreaterThan(0);
  });
});
