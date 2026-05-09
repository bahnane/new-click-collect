import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import { extractApiErrorCode } from '../../../core/errors/api-error.util';
import { AUTH_ERROR_I18N_KEY_BY_CODE } from '../../../core/errors/auth-error-i18n-map';
import {
  Product,
  ProductCategory,
} from '../../../core/models/merchant-shop.model';
import {
  CreateProductSubmissionPayload,
  MerchantsService,
  ProductSubmission,
  ProductSubmissionsPaginatedResponse,
  SimilarCatalogProduct,
  UpdateProductSubmissionPayload,
} from '../../../core/services/merchants.service';
import { DeleteConfirmationDialogComponent } from '../../../shared/dialogs/delete-confirmation-dialog/delete-confirmation-dialog.component';
import {
  CreateOfferFromSuggestionDialogComponent,
  CreateOfferFromSuggestionDialogResult,
} from '../../../shared/dialogs/create-offer-from-suggestion-dialog/create-offer-from-suggestion-dialog.component';
import { SubmissionDiffDialogComponent } from './submission-diff-dialog/submission-diff-dialog.component';
import { SubmissionEditorDialogComponent } from './submission-editor-dialog/submission-editor-dialog.component';

@Component({
  selector: 'app-merchant-product-submissions',
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatTooltipModule,
    MatDialogModule,
    TranslocoPipe,
  ],
  templateUrl: './merchant-product-submissions.component.html',
  styleUrl: './merchant-product-submissions.component.scss',
})
export class MerchantProductSubmissionsComponent {
  private readonly merchantsService = inject(MerchantsService);
  private readonly dialog = inject(MatDialog);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly deletingSubmissionId = signal<string | null>(null);
  readonly creatingOfferForId = signal<string | null>(null);
  readonly errorKey = signal<string | null>(null);
  readonly actionErrorKey = signal<string | null>(null);
  readonly successKey = signal<string | null>(null);

  readonly page = signal<ProductSubmissionsPaginatedResponse | null>(null);
  readonly categories = signal<ProductCategory[]>([]);

  readonly currentPage = signal(1);
  readonly pageSize = signal(10);

  readonly displayedColumns = [
    'name',
    'category',
    'saleUnit',
    'price',
    'status',
    'actions',
  ];

  readonly isEmpty = computed(() => {
    const current = this.page();
    return !this.loading() && current && current.data.length === 0;
  });

  constructor() {
    this.loadInitialData();
  }

  loadInitialData(): void {
    this.loading.set(true);
    this.errorKey.set(null);

    this.merchantsService.getProductCategories().subscribe({
      next: (categories) => {
        this.categories.set(categories);
        this.loadSubmissions();
      },
      error: (error) => {
        this.errorKey.set(this.mapApiError(error));
        this.loading.set(false);
      },
    });
  }

  loadSubmissions(page = this.currentPage(), pageSize = this.pageSize()): void {
    this.loading.set(true);
    this.errorKey.set(null);

    this.merchantsService.getMyProductSubmissions(page, pageSize).subscribe({
      next: (response) => {
        this.page.set(response);
        this.currentPage.set(response.page);
        this.pageSize.set(response.pageSize);
        this.loading.set(false);
      },
      error: (error) => {
        this.errorKey.set(this.mapApiError(error));
        this.loading.set(false);
      },
    });
  }

  onPageChange(event: PageEvent): void {
    this.loadSubmissions(event.pageIndex + 1, event.pageSize);
  }

  onOpenCreate(): void {
    this.successKey.set(null);
    this.actionErrorKey.set(null);

    const dialogRef = this.dialog.open(SubmissionEditorDialogComponent, {
      width: '600px',
      maxWidth: '95vw',
      data: {
        categories: this.categories(),
        isEditMode: false,
      },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (!result) return;
      this.submitSubmission(result, null);
    });
  }

  onEdit(submission: ProductSubmission): void {
    if (!this.canMutate(submission)) {
      return;
    }

    this.successKey.set(null);
    this.actionErrorKey.set(null);

    const dialogRef = this.dialog.open(SubmissionEditorDialogComponent, {
      width: '600px',
      maxWidth: '95vw',
      data: {
        submission,
        categories: this.categories(),
        isEditMode: true,
      },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (!result) return;
      this.submitSubmission(result, submission.id);
    });
  }

