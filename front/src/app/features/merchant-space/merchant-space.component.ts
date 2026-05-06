import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-merchant-space',
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    MatButtonModule,
    TranslocoPipe,
  ],
  template: `
    <section class="merchant-shell">
      <header class="merchant-shell-header">
        <p class="eyebrow">{{ 'shell.merchant.eyebrow' | transloco }}</p>
        <h1>{{ 'shell.merchant.title' | transloco }}</h1>
        <p>{{ 'shell.merchant.subtitle' | transloco }}</p>

        <nav
          class="merchant-shell-nav"
          [attr.aria-label]="'shell.merchant.navigationLabel' | transloco"
        >
          <a
            routerLink="overview"
            routerLinkActive="is-active"
            [routerLinkActiveOptions]="{ exact: true }"
            mat-stroked-button
            type="button"
          >
            {{ 'shell.merchant.sections.overview' | transloco }}
          </a>
          <a
            routerLink="profile"
            routerLinkActive="is-active"
            [routerLinkActiveOptions]="{ exact: true }"
            mat-stroked-button
            type="button"
          >
            {{ 'shell.merchant.sections.profile' | transloco }}
          </a>
          <a
            routerLink="store-offers"
            routerLinkActive="is-active"
            [routerLinkActiveOptions]="{ exact: true }"
            mat-stroked-button
            type="button"
          >
            {{ 'shell.merchant.sections.storeOffers' | transloco }}
          </a>
          <a
            routerLink="store-offers/add"
            routerLinkActive="is-active"
            [routerLinkActiveOptions]="{ exact: true }"
            mat-stroked-button
            type="button"
          >
            {{ 'shell.merchant.sections.storeOffersAdd' | transloco }}
          </a>
          <a
            routerLink="product-submissions"
            routerLinkActive="is-active"
            [routerLinkActiveOptions]="{ exact: true }"
            mat-stroked-button
            type="button"
          >
            {{ 'shell.merchant.sections.productSubmissions' | transloco }}
          </a>
        </nav>
      </header>

      <router-outlet />
    </section>
  `,
  styles: `
    .merchant-shell {
      display: grid;
      gap: 1.5rem;
    }

    .merchant-shell-header {
      display: grid;
      gap: 0.75rem;
      padding: 1.5rem;
      border-radius: 1.5rem;
      background:
        linear-gradient(
          135deg,
          color-mix(in srgb, var(--mat-sys-primary) 12%, transparent),
          transparent
        ),
        var(--mat-sys-surface-container-low);
      border: 1px solid var(--mat-sys-outline-variant);
    }

    .eyebrow {
      margin: 0;
      color: var(--mat-sys-primary);
      font: var(--mat-sys-label-large);
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .merchant-shell h1 {
      margin: 0;
      font: var(--mat-sys-headline-small);
      text-align: start;
    }

    .merchant-shell p {
      margin: 0;
      text-align: start;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-medium);
    }

    .merchant-shell-nav {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin-block-start: 0.5rem;
    }

    .merchant-shell-nav .is-active {
      border-color: var(--mat-sys-primary);
      background: color-mix(in srgb, var(--mat-sys-primary) 12%, transparent);
    }
  `,
})
export class MerchantSpaceComponent {}
