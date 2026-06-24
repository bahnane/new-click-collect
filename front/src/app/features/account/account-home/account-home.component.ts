import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { MerchantProfile } from '../../../core/models/merchant-shop.model';
import { AuthService } from '../../../core/services/auth.service';
import { MerchantsService } from '../../../core/services/merchants.service';
import { ConfirmationDialogComponent } from '../../../shared/dialogs/confirmation-dialog/confirmation-dialog.component';

type AccountScope = 'customer' | 'merchant';

interface AccountEntry {
  labelKey: string;
  descriptionKey?: string;
  icon: string;
  route?: string[];
  queryParams?: Record<string, string>;
  action?: 'logout';
}

interface AccountDetail {
  labelKey: string;
  value?: string;
  valueKey?: string;
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
  private readonly dialog = inject(MatDialog);
  private readonly authService = inject(AuthService);
  private readonly merchantsService = inject(MerchantsService);

  readonly currentUser = this.authService.currentUser;
  readonly merchantProfile = signal<MerchantProfile | null>(null);

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

  readonly accountDetails = computed<AccountDetail[]>(() => {
    const user = this.currentUser();
    if (!user) {
      return [];
    }

    const merchantProfile =
      this.scope() === 'merchant' ? this.merchantProfile() : null;

    return [
      {
        labelKey: 'account.details.email',
        value: user.email,
      },
      {
        labelKey: 'account.details.role',
        valueKey: `account.details.roles.${user.role.toLowerCase()}`,
      },
      {
        labelKey: 'account.details.status',
        valueKey: `account.details.statuses.${user.status.toLowerCase()}`,
      },
      ...(merchantProfile
        ? [
            {
              labelKey: 'account.details.storeName',
              value: merchantProfile.storeName,
            },
            {
              labelKey: 'account.details.storeSlug',
              value: merchantProfile.slug,
            },
            {
              labelKey: 'account.details.storePhone',
              value: merchantProfile.phone || '—',
            },
            {
              labelKey: 'account.details.storeAddress',
              value: merchantProfile.address || '—',
            },
            {
              labelKey: 'account.details.storeCity',
              value: merchantProfile.city || '—',
            },
          ]
        : []),
    ];
  });

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

    if (!isMerchant) {
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

  constructor() {
    effect(() => {
      if (this.scope() !== 'merchant') {
        this.merchantProfile.set(null);
        return;
      }

      this.merchantsService.getMyProfile().subscribe({
        next: (profile) => this.merchantProfile.set(profile),
        error: () => this.merchantProfile.set(null),
      });
    });
  }

  onAction(entry: AccountEntry): void {
    if (entry.action === 'logout') {
      this.dialog.open(ConfirmationDialogComponent, {
        width: '420px',
        data: {
          title: 'account.actions.logoutConfirmTitle',
          message: 'account.actions.logoutConfirmMessage',
          confirmLabel: 'account.actions.logout',
          confirmColor: 'warn',
          icon: 'logout',
          confirmAction: () => this.authService.logout(),
        },
      });
    }
  }

  goToStoreProfile(): void {
    if (this.scope() !== 'merchant') {
      return;
    }

    this.router.navigate(['/merchant', 'account', 'store-profile']);
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
