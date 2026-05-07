import { Component, inject, signal } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import { extractApiErrorCode } from '../../../core/errors/api-error.util';
import { AUTH_ERROR_I18N_KEY_BY_CODE } from '../../../core/errors/auth-error-i18n-map';
import { MerchantHours } from '../../../core/models/merchant-shop.model';
import { MerchantsService } from '../../../core/services/merchants.service';

type Weekday =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY';

const DAYS: Weekday[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

type DayHoursGroup = FormGroup<{
  enabled: FormControl<boolean>;
  startHour: FormControl<number>;
  endHour: FormControl<number>;
}>;

@Component({
  selector: 'app-admin-create-merchant',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    TranslocoPipe,
  ],
  templateUrl: './admin-create-merchant.component.html',
  styleUrl: './admin-create-merchant.component.scss',
})
export class AdminCreateMerchantComponent {
  private readonly merchantsService = inject(MerchantsService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly DAYS = DAYS;
  readonly saving = signal(false);
  readonly errorKey = signal<string | null>(null);
  readonly noPickupDayError = signal(false);

  readonly pickupStartHours = Array.from({ length: 12 }, (_, i) => i * 2);
  readonly pickupEndHours = Array.from({ length: 12 }, (_, i) => (i + 1) * 2);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    storeName: [
      '',
      [Validators.required, Validators.minLength(2), Validators.maxLength(120)],
    ],
    businessType: ['HANOUTE' as 'HANOUTE' | 'PATISSERIE', Validators.required],
    phone: ['', [Validators.maxLength(30)]],
    address: ['', [Validators.maxLength(255)]],
  });

  readonly pickupHoursArray: FormArray<DayHoursGroup> = this.fb.array(
    DAYS.map(
      () =>
        this.fb.nonNullable.group({
          enabled: [false],
          startHour: [8],
          endHour: [20],
        }) as DayHoursGroup,
    ),
  );

  get pickupDayGroups(): DayHoursGroup[] {
    return this.pickupHoursArray.controls as DayHoursGroup[];
  }

  onSubmit(): void {
    if (this.saving()) {
      return;
    }

    this.errorKey.set(null);
    this.noPickupDayError.set(false);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const pickupHours = this.buildPickupHours();
    if (pickupHours.length === 0) {
      this.noPickupDayError.set(true);
      return;
    }

    const raw = this.form.getRawValue();
    this.saving.set(true);

    this.merchantsService
      .createMerchantInvite({
        email: raw.email.trim().toLowerCase(),
        storeName: raw.storeName.trim(),
        businessType: raw.businessType,
        ...(raw.phone.trim() ? { phone: raw.phone.trim() } : {}),
        ...(raw.address.trim() ? { address: raw.address.trim() } : {}),
        pickupHours,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.router.navigate(['/admin-space/merchants'], {
            queryParams: { invited: '1' },
          });
        },
        error: (error) => {
          this.saving.set(false);
          const code = extractApiErrorCode(error) || 'INTERNAL_SERVER_ERROR';
          this.errorKey.set(
            AUTH_ERROR_I18N_KEY_BY_CODE[code] ??
              'auth.apiErrors.INTERNAL_SERVER_ERROR',
          );
        },
      });
  }

  clearError(): void {
    this.errorKey.set(null);
  }

  getDayLabel(day: Weekday): string {
    return `shop.day.${day}`;
  }

  private buildPickupHours(): MerchantHours[] {
    const hours: MerchantHours[] = [];
    for (let i = 0; i < DAYS.length; i++) {
      const group = this.pickupDayGroups[i];
      if (group.controls['enabled'].value) {
        hours.push({
          dayOfWeek: DAYS[i],
          startHour: group.controls['startHour'].value,
          endHour: group.controls['endHour'].value,
        });
      }
    }

    return hours;
  }
}
