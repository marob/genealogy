import { signal } from '@angular/core';
import type { PersonDto } from '@genealogie/shared';

/** Part of the tree a node is displayed in. */
export type TreePart = 'root' | 'parents' | 'children';

let nextUid = 1;

/** Displayed tree node; parents and children are expanded on demand. */
export class TreeNode {
  /** Display identifier (the same person may appear several times). */
  readonly uid = nextUid++;

  readonly parents = signal<TreeNode[] | undefined>(undefined);
  readonly children = signal<TreeNode[] | undefined>(undefined);
  readonly partners = signal<TreeNode[]>([]);

  constructor(readonly person: PersonDto) {}

  get hasParents(): boolean {
    return !!this.person.fatherId || !!this.person.motherId;
  }

  /** Children of all unions, without duplicates, in union order. */
  get childIds(): string[] {
    return [...new Set(this.person.unions.flatMap((union) => union.childIds))];
  }
}
