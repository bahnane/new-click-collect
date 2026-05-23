import { Component, computed, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import { forkJoin } from 'rxjs';
import {
  AdminImageMetadataDraft,
  AdminImageUploadService,
} from '../../../core/services/admin-image-upload.service';
import { extractApiErrorCode } from '../../../core/errors/api-error.util';
import { AUTH_ERROR_I18N_KEY_BY_CODE } from '../../../core/errors/auth-error-i18n-map';
import { Product } from '../../../core/models/merchant-shop.model';
import {
  ApproveAdminProductSubmissionBatchItem,
  AdminProductCategory,
  AdminProductSubmission,
  AdminProductSubmissionsPaginatedResponse,
  MerchantsService,
  ProductSubmissionStatus,
  ReviewAdminProductSubmissionPayload,
} from '../../../core/services/merchants.service';
import { UiFeedbackService } from '../../../core/services/ui-feedback.service';
import { SubmissionDiffDialogComponent } from '../../merchant-space/merchant-product-submissions/submission-diff-dialog/submission-diff-dialog.component';

@Component({
  selector: 'app-admin-product-submissions',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTableModule,
    MatTooltipModule,
    TranslocoPipe,
  ],
  templateUrl: './admin-product-submissions.component.html',
  styleUrl: './admin-product-submissions.component.scss',
})
export class AdminProductSubmissionsComponent {
  private readonly merchantsService = inject(MerchantsService);
  private readonly adminImageUploadService = inject(AdminImageUploadService);
  private readonly dialog = inject(MatDialog);
  private readonly uiFeedback = inject(UiFeedbackService);

  readonly loading = signal(false);
  readonly reviewingId = signal<string | null>(null);
  readonly batchApproving = signal(false);
  readonly batchRejecting = signal(false);
  readonly errorKey = signal<string | null>(null);
  readonly actionErrorKey = signal<string | null>(null);
  readonly successKey = signal<string | null>(null);

  readonly page = signal<AdminProductSubmissionsPaginatedResponse | null>(null);
  readonly categories = signal<AdminProductCategory[]>([]);

  readonly currentPage = signal(1);
  readonly pageSize = signal(10);
  readonly statusFilter = signal<ProductSubmissionStatus | 'ALL'>('PENDING');

  readonly selectedSubmissionIds = signal<Set<string>>(new Set<string>());
  readonly inlineDraftById = signal<Record<string, InlineSubmissionDraft>>({});

  readonly displayedColumns = [
    'select',
    'name',
    'merchant',
    'category',
    'saleUnit',
    'price',
    'description',
    'image',
    'status',
    'actions',
  ];

  readonly pendingItemsOnPage = computed(() =>
    (this.page()?.data ?? []).filter((entry) => entry.status === 'PENDING'),
  );

  readonly selectedPendingCount = computed(() => {
    const selectedIds = this.selectedSubmissionIds();
    return this.pendingItemsOnPage().filter((entry) =>
      selectedIds.has(entry.id),
    ).length;
  });

  readonly allPendingSelected = computed(() => {
    const pending = this.pendingItemsOnPage();
    if (pending.length === 0) {
      return false;
    }
    const selectedIds = this.selectedSubmissionIds();
    return pending.every((entry) => selectedIds.has(entry.id));
  });

