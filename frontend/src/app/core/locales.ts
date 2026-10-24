import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import localeFr from '@angular/common/locales/fr';

/** Formatting data (dates, numbers) for the interface languages. */
export function registerLocales(): void {
  registerLocaleData(localeFr);
  registerLocaleData(localeEs);
}
