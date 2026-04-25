import { Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-admin-space',
  imports: [MatCardModule, TranslocoPipe],
  template: `
    <section class="space-page">
      <mat-card>
        <mat-card-content>
          <h1>{{ 'shell.adminSpace.title' | transloco }}</h1>
          <p>{{ 'shell.adminSpace.subtitle' | transloco }}</p>
        </mat-card-content>
      </mat-card>
    </section>
  `,
  styles: `
    .space-page h1 {
      margin: 0;
      font: var(--mat-sys-headline-small);
      text-align: start;
    }

    .space-page p {
      margin: 0.5rem 0 0;
      text-align: start;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-medium);
    }
  `,
})
export class AdminSpaceComponent {}
