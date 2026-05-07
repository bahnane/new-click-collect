import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-admin-space',
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    MatButtonModule,
    TranslocoPipe,
  ],
  template: `
    <section class="admin-shell">
      <header class="admin-shell-header">
        <p class="eyebrow">{{ 'shell.adminSpace.eyebrow' | transloco }}</p>
        <h1>{{ 'shell.adminSpace.title' | transloco }}</h1>
        <nav
          class="admin-shell-nav"
          [attr.aria-label]="'shell.adminSpace.navigationLabel' | transloco"
        >
          <a
            routerLink="merchants"
            routerLinkActive="is-active"
            mat-stroked-button
            type="button"
          >
            {{ 'shell.adminSpace.sections.merchants' | transloco }}
          </a>
        </nav>
      </header>

      <router-outlet />
    </section>
  `,
  styles: `
    .admin-shell {
      display: grid;
      gap: 1.5rem;
    }

    .admin-shell-header {
      display: grid;
      gap: 0.5rem;
    }

    .eyebrow {
      margin: 0;
      font: var(--mat-sys-label-small);
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--mat-sys-primary);
    }

    h1 {
      margin: 0;
      font: var(--mat-sys-headline-small);
    }

    .admin-shell-nav {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-block-start: 0.5rem;
    }

    .admin-shell-nav a.is-active {
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }
  `,
})
export class AdminSpaceComponent {}