  private submitSubmission(payload: any, submissionId: string | null): void {
    this.saving.set(true);
    this.actionErrorKey.set(null);

    if (submissionId) {
      const updatePayload: UpdateProductSubmissionPayload = payload;
      this.merchantsService
        .updateProductSubmission(submissionId, updatePayload)
        .subscribe({
          next: () => {
            this.saving.set(false);
            this.successKey.set(
              'shell.merchant.productSubmissions.messages.updated',
            );
            this.loadSubmissions(this.currentPage(), this.pageSize());
          },
          error: (error) => {
            this.saving.set(false);
            this.actionErrorKey.set(this.mapApiError(error));
          },
        });
    } else {
      const createPayload: CreateProductSubmissionPayload = payload;
      this.merchantsService.createProductSubmission(createPayload).subscribe({
        next: () => {
          this.saving.set(false);
          this.successKey.set(
            'shell.merchant.productSubmissions.messages.created',
          );
          this.loadSubmissions(1, this.pageSize());
        },
        error: (error) => {
          this.saving.set(false);
          this.actionErrorKey.set(this.mapApiError(error));
        },
      });
    }
  }

  onDelete(submission: ProductSubmission): void {
    if (
      !this.canMutate(submission) ||
      this.deletingSubmissionId() === submission.id
    ) {
      return;
    }

    const dialogRef = this.dialog.open(DeleteConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'shell.merchant.productSubmissions.deleteConfirm.title',
        message: 'shell.merchant.productSubmissions.deleteConfirm.message',
        confirmLabel: 'common.delete',
        confirmColor: 'warn',
        itemName: submission.name,
      },
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (!confirmed) {
        return;
      }

      this.deletingSubmissionId.set(submission.id);
      this.actionErrorKey.set(null);
      this.merchantsService.deleteProductSubmission(submission.id).subscribe({
        next: () => {
          this.deletingSubmissionId.set(null);
          this.successKey.set(
            'shell.merchant.productSubmissions.messages.deleted',
          );
          this.loadSubmissions(this.currentPage(), this.pageSize());
        },
        error: (error) => {
          this.deletingSubmissionId.set(null);
          this.actionErrorKey.set(this.mapApiError(error));
        },
      });
    });
  }

  onCreateOfferFromSuggestion(product: SimilarCatalogProduct): void {
    const dialogRef = this.dialog.open(
      CreateOfferFromSuggestionDialogComponent,
      {
        width: '400px',
        data: { product },
      },
    );

    dialogRef
      .afterClosed()
      .subscribe(
        (result: CreateOfferFromSuggestionDialogResult | undefined) => {
          if (!result) {
            return;
          }

          this.creatingOfferForId.set(product.id);
          this.actionErrorKey.set(null);

          this.merchantsService
            .createOffer({
              productId: product.id,
              ...result,
            })
            .subscribe({
              next: () => {
                this.creatingOfferForId.set(null);
                this.successKey.set(
                  'shell.merchant.productSubmissions.messages.offerCreated',
                );
              },
              error: (error) => {
                this.creatingOfferForId.set(null);
                this.actionErrorKey.set(this.mapApiError(error));
              },
            });
        },
      );
  }

  clearErrorKey(): void {
    this.errorKey.set(null);
  }

  clearActionErrorKey(): void {
    this.actionErrorKey.set(null);
  }

  getSaleUnitLabel(saleUnit: Product['saleUnit']): string {
    return `shop.saleUnit.${saleUnit.toLowerCase()}`;
  }

  getStatusLabel(status: string): string {
    return `shell.merchant.productSubmissions.status.${status.toLowerCase()}`;
  }

  canMutate(submission: ProductSubmission): boolean {
    return submission.status === 'PENDING';
  }

  hasApprovedDiff(submission: ProductSubmission): boolean {
    if (submission.status !== 'APPROVED' || !submission.approvedProduct) {
      return false;
    }
    const p = submission.approvedProduct;
    return (
      p.name !== submission.name ||
      p.description !== submission.description ||
      p.saleUnit !== submission.saleUnit ||
      p.priceInCents !== submission.priceInCents ||
      p.category.id !== submission.category.id
    );
  }

  onViewDiff(submission: ProductSubmission): void {
    this.dialog.open(SubmissionDiffDialogComponent, {
      width: '600px',
      maxWidth: '95vw',
      data: submission,
    });
  }

  formatPrice(priceInCents: number | null): string {
    if (priceInCents == null) {
      return '-';
    }

    return (priceInCents / 100).toFixed(2);
  }

  private mapApiError(error: unknown): string {
    const errorCode = extractApiErrorCode(error) || 'INTERNAL_SERVER_ERROR';
    return (
      AUTH_ERROR_I18N_KEY_BY_CODE[errorCode] ||
      'auth.apiErrors.INTERNAL_SERVER_ERROR'
    );
  }
}
