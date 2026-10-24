import type { EnvironmentProviders, Provider } from '@angular/core';
import type { PersonDto } from '@genealogie/shared';
import { TranslocoTestingModule } from '@jsverse/transloco';
import fr from '../../public/i18n/fr.json';
import { registerLocales } from '../app/core/locales';

registerLocales();

/** Transloco with the real French translations, loaded synchronously. */
export function provideTestTransloco(): (Provider | EnvironmentProviders)[] {
  return (
    TranslocoTestingModule.forRoot({
      langs: { fr },
      translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
      preloadLangs: true,
    }).providers ?? []
  );
}

export function person(overrides: Partial<PersonDto> & { id: string }): PersonDto {
  return {
    givenNames: 'Jean',
    surname: 'MARTIN',
    sex: 'M',
    unions: [],
    restricted: false,
    events: [],
    ...overrides,
  };
}
