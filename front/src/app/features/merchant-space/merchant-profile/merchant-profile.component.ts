import { Component, effect, inject, signal } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  MerchantHours,
  MerchantProfile,
  UpdateMerchantProfilePayload,
  Weekday,
} from '../../../core/models/merchant-shop.model';
import { MerchantsService } from '../../../core/services/merchants.service';
import { UiFeedbackService } from '../../../core/services/ui-feedback.service';

type DayHoursGroup = FormGroup<{
  enabled: FormControl<boolean>;
  startHour: FormControl<number>;
  endHour: FormControl<number>;
}>;

const DAYS: Weekday[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

@Component({
  selector: 'app-merchant-profile',
  imports: [
    ReactiveFormsModule,
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
  templateUrl: './merchant-profile.component.html',
  styleUrl: './merchant-profile.component.scss',
})
export class MerchantProfileComponent {
  private readonly fb = inject(FormBuilder);
  private readonly merchantsService = inject(MerchantsService);
  private readonly uiFeedback = inject(UiFeedbackService);

  readonly DAYS = DAYS;
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly loadErrorKey = signal<string | null>(null);
  readonly saveErrorKey = signal<string | null>(null);
  readonly profile = signal<MerchantProfile | null>(null);

  readonly openingStartHours = Array.from({ length: 24 }, (_, i) => i);
  readonly openingEndHours = Array.from({ length: 24 }, (_, i) => i + 1);
  readonly pickupStartHours = Array.from({ length: 12 }, (_, i) => i * 2);
  readonly pickupEndHours = Array.from({ length: 12 }, (_, i) => (i + 1) * 2);

  readonly form = this.fb.nonNullable.group({
    storeName: [
      '',
      [Validators.required, Validators.minLength(2), Validators.maxLength(120)],
    ],
    description: ['', [Validators.maxLength(2000)]],
    phone: ['', [Validators.maxLength(30)]],
    address: ['', [Validators.maxLength(255)]],
    city: ['', [Validators.maxLength(100)]],
    zipCode: ['', [Validators.maxLength(10)]],
    pickupSlotCapacity: [
      10,
      [Validators.required, Validators.min(1), Validators.max(999)],
    ],
  });

  readonly openingHoursArray: FormArray<DayHoursGroup> = this.fb.array(
    DAYS.map(() => this.buildDayGroup(false, 8, 18)),
  );

  readonly pickupHoursArray: FormArray<DayHoursGroup> = this.fb.array(
    DAYS.map(() => this.buildDayGroup(false, 8, 20)),
  );

  get openingDayGroups(): DayHoursGroup[] {
    return this.openingHoursArray.controls as DayHoursGroup[];
  }

  get pickupDayGroups(): DayHoursGroup[] {
    return this.pickupHoursArray.controls as DayHoursGroup[];
  }

  constructor() {
    effect(() => {
      const currentError = this.loadErrorKey() ?? this.saveErrorKey();
      if (currentError) {
        this.uiFeedback.showError(currentError);
      } else {
        this.uiFeedback.clearError();
      }
    });

    this.merchantsService.getMyProfile().subscribe({
      next: (profile) => {
        this.profile.set(profile);
        this.patchForm(profile);
        this.loading.set(false);
      },
      error: () => {
        this.loadErrorKey.set('shell.merchant.profile.errors.loadFailed');
        this.loading.set(false);
      },
    });
  }

  onSubmit(): void {
    if (this.form.invalid || this.saving()) return;

    const pickupEnabled = this.pickupHoursArray.controls.some(
      (g) => (g as DayHoursGroup).controls.enabled.value,
    );
    if (!pickupEnabled) {
      this.saveErrorKey.set('shell.merchant.profile.pickupHoursRequired');
      return;
    }

    const raw = this.form.getRawValue();
    const payload: UpdateMerchantProfilePayload = {
      storeName: raw.storeName,
      description: raw.description || undefined,
      phone: raw.phone || undefined,
      address: raw.address || undefined,
      city: raw.city || undefined,
      zipCode: raw.zipCode || undefined,
      pickupSlotCapacity: raw.pickupSlotCapacity,
      openingHours: this.extractEnabledHours(this.openingHoursArray),
      pickupHours: this.extractEnabledHours(this.pickupHoursArray),
    };

    this.saving.set(true);
    this.saveErrorKey.set(null);

    this.merchantsService.updateMyProfile(payload).subscribe({
      next: (updated) => {
        this.profile.set(updated);
        this.saving.set(false);
        this.uiFeedback.showSuccessToast('shell.merchant.profile.saveSuccess');
      },
      error: () => {
        this.saveErrorKey.set('shell.merchant.profile.errors.saveFailed');
        this.saving.set(false);
      },
    });
  }

  private buildDayGroup(
    enabled: boolean,
    startHour: number,
    endHour: number,
  ): DayHoursGroup {
    return this.fb.nonNullable.group({
      enabled: [enabled as boolean],
      startHour: [startHour as number],
      endHour: [endHour as number],
    }) as DayHoursGroup;
  }

  private patchForm(profile: MerchantProfile): void {
    this.form.patchValue({
      storeName: profile.storeName,
      description: profile.description ?? '',
      phone: profile.phone ?? '',
      address: profile.address ?? '',
      city: profile.city ?? '',
      zipCode: profile.zipCode ?? '',
      pickupSlotCapacity: profile.pickupSlotCapacity ?? 10,
    });

    this.patchDayArray(this.openingHoursArray, profile.openingHours, 8, 18);
    this.patchDayArray(this.pickupHoursArray, profile.pickupHours, 8, 20);
  }

  private patchDayArray(
    array: FormArray<DayHoursGroup>,
    hours: MerchantHours[],
    defaultStart: number,
    defaultEnd: number,
  ): void {
    DAYS.forEach((day, i) => {
      const entry = hours.find((h) => h.dayOfWeek === day);
      (array.controls[i] as DayHoursGroup).patchValue({
        enabled: !!entry,
        startHour: entry?.startHour ?? defaultStart,
        endHour: entry?.endHour ?? defaultEnd,
      });
    });
  }

  private extractEnabledHours(
    array: FormArray<DayHoursGroup>,
  ): MerchantHours[] {
    return array.controls
      .map((group, i) => ({
        enabled: (group as DayHoursGroup).controls.enabled.value,
        dayOfWeek: DAYS[i],
        startHour: (group as DayHoursGroup).controls.startHour.value,
        endHour: (group as DayHoursGroup).controls.endHour.value,
      }))
      .filter((d) => d.enabled)
      .map(({ dayOfWeek, startHour, endHour }) => ({
        dayOfWeek,
        startHour,
        endHour,
      }));
  }
}
