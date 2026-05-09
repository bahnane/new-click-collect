import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { TranslocoPipe } from '@jsverse/transloco';
import { extractApiErrorCode } from '../../../core/errors/api-error.util';
import { AUTH_ERROR_I18N_KEY_BY_CODE } from '../../../core/errors/auth-error-i18n-map';
import {
  AdminMerchantEntry,
  AdminMerchantsPaginatedResponse,
} from '../../../core/models/merchant-shop.model';
import { MerchantsService } from '../../../core/services/merchants.service';
import { UiFeedbackService } from '../../../core/services/ui-feedback.service';

@Component({
  selector: 'app-admin-merchants',
  imports: [
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatTableModule,
    TranslocoPipe,
  ],
  templateUrl: './admin-merchants.component.html',
  styleUrl: './admin-merchants.component.scss',
})
export class AdminMerchantsComponent {
  private readonly merchantsService = inject(MerchantsService);
  private readonly uiFeedback = inject(UiFeedbackService);

  readonly loading = signal(false);
  readonly errorKey = signal<string | null>(null);
  readonly page = signal<AdminMerchantsPaginatedResponse | null>(null);
  readonly currentPage = signal(1);
  readonly pageSize = signal(10);

  readonly displayedColumns = [
    'storeName',
    'email',
    'businessType',
    'status',
    'isActive',
    'actions',
  ];

  readonly isEmpty = computed(
    () => !this.loading() && this.page() && this.page()!.data.length === 0,
  );

  constructor() {
    effect(() => {
      const currentError = this.errorKey();
      if (currentError) {
        this.uiFeedback.showError(currentError);
      } else {
        this.uiFeedback.clearError();
      }
    });
    this.loadMerchants();
  }

  loadMerchants(page = this.currentPage(), pageSize = this.pageSize()): void {
    this.loading.set(true);
    this.errorKey.set(null);

    this.merchantsService.listAdminMerchants(page, pageSize).subscribe({
      next: (response) => {
        this.page.set(response);
        this.currentPage.set(response.page);
        this.pageSize.set(response.pageSize);
        this.loading.set(false);
      },
      error: (error) => {
        const code = extractApiErrorCode(error) || 'INTERNAL_SERVER_ERROR';
        this.errorKey.set(
          AUTH_ERROR_I18N_KEY_BY_CODE[code] ??
            'auth.apiErrors.INTERNAL_SERVER_ERROR',
        );
        this.loading.set(false);
      },
    });
  }

  onPageChange(event: PageEvent): void {
    this.loadMerchants(event.pageIndex + 1, event.pageSize);
  }

  clearError(): void {
    this.errorKey.set(null);
    this.uiFeedback.clearError();
  }

  shopUrl(merchant: AdminMerchantEntry): string {
    return `/shop/${merchant.slug}`;
  }

  getBusinessTypeLabel(type: string): string {
    return `shell.adminSpace.merchants.businessType.${type.toLowerCase()}`;
  }

  getUserStatusLabel(status: string): string {
    return `shell.adminSpace.merchants.userStatus.${status.toLowerCase()}`;
  }
}
