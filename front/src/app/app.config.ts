import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { ENVIRONMENT_INITIALIZER, inject } from '@angular/core';
import {
  provideRouter,
  TitleStrategy,
  withComponentInputBinding,
} from '@angular/router';
import { provideTransloco } from '@jsverse/transloco';
import { environment } from '../environments/environment';
import { I18nTitleStrategy } from './core/i18n/i18n-title.strategy';
import { LanguageService } from './core/i18n/language.service';
import { TranslocoHttpLoader } from './core/i18n/transloco-loader.service';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch()),
    provideTransloco({
      config: {
        availableLangs: ['fr', 'ar'],
        defaultLang: 'fr',
        fallbackLang: 'fr',
        reRenderOnLangChange: true,
        prodMode: environment.production,
      },
      loader: TranslocoHttpLoader,
    }),
    {
      provide: TitleStrategy,
      useClass: I18nTitleStrategy,
    },
    {
      provide: ENVIRONMENT_INITIALIZER,
      multi: true,
      useValue: () => inject(LanguageService).initialize(),
    },
  ],
};
