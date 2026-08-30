import {
  Component,
  ElementRef,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  AdminBusinessType,
  AdminProductCategory,
  MerchantsService,
} from '../../../core/services/merchants.service';

@Component({
  selector: 'app-admin-product-categories',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    RouterLinkActive,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    TranslocoPipe,
  ],
  templateUrl: './admin-product-categories.component.html',
  styleUrl: './admin-product-categories.component.scss',
})
export class AdminProductCategoriesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly merchantsService = inject(MerchantsService);
  readonly categories = signal<AdminProductCategory[]>([]);
  readonly businessTypes = signal<AdminBusinessType[]>([]);
  readonly editingId = signal<string | null>(null);
  readonly saving = signal(false);
  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    slug: ['', [Validators.required, Validators.minLength(2)]],
    parentId: [''],
    businessTypeIds: [[] as string[]],
  });

  @ViewChild('editorForm') editorForm?: ElementRef<HTMLFormElement>;

  constructor() {
    this.load();
  }

  load(): void {
    this.merchantsService
      .listAdminProductCategories()
      .subscribe((categories) => this.categories.set(categories));
    this.merchantsService
      .listAdminBusinessTypes()
      .subscribe((businessTypes) => this.businessTypes.set(businessTypes));
  }

  edit(category: AdminProductCategory): void {
    this.editingId.set(category.id);
    this.form.setValue({
      name: category.name,
      slug: category.slug,
      parentId: category.parentId ?? '',
      businessTypeIds:
        category.businessTypes?.map((item) => item.businessType.id) ?? [],
    });
    requestAnimationFrame(() =>
      this.editorForm?.nativeElement.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      }),
    );
  }

  reset(): void {
    this.editingId.set(null);
    this.form.reset({ name: '', slug: '', parentId: '', businessTypeIds: [] });
  }

  save(): void {
    if (this.form.invalid || this.saving()) return;
    const value = this.form.getRawValue();
    const payload = {
      name: value.name.trim(),
      slug: value.slug.trim(),
      parentId: value.parentId || undefined,
      businessTypeIds: value.parentId ? undefined : value.businessTypeIds,
    };
    this.saving.set(true);
    const request = this.editingId()
      ? this.merchantsService.updateAdminProductCategory(
          this.editingId()!,
          payload,
        )
      : this.merchantsService.createAdminProductCategory(payload);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.reset();
        this.load();
      },
      error: () => this.saving.set(false),
    });
  }
}
