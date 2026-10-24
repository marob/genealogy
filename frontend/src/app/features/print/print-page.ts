import { DOCUMENT } from '@angular/common';
import {
  afterRenderEffect,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  type OnDestroy,
  resource,
  signal,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import type { PersonSummaryDto } from '@genealogie/shared';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiService } from '../../core/api.service';
import { iconPrint, iconSearch } from '../../ui/icons';
import { ChartNode } from '../tree/chart-node';
import { MAX_GENERATIONS, TreeController } from '../tree/tree-controller';
import { type ChartDrawing, measureChart, placedCopy } from './chart-drawing';
import { lineageDepth } from './lineage-depth';
import { type Layout, type LayoutInput, layoutPages } from './pagination';

const SCALES = [100, 85, 70, 60, 50, 40, 30];
type Mode = 'pdf' | 'paper';
type Orientation = 'landscape' | 'portrait';
/** Formats de papier (portrait), en millimètres. */
const PAPERS = { A4: [210, 297], A3: [297, 420], Letter: [215.9, 279.4] } as const;
type Paper = keyof typeof PAPERS;
const MARGIN_MM = 5;
/** Hauteur réservée au repère de page (numéro, ligne, colonne). */
const LABEL_MM = 4;
/** Marge de sécurité pour qu'une feuille ne déborde jamais sur la page suivante (arrondis). */
const SAFETY_MM = 1;
const PX_PER_MM = 96 / 25.4;

function generations(value: string | undefined, available: number): number {
  const number = Number(value);
  return value !== undefined && Number.isInteger(number) ? Math.min(available, Math.max(0, number)) : available;
}

/**
 * Version imprimable de l'arbre : personne centrale au choix, ascendants et
 * descendants dépliés récursivement (par défaut, toute la lignée). Deux modes :
 *  - « PDF » : une seule page aux dimensions exactes de l'arbre ;
 *  - « papier » : l'arbre est découpé en pages (format, orientation et
 *    échelle au choix) en plaçant les coupes entre les cartes. Le découpage
 *    est calculé dans un Web Worker ; chaque page ne recopie que ses cartes
 *    et redessine ses traits en SVG.
 * Les réglages sont portés par l'URL (`/print?person=I1&up=5&down=3&mode=paper`).
 */
@Component({
  selector: 'app-print-page',
  imports: [ChartNode, FaIconComponent, FormsModule, TranslocoPipe],
  providers: [TreeController],
  templateUrl: './print-page.html',
  styleUrl: './print-page.scss',
})
export class PrintPage implements OnDestroy {
  // Paramètres de requête liés par le routeur.
  readonly person = input<string>();
  readonly up = input<string>();
  readonly down = input<string>();
  readonly mode = input<string>();
  readonly paper = input<string>();
  readonly orientation = input<string>();
  readonly scale = input<string>();
  /** `keep` pour imprimer aussi les pages sans carte. */
  readonly empty = input<string>();

  protected readonly tree = inject(TreeController);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly pageStyle = this.document.createElement('style');

  protected readonly scales = SCALES;
  protected readonly papers = Object.keys(PAPERS) as Paper[];

  /** Nombre de générations réellement disponibles autour de la personne. */
  protected readonly depth = resource({
    params: () => this.person(),
    loader: async ({ params: id }) =>
      lineageDepth(id, await this.api.lineage(id, { ancestors: MAX_GENERATIONS, descendants: MAX_GENERATIONS })),
  });
  protected readonly ancestors = computed(() => generations(this.up(), this.depth.value()?.ancestors ?? 0));
  protected readonly descendants = computed(() => generations(this.down(), this.depth.value()?.descendants ?? 0));

  protected readonly printMode = computed<Mode>(() => (this.mode() === 'paper' ? 'paper' : 'pdf'));
  protected readonly paperFormat = computed<Paper>(() => {
    const paper = this.paper();
    return paper && paper in PAPERS ? (paper as Paper) : 'A4';
  });
  protected readonly pageOrientation = computed<Orientation>(() =>
    this.orientation() === 'portrait' ? 'portrait' : 'landscape',
  );
  protected readonly zoom = computed(() => {
    const scale = Number(this.scale());
    return SCALES.includes(scale) ? scale : 70;
  });
  protected readonly skipEmpty = computed(() => this.empty() !== 'keep');

  /** Zone utile d'une page papier, en millimètres. */
  protected readonly sheet = computed(() => {
    const [short, long] = PAPERS[this.paperFormat()];
    const [width, height] = this.pageOrientation() === 'landscape' ? [long, short] : [short, long];
    return { width: width - 2 * MARGIN_MM, height: height - 2 * MARGIN_MM - LABEL_MM - SAFETY_MM };
  });
  protected readonly labelHeight = LABEL_MM;
  protected readonly margin = MARGIN_MM;
  /** Épaisseur des traits dans l'aperçu à l'écran : au moins un pixel malgré la réduction. */
  protected readonly screenStroke = computed(() => Math.max(1, 100 / this.zoom()));

  private readonly preview = viewChild<ElementRef<HTMLElement>>('preview');
  private readonly chart = viewChild<unknown, ElementRef<HTMLElement>>('chart', { read: ElementRef });
  private readonly tileContents = viewChildren<ElementRef<HTMLElement>>('tileContent');
  /** Taille de l'arbre à l'échelle 100 %. */
  private readonly chartSize = signal({ width: 0, height: 0 });

