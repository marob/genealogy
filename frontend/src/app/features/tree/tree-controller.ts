import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { PersonDto } from '@genealogie/shared';
import { ApiService } from '../../core/api.service';
import { NotificationsService } from '../../core/notifications.service';
import { isNotFound } from '../../core/resources';
import { TreeNode } from './tree-node';

/** Maximum depth accepted by the API. */
export const MAX_GENERATIONS = 50;

/**
 * Maximum number of nodes rendered by a recursive expansion: with pedigree
 * collapse (the same person reached through several lines), the displayed
 * tree can otherwise grow exponentially.
 */
export const MAX_RENDERED_NODES = 3000;

/** Nodes that a recursive expansion may still create. */
interface NodeBudget {
  remaining: number;
  exceeded: boolean;
}

function countNodes(node: TreeNode, direction: 'parents' | 'children'): number {
  return (node[direction]() ?? []).reduce((count, next) => count + 1 + countNodes(next, direction), 0);
}

/**
 * Reserves nodes in the budget: a node's relatives are all displayed, or
 * none of them (they stay expandable by hand).
 */
function reserve(budget: NodeBudget, count: number): boolean {
  if (count > budget.remaining) {
    budget.exceeded = true;
    return false;
  }
  budget.remaining -= count;
  return true;
}

/**
 * Tree state and actions, shared by the recursively rendered nodes.
 * Provided at the tree page level.
 */
@Injectable()
export class TreeController {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationsService);
  /** Identifies the latest load: the responses of older ones are ignored. */
  private request = 0;

  readonly root = signal<TreeNode | undefined>(undefined);
  readonly selected = signal<PersonDto | undefined>(undefined);
  readonly loading = signal(false);
  readonly notFound = signal(false);
  /** The last recursive expansion stopped at `MAX_RENDERED_NODES`. */
  readonly truncated = signal(false);
  /** Incremented on each new root, to recentre the view. */
  readonly focusVersion = signal(0);
  /**
   * Called just before expanding or collapsing a node, with that node: the
   * page records its on-screen position to keep it still.
   */
  beforeChange?: (node: TreeNode) => void;

  /**
   * Loads the central person. Without `generations`, only their parents,
   * children and spouses are displayed; otherwise the whole requested lineage.
   */
  async load(id: string, generations?: { ancestors: number; descendants: number }): Promise<void> {
    const request = ++this.request;
    const current = () => request === this.request;
    this.loading.set(true);
    this.notFound.set(false);
    this.truncated.set(false);
    try {
      if (generations) {
        // Full lineage (cached by the API); expansion then applies the desired depth.
        await this.api.lineage(id, { ancestors: MAX_GENERATIONS, descendants: MAX_GENERATIONS });
      }
      const person = await this.api.person(id, ['parents', 'children', 'unions']);
      if (!current()) {
        return;
      }
      if (!person) {
        this.notFound.set(true);
        this.root.set(undefined);
        return;
      }
      const root = new TreeNode(person);
      const budget: NodeBudget = { remaining: MAX_RENDERED_NODES - 1, exceeded: false };
      await Promise.all([
        generations ? this.expandParents(root, generations.ancestors, new Set([id]), budget) : this.showParents(root),
        generations
          ? this.expandChildren(root, generations.descendants, new Set([id]), budget)
          : this.showChildren(root),
        this.showPartners(root),
      ]);
      if (!current()) {
        return;
      }
      this.root.set(root);
      this.truncated.set(budget.exceeded);
      this.focusVersion.update((version) => version + 1);
    } catch (error) {
      if (!current()) {
        return;
      }
      this.root.set(undefined);
      if (isNotFound(error)) {
        this.notFound.set(true);
      } else {
        this.notifications.error(error);
      }
    } finally {
      if (current()) {
        this.loading.set(false);
      }
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
      return;
    }
    try {
      await this.showParents(node);
    } catch (error) {
      this.notifications.error(error);
    }
  }

  async toggleChildren(node: TreeNode): Promise<void> {
    this.beforeChange?.(node);
    if (node.children()) {
      node.children.set(undefined);
      return;
    }
    try {
      await this.showChildren(node);
    } catch (error) {
      this.notifications.error(error);
    }
  }

  /** Recursively expands all ancestors or descendants of the root. */
  async expandAll(direction: 'ancestors' | 'descendants', generations = MAX_GENERATIONS): Promise<void> {
    const root = this.root();
    if (!root) {
      return;
    }
    // A load started meanwhile owns the loading state and the root.
    const request = this.request;
    const current = () => request === this.request;
    this.beforeChange?.(root);
    this.loading.set(true);
    this.truncated.set(false);
    try {
      await this.api.lineage(root.person.id, {
        ancestors: direction === 'ancestors' ? generations : 0,
        descendants: direction === 'descendants' ? generations : 0,
      });
      // Nodes already displayed in the other direction count towards the budget.
      const shown = 1 + root.partners().length + countNodes(root, direction === 'ancestors' ? 'children' : 'parents');
      const budget: NodeBudget = { remaining: Math.max(0, MAX_RENDERED_NODES - shown), exceeded: false };
      const path = new Set([root.person.id]);
      await (direction === 'ancestors'
        ? this.expandParents(root, generations, path, budget)
        : this.expandChildren(root, generations, path, budget));
      if (current()) {
        this.truncated.set(budget.exceeded);
      }
    } catch (error) {
      if (current()) {
        this.notifications.error(error);
      }
    } finally {
      if (current()) {
        this.loading.set(false);
      }
    }
  }

  // The path from the root prevents looping on an inconsistent file.
  private async expandParents(node: TreeNode, depth: number, path: Set<string>, budget: NodeBudget): Promise<void> {
    if (depth <= 0 || !node.hasParents) {
      node.parents.set(undefined);
      return;
    }
    const people = (await this.api.people([node.person.fatherId, node.person.motherId])).filter(
      (parent) => !path.has(parent.id),
    );
    if (!reserve(budget, people.length)) {
      node.parents.set(undefined);
      return;
    }
    const parents = people.map((parent) => new TreeNode(parent));
    await Promise.all(
      parents.map((parent) => this.expandParents(parent, depth - 1, new Set(path).add(parent.person.id), budget)),
    );
    node.parents.set(parents.length ? parents : undefined);
  }

  private async expandChildren(node: TreeNode, depth: number, path: Set<string>, budget: NodeBudget): Promise<void> {
    if (depth <= 0 || node.childIds.length === 0) {
      node.children.set(undefined);
      return;
    }
    const people = (await this.api.people(node.childIds)).filter((child) => !path.has(child.id));
    if (!reserve(budget, people.length)) {
      node.children.set(undefined);
      return;
    }
    const children = people.map((child) => new TreeNode(child));
    await Promise.all(
      children.map((child) => this.expandChildren(child, depth - 1, new Set(path).add(child.person.id), budget)),
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
