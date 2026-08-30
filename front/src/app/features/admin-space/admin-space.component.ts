import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-admin-space',
  imports: [RouterOutlet],
  template: `
    <section class="admin-shell">
      <router-outlet />
    </section>
  `,
  styles: `
    .admin-shell {
      min-inline-size: 0;
    }
  `,
})
export class AdminSpaceComponent {}
