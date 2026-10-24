import { alignVerticalChains, moveCutCards } from './card-nudging';
import type { Segment } from './pagination';

const card = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });
const line = (x1: number, y1: number, x2: number, y2: number): Segment => ({ x1, y1, x2, y2 });
const size = { width: 400, height: 300 };
const sorted = (lines: Segment[]) =>
  [...lines].sort((a, b) => a.x1 - b.x1 || a.y1 - b.y1 || a.x2 - b.x2 || a.y2 - b.y2);

describe('moveCutCards', () => {
  it('keeps lines straight: the drop follows the card and the horizontal line stretches', () => {
    // Siblings joined by a horizontal line (y=20); the right child overlaps the x=100 cut.
    const result = moveCutCards(
      [card(0, 50, 60, 90), card(80, 50, 140, 90)],
      [line(30, 20, 110, 20), line(30, 20, 30, 50), line(110, 20, 110, 50)],
      { x: [100], y: [] },
      size,
    );
    // Moving left would push the neighbouring card out of the tree: the card moves right.
    expect(result.cards[1]).toEqual(card(104, 50, 164, 90));
    expect(sorted(result.segments)).toEqual(
      sorted([line(30, 20, 134, 20), line(30, 20, 30, 50), line(134, 20, 134, 50)]),
    );
  });

  it('prefers the side of the card family, even if farther', () => {
    // The card is mostly left of the cut (14 to move left versus 64 to move right),
    // but its siblings are on the right: the horizontal line runs from its drop (x=75) to x=300.
    const result = moveCutCards(
      [card(40, 50, 110, 90)],
      [line(75, 20, 300, 20), line(75, 20, 75, 50)],
      { x: [100], y: [] },
      size,
    );
    expect(result.cards[0]).toEqual(card(104, 50, 174, 90));
    expect(sorted(result.segments)).toEqual(sorted([line(139, 20, 300, 20), line(139, 20, 139, 50)]));
  });

  it('moves two cards joined by a direct line together, to keep the line straight', () => {
    const result = moveCutCards(
      [card(80, 50, 140, 90), card(80, 0, 140, 20)],
      [line(110, 20, 110, 50)],
      { x: [100], y: [] },
      size,
    );
    expect(result.cards).toEqual([card(104, 50, 164, 90), card(104, 0, 164, 20)]);
    expect(result.segments).toEqual([line(134, 20, 134, 50)]);
  });

  it('draws a jog as a last resort, when the linked card cannot move', () => {
    // The upper card is blocked by its neighbour (x=170).
    const result = moveCutCards(
      [card(80, 50, 140, 90), card(101, 0, 161, 20), card(170, 0, 220, 20)],
      [line(110, 20, 110, 50)],
      { x: [100], y: [] },
      size,
    );
    expect(result.cards[0]).toEqual(card(104, 50, 164, 90));
    expect(sorted(result.segments)).toEqual(
      sorted([line(110, 20, 110, 35), line(110, 35, 134, 35), line(134, 35, 134, 50)]),
    );
  });

  it('stretches the horizontal line beyond its end when the drop leaves it', () => {
    // The drop (x=70) hangs from the middle of a line drawn from right to left;
    // the right side is blocked (the pushed neighbour would leave the sheet).
    const result = moveCutCards(
      [card(60, 50, 120, 90), card(125, 50, 395, 90)],
      [line(300, 20, 65, 20), line(70, 20, 70, 50)],
      { x: [100], y: [] },
      size,
    );
    expect(result.cards[0]).toEqual(card(36, 50, 96, 90));
    expect(sorted(result.segments)).toEqual(sorted([line(300, 20, 46, 20), line(46, 20, 46, 50)]));
  });

  it('pushes the neighbouring card when it blocks the move', () => {
    const result = moveCutCards(
      [card(80, 50, 140, 90), card(150, 50, 200, 90), card(0, 50, 60, 90)],
      [],
      { x: [100], y: [] },
      size,
    );
    // To the right (24) by pushing the neighbour; to the left, the left card blocks.
    expect(result.cards[0]).toEqual(card(104, 50, 164, 90));
    expect(result.cards[1]).toEqual(card(174, 50, 224, 90));
  });

  it('ignores the horizontal margin for a very close card in another row', () => {
    // A card just above (2 px) must not block a horizontal shift.
    const result = moveCutCards([card(80, 50, 140, 90), card(150, 0, 220, 48)], [], { x: [100], y: [] }, size);
    expect(result.cards[0]).toEqual(card(104, 50, 164, 90));
  });

  it('moves a card up by shortening its whole drop, not just the last segment', () => {
    // Drop of 50 in two segments (28 + 22); the card must move up by 34.
    const result = moveCutCards(
      [card(80, 50, 140, 90)],
      [line(110, 0, 140, 0), line(110, 0, 110, 28), line(110, 28, 110, 50)],
      { x: [], y: [60] },
      size,
    );
    expect(result.cards[0]).toEqual(card(80, 64, 140, 104));
    const up = moveCutCards(
      [card(80, 50, 140, 90)],
      [line(110, 0, 140, 0), line(110, 0, 110, 28), line(110, 28, 110, 50)],
      { x: [], y: [80] },
      size,
    );
    expect(up.cards[0]).toEqual(card(80, 36, 140, 76));
    expect(sorted(up.segments)).toEqual(sorted([line(110, 0, 140, 0), line(110, 0, 110, 36)]));
  });

  it('leaves the card cut when no move is possible', () => {
    const cards = [
      card(80, 50, 140, 90),
      card(0, 50, 70, 90),
      card(150, 50, 200, 90),
      card(204, 50, 260, 90),
      card(264, 50, 300, 90),
      card(304, 50, 350, 90),
    ];
    expect(moveCutCards(cards, [], { x: [100, 302], y: [] }, size).cards[0]).toEqual(cards[0]);
  });
});

describe('alignVerticalChains', () => {
  it('aligns the segments of a vertical line on the longest one', () => {
    expect(alignVerticalChains([line(100, 0, 100, 40), line(100.8, 40, 100.8, 60), line(300, 0, 300, 10)])).toEqual([
      line(100, 0, 100, 40),
      line(100, 40, 100, 60),
      line(300, 0, 300, 10),
    ]);
  });
});
