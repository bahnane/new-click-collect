import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';

type AccountScope = 'customer' | 'merchant';

interface SecurityEntry {
  labelKey: string;
  descriptionKey: string;
}

@Component({
  selector: 'app-account-security',
  imports: [CommonModule, MatCardModule, MatIconModule, TranslocoPipe],
  templateUrl: './account-security.component.html',
  styleUrl: './account-security.component.scss',
})
export class AccountSecurityComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly scope = computed<AccountScope>(
    () =>
      (this.route.snapshot.data['accountScope'] as AccountScope) ?? 'customer',
  );

  readonly titleKey = 'account.sections.security.title';

  readonly entries = computed<SecurityEntry[]>(() => [
    {
      labelKey: 'account.security.changePassword.title',
      descriptionKey: 'account.security.changePassword.description',
    },
    {
      labelKey: 'account.security.deleteAccount.title',
      descriptionKey: 'account.security.deleteAccount.description',
    },
  ]);

  goBack(): void {
    if (this.scope() === 'merchant') {
      this.router.navigate(['/merchant', 'account']);
      return;
    }

    const merchantSlug = this.route.snapshot.queryParamMap
      .get('merchantSlug')
      ?.trim();
    this.router.navigate(['/account'], {
      queryParams: merchantSlug ? { merchantSlug } : undefined,
    });
  }
}
