import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { PersonDto } from '@genealogie/shared';
import { person } from '../../../testing/test-helpers';
import { ApiService } from '../../core/api.service';
import { TreeController } from './tree-controller';

const family: Record<string, PersonDto> = {
  I0: person({
    id: 'I0',
    givenNames: 'Pierre',
    unions: [{ familyId: 'F0', childIds: ['I1'], events: [], restricted: false }],
  }),
  I1: person({
    id: 'I1',
    givenNames: 'Émile',
    fatherId: 'I0',
    unions: [{ familyId: 'F1', partnerId: 'I2', childIds: ['I3', 'I4'], events: [], restricted: false }],
  }),
  I2: person({ id: 'I2', givenNames: 'Hélène', sex: 'F' }),
  I3: person({ id: 'I3', givenNames: 'François', fatherId: 'I1', motherId: 'I2' }),
  I4: person({ id: 'I4', givenNames: 'Zoé', sex: 'F', fatherId: 'I1', motherId: 'I2', restricted: true }),
};

describe('TreeController', () => {
  let tree: TreeController;

  beforeEach(() => {
    const api: Partial<ApiService> = {
      person: (id) => Promise.resolve(family[id]),
      lineage: () => Promise.resolve([]),
      people: (ids) => Promise.resolve(ids.filter((id): id is string => !!id && !!family[id]).map((id) => family[id]!)),
    };
    TestBed.configureTestingModule({
      providers: [TreeController, provideRouter([]), { provide: ApiService, useValue: api }],
    });
    tree = TestBed.inject(TreeController);
  });

  it('charge la racine avec parents, enfants et conjoints', async () => {
    await tree.load('I1');
    const root = tree.root()!;
    expect(root.person.id).toBe('I1');
    expect(root.parents()?.map((n) => n.person.id)).toEqual(['I0']);
    expect(root.children()?.map((n) => n.person.id)).toEqual(['I3', 'I4']);
    expect(root.partners().map((n) => n.person.id)).toEqual(['I2']);
    expect(tree.focusVersion()).toBe(1);
  });

  it('déplie et replie les ascendants et descendants', async () => {
    await tree.load('I1');
    const root = tree.root()!;
    await tree.toggleParents(root);
    expect(root.parents()).toBeUndefined();
    await tree.toggleParents(root);
    expect(root.parents()).toHaveLength(1);

    const child = root.children()![0]!;
    expect(child.children()).toBeUndefined();
    await tree.toggleChildren(child);
    // François n'a pas d'enfant : rien à déplier.
    expect(child.children()).toBeUndefined();
  });

  it('déplie récursivement tous les ascendants et descendants', async () => {
    await tree.load('I3', { ancestors: 5, descendants: 5 });
    const root = tree.root()!;
    const father = root.parents()!.find((n) => n.person.id === 'I1')!;
    expect(father.parents()?.map((n) => n.person.id)).toEqual(['I0']);
    expect(father.parents()![0]!.parents()).toBeUndefined();
  });

  it('limite le dépliage au nombre de générations demandé', async () => {
    await tree.load('I3', { ancestors: 1, descendants: 0 });
    expect(
      tree
        .root()!
        .parents()!
        .find((n) => n.person.id === 'I1')!
        .parents(),
    ).toBeUndefined();
  });

  it('ne boucle pas sur une personne qui serait son propre ascendant', async () => {
    family['I0'] = { ...family['I0']!, fatherId: 'I1' };
    await tree.load('I1');
    await tree.expandAll('ancestors');
    const grandfather = tree.root()!.parents()![0]!;
    expect(grandfather.person.id).toBe('I0');
    // I1 est déjà sur le chemin : il n'est pas réaffiché comme parent de I0.
    expect(grandfather.parents()).toBeUndefined();
    family['I0'] = { ...family['I0'], fatherId: undefined };
  });

  it('signale une personne introuvable', async () => {
    await tree.load('inconnu');
    expect(tree.notFound()).toBe(true);
    expect(tree.root()).toBeUndefined();
  });
});
