import { signal } from '@angular/core';
import type { PersonDto } from '@genealogie/shared';

/** Partie de l'arbre dans laquelle un nœud est affiché. */
export type TreePart = 'root' | 'parents' | 'children';

let nextUid = 1;

/** Nœud de l'arbre affiché ; parents et enfants sont dépliés à la demande. */
export class TreeNode {
  /** Identifiant d'affichage (une même personne peut apparaître plusieurs fois). */
  readonly uid = nextUid++;

  readonly parents = signal<TreeNode[] | undefined>(undefined);
  readonly children = signal<TreeNode[] | undefined>(undefined);
  readonly partners = signal<TreeNode[]>([]);

  constructor(readonly person: PersonDto) {}

  get hasParents(): boolean {
    return !!this.person.fatherId || !!this.person.motherId;
  }

  /** Enfants de toutes les unions, sans doublon, dans l'ordre des unions. */
  get childIds(): string[] {
    return [...new Set(this.person.unions.flatMap((union) => union.childIds))];
  }
}
