import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  computed,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

export type AppLanguage = 'fr' | 'ar';

const DEFAULT_LANGUAGE: AppLanguage = 'fr';
const STORAGE_KEY = 'app.language';
const RTL_LANGUAGES = new Set<AppLanguage>(['ar']);

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly translocoService = inject(TranslocoService);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  private readonly _currentLanguage = signal<AppLanguage>(DEFAULT_LANGUAGE);

  readonly availableLanguages = [
    { code: 'fr' as const, label: 'Français' },
    { code: 'ar' as const, label: 'العربية' },
  ];
  readonly currentLanguage = this._currentLanguage.asReadonly();
  readonly isRtl = computed(() => RTL_LANGUAGES.has(this._currentLanguage()));
  readonly currentDirection = computed(() => (this.isRtl() ? 'rtl' : 'ltr'));

  initialize(): void {
    this.setLanguage(this.resolveInitialLanguage());
  }

  setLanguage(language: AppLanguage): void {
    this._currentLanguage.set(language);
    this.translocoService.setActiveLang(language);
    this.document.documentElement.lang = language;
    this.document.documentElement.dir = RTL_LANGUAGES.has(language)
      ? 'rtl'
      : 'ltr';

    if (this.isBrowser) {
      window.localStorage.setItem(STORAGE_KEY, language);
    }
  }

  private resolveInitialLanguage(): AppLanguage {
    if (!this.isBrowser) {
      return DEFAULT_LANGUAGE;
    }

    const storedLanguage = window.localStorage.getItem(STORAGE_KEY);
    if (storedLanguage === 'fr' || storedLanguage === 'ar') {
      return storedLanguage;
    }

    const browserLanguage = window.navigator.language.toLowerCase();
    if (browserLanguage.startsWith('ar')) {
      return 'ar';
    }

    return DEFAULT_LANGUAGE;
  }
}