  readonly isEmpty = computed(() => {
    const current = this.page();
    return !this.loading() && current !== null && current.data.length === 0;
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

    this.merchantsService.listAdminProductCategories().subscribe({
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

    const filter = this.statusFilter();
    const status: ProductSubmissionStatus | undefined =
      filter === 'ALL' ? undefined : filter;

    this.merchantsService
      .listAdminProductSubmissions(page, pageSize, status)
      .subscribe({
        next: (response) => {
          this.page.set(response);
          this.currentPage.set(response.page);
          this.pageSize.set(response.pageSize);
          this.initializeDraftsForPage(response.data);
          this.loading.set(false);
          this.pruneSelectionForCurrentPage();
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

  onStatusFilterChange(value: ProductSubmissionStatus | 'ALL'): void {
    this.statusFilter.set(value);
    this.selectedSubmissionIds.set(new Set<string>());
    this.inlineDraftById.set({});
    this.loadSubmissions(1, this.pageSize());
  }

  onApproveInline(submission: AdminProductSubmission): void {
    if (!this.canReview(submission) || this.reviewingId()) {
      return;
    }

    const payload = this.buildApprovePayload(submission);
    if (!payload) {
      return;
    }

    this.reviewingId.set(submission.id);
    this.actionErrorKey.set(null);

    this.merchantsService
      .reviewAdminProductSubmission(submission.id, payload)
      .subscribe({
        next: () => {
          this.reviewingId.set(null);
          this.successKey.set(
            'shell.adminSpace.productSubmissions.messages.approved',
          );
          this.selectedSubmissionIds.update((current) => {
            const next = new Set(current);
            next.delete(submission.id);
            return next;
          });
          this.loadSubmissions(this.currentPage(), this.pageSize());
        },
        error: (error) => {
          this.reviewingId.set(null);
          this.actionErrorKey.set(this.mapApiError(error));
        },
      });
  }

  onRejectInline(submission: AdminProductSubmission): void {
    if (!this.canReview(submission) || this.reviewingId()) {
      return;
    }

    const draft = this.getDraft(submission);
    const reason = draft.rejectionReason.trim();
    if (reason.length < 3) {
      this.actionErrorKey.set(
        'shell.adminSpace.productSubmissions.errors.rejectionReasonRequired',
      );
      return;
    }

    this.reviewingId.set(submission.id);
    this.actionErrorKey.set(null);

    this.merchantsService
      .reviewAdminProductSubmission(submission.id, {
        status: 'REJECTED',
        rejectionReason: reason,
      })
      .subscribe({
        next: () => {
          this.reviewingId.set(null);
          this.successKey.set(
            'shell.adminSpace.productSubmissions.messages.rejected',
          );
          this.selectedSubmissionIds.update((current) => {
            const next = new Set(current);
            next.delete(submission.id);
            return next;
          });
          this.loadSubmissions(this.currentPage(), this.pageSize());
        },
        error: (error) => {
          this.reviewingId.set(null);
          this.actionErrorKey.set(this.mapApiError(error));
        },
      });
  }

  onSubmissionImageSelected(
    submission: AdminProductSubmission,
    event: Event,
  ): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0);
    input.value = '';

    if (!file || this.getDraft(submission).imageUploading) {
      return;
    }

    this.updateDraft(submission, {
      imageUploading: true,
      imageErrorKey: null,
    });

    const draft = this.getDraft(submission);
    this.adminImageUploadService
      .inferMetadata(file, draft.imageAltText || submission.name)
      .then((autoMeta) => {
        const mergedDraft = this.buildMergedDraftMetadata(draft, autoMeta);
        const uploadOptions = this.validateAndBuildUploadOptions(mergedDraft);

        if (!uploadOptions) {
          this.updateDraft(submission, {
            ...mergedDraft,
            imageUploading: false,
            imageErrorKey: 'auth.apiErrors.VALIDATION_ERROR',
          });
          return;
        }

        this.updateDraft(submission, mergedDraft);

        this.adminImageUploadService
          .uploadProductImage(file, uploadOptions)
          .subscribe({
            next: (imageAsset) => {
              this.updateDraft(submission, {
                imageUploading: false,
                imageAssetId: imageAsset.id,
                imagePreviewUrl: imageAsset.cdnUrl,
                imageErrorKey: null,
                imageAltText: imageAsset.altText ?? uploadOptions.altText,
                imageDominantColor:
                  imageAsset.dominantColor ?? uploadOptions.dominantColor,
              });
            },
            error: (error) => {
              this.updateDraft(submission, {
                imageUploading: false,
                imageErrorKey: this.mapApiError(error),
              });
            },
          });
      })
      .catch(() => {
        this.updateDraft(submission, {
          imageUploading: false,
          imageErrorKey: 'auth.apiErrors.VALIDATION_ERROR',
        });
      });
  }

  onDraftImageAltTextChange(
    submission: AdminProductSubmission,
    value: string,
  ): void {
    this.updateDraft(submission, { imageAltText: value });
  }

  onDraftImageDominantColorChange(
    submission: AdminProductSubmission,
    value: string,
  ): void {
    this.updateDraft(submission, { imageDominantColor: value });
  }

  onToggleSelectOne(
    submission: AdminProductSubmission,
    checked: boolean,
  ): void {
    if (!this.canReview(submission)) {
      return;
    }

    this.selectedSubmissionIds.update((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(submission.id);
      } else {
        next.delete(submission.id);
      }
      return next;
    });
  }

  onToggleSelectAllPending(checked: boolean): void {
    const pending = this.pendingItemsOnPage();
    this.selectedSubmissionIds.update((current) => {
      const next = new Set(current);
      for (const item of pending) {
        if (checked) {
          next.add(item.id);
        } else {
          next.delete(item.id);
        }
      }
      return next;
    });
  }

  onApproveSelectedBatch(): void {
    if (
      this.batchApproving() ||
      this.batchRejecting() ||
      this.selectedPendingCount() === 0
    ) {
      return;
    }

    const selectedIds = this.selectedSubmissionIds();
    const items: ApproveAdminProductSubmissionBatchItem[] = [];
    for (const submission of this.pendingItemsOnPage()) {
      if (!selectedIds.has(submission.id)) {
        continue;
      }

      const batchItem = this.buildBatchApprovalItem(submission);
      if (!batchItem) {
        return;
      }
      items.push(batchItem);
    }

    if (items.length === 0) {
      return;
    }

    this.batchApproving.set(true);
    this.actionErrorKey.set(null);

    this.merchantsService.approveAdminProductSubmissionsBatch(items).subscribe({
      next: (result) => {
        this.batchApproving.set(false);
        this.selectedSubmissionIds.set(new Set<string>());
        this.successKey.set(
          result.count > 1
            ? 'shell.adminSpace.productSubmissions.messages.batchApprovedMany'
            : 'shell.adminSpace.productSubmissions.messages.batchApprovedOne',
        );
        this.loadSubmissions(this.currentPage(), this.pageSize());
      },
      error: (error) => {
        this.batchApproving.set(false);
        this.actionErrorKey.set(this.mapApiError(error));
      },
    });
  }

  onRejectSelectedBatch(): void {
    if (
      this.batchRejecting() ||
      this.batchApproving() ||
      this.selectedPendingCount() === 0
    ) {
      return;
    }

    const selectedIds = this.selectedSubmissionIds();
    const requests = [];

    for (const submission of this.pendingItemsOnPage()) {
      if (!selectedIds.has(submission.id)) {
        continue;
      }

      const reason = this.getDraft(submission).rejectionReason.trim();
      if (reason.length < 3) {
        this.actionErrorKey.set(
          'shell.adminSpace.productSubmissions.errors.rejectionReasonRequiredForSelected',
        );
        return;
      }

      requests.push(
        this.merchantsService.reviewAdminProductSubmission(submission.id, {
          status: 'REJECTED',
          rejectionReason: reason,
        }),
      );
    }

    if (requests.length === 0) {
      return;
    }

    this.batchRejecting.set(true);
    this.actionErrorKey.set(null);

    forkJoin(requests).subscribe({
      next: (result) => {
        this.batchRejecting.set(false);
        this.selectedSubmissionIds.set(new Set<string>());
        this.successKey.set(
          result.length > 1
            ? 'shell.adminSpace.productSubmissions.messages.batchRejectedMany'
            : 'shell.adminSpace.productSubmissions.messages.batchRejectedOne',
        );
        this.loadSubmissions(this.currentPage(), this.pageSize());
      },
      error: (error) => {
        this.batchRejecting.set(false);
        this.actionErrorKey.set(this.mapApiError(error));
      },
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

  isSelected(id: string): boolean {
    return this.selectedSubmissionIds().has(id);
  }

  canReview(submission: AdminProductSubmission): boolean {
    return submission.status === 'PENDING';
  }

  canApprove(submission: AdminProductSubmission): boolean {
    const draft = this.getDraft(submission);
    return (
      this.canReview(submission) &&
      !draft.imageUploading &&
      !!draft.imageAssetId
    );
  }

  hasApprovedDiff(submission: AdminProductSubmission): boolean {
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

  getRootCategories(): AdminProductCategory[] {
    return this.categories().filter((category) => category.parentId == null);
  }

  getSubCategoriesFor(categoryId: string): AdminProductCategory[] {
    if (!categoryId) {
      return [];
    }

    return this.categories().filter(
      (category) => category.parentId === categoryId,
    );
  }

  onDraftCategoryChange(
    submission: AdminProductSubmission,
    categoryId: string,
  ): void {
    const current = this.getDraft(submission);
    const subCategories = this.getSubCategoriesFor(categoryId);
    const shouldKeepSubCategory = subCategories.some(
      (category) => category.id === current.subCategoryId,
    );

    this.updateDraft(submission, {
      categoryId,
      ...(shouldKeepSubCategory ? {} : { subCategoryId: '' }),
    });
  }

  getCategoryDisplayLabel(submission: AdminProductSubmission): string {
    if (!submission.subCategory?.name) {
      return submission.category.name;
    }

    return `${submission.category.name} / ${submission.subCategory.name}`;
  }

  onViewDiff(submission: AdminProductSubmission): void {
    this.dialog.open(SubmissionDiffDialogComponent, {
      width: '600px',
      maxWidth: '95vw',
      data: submission,
    });
  }

  getSaleUnitLabel(saleUnit: Product['saleUnit']): string {
    return `shop.saleUnit.${saleUnit.toLowerCase()}`;
  }

  getStatusLabel(status: ProductSubmissionStatus): string {
    return `shell.adminSpace.productSubmissions.status.${status.toLowerCase()}`;
  }

  getDraft(submission: AdminProductSubmission): InlineSubmissionDraft {
    return (
      this.inlineDraftById()[submission.id] ?? this.createDraft(submission)
    );
  }

  updateDraft(
    submission: AdminProductSubmission,
    patch: Partial<InlineSubmissionDraft>,
  ): void {
    const current = this.getDraft(submission);
    this.inlineDraftById.update((all) => ({
      ...all,
      [submission.id]: {
        ...current,
        ...patch,
      },
    }));
  }

  getDescriptionPreview(description: string | null, maxLength = 90): string {
    const value = (description ?? '').trim();
    if (!value) {
      return '-';
    }
    if (value.length <= maxLength) {
      return value;
    }
    return `${value.slice(0, maxLength).trim()}...`;
  }

  formatPrice(priceInCents: number | null): string {
    if (priceInCents == null) {
      return '-';
    }

    return (priceInCents / 100).toFixed(2);
  }

  getDraftImageAlt(submission: AdminProductSubmission): string {
    return this.getDraft(submission).name.trim() || submission.name;
  }

  private pruneSelectionForCurrentPage(): void {
    const visiblePendingIds = new Set(
      this.pendingItemsOnPage().map((item) => item.id),
    );
    this.selectedSubmissionIds.update((current) => {
      const next = new Set<string>();
      for (const id of current) {
        if (visiblePendingIds.has(id)) {
          next.add(id);
        }
      }
      return next;
    });
  }

  private initializeDraftsForPage(data: AdminProductSubmission[]): void {
    const next: Record<string, InlineSubmissionDraft> = {};
    for (const submission of data) {
      next[submission.id] = this.createDraft(submission);
    }
    this.inlineDraftById.set(next);
  }

  private createDraft(
    submission: AdminProductSubmission,
  ): InlineSubmissionDraft {
    return {
      name: submission.name,
      categoryId: submission.category.id,
      subCategoryId: submission.subCategory?.id ?? '',
      saleUnit: submission.saleUnit,
      price: this.formatDraftPrice(submission.priceInCents),
      description: submission.description ?? '',
      rejectionReason: submission.rejectionReason ?? '',
      imageAssetId: '',
      imagePreviewUrl: '',
      imageUploading: false,
      imageErrorKey: null,
      imageAltText: submission.name,
      imageDominantColor: '',
    };
  }

  private buildMergedDraftMetadata(
    draft: InlineSubmissionDraft,
    autoMeta: AdminImageMetadataDraft,
  ): InlineSubmissionDraft {
    return {
      ...draft,
      imageAltText: draft.imageAltText.trim() || autoMeta.altText,
      imageDominantColor:
        this.normalizeDominantColor(draft.imageDominantColor) ||
        autoMeta.dominantColor,
      imageUploading: true,
      imageErrorKey: null,
    };
  }

  private validateAndBuildUploadOptions(draft: InlineSubmissionDraft): {
    targetFolder: string;
    altText: string;
    dominantColor: string;
  } | null {
    return {
      targetFolder: 'product-submissions',
      altText: draft.imageAltText.trim() || draft.name.trim(),
      dominantColor: this.normalizeDominantColor(draft.imageDominantColor),
    };
  }

  private normalizeDominantColor(value: string): string {
    const normalized = value.trim();
    if (!normalized) {
      return '';
    }

    const withHash = normalized.startsWith('#') ? normalized : `#${normalized}`;
    return /^#[0-9a-fA-F]{6}$/.test(withHash) ? withHash.toUpperCase() : '';
  }

  private formatDraftPrice(priceInCents: number | null): string {
    if (priceInCents == null) {
      return '';
    }
    return (priceInCents / 100).toFixed(2);
  }

  private buildApprovePayload(
    submission: AdminProductSubmission,
  ): ReviewAdminProductSubmissionPayload | null {
    const draft = this.getDraft(submission);
    const name = draft.name.trim();
    if (name.length < 2 || name.length > 191) {
      this.actionErrorKey.set('auth.apiErrors.VALIDATION_ERROR');
      return null;
    }

    if (!draft.categoryId.trim()) {
      this.actionErrorKey.set('auth.apiErrors.VALIDATION_ERROR');
      return null;
    }

    const description = draft.description.trim();
    if (description.length > 2000) {
      this.actionErrorKey.set('auth.apiErrors.VALIDATION_ERROR');
      return null;
    }

    const priceInCents = this.parsePriceToCents(draft.price);
    if (priceInCents === null) {
      this.actionErrorKey.set('auth.apiErrors.VALIDATION_ERROR');
      return null;
    }

    if (draft.imageUploading) {
      this.actionErrorKey.set(
        'shell.adminSpace.productSubmissions.errors.imageUploadInProgress',
      );
      return null;
    }

    if (!draft.imageAssetId) {
      this.actionErrorKey.set(
        'shell.adminSpace.productSubmissions.errors.imageRequired',
      );
      return null;
    }

    const payload: ReviewAdminProductSubmissionPayload = {
      status: 'APPROVED',
      imageAssetId: draft.imageAssetId,
    };

    if (name !== submission.name) {
      payload.name = name;
    }
    if (draft.categoryId !== submission.category.id) {
      payload.categoryId = draft.categoryId;
    }
    if (
      (draft.subCategoryId || null) !== (submission.subCategory?.id ?? null)
    ) {
      payload.subCategoryId = draft.subCategoryId || null;
    }
    if (draft.saleUnit !== submission.saleUnit) {
      payload.saleUnit = draft.saleUnit;
    }
    if (description && description !== (submission.description ?? '')) {
      payload.description = description;
    }

    if (
      priceInCents !== undefined &&
      priceInCents !== submission.priceInCents
    ) {
      payload.priceInCents = priceInCents;
    }

    return payload;
  }

  private buildBatchApprovalItem(
    submission: AdminProductSubmission,
  ): ApproveAdminProductSubmissionBatchItem | null {
    const payload = this.buildApprovePayload(submission);
    if (!payload) {
      return null;
    }

    return {
      id: submission.id,
      ...(payload.name ? { name: payload.name } : {}),
      ...(payload.categoryId ? { categoryId: payload.categoryId } : {}),
      ...(payload.subCategoryId !== undefined
        ? { subCategoryId: payload.subCategoryId }
        : {}),
      ...(payload.saleUnit ? { saleUnit: payload.saleUnit } : {}),
      ...(payload.description ? { description: payload.description } : {}),
      ...(payload.priceInCents !== undefined
        ? { priceInCents: payload.priceInCents }
        : {}),
      ...(payload.imageAssetId ? { imageAssetId: payload.imageAssetId } : {}),
    };
  }

  private parsePriceToCents(value: string): number | undefined | null {
    const normalized = value.trim();
    if (!normalized) {
      return undefined;
    }

    const parsed = Number.parseFloat(normalized);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
    }

    return Math.round(parsed * 100);
  }

  private mapApiError(error: unknown): string {
    const code = extractApiErrorCode(error) || 'INTERNAL_SERVER_ERROR';
    return (
      AUTH_ERROR_I18N_KEY_BY_CODE[code] ||
      'auth.apiErrors.INTERNAL_SERVER_ERROR'
    );
  }
}

interface InlineSubmissionDraft {
  name: string;
  categoryId: string;
  subCategoryId: string;
  saleUnit: Product['saleUnit'];
  price: string;
  description: string;
  rejectionReason: string;
  imageAssetId: string;
  imagePreviewUrl: string;
  imageUploading: boolean;
  imageErrorKey: string | null;
  imageAltText: string;
  imageDominantColor: string;
}
