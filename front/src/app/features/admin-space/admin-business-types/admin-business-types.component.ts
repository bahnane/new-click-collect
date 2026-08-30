import {
  Component,
  ElementRef,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
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
  selector: 'app-admin-business-types',
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
  templateUrl: './admin-business-types.component.html',
  styleUrl: './admin-business-types.component.scss',
})
export class AdminBusinessTypesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly merchantsService = inject(MerchantsService);
  readonly businessTypes = signal<AdminBusinessType[]>([]);
  readonly categories = signal<AdminProductCategory[]>([]);
  readonly editingId = signal<string | null>(null);
  readonly saving = signal(false);
  readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^[A-Z][A-Z0-9_]*$/)]],
    categoryIds: [[] as string[]],
    isActive: [true],
  });

  @ViewChild('editorForm') editorForm?: ElementRef<HTMLFormElement>;
  constructor() {
    this.load();
  }
  load(): void {
    this.merchantsService
      .listAdminBusinessTypes()
      .subscribe((items) => this.businessTypes.set(items));
    this.merchantsService
      .listAdminProductCategories()
      .subscribe((items) =>
        this.categories.set(items.filter((category) => !category.parentId)),
      );
  }
  edit(type: AdminBusinessType): void {
    this.editingId.set(type.id);
    this.form.setValue({
      code: type.code,
      categoryIds: type.categories.map((item) => item.category.id),
      isActive: type.isActive,
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
    this.form.reset({ code: '', categoryIds: [], isActive: true });
  }
  save(): void {
    if (this.form.invalid || this.saving()) return;
    const value = this.form.getRawValue();
    const payload = {
      code: value.code.trim(),
      categoryIds: value.categoryIds,
      isActive: value.isActive,
    };
    this.saving.set(true);
    const request = this.editingId()
      ? this.merchantsService.updateAdminBusinessType(
          this.editingId()!,
          payload,
        )
      : this.merchantsService.createAdminBusinessType(payload);
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
