import { Component, computed, DestroyRef, ElementRef, inject, resource, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import type { EventDto, PersonSummaryDto } from '@genealogie/shared';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiService } from '../core/api.service';
import { formatGenealogyDate } from '../core/genealogy-format';
import { LanguageService } from '../core/language.service';
import { valueOf } from '../core/resources';
import { iconClose, iconSearch } from './icons';
import { PersonName } from './person-name';

/** Delay before searching while typing. */
const DEBOUNCE_MS = 200;
const MIN_LENGTH = 2;
const MAX_RESULTS = 8;

let nextId = 1;

/**
 * Header quick search: suggestions while typing (surname and given names,
 * accent-insensitive); choosing a person recentres the tree on them.
 * Keyboard-accessible combobox (arrows, Enter, Escape).
 * On mobile, the field collapses to an icon and opens over the header.
 */
@Component({
  selector: 'app-quick-search',
  imports: [PersonName, FaIconComponent, TranslocoPipe],
  host: {
    '[class.expanded]': 'expanded()',
    '(focusout)': 'onFocusOut($event)',
  },
  template: `
    <button
      type="button"
      class="btn-icon toggle"
      [attr.aria-label]="'search.open' | transloco"
      [attr.aria-expanded]="expanded()"
      (click)="expand()"
    >
      <fa-icon [icon]="icons.iconSearch" />
    </button>
    <div class="field">
      <fa-icon class="icon" [icon]="icons.iconSearch" />
      <input
        #input
        type="search"
        role="combobox"
        autocomplete="off"
        [id]="inputId"
        [value]="query()"
        [placeholder]="'search.quickPlaceholder' | transloco"
        [attr.aria-label]="'search.quickLabel' | transloco"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="listId"
        aria-autocomplete="list"
        [attr.aria-activedescendant]="open() && active() >= 0 ? listId + '-' + active() : null"
        (input)="type($any($event.target).value)"
        (keydown)="onKey($event)"
        (focus)="focused.set(true)"
        (blur)="focused.set(false)"
      />
      @if (open()) {
        <ul class="suggestions" role="listbox" [id]="listId" [attr.aria-label]="'search.quickLabel' | transloco">
          @for (person of results(); track person.id; let index = $index) {
            <!-- Combobox pattern: focus stays on the field, which handles the keyboard (aria-activedescendant). -->
            <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
            <li
              role="option"
              [id]="listId + '-' + index"
              [attr.aria-selected]="index === active()"
              [class.active]="index === active()"
              (mousedown)="$event.preventDefault()"
              (click)="choose(person)"
              (mouseenter)="active.set(index)"
            >
              <app-person-name class="name strong" [person]="person" />
              @if (lifespan(person); as years) {
                <span class="years">{{ years }}</span>
              }
            </li>
          } @empty {
            <li class="empty" role="presentation">
              @if (suggestions.isLoading()) {
                {{ 'common.loading' | transloco }}
              } @else if (suggestions.error()) {
                {{ 'common.error' | transloco }}
              } @else {
                {{ 'search.noMatch' | transloco }}
              }
            </li>
          }
        </ul>
      }
    </div>
    <button type="button" class="btn-icon close" [attr.aria-label]="'common.close' | transloco" (click)="collapse()">
      <fa-icon [icon]="icons.iconClose" />
    </button>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      width: min(18rem, 100%);
    }
    .field {
      position: relative;
      display: flex;
      flex: 1;
      align-items: center;
    }
    .toggle,
    .close {
      display: none;
    }
    @media (max-width: 640px) {
      :host {
        width: auto;
      }
      :host(:not(.expanded)) .field {
        display: none;
      }
      :host(:not(.expanded)) .toggle,
      :host(.expanded) .close {
        display: inline-grid;
      }
      :host(.expanded) {
        position: absolute;
        z-index: 30;
        inset: 0;
        gap: 0.5rem;
        padding: 0 0.75rem;
        background: var(--surface);
      }
    }
    .icon {
      position: absolute;
      top: 50%;
      left: 0.6rem;
      display: flex;
      transform: translateY(-50%);
      color: var(--text-muted);
      pointer-events: none;
    }
    input {
      padding-left: 2rem;
    }
    .suggestions {
      position: absolute;
      z-index: 20;
      top: calc(100% + 0.25rem);
      left: 0;
      right: 0;
      max-height: 22rem;
      margin: 0;
      padding: 0.25rem 0;
      overflow-y: auto;
      list-style: none;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
      box-shadow: var(--shadow-md);
    }
    li {
      display: flex;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.4rem 0.75rem;
      cursor: pointer;
    }
    li.active {
      background: color-mix(in srgb, var(--accent) 15%, transparent);
    }
    li.empty {
      cursor: default;
      color: var(--text-muted);
    }
    .years {
      flex-shrink: 0;
      font-size: 0.85rem;
      color: var(--text-muted);
    }
  `,
})
export class QuickSearch {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly lang = inject(LanguageService).current;

