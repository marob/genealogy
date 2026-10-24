import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { PersonDto } from '@genealogie/shared';
import { ApiService } from '../../core/api.service';
import { TreeNode } from './tree-node';

/**
 * État et actions de l'arbre, partagés par les nœuds affichés récursivement.
 * Fourni au niveau de la page de l'arbre.
 */
/** Profondeur maximale acceptée par l'API. */
export const MAX_GENERATIONS = 50;

@Injectable()
export class TreeController {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly root = signal<TreeNode | undefined>(undefined);
  readonly selected = signal<PersonDto | undefined>(undefined);
  readonly loading = signal(false);
  readonly notFound = signal(false);
  /** Incrémenté à chaque nouvelle racine, pour recentrer la vue. */
  readonly focusVersion = signal(0);
  /**
   * Appelé juste avant de déplier ou replier un nœud, avec ce nœud : la page
   * mémorise sa position à l'écran pour le garder immobile.
   */
  beforeChange?: (node: TreeNode) => void;

  /**
   * Charge la personne centrale. Sans `generations`, seuls ses parents,
   * enfants et conjoints sont affichés ; sinon toute la lignée demandée.
   */
  async load(id: string, generations?: { ancestors: number; descendants: number }): Promise<void> {
    this.loading.set(true);
    this.notFound.set(false);
    try {
      if (generations) {
        // Lignée complète (mémorisée par l'API) ; le dépliage applique ensuite la profondeur voulue.
        await this.api.lineage(id, { ancestors: MAX_GENERATIONS, descendants: MAX_GENERATIONS });
      }
      const person = await this.api.person(id, ['parents', 'children', 'unions']);
      if (!person) {
        this.notFound.set(true);
        this.root.set(undefined);
        return;
      }
      const root = new TreeNode(person);
      await Promise.all([
        generations ? this.expandParents(root, generations.ancestors, new Set([id])) : this.showParents(root),
        generations ? this.expandChildren(root, generations.descendants, new Set([id])) : this.showChildren(root),
        this.showPartners(root),
      ]);
      this.root.set(root);
      this.focusVersion.update((version) => version + 1);
    } catch {
      this.notFound.set(true);
      this.root.set(undefined);
    } finally {
      this.loading.set(false);
    }
  }

  focus(person: PersonDto): void {
    void this.router.navigate(['/tree', person.id]);
  }

  select(person: PersonDto | undefined): void {
    this.selected.set(person);
  }

  async toggleParents(node: TreeNode): Promise<void> {
    this.beforeChange?.(node);
    if (node.parents()) {
      node.parents.set(undefined);
    } else {
      await this.showParents(node);
    }
  }

  async toggleChildren(node: TreeNode): Promise<void> {
    this.beforeChange?.(node);
    if (node.children()) {
      node.children.set(undefined);
    } else {
      await this.showChildren(node);
    }
  }

  /** Déplie récursivement tous les ascendants ou descendants de la racine. */
  async expandAll(direction: 'ancestors' | 'descendants', generations = MAX_GENERATIONS): Promise<void> {
    const root = this.root();
    if (!root) {
      return;
    }
    this.beforeChange?.(root);
    this.loading.set(true);
    try {
      await this.api.lineage(root.person.id, {
        ancestors: direction === 'ancestors' ? generations : 0,
        descendants: direction === 'descendants' ? generations : 0,
      });
      const path = new Set([root.person.id]);
      await (direction === 'ancestors'
        ? this.expandParents(root, generations, path)
        : this.expandChildren(root, generations, path));
    } finally {
      this.loading.set(false);
    }
  }

  // Le chemin depuis la racine évite de boucler sur un fichier incohérent.
  private async expandParents(node: TreeNode, depth: number, path: Set<string>): Promise<void> {
    if (depth <= 0 || !node.hasParents) {
      node.parents.set(undefined);
      return;
    }
    const parents = (await this.api.people([node.person.fatherId, node.person.motherId]))
      .filter((parent) => !path.has(parent.id))
      .map((parent) => new TreeNode(parent));
    await Promise.all(
      parents.map((parent) => this.expandParents(parent, depth - 1, new Set(path).add(parent.person.id))),
    );
    node.parents.set(parents.length ? parents : undefined);
  }

  private async expandChildren(node: TreeNode, depth: number, path: Set<string>): Promise<void> {
    if (depth <= 0 || node.childIds.length === 0) {
      node.children.set(undefined);
      return;
    }
    const children = (await this.api.people(node.childIds))
      .filter((child) => !path.has(child.id))
      .map((child) => new TreeNode(child));
    await Promise.all(
      children.map((child) => this.expandChildren(child, depth - 1, new Set(path).add(child.person.id))),
    );
    node.children.set(children.length ? children : undefined);
  }

  private async showParents(node: TreeNode): Promise<void> {
    if (!node.hasParents) {
      return;
    }
    const parents = await this.api.people([node.person.fatherId, node.person.motherId]);
    node.parents.set(parents.map((parent) => new TreeNode(parent)));
  }

  private async showChildren(node: TreeNode): Promise<void> {
    const ids = node.childIds;
    if (ids.length === 0) {
      return;
    }
    const children = await this.api.people(ids);
    node.children.set(children.map((child) => new TreeNode(child)));
  }

  private async showPartners(node: TreeNode): Promise<void> {
    const partners = await this.api.people(node.person.unions.map((union) => union.partnerId));
    node.partners.set(partners.map((partner) => new TreeNode(partner)));
  }
}
