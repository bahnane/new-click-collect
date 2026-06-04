import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
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
import { finalize, tap } from 'rxjs/operators';
import { extractApiErrorCode } from '../../../core/errors/api-error.util';
import { AUTH_ERROR_I18N_KEY_BY_CODE } from '../../../core/errors/auth-error-i18n-map';
import {
  StoreOffer,
  StoreOffersPaginatedResponse,
} from '../../../core/models/merchant-shop.model';
import { MerchantsService } from '../../../core/services/merchants.service';
import { UiFeedbackService } from '../../../core/services/ui-feedback.service';
import { ConfirmationDialogComponent } from '../../../shared/dialogs/confirmation-dialog/confirmation-dialog.component';
import { EditStoreOfferDialogComponent } from './edit-store-offer-dialog.component';

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
  private readonly uiFeedback = inject(UiFeedbackService);

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
    'maxOrderQty',
    'status',
    'actions',
  ];

  readonly isEmpty = computed(() => {
    const page = this.offersPage();
    return !this.loading() && page && page.data.length === 0;
  });

  constructor() {
    effect(() => {
      const currentError = this.errorKey() ?? this.actionErrorKey();
      if (currentError) {
        this.uiFeedback.showError(currentError);
      } else {
        this.uiFeedback.clearError();
      }
    });
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
    const dialogRef = this.dialog.open(EditStoreOfferDialogComponent, {
      width: '520px',
      maxWidth: '95vw',
      data: { offer },
    });

    dialogRef.afterClosed().subscribe((updated: boolean | undefined) => {
      if (updated) {
        this.loadOffers(this.currentPage(), this.pageSize());
      }
    });
  }

  onStatusToggleChange(event: MatSlideToggleChange, offer: StoreOffer): void {
    // Keep the current UI state; update only after backend success + reload.
    event.source.checked = offer.isActive;

    if (this.deleting() === offer.id) {
      return;
    }

    const statusAction = offer.isActive ? 'deactivate' : 'activate';
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      panelClass: 'status-confirmation-dialog-panel',
      data: {
        title: `shell.merchant.storeOffers.statusConfirm.${statusAction}.title`,
        message: `shell.merchant.storeOffers.statusConfirm.${statusAction}.message`,
        confirmLabel: `shell.merchant.storeOffers.${statusAction}`,
        confirmColor: offer.isActive ? 'warn' : 'primary',
        itemName: offer.product.name,
        confirmAction: () =>
          this.merchantsService.toggleOffer(offer.id).pipe(
            tap(() => this.loadOffers(this.currentPage(), this.pageSize())),
            finalize(() => this.deleting.set(null)),
          ),
      },
    });

    this.deleting.set(offer.id);
    dialogRef.afterClosed().subscribe((confirmed: boolean | undefined) => {
      this.deleting.set(null);
      if (!confirmed) {
        return;
      }
    });
  }

  clearErrorKey(): void {
    this.errorKey.set(null);
    this.uiFeedback.clearError();
  }

  clearActionErrorKey(): void {
    this.actionErrorKey.set(null);
    this.uiFeedback.clearError();
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
