import { Injectable, signal } from '@angular/core';
import type { PersonSummaryDto } from '@genealogie/shared';

export const NAME_ORDERS = ['surname-first', 'given-first'] as const;
export type NameOrder = (typeof NAME_ORDERS)[number];
const STORAGE_KEY = 'genealogie.nameOrder';

export function isNameOrder(value: unknown): value is NameOrder {
  return NAME_ORDERS.includes(value as NameOrder);
}

/** Order of names ("MARTIN Émile" or "Émile MARTIN"): stored choice, surname first by default. */
@Injectable({ providedIn: 'root' })
export class NameOrderService {
  readonly current = signal<NameOrder>(this.stored() ?? 'surname-first');

  use(order: NameOrder): void {
    this.current.set(order);
    try {
      localStorage.setItem(STORAGE_KEY, order);
    } catch {
      // Storage unavailable: the choice applies to this session only.
    }
  }

  /** Full name as plain text (labels, titles), in the chosen order. */
  format(person: Pick<PersonSummaryDto, 'givenNames' | 'surname'>): string {
    const parts = [person.surname.toUpperCase(), person.givenNames];
    return (this.current() === 'surname-first' ? parts : parts.reverse()).filter(Boolean).join(' ');
  }

  private stored(): NameOrder | undefined {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return isNameOrder(stored) ? stored : undefined;
    } catch {
      return undefined;
    }
  }
}
