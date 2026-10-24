import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';

export const LANGUAGES = ['fr', 'en', 'es'] as const;
export type Language = (typeof LANGUAGES)[number];
const STORAGE_KEY = 'genealogie.language';

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language);
}

/** Interface language: stored choice, otherwise the browser language. */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly transloco = inject(TranslocoService);
  private readonly document = inject(DOCUMENT);

  /** Active language, as a signal. */
  readonly current = toSignal(this.transloco.langChanges$, { initialValue: this.transloco.getActiveLang() });

  initialLanguage(): Language {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isLanguage(stored)) {
        return stored;
      }
    } catch {
      // Storage unavailable (private browsing…).
    }
    const browser = this.document.defaultView?.navigator.languages.map((lang) => lang.slice(0, 2)) ?? [];
    return browser.find(isLanguage) ?? 'fr';
  }

  use(language: Language): void {
    this.transloco.setActiveLang(language);
    this.document.documentElement.lang = language;
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // Storage unavailable: the choice applies to this session only.
    }
  }
}
