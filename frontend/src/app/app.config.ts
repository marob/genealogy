import { provideHttpClient } from '@angular/common/http';
import {
  type ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { routes } from './app.routes';
import { LANGUAGES, LanguageService } from './core/language.service';
import { registerLocales } from './core/locales';
import { SessionStore } from './core/session.store';
import { TranslocoHttpLoader } from './core/transloco-loader';

registerLocales();

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(),
    provideTransloco({
      config: {
        availableLangs: [...LANGUAGES],
        defaultLang: 'fr',
        fallbackLang: 'fr',
        missingHandler: { useFallbackTranslation: true, logMissingKey: isDevMode() },
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: TranslocoHttpLoader,
    }),
    provideAppInitializer(async () => {
      const language = inject(LanguageService);
      const transloco = inject(TranslocoService);
      const initial = language.initialLanguage();
      language.use(initial);
      await Promise.all([firstValueFrom(transloco.load(initial)), inject(SessionStore).load()]);
    }),
  ],
};
