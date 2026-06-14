import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../../core/services/auth.service';

type AccountScope = 'customer' | 'merchant';

interface AccountEntry {
  labelKey: string;
  descriptionKey?: string;
  icon: string;
  route?: string[];
  queryParams?: Record<string, string>;
  action?: 'logout';
}

@Component({
  selector: 'app-account-home',
  imports: [
    CommonModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    TranslocoPipe,
  ],
  templateUrl: './account-home.component.html',
  styleUrl: './account-home.component.scss',
})
export class AccountHomeComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  readonly scope = computed<AccountScope>(
    () =>
      (this.route.snapshot.data['accountScope'] as AccountScope) ?? 'customer',
  );

  readonly titleKey = computed(() =>
    this.scope() === 'merchant'
      ? 'account.merchant.title'
      : 'account.customer.title',
  );

  readonly subtitleKey = computed(() =>
    this.scope() === 'merchant'
      ? 'account.merchant.subtitle'
      : 'account.customer.subtitle',
  );

  readonly entries = computed<AccountEntry[]>(() => {
    const isMerchant = this.scope() === 'merchant';
    const merchantSlug = this.route.snapshot.queryParamMap
      .get('merchantSlug')
      ?.trim();

    const accountBase = isMerchant ? ['/merchant', 'account'] : ['/account'];

    const rows: AccountEntry[] = [
      {
        labelKey: 'account.sections.security.title',
        descriptionKey: 'account.sections.security.description',
        icon: 'security',
        route: [...accountBase, 'security'],
        ...(merchantSlug ? { queryParams: { merchantSlug } } : {}),
      },
      {
        labelKey: 'account.sections.language.title',
        descriptionKey: 'account.sections.language.description',
        icon: 'language',
        route: [...accountBase, 'language'],
        ...(merchantSlug ? { queryParams: { merchantSlug } } : {}),
      },
    ];

    if (isMerchant) {
      rows.unshift({
        labelKey: 'account.sections.profile.title',
        descriptionKey: 'account.sections.profile.description',
        icon: 'store',
        route: ['/merchant', 'profile'],
      });
    } else {
      rows.unshift({
        labelKey: 'account.sections.orders.title',
        descriptionKey: 'account.sections.orders.description',
        icon: 'receipt_long',
        route: ['/dashboard', 'orders'],
        ...(merchantSlug ? { queryParams: { merchantSlug } } : {}),
      });
    }

    rows.push({
      labelKey: 'account.actions.logout',
      icon: 'logout',
      action: 'logout',
    });

    return rows;
  });

  onAction(entry: AccountEntry): void {
    if (entry.action === 'logout') {
      this.authService.logout().subscribe();
    }
  }

  goBack(): void {
    if (this.scope() === 'merchant') {
      this.router.navigate(['/merchant', 'overview']);
      return;
    }

    const merchantSlug = this.route.snapshot.queryParamMap
      .get('merchantSlug')
      ?.trim();
    if (merchantSlug) {
      this.router.navigate(['/shop', merchantSlug]);
      return;
    }

    this.router.navigate(['/dashboard']);
  }
}
