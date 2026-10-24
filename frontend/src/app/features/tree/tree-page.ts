import {
  afterRenderEffect,
  Component,
  type ElementRef,
  effect,
  inject,
  input,
  type OnDestroy,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import Panzoom, { type PanzoomObject } from '@panzoom/panzoom';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import type { PersonDto } from '@genealogie/shared';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiService } from '../../core/api.service';
import {
  iconExpandAncestors,
  iconExpandDescendants,
  iconPrint,
  iconReset,
  iconZoomIn,
  iconZoomOut,
} from '../../ui/icons';
import { ChartNode } from './chart-node';
import { PersonDetails } from './person-details';
import { TreeController } from './tree-controller';

/** Tree page: `/tree` (default root) or `/tree/:id`. */
@Component({
  selector: 'app-tree-page',
  imports: [ChartNode, PersonDetails, FaIconComponent, TranslocoPipe, RouterLink],
  providers: [TreeController],
  templateUrl: './tree-page.html',
  styleUrl: './tree-page.scss',
})
export class TreePage implements OnDestroy {
  /** Route parameter (router input binding). */
  readonly id = input<string>();

  protected readonly tree = inject(TreeController);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  private readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport');
  private readonly canvas = viewChild<ElementRef<HTMLElement>>('canvas');
  private panzoom?: PanzoomObject;
  /** Record to open once the tree is recentred (navigation from a record). */
  private pendingSelection?: PersonDto;
  private readonly onWheel = (event: WheelEvent) => this.panzoom?.zoomWithWheel(event);
  /** Card kept still on screen when the tree resizes, and its position. */
  private anchor?: { uid: number; left: number; top: number };
  private resizeObserver?: ResizeObserver;

  constructor() {
    this.tree.beforeChange = (node) => {
      const card = this.cardOf(node.uid);
      if (card) {
        const rect = card.getBoundingClientRect();
        this.anchor = { uid: node.uid, left: rect.left, top: rect.top };
      }
    };

    effect(() => {
      const id = this.id();
      untracked(() => void this.open(id));
    });

    afterRenderEffect(() => {
      const canvas = this.canvas()?.nativeElement;
      if (canvas && !this.panzoom) {
        this.panzoom = Panzoom(canvas, {
          canvas: true,
          minScale: 0.1,
          maxScale: 4,
          step: 0.15,
          excludeClass: 'no-pan',
        });
        canvas.parentElement?.addEventListener('wheel', this.onWheel, { passive: false });
        // Lines stay at least one pixel wide on screen when zooming out.
        canvas.addEventListener('panzoomchange', () => {
          const scale = this.panzoom?.getScale() ?? 1;
          canvas.style.setProperty('--line-width', `${Math.max(1, 1 / scale)}px`);
          // The view moved (pan, zoom): the anchor card follows.
          const card = this.anchor && this.cardOf(this.anchor.uid);
          if (this.anchor && card) {
            const rect = card.getBoundingClientRect();
            this.anchor = { ...this.anchor, left: rect.left, top: rect.top };
          }
        });
        // When the tree grows or shrinks (expansion), the anchor card is put
        // back in place before rendering: the view does not "jump".
        this.resizeObserver = new ResizeObserver(() => this.keepAnchor());
        this.resizeObserver.observe(canvas);
      }
    });

    // Recentres the view on the root whenever the central person changes.
    afterRenderEffect(() => {
      if (this.tree.focusVersion() > 0) {
        untracked(() => this.center());
      }
    });
  }

  private async open(id: string | undefined): Promise<void> {
    this.anchor = undefined;
    this.tree.select(this.pendingSelection?.id === id ? this.pendingSelection : undefined);
    this.pendingSelection = undefined;
    if (id) {
      await this.tree.load(id);
      return;
    }
    const info = await this.api.treeInfo();
    if (info.rootPersonId) {
      await this.router.navigate(['/tree', info.rootPersonId], { replaceUrl: true });
    } else {
      this.tree.notFound.set(true);
    }
  }

  private cardOf(uid: number): Element | null | undefined {
    return this.viewport()?.nativeElement.querySelector(`.node-center[data-node="${uid}"] app-person-card`);
  }

  private keepAnchor(): void {
    const anchor = this.anchor;
    const card = anchor && this.cardOf(anchor.uid);
    if (!anchor || !card || !this.panzoom) {
      return;
    }
    const rect = card.getBoundingClientRect();
    const scale = this.panzoom.getScale();
    const dx = anchor.left - rect.left;
    const dy = anchor.top - rect.top;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      this.panzoom.pan(dx / scale, dy / scale, { relative: true, animate: false });
      this.applyNow();
    }
  }

  protected center(): void {
    const viewport = this.viewport()?.nativeElement;
    const root = viewport?.querySelector('app-person-card.part-root');
    if (!this.panzoom || !viewport || !root) {
      return;
    }
    this.panzoom.reset({ animate: false });
    this.applyNow();
    const view = viewport.getBoundingClientRect();
    const card = root.getBoundingClientRect();
    this.panzoom.pan(
      view.left + view.width / 2 - (card.left + card.width / 2),
      view.top + view.height / 2 - (card.top + card.height / 2),
      { relative: true, animate: false },
    );
    this.applyNow();
  }

  /**
   * Panzoom only applies the transform on the next frame: apply it right
   * away, so the new view can be measured and is not shown in the wrong
   * place for one frame.
   */
  private applyNow(): void {
    const canvas = this.canvas()?.nativeElement;
    if (canvas && this.panzoom) {
      const { x, y } = this.panzoom.getPan();
      canvas.style.transform = `scale(${this.panzoom.getScale()}) translate(${x}px, ${y}px)`;
    }
  }

  protected zoomIn(): void {
    this.panzoom?.zoomIn();
  }

  protected zoomOut(): void {
    this.panzoom?.zoomOut();
  }

  /** From a record: recentres the tree and opens the person's record. */
  protected focus(person: PersonDto): void {
    if (person.id === this.id()) {
      this.tree.select(person);
      return;
    }
    this.pendingSelection = person;
    this.tree.focus(person);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.canvas()?.nativeElement.parentElement?.removeEventListener('wheel', this.onWheel);
    this.panzoom?.destroy();
  }

  protected readonly icons = {
    iconExpandAncestors,
    iconExpandDescendants,
    iconPrint,
    iconReset,
    iconZoomIn,
    iconZoomOut,
  };
}
