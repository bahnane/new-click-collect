import { Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { combineLatest } from 'rxjs';
import { take } from 'rxjs/operators';

@Injectable()
export class I18nTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly translocoService = inject(TranslocoService);
  private lastRouterState: RouterStateSnapshot | null = null;

  constructor() {
    super();

    this.translocoService.langChanges$
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (this.lastRouterState) {
          this.updateTitle(this.lastRouterState);
        }
      });
  }

  override updateTitle(routerState: RouterStateSnapshot): void {
    this.lastRouterState = routerState;

    const routeTitleKey = this.buildTitle(routerState);

    if (!routeTitleKey) {
      this.translocoService
        .selectTranslate('app.name')
        .pipe(take(1))
        .subscribe((appName) => this.title.setTitle(appName));
      return;
    }

    combineLatest([
      this.translocoService.selectTranslate(routeTitleKey),
      this.translocoService.selectTranslate('app.name'),
    ])
      .pipe(take(1))
      .subscribe(([routeTitle, appName]) => {
        this.title.setTitle(`${routeTitle} | ${appName}`);
      });
  }
}
