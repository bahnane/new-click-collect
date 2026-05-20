import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
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
  MerchantsService,
  ProductSubmission,
  ProductSubmissionsPaginatedResponse,
} from '../../../core/services/merchants.service';
import { UiFeedbackService } from '../../../core/services/ui-feedback.service';
import { ConfirmationDialogComponent } from '../../../shared/dialogs/confirmation-dialog/confirmation-dialog.component';
import { SubmissionDiffDialogComponent } from './submission-diff-dialog/submission-diff-dialog.component';
import {
  SubmissionEditorDialogComponent,
  SubmissionEditorDialogResult,
} from './submission-editor-dialog/submission-editor-dialog.component';

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
  private readonly uiFeedback = inject(UiFeedbackService);

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
    effect(() => {
      const currentError = this.errorKey() ?? this.actionErrorKey();
      if (currentError) {
        this.uiFeedback.showError(currentError);
      } else {
        this.uiFeedback.clearError();
      }
    });
    effect(() => {
      const success = this.successKey();
      if (success) {
        this.uiFeedback.showSuccessToast(success);
        this.successKey.set(null);
      }
    });
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

    dialogRef
      .afterClosed()
      .subscribe((result: SubmissionEditorDialogResult | undefined) => {
        if (!result) {
          return;
        }

        if (result.created) {
          this.successKey.set(
            'shell.merchant.productSubmissions.messages.created',
          );
          this.loadSubmissions(1, this.pageSize());
        }
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

    dialogRef
      .afterClosed()
      .subscribe((result: SubmissionEditorDialogResult | undefined) => {
        if (!result) {
          return;
        }

        if (result.updated) {
          this.successKey.set(
            'shell.merchant.productSubmissions.messages.updated',
          );
          this.loadSubmissions(this.currentPage(), this.pageSize());
        }
      });
  }

  onDelete(submission: ProductSubmission): void {
    if (
      !this.canMutate(submission) ||
      this.deletingSubmissionId() === submission.id
    ) {
      return;
    }

    this.deletingSubmissionId.set(submission.id);

    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'shell.merchant.productSubmissions.deleteConfirm.title',
        message: 'shell.merchant.productSubmissions.deleteConfirm.message',
        confirmLabel: 'common.delete',
        confirmColor: 'warn',
        itemName: submission.name,
        confirmAction: () =>
          this.merchantsService.deleteProductSubmission(submission.id),
      },
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      this.deletingSubmissionId.set(null);
      if (confirmed) {
        this.successKey.set(
          'shell.merchant.productSubmissions.messages.deleted',
        );
        this.loadSubmissions(this.currentPage(), this.pageSize());
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
      p.category.id !== submission.category.id ||
      (p.subCategory?.id ?? null) !== (submission.subCategory?.id ?? null)
    );
  }

  getCategoryDisplayLabel(submission: ProductSubmission): string {
    if (!submission.subCategory?.name) {
      return submission.category.name;
    }

    return `${submission.category.name} / ${submission.subCategory.name}`;
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