  /** Pages de l'impression papier et éléments relevés dans l'arbre. */
  protected readonly layout = signal<Layout | undefined>(undefined);
  protected readonly drawing = signal<ChartDrawing | undefined>(undefined);
  protected readonly computing = signal(false);
  protected readonly busy = computed(() => this.depth.isLoading() || this.tree.loading() || this.computing());
  private worker?: Worker;
  private request = 0;

  /** Recherche de la personne centrale. */
  protected readonly query = signal('');
  protected readonly candidates = resource({
    params: () => (this.query().trim().length >= 2 ? this.query().trim() : undefined),
    loader: async ({ params, abortSignal }) => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      abortSignal.throwIfAborted();
      return (await this.api.search({ q: params, pageSize: 10 })).items;
    },
  });

  constructor() {
    this.document.head.appendChild(this.pageStyle);

    effect(() => {
      const id = this.person();
      if (!id) {
        untracked(() => this.tree.root.set(undefined));
        return;
      }
      if (!this.depth.hasValue()) {
        return;
      }
      const wanted = { ancestors: this.ancestors(), descendants: this.descendants() };
      untracked(() => void this.tree.load(id, wanted));
    });

    // Suit la taille de l'arbre affiché.
    afterRenderEffect((onCleanup) => {
      const chart = this.chart()?.nativeElement;
      if (!chart) {
        return;
      }
      const observer = new ResizeObserver(() =>
        this.chartSize.set({ width: chart.offsetWidth, height: chart.offsetHeight }),
      );
      observer.observe(chart);
      onCleanup(() => observer.disconnect());
    });

    // Centre l'aperçu sur la personne choisie.
    afterRenderEffect(() => {
      this.tree.focusVersion();
      const preview = this.preview()?.nativeElement;
      const root = this.chart()?.nativeElement.querySelector('app-person-card.part-root');
      if (preview && root && this.printMode() === 'pdf') {
        const view = preview.getBoundingClientRect();
        const card = root.getBoundingClientRect();
        preview.scrollLeft += card.left + card.width / 2 - (view.left + view.width / 2);
        preview.scrollTop += card.top - view.top - 24;
      }
    });

    // Format de page : taille exacte de l'arbre en PDF, papier choisi sinon.
    effect(() => {
      const margin = `${MARGIN_MM}mm`;
      if (this.printMode() === 'pdf') {
        const { width, height } = this.chartSize();
        const size = `${Math.ceil(width / PX_PER_MM) + 2 * MARGIN_MM}mm ${Math.ceil(height / PX_PER_MM) + 2 * MARGIN_MM + 2 * SAFETY_MM}mm`;
        this.pageStyle.textContent = `@page { size: ${size}; margin: ${margin}; }`;
      } else {
        this.pageStyle.textContent = `@page { size: ${this.paperFormat()} ${this.pageOrientation()}; margin: ${margin}; }`;
      }
    });

    // Relevé de l'arbre puis découpage en pages dans le worker.
    afterRenderEffect(() => {
      const size = this.chartSize();
      const chart = this.chart()?.nativeElement;
      const sheet = this.sheet();
      const ratio = (PX_PER_MM * 100) / this.zoom();
      const skipEmpty = this.skipEmpty();
      if (this.printMode() !== 'paper' || !chart || !size.width || this.tree.loading()) {
        return;
      }
      const drawing = measureChart(chart);
      untracked(() =>
        this.computeLayout(drawing, {
          cards: drawing.cardBoxes,
          marks: drawing.markBoxes,
          segments: drawing.segments,
          size: drawing.size,
          page: { width: sheet.width * ratio, height: sheet.height * ratio },
          skipEmpty,
        }),
      );
    });

    // Chaque page reçoit une copie de ses cartes et anneaux d'union.
    afterRenderEffect(() => {
      const drawing = this.drawing();
      const layout = this.layout();
      const pages = layout?.pages ?? [];
      this.tileContents().forEach(({ nativeElement: container }, index) => {
        const page = pages[index];
        if (!drawing || !layout || !page) {
          return;
        }
        const offset = { x: page.x, y: page.y };
        container.replaceChildren(
          ...page.cards.map((card) => placedCopy(drawing.cards[card]!, layout.cardBoxes[card]!, offset)),
          ...page.marks.map((mark) => placedCopy(drawing.marks[mark]!, drawing.markBoxes[mark]!, offset)),
        );
      });
    });
  }

  private computeLayout(drawing: ChartDrawing, input: LayoutInput): void {
    const request = ++this.request;
    this.computing.set(true);
    const done = (layout: Layout) => {
      if (request === this.request) {
        this.drawing.set(drawing);
        this.layout.set(layout);
        this.computing.set(false);
      }
    };
    if (typeof Worker === 'undefined') {
      done(layoutPages(input));
      return;
    }
    this.worker ??= new Worker(new URL('./pagination.worker', import.meta.url), { type: 'module' });
    this.worker.onmessage = ({ data }: MessageEvent<Layout>) => done(data);
    this.worker.postMessage(input);
  }

  protected segmentsOf(indices: number[]) {
    const segments = this.layout()?.segments ?? [];
    return indices.map((index) => segments[index]!);
  }

  protected update(changes: Record<string, string | number | undefined>): void {
    void this.router.navigate([], { queryParams: changes, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected choose(person: PersonSummaryDto): void {
    this.query.set('');
    this.update({ person: person.id, up: undefined, down: undefined });
  }

  protected print(): void {
    this.document.defaultView?.print();
  }

  ngOnDestroy(): void {
    this.worker?.terminate();
    this.pageStyle.remove();
  }

  protected readonly icons = { iconPrint, iconSearch };
}
