import { Component, computed, effect, inject, input, resource, untracked } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import type { SurnameDto } from '@genealogie/shared';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiService, type SearchCriteria } from '../../core/api.service';
import { GenealogyDatePipe, PlacePipe } from '../../core/genealogy-pipes';
import { LanguageService } from '../../core/language.service';
import { iconSearch } from '../../ui/icons';

const PAGE_SIZE = 50;

function toNumber(value: string | undefined): number | undefined {
  const number = value === undefined || value === '' ? NaN : Number(value);
  return Number.isInteger(number) ? number : undefined;
}

/**
 * Multi-criteria search (name, place, birth period, sex) and surname index.
 * Criteria are carried by the URL so they can be shared.
 */
@Component({
  selector: 'app-search-page',
  imports: [ReactiveFormsModule, RouterLink, FaIconComponent, TranslocoPipe, GenealogyDatePipe, PlacePipe],
  templateUrl: './search-page.html',
  styleUrl: './search-page.scss',
})
export class SearchPage {
  // Query parameters bound by the router.
  readonly q = input<string>();
  readonly surname = input<string>();
  readonly place = input<string>();
  readonly bornFrom = input<string>();
  readonly bornTo = input<string>();
  readonly sex = input<string>();
  readonly page = input<string>();

  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  protected readonly lang = inject(LanguageService).current;

  protected readonly form = inject(FormBuilder).nonNullable.group({
    q: '',
    place: '',
    bornFrom: '',
    bornTo: '',
    sex: '',
  });

  protected readonly criteria = computed<SearchCriteria | undefined>(() => {
    const criteria: SearchCriteria = {
      ...(this.q() ? { q: this.q()! } : {}),
      ...(this.surname() !== undefined ? { surname: this.surname()! } : {}),
      ...(this.place() ? { place: this.place()! } : {}),
      ...(toNumber(this.bornFrom()) !== undefined ? { bornFrom: toNumber(this.bornFrom())! } : {}),
      ...(toNumber(this.bornTo()) !== undefined ? { bornTo: toNumber(this.bornTo())! } : {}),
      ...(this.sex() === 'M' || this.sex() === 'F' || this.sex() === 'U' ? { sex: this.sex() as 'M' | 'F' | 'U' } : {}),
    };
    if (Object.keys(criteria).length === 0) {
      return undefined;
    }
    return { ...criteria, page: toNumber(this.page()) ?? 1, pageSize: PAGE_SIZE };
  });

  protected readonly results = resource({
    params: () => this.criteria(),
    loader: ({ params }) => this.api.search(params),
  });

  protected readonly surnames = resource({ loader: () => this.api.surnames() });

  /** Surname index grouped by initial. */
  protected readonly surnameIndex = computed(() => {
    const groups = new Map<string, SurnameDto[]>();
    for (const entry of this.surnames.value() ?? []) {
      const initial = entry.surname.normalize('NFD').replace(/\p{M}/gu, '').charAt(0).toUpperCase() || '?';
      groups.set(initial, [...(groups.get(initial) ?? []), entry]);
    }
    return [...groups.entries()];
  });

  protected readonly pageCount = computed(() => {
    const value = this.results.value();
    return value ? Math.max(1, Math.ceil(value.total / value.pageSize)) : 1;
  });

  constructor() {
    // The form reflects the URL criteria.
    effect(() => {
      const values = {
        q: this.q() ?? '',
        place: this.place() ?? '',
        bornFrom: this.bornFrom() ?? '',
        bornTo: this.bornTo() ?? '',
        sex: this.sex() ?? '',
      };
      untracked(() => this.form.setValue(values));
    });
  }

  protected submit(): void {
    const values = this.form.getRawValue();
    const queryParams = Object.fromEntries(Object.entries(values).filter(([, value]) => value.trim() !== ''));
    void this.router.navigate(['/search'], { queryParams });
  }

  protected reset(): void {
    void this.router.navigate(['/search']);
  }

  protected goToPage(page: number): void {
    void this.router.navigate([], { queryParams: { page }, queryParamsHandling: 'merge' });
  }

  protected readonly icons = { iconSearch };
}
