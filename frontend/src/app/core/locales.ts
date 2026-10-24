import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import localeFr from '@angular/common/locales/fr';

/** Données de formatage (dates, nombres) des langues de l'interface. */
export function registerLocales(): void {
  registerLocaleData(localeFr);
  registerLocaleData(localeEs);
}
