import { person } from '../../../testing/test-helpers';
import { lineageDepth } from './lineage-depth';

describe('lineageDepth', () => {
  const union = (childIds: string[]) => ({ familyId: 'F', childIds, events: [], restricted: false });

  it('compte les générations d’ascendants et de descendants', () => {
    const people = [
      person({ id: 'grand-pere' }),
      person({ id: 'pere', fatherId: 'grand-pere', unions: [union(['moi'])] }),
      person({ id: 'moi', fatherId: 'pere', unions: [union(['fils'])] }),
      person({ id: 'fils', fatherId: 'moi' }),
    ];
    expect(lineageDepth('moi', people)).toEqual({ ancestors: 2, descendants: 1 });
    expect(lineageDepth('grand-pere', people)).toEqual({ ancestors: 0, descendants: 0 });
  });

  it('ignore les personnes non chargées et les boucles', () => {
    const people = [
      person({ id: 'a', fatherId: 'b' }),
      person({ id: 'b', fatherId: 'a' }),
      person({ id: 'c', motherId: 'x' }),
    ];
    expect(lineageDepth('a', people)).toEqual({ ancestors: 1, descendants: 0 });
    expect(lineageDepth('c', people)).toEqual({ ancestors: 0, descendants: 0 });
  });
});
