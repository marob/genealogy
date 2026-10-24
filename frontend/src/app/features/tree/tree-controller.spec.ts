import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { PersonDto } from '@genealogie/shared';
import { person } from '../../../testing/test-helpers';
import { ApiService } from '../../core/api.service';
import { NotificationsService } from '../../core/notifications.service';
import { MAX_RENDERED_NODES, TreeController } from './tree-controller';
import type { TreeNode } from './tree-node';

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

function countAncestors(node: TreeNode): number {
  return (node.parents() ?? []).reduce((count, parent) => count + 1 + countAncestors(parent), 0);
}

/** Resolves a promise on demand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

describe('TreeController', () => {
  let tree: TreeController;
  let api: Partial<ApiService>;

  beforeEach(() => {
    api = {
      person: (id) => Promise.resolve(family[id]),
      lineage: () => Promise.resolve([]),
      people: (ids) => Promise.resolve(ids.filter((id): id is string => !!id && !!family[id]).map((id) => family[id]!)),
    };
    TestBed.configureTestingModule({
      providers: [TreeController, provideRouter([]), { provide: ApiService, useValue: api }],
    });
    tree = TestBed.inject(TreeController);
  });

  it('loads the root with parents, children and spouses', async () => {
    await tree.load('I1');
    const root = tree.root()!;
    expect(root.person.id).toBe('I1');
    expect(root.parents()?.map((n) => n.person.id)).toEqual(['I0']);
    expect(root.children()?.map((n) => n.person.id)).toEqual(['I3', 'I4']);
    expect(root.partners().map((n) => n.person.id)).toEqual(['I2']);
    expect(tree.focusVersion()).toBe(1);
  });

  it('expands and collapses ancestors and descendants', async () => {
    await tree.load('I1');
    const root = tree.root()!;
    await tree.toggleParents(root);
    expect(root.parents()).toBeUndefined();
    await tree.toggleParents(root);
    expect(root.parents()).toHaveLength(1);

    const child = root.children()![0]!;
    expect(child.children()).toBeUndefined();
    await tree.toggleChildren(child);
    // François has no children: nothing to expand.
    expect(child.children()).toBeUndefined();
  });

  it('recursively expands all ancestors and descendants', async () => {
    await tree.load('I3', { ancestors: 5, descendants: 5 });
    const root = tree.root()!;
    const father = root.parents()!.find((n) => n.person.id === 'I1')!;
    expect(father.parents()?.map((n) => n.person.id)).toEqual(['I0']);
    expect(father.parents()![0]!.parents()).toBeUndefined();
  });

  it('limits expansion to the requested number of generations', async () => {
    await tree.load('I3', { ancestors: 1, descendants: 0 });
    expect(
      tree
        .root()!
        .parents()!
        .find((n) => n.person.id === 'I1')!
        .parents(),
    ).toBeUndefined();
  });

  it('does not loop on a person who would be their own ancestor', async () => {
    family['I0'] = { ...family['I0']!, fatherId: 'I1' };
    await tree.load('I1');
    await tree.expandAll('ancestors');
    const grandfather = tree.root()!.parents()![0]!;
    expect(grandfather.person.id).toBe('I0');
    // I1 is already on the path: it is not displayed again as a parent of I0.
    expect(grandfather.parents()).toBeUndefined();
    family['I0'] = { ...family['I0'], fatherId: undefined };
  });

  it('reports a person that cannot be found', async () => {
    await tree.load('inconnu');
    expect(tree.notFound()).toBe(true);
    expect(tree.root()).toBeUndefined();
  });

  it('ignores the response of a load overtaken by a newer one', async () => {
    const slow = deferred<PersonDto | undefined>();
    api.person = (id) => (id === 'I1' ? slow.promise : Promise.resolve(family[id]));
    const first = tree.load('I1');
    await tree.load('I3');
    expect(tree.root()?.person.id).toBe('I3');
    expect(tree.loading()).toBe(false);

    slow.resolve(family['I1']);
    await first;
    expect(tree.root()?.person.id).toBe('I3');
    expect(tree.loading()).toBe(false);
  });

  it('stays loading until the latest load completes', async () => {
    const slow = deferred<PersonDto | undefined>();
    api.person = (id) => (id === 'I3' ? slow.promise : Promise.resolve(family[id]));
    const second = Promise.resolve().then(() => tree.load('I3'));
    await tree.load('I1');
    await Promise.resolve();
    expect(tree.loading()).toBe(true);
    slow.resolve(family['I3']);
    await second;
    expect(tree.root()?.person.id).toBe('I3');
    expect(tree.loading()).toBe(false);
  });

  it('reports a 404 as a person that cannot be found', async () => {
    api.person = vi.fn().mockRejectedValue(new HttpErrorResponse({ status: 404 }));
    await tree.load('I9');
    expect(tree.notFound()).toBe(true);
    expect(TestBed.inject(NotificationsService).items()).toEqual([]);
  });

  it('notifies other errors instead of showing an empty tree', async () => {
    api.person = vi.fn().mockRejectedValue(new HttpErrorResponse({ status: 500 }));
    await tree.load('I1');
    expect(tree.notFound()).toBe(false);
    expect(tree.root()).toBeUndefined();
    expect(tree.loading()).toBe(false);
    expect(
      TestBed.inject(NotificationsService)
        .items()
        .map((item) => item.kind),
    ).toEqual(['error']);
  });

  it('stops expanding past the node budget on pedigree collapse', async () => {
    // Every couple of generation n are the parents of both people of generation n - 1:
    // the displayed ancestry doubles at each generation.
    const collapsed: Record<string, PersonDto> = {};
    for (let generation = 0; generation < 20; generation++) {
      for (const side of ['A', 'B']) {
        collapsed[`${side}${generation}`] = person({
          id: `${side}${generation}`,
          fatherId: `A${generation + 1}`,
          motherId: `B${generation + 1}`,
        });
      }
    }
    api.person = (id) => Promise.resolve(collapsed[id]);
    api.people = (ids) =>
      Promise.resolve(ids.filter((id): id is string => !!id && !!collapsed[id]).map((id) => collapsed[id]!));

    await tree.load('A0', { ancestors: 20, descendants: 0 });
    const count = countAncestors(tree.root()!);
    expect(tree.truncated()).toBe(true);
    expect(count).toBeLessThan(MAX_RENDERED_NODES);
    expect(count).toBeGreaterThan(MAX_RENDERED_NODES / 2);

    await tree.load('A0', { ancestors: 5, descendants: 0 });
    expect(tree.truncated()).toBe(false);
    expect(countAncestors(tree.root()!)).toBe(2 + 4 + 8 + 16 + 32);
  });
});
