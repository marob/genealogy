import { alignVerticalChains, moveCutCards } from './card-nudging';
import type { Segment } from './pagination';

const card = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });
const line = (x1: number, y1: number, x2: number, y2: number): Segment => ({ x1, y1, x2, y2 });
const size = { width: 400, height: 300 };
const sorted = (lines: Segment[]) =>
  [...lines].sort((a, b) => a.x1 - b.x1 || a.y1 - b.y1 || a.x2 - b.x2 || a.y2 - b.y2);

describe('moveCutCards', () => {
  it('garde les traits droits : la descente suit la carte et le trait horizontal s’allonge', () => {
    // Fratrie reliée par un trait horizontal (y=20) ; l'enfant de droite chevauche la coupe x=100.
    const result = moveCutCards(
      [card(0, 50, 60, 90), card(80, 50, 140, 90)],
      [line(30, 20, 110, 20), line(30, 20, 30, 50), line(110, 20, 110, 50)],
      { x: [100], y: [] },
      size,
    );
    // À gauche, il faudrait pousser la carte voisine hors de l'arbre : la carte part à droite.
    expect(result.cards[1]).toEqual(card(104, 50, 164, 90));
    expect(sorted(result.segments)).toEqual(
      sorted([line(30, 20, 134, 20), line(30, 20, 30, 50), line(134, 20, 134, 50)]),
    );
  });

  it('préfère le côté où se trouve la famille de la carte, même plus loin', () => {
    // La carte est surtout à gauche de la coupe (décalage de 14 à gauche contre 64 à droite),
    // mais sa fratrie est à droite : le trait horizontal va de sa descente (x=75) à x=300.
    const result = moveCutCards(
      [card(40, 50, 110, 90)],
      [line(75, 20, 300, 20), line(75, 20, 75, 50)],
      { x: [100], y: [] },
      size,
    );
    expect(result.cards[0]).toEqual(card(104, 50, 174, 90));
    expect(sorted(result.segments)).toEqual(sorted([line(139, 20, 300, 20), line(139, 20, 139, 50)]));
  });

  it('déplace ensemble deux cartes reliées par un trait direct, pour garder le trait droit', () => {
    const result = moveCutCards(
      [card(80, 50, 140, 90), card(80, 0, 140, 20)],
      [line(110, 20, 110, 50)],
      { x: [100], y: [] },
      size,
    );
    expect(result.cards).toEqual([card(104, 50, 164, 90), card(104, 0, 164, 20)]);
    expect(result.segments).toEqual([line(134, 20, 134, 50)]);
  });

  it('dessine un crochet en dernier recours, si la carte reliée ne peut pas bouger', () => {
    // La carte du dessus est bloquée par sa voisine (x=170).
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

  it('pousse la carte voisine quand elle bloque le déplacement', () => {
    const result = moveCutCards(
      [card(80, 50, 140, 90), card(150, 50, 200, 90), card(0, 50, 60, 90)],
      [],
      { x: [100], y: [] },
      size,
    );
    // Vers la droite (24) en poussant la voisine ; vers la gauche, la carte de gauche bloque.
    expect(result.cards[0]).toEqual(card(104, 50, 164, 90));
    expect(result.cards[1]).toEqual(card(174, 50, 224, 90));
  });

  it('ignore la marge horizontale pour une carte d’une autre rangée très proche', () => {
    // Une carte juste au-dessus (2 px) ne doit pas bloquer un décalage horizontal.
    const result = moveCutCards([card(80, 50, 140, 90), card(150, 0, 220, 48)], [], { x: [100], y: [] }, size);
    expect(result.cards[0]).toEqual(card(104, 50, 164, 90));
  });

  it('remonte une carte en raccourcissant toute sa descente, pas seulement le dernier tronçon', () => {
    // Descente de 50 en deux tronçons (28 + 22) ; la carte doit remonter de 34.
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

  it('laisse la carte coupée si aucun déplacement n’est possible', () => {
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
  it('aligne les tronçons d’un même trait vertical sur le plus long', () => {
    expect(alignVerticalChains([line(100, 0, 100, 40), line(100.8, 40, 100.8, 60), line(300, 0, 300, 10)])).toEqual([
      line(100, 0, 100, 40),
      line(100, 40, 100, 60),
      line(300, 0, 300, 10),
    ]);
  });
});