  protected readonly inputId = `quick-search-${nextId}`;
  protected readonly listId = `quick-search-list-${nextId++}`;
  protected readonly query = signal('');
  /** Field open (mobile, where it is otherwise collapsed to an icon). */
  protected readonly expanded = signal(false);
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // Capture phase: the zoomable tree stops click propagation.
    const document = this.host.nativeElement.ownerDocument;
    const listener = (event: PointerEvent) => this.onDocumentPointerDown(event);
    document.addEventListener('pointerdown', listener, true);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('pointerdown', listener, true));
  }
  protected readonly focused = signal(false);
  protected readonly active = signal(-1);
  private readonly dismissed = signal(false);

  protected readonly suggestions = resource({
    params: () => (this.query().trim().length >= MIN_LENGTH ? this.query().trim() : undefined),
    loader: async ({ params, abortSignal }) => {
      await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS));
      abortSignal.throwIfAborted();
      return (await this.api.search({ q: params, pageSize: MAX_RESULTS })).items;
    },
  });
  protected readonly results = computed(() => valueOf(this.suggestions) ?? []);
  protected readonly open = computed(
    () => this.focused() && !this.dismissed() && this.query().trim().length >= MIN_LENGTH,
  );

  protected type(value: string): void {
    this.query.set(value);
    this.active.set(0);
    this.dismissed.set(false);
  }

  protected onKey(event: KeyboardEvent): void {
    const count = this.results().length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.dismissed.set(false);
        this.active.set(count ? (this.active() + 1) % count : -1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.active.set(count ? (this.active() - 1 + count) % count : -1);
        break;
      case 'Enter': {
        const person = this.results()[Math.max(0, this.active())];
        if (this.open() && person) {
          event.preventDefault();
          this.choose(person);
        }
        break;
      }
      case 'Escape':
        if (this.open()) {
          this.dismissed.set(true);
        } else {
          this.collapse();
        }
        break;
    }
  }

  protected expand(): void {
    this.expanded.set(true);
    // The field becomes visible on the next render.
    setTimeout(() => this.input().nativeElement.focus());
  }

  protected collapse(): void {
    this.expanded.set(false);
    this.query.set('');
  }

  /**
   * The field closes when focus leaves the search. The check is deferred:
   * on opening, the magnifier button (focused after a click) is hidden and
   * Firefox reports a focus loss before the field receives it.
   */
  protected onFocusOut(event: FocusEvent): void {
    const host = event.currentTarget as HTMLElement;
    setTimeout(() => {
      if (!host.contains(host.ownerDocument.activeElement)) {
        this.expanded.set(false);
      }
    });
  }

  /**
   * A click outside closes the field: some areas (the zoomable tree)
   * intercept the click without removing focus from the field.
   */
  private onDocumentPointerDown(event: PointerEvent): void {
    if (this.expanded() && !this.host.nativeElement.contains(event.target as Node)) {
      this.collapse();
    }
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.dismissed.set(true);
    }
  }

  protected choose(person: PersonSummaryDto): void {
    this.query.set('');
    this.active.set(-1);
    this.dismissed.set(true);
    this.expanded.set(false);
    void this.router.navigate(['/tree', person.id]);
  }

  /** Birth and death years ("1850 – about 1920"), when visible. */
  protected lifespan(person: PersonSummaryDto): string {
    const year = (event: EventDto | undefined) => {
      const date = event?.date;
      if (!date?.start) {
        return '';
      }
      return formatGenealogyDate(
        { ...date, start: { year: date.start.year }, ...(date.end ? { end: { year: date.end.year } } : {}) },
        this.lang(),
      );
    };
    const [birth, death] = [year(person.birth), year(person.death)];
    return birth || death ? `${birth} – ${death}`.replace(/^ – /, '† ').replace(/ – $/, '') : '';
  }

  protected readonly icons = { iconClose, iconSearch };
}
