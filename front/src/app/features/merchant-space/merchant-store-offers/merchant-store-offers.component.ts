import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  MatSlideToggleChange,
  MatSlideToggleModule,
} from '@angular/material/slide-toggle';
import { MatTableModule } from '@angular/material/table';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { TranslocoPipe } from '@jsverse/transloco';
import { extractApiErrorCode } from '../../../core/errors/api-error.util';
import { AUTH_ERROR_I18N_KEY_BY_CODE } from '../../../core/errors/auth-error-i18n-map';
import {
  StoreOffer,
  StoreOffersPaginatedResponse,
} from '../../../core/models/merchant-shop.model';
import { MerchantsService } from '../../../core/services/merchants.service';
import { DeleteConfirmationDialogComponent } from '../../../shared/dialogs/delete-confirmation-dialog/delete-confirmation-dialog.component';

@Component({
  selector: 'app-merchant-store-offers',
  imports: [
    CommonModule,
    RouterLink,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatDialogModule,
    TranslocoPipe,
  ],
  templateUrl: './merchant-store-offers.component.html',
  styleUrl: './merchant-store-offers.component.scss',
})
export class MerchantStoreOffersComponent {
  private readonly merchantsService = inject(MerchantsService);
  private readonly dialog = inject(MatDialog);

  readonly loading = signal(false);
  readonly deleting = signal<string | null>(null);
  readonly errorKey = signal<string | null>(null);
  readonly actionErrorKey = signal<string | null>(null);
  readonly offersPage = signal<StoreOffersPaginatedResponse | null>(null);
  readonly currentPage = signal(1);
  readonly pageSize = signal(10);

  readonly displayedColumns = [
    'product',
    'category',
    'effectivePrice',
    'minOrderQty',
    'stepQty',
    'status',
    'actions',
  ];

  readonly isEmpty = computed(() => {
    const page = this.offersPage();
    return !this.loading() && page && page.data.length === 0;
  });

  constructor() {
    this.loadOffers();
  }

  loadOffers(page = this.currentPage(), pageSize = this.pageSize()): void {
    this.loading.set(true);
    this.errorKey.set(null);

    this.merchantsService.getMyOffers(page, pageSize).subscribe({
      next: (response) => {
        this.offersPage.set(response);
        this.currentPage.set(response.page);
        this.pageSize.set(response.pageSize);
        this.loading.set(false);
      },
      error: (error) => {
        const errorCode = extractApiErrorCode(error) || 'INTERNAL_SERVER_ERROR';
        const errorKey =
          AUTH_ERROR_I18N_KEY_BY_CODE[errorCode] ||
          'auth.apiErrors.INTERNAL_SERVER_ERROR';
        this.errorKey.set(errorKey);
        this.loading.set(false);
      },
    });
  }

  onPageChange(event: PageEvent): void {
    this.loading.set(true);
    this.loadOffers(event.pageIndex + 1, event.pageSize);
  }

  onEdit(offer: StoreOffer): void {
    // TODO: Implement edit dialog
    console.log('Edit offer:', offer);
  }

  onStatusToggleChange(event: MatSlideToggleChange, offer: StoreOffer): void {
    // Keep the current UI state; update only after backend success + reload.
    event.source.checked = offer.isActive;

    if (this.deleting() === offer.id) {
      return;
    }

    const statusAction = offer.isActive ? 'deactivate' : 'activate';
    const dialogRef = this.dialog.open(DeleteConfirmationDialogComponent, {
      width: '400px',
      panelClass: 'status-confirmation-dialog-panel',
      data: {
        title: `shell.merchant.storeOffers.statusConfirm.${statusAction}.title`,
        message: `shell.merchant.storeOffers.statusConfirm.${statusAction}.message`,
        confirmLabel: `shell.merchant.storeOffers.${statusAction}`,
        confirmColor: offer.isActive ? 'warn' : 'primary',
        itemName: offer.product.name,
      },
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.toggleOfferStatus(offer.id);
      }
    });
  }

  private toggleOfferStatus(offerId: string): void {
    this.deleting.set(offerId);
    this.actionErrorKey.set(null);

    // Toggle status: deactivate active offers and reactivate inactive ones.
    this.merchantsService.toggleOffer(offerId).subscribe({
      next: () => {
        this.deleting.set(null);
        // Reload current page
        this.loadOffers(this.currentPage(), this.pageSize());
      },
      error: (error) => {
        this.deleting.set(null);
        const errorCode = extractApiErrorCode(error) || 'INTERNAL_SERVER_ERROR';
        const errorKey =
          AUTH_ERROR_I18N_KEY_BY_CODE[errorCode] ||
          'auth.apiErrors.INTERNAL_SERVER_ERROR';
        this.actionErrorKey.set(errorKey);
      },
    });
  }

  clearErrorKey(): void {
    this.errorKey.set(null);
  }

  clearActionErrorKey(): void {
    this.actionErrorKey.set(null);
  }

  formatPrice(priceInCents: number | null): string {
    if (priceInCents === null) return '—';
    return (priceInCents / 100).toFixed(2);
  }

  getSaleUnitLabel(saleUnit: string): string {
    return `shop.saleUnit.${saleUnit.toLowerCase()}`;
  }

  getStatusLabel(isActive: boolean): string {
    return isActive
      ? 'shell.merchant.storeOffers.status.active'
      : 'shell.merchant.storeOffers.status.inactive';
  }

  getStatusActionLabelKey(isActive: boolean): string {
    return isActive
      ? 'shell.merchant.storeOffers.deactivate'
      : 'shell.merchant.storeOffers.activate';
  }
}
