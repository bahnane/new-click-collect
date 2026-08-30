import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  ViewChild,
} from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
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
  Subject,
  forkJoin,
  switchMap,
  takeUntil,
  distinctUntilChanged,
  debounceTime,
} from 'rxjs';
import { AUTH_ERROR_I18N_KEY_BY_CODE } from '../../../core/errors/auth-error-i18n-map';
import { extractApiErrorCode } from '../../../core/errors/api-error.util';
import {
  MerchantHours,
  BusinessType,
  MerchantProfile,
  UpdateMerchantProfilePayload,
  Weekday,
} from '../../../core/models/merchant-shop.model';
import {
  AddressSearchService,
  AddressSearchSuggestion,
} from '../../../core/services/address-search.service';
import { AuthService } from '../../../core/services/auth.service';
import { MerchantsService } from '../../../core/services/merchants.service';
import { UiFeedbackService } from '../../../core/services/ui-feedback.service';

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
  startHour: FormControl<number | null>;
  endHour: FormControl<number | null>;
}>;

type OnboardingStatus =
  | 'PROFILE_REQUIRED'
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'CHANGES_REQUESTED'
  | 'INACTIVE';

function normalizeDigits(value: string): string {
  return value.replace(/\D+/g, '');
}

function isValidLuhn(value: string): boolean {
  let sum = 0;
  let doubleDigit = false;

  for (let i = value.length - 1; i >= 0; i -= 1) {
    let digit = Number.parseInt(value.charAt(i), 10);

    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    doubleDigit = !doubleDigit;
  }

  return sum % 10 === 0;
}

function luhnFieldValidator(requiredLength: number): ValidatorFn {
  return (control: AbstractControl<string | null>): ValidationErrors | null => {
    const rawValue = (control.value ?? '').trim();

    if (!rawValue) {
      return null;
    }

    const digits = normalizeDigits(rawValue);

    if (digits.length !== requiredLength) {
      return { legalIdLength: { requiredLength } };
    }

    if (!isValidLuhn(digits)) {
      return { legalIdLuhn: true };
    }

    return null;
  };
}

@Component({
  selector: 'app-merchant-onboarding',
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
  templateUrl: './merchant-onboarding.component.html',
  styleUrl: './merchant-onboarding.component.scss',
})
export class MerchantOnboardingComponent {
  private readonly fb = inject(FormBuilder);
  private readonly merchantsService = inject(MerchantsService);
  private readonly authService = inject(AuthService);
  private readonly uiFeedback = inject(UiFeedbackService);
  private readonly addressSearchService = inject(AddressSearchService);
  private readonly hostElement = inject(ElementRef<HTMLElement>);

  private pickupHoursSectionElement: HTMLElement | null = null;
  private pickupHoursErrorAnchorElement: HTMLElement | null = null;
  private readonly destroy$ = new Subject<void>();
  private readonly searchInput$ = new Subject<string>();
  private leaflet: typeof import('leaflet') | null = null;
  private mapInstance: import('leaflet').Map | null = null;
  private markerInstance: import('leaflet').Marker | null = null;
  private mapContainerElement: HTMLElement | null = null;

  readonly DAYS = DAYS;
  readonly loading = signal(true);
  readonly savingDraft = signal(false);
  readonly submitting = signal(false);
  readonly validationRequested = signal(false);
  readonly searchQuery = signal('');
  readonly searchResults = signal<AddressSearchSuggestion[]>([]);
  readonly isSearchingAddress = signal(false);
  readonly selectedAddress = signal<AddressSearchSuggestion | null>(null);
  readonly selectedAddressCoordinates = signal<{
    latitude: number;
    longitude: number;
  } | null>(null);
  readonly addressFieldsLocked = signal(false);
  readonly mapPreviewVisible = signal(false);
  readonly mapPreviewReady = signal(false);
  readonly mapPreviewError = signal<string | null>(null);
  readonly mapOverlayVisible = signal(false);
  readonly loadErrorKey = signal<string | null>(null);
  readonly saveErrorKey = signal<string | null>(null);
  readonly successKey = signal<string | null>(null);
  readonly profile = signal<MerchantProfile | null>(null);
  readonly businessTypes = signal<BusinessType[]>([]);
  readonly changeRequestReason = computed(
    () => this.profile()?.changesRequestedReason?.trim() || null,
  );
  readonly isReadOnly = computed(
    () => this.accessState() === 'PENDING_APPROVAL',
  );

  readonly openingStartHours = Array.from({ length: 24 }, (_, i) => i);
  readonly openingEndHours = Array.from({ length: 24 }, (_, i) => i + 1);
  readonly pickupStartHours = Array.from({ length: 12 }, (_, i) => i * 2);
  readonly pickupEndHours = Array.from({ length: 12 }, (_, i) => (i + 1) * 2);

  @ViewChild('pickupHoursSection')
  set pickupHoursSection(element: ElementRef<HTMLElement> | undefined) {
    this.pickupHoursSectionElement = element?.nativeElement ?? null;
  }

  @ViewChild('pickupHoursErrorAnchor')
  set pickupHoursErrorAnchor(element: ElementRef<HTMLElement> | undefined) {
    this.pickupHoursErrorAnchorElement = element?.nativeElement ?? null;
  }

  readonly accessState = computed<OnboardingStatus>(() => {
    const state = this.authService.currentUser()?.merchantAccessState;

    if (
      state === 'PROFILE_REQUIRED' ||
      state === 'DRAFT' ||
      state === 'PENDING_APPROVAL' ||
      state === 'CHANGES_REQUESTED' ||
      state === 'INACTIVE'
    ) {
      return state;
    }

    return 'DRAFT';
  });

  readonly form = this.fb.nonNullable.group({
    storeName: [
      '',
      [Validators.required, Validators.minLength(2), Validators.maxLength(120)],
    ],
    businessTypeId: ['', Validators.required],
    description: ['', [Validators.maxLength(2000)]],
    phone: ['', [Validators.required, Validators.maxLength(30)]],
    address: ['', [Validators.required, Validators.maxLength(255)]],
    city: ['', [Validators.required, Validators.maxLength(100)]],
    zipCode: ['', [Validators.required, Validators.maxLength(10)]],
    pickupSlotCapacity: [
      10,
      [Validators.required, Validators.min(1), Validators.max(999)],
    ],
    siret: ['', [Validators.required, luhnFieldValidator(14)]],
  });

  readonly openingHoursArray: FormArray<DayHoursGroup> = this.fb.array(
    DAYS.map(() => this.buildDayGroup(false, 8, 18)),
  );

  readonly pickupHoursArray: FormArray<DayHoursGroup> = this.fb.array(
    DAYS.map(() => this.buildDayGroup(false, null, null)),
  );

  get openingDayGroups(): DayHoursGroup[] {
    return this.openingHoursArray.controls as DayHoursGroup[];
  }

  get pickupDayGroups(): DayHoursGroup[] {
    return this.pickupHoursArray.controls as DayHoursGroup[];
  }

  hasPickupHoursSectionError(): boolean {
    const errorKey = this.saveErrorKey();
    return (
      errorKey === 'shell.merchant.onboarding.errors.pickupHoursRequired' ||
      errorKey === 'auth.apiErrors.MERCHANT_PROFILE_INCOMPLETE'
    );
  }

  hasOpeningHoursSectionError(): boolean {
    const errorKey = this.saveErrorKey();
    return errorKey === 'shell.merchant.onboarding.errors.openingHoursRequired';
  }

  constructor() {
    this.pickupDayGroups.forEach((group) =>
      this.configurePickupDayGroup(group),
    );

    this.searchInput$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((query) => {
        const normalized = query.trim();
        if (!normalized) {
          this.searchResults.set([]);
          this.isSearchingAddress.set(false);
          return;
        }

        this.isSearchingAddress.set(true);
        this.addressSearchService.search(normalized).subscribe({
          next: (results) => {
            this.searchResults.set(results);
            this.isSearchingAddress.set(false);
          },
          error: () => {
            this.searchResults.set([]);
            this.isSearchingAddress.set(false);
          },
        });
      });

    effect(() => {
      if (this.isReadOnly()) {
        this.form.disable({ emitEvent: false });
        this.openingDayGroups.forEach((group) =>
          this.syncOpeningDayGroupState(group),
        );
        this.pickupDayGroups.forEach((group) =>
          this.syncPickupDayGroupState(group),
        );
        return;
      }

      this.form.enable({ emitEvent: false });
      this.openingDayGroups.forEach((group) =>
        this.syncOpeningDayGroupState(group),
      );
      this.pickupDayGroups.forEach((group) =>
        this.syncPickupDayGroupState(group),
      );
    });

    effect(() => {
      const currentError = this.loadErrorKey() ?? this.saveErrorKey();
      if (currentError) {
        this.uiFeedback.showError(currentError);
      } else {
        this.uiFeedback.clearError();
      }
    });

    forkJoin({
      profile: this.merchantsService.getMyProfile(),
      businessTypes: this.merchantsService.getBusinessTypes(),
    }).subscribe({
      next: ({ profile, businessTypes }) => {
        this.profile.set(profile);
        this.businessTypes.set(businessTypes);
        this.patchForm(profile);
        this.loading.set(false);
      },
      error: () => {
        this.loadErrorKey.set('shell.merchant.onboarding.errors.loadFailed');
        this.loading.set(false);
      },
    });
  }

  onAddressInputChange(value: string): void {
    this.searchQuery.set(value);
    this.searchInput$.next(value);
  }

  onSelectAddress(suggestion: AddressSearchSuggestion): void {
    this.selectedAddress.set(suggestion);
    this.selectedAddressCoordinates.set({
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
    });
    this.setAddressFieldsLocked(true);
    this.searchResults.set([]);
    this.searchQuery.set(suggestion.label);
    this.applyAddressSelectionToForm(suggestion);
    this.mapPreviewVisible.set(true);
    this.mapOverlayVisible.set(true);
    this.mapPreviewReady.set(false);
    this.mapPreviewError.set(null);
    requestAnimationFrame(() => {
      void this.initializeMapPreview(suggestion.latitude, suggestion.longitude);
    });
  }

  onConfirmAddressSelection(): void {
    if (!this.selectedAddress()) {
      return;
    }

    const selected = this.selectedAddress()!;
    this.form.patchValue({
      address: selected.addressLine,
      city: selected.city ?? '',
      zipCode: selected.zipCode ?? '',
    });
    this.searchResults.set([]);
    this.mapOverlayVisible.set(false);
    this.mapPreviewVisible.set(false);
    this.mapPreviewReady.set(false);
  }

  onEditAddressSelection(): void {
    this.resetAddressSelection();
  }

  onBackToAddressForm(): void {
    this.resetAddressSelection();
  }

  @ViewChild('addressMap')
  set addressMapElement(element: ElementRef<HTMLElement> | undefined) {
    this.mapContainerElement = element?.nativeElement ?? null;
    if (this.selectedAddress()) {
      void this.initializeMapPreview(
        this.selectedAddress()!.latitude,
        this.selectedAddress()!.longitude,
      );
    }
  }

  private resetAddressSelection(): void {
    this.form.patchValue({
      address: '',
      city: '',
      zipCode: '',
    });
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.selectedAddress.set(null);
    this.selectedAddressCoordinates.set(null);
    this.setAddressFieldsLocked(false);
    this.mapPreviewVisible.set(false);
    this.mapOverlayVisible.set(false);
    this.mapPreviewReady.set(false);
    this.mapPreviewError.set(null);

    if (this.mapInstance) {
      this.mapInstance.remove();
      this.mapInstance = null;
    }
    this.markerInstance = null;
  }

  private applyAddressSelectionToForm(
    selection: AddressSearchSuggestion | null,
  ): void {
    if (!selection) {
      return;
    }

    this.form.patchValue({
      address: selection.addressLine,
      city: selection.city ?? '',
      zipCode: selection.zipCode ?? '',
    });
  }

  private updateAddressFromMarker(latitude: number, longitude: number): void {
    this.selectedAddressCoordinates.set({ latitude, longitude });
    this.addressSearchService.reverseGeocode(latitude, longitude).subscribe({
      next: (selection) => {
        if (!selection) {
          return;
        }

        const normalizedSelection: AddressSearchSuggestion = {
          ...selection,
          latitude,
          longitude,
        };

        this.selectedAddress.set(normalizedSelection);
        this.applyAddressSelectionToForm(normalizedSelection);
        this.searchQuery.set(normalizedSelection.label);
      },
      error: () => {
        this.mapPreviewError.set(
          'shell.merchant.onboarding.addressMap.geocodeFailed',
        );
      },
    });
  }

  private async initializeMapPreview(
    latitude: number,
    longitude: number,
  ): Promise<void> {
    if (!this.mapContainerElement) {
      requestAnimationFrame(() => {
        void this.initializeMapPreview(latitude, longitude);
      });
      return;
    }

    if (!this.leaflet) {
      this.leaflet = await import('leaflet');
    }

    if (this.mapInstance) {
      this.mapInstance.remove();
      this.mapInstance = null;
    }
    this.markerInstance = null;

    this.mapInstance = this.leaflet.map(this.mapContainerElement, {
      zoomControl: true,
    });
    this.leaflet
      .tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      })
      .addTo(this.mapInstance);

    this.mapInstance.setView([latitude, longitude], 15);

    const markerIcon = this.leaflet.icon({
      iconUrl:
        'data:image/svg+xml;charset=UTF-8,' +
        encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
            <path fill="#d32f2f" d="M24 4c-8.8 0-16 7.2-16 16 0 11.7 16 24 16 24s16-12.3 16-24c0-8.8-7.2-16-16-16z"/>
            <circle cx="24" cy="20" r="8" fill="#ffffff"/>
          </svg>
        `),
      iconSize: [28, 28],
      iconAnchor: [14, 28],
      popupAnchor: [0, -28],
    });

    this.markerInstance = this.leaflet
      .marker([latitude, longitude], { draggable: true, icon: markerIcon })
      .addTo(this.mapInstance);

    this.markerInstance.on('dragend', () => {
      const position = this.markerInstance?.getLatLng();
      if (position) {
        this.mapPreviewError.set(null);
        this.updateAddressFromMarker(position.lat, position.lng);
      }
    });

    this.updateAddressFromMarker(latitude, longitude);
    this.mapPreviewReady.set(true);
    this.mapPreviewError.set(null);
    requestAnimationFrame(() => {
      this.mapInstance?.invalidateSize();
      this.mapInstance?.setView([latitude, longitude], 15);
    });
  }

  onSaveDraft(): void {
    if (this.savingDraft() || this.submitting()) {
      return;
    }

    this.validationRequested.set(false);
    this.saveErrorKey.set(null);
    this.successKey.set(null);

    const payload = this.buildPayload();
    this.savingDraft.set(true);

    this.merchantsService.updateMyProfile(payload).subscribe({
      next: (updatedProfile) => {
        this.profile.set(updatedProfile);
        this.savingDraft.set(false);
        this.validationRequested.set(false);
        this.successKey.set('shell.merchant.onboarding.success.draftSaved');
        this.scrollToTopAfterDraftSave();
      },
      error: (error) => {
        this.savingDraft.set(false);
        this.handleSaveError(error);
      },
    });
  }

  onSubmitForApproval(): void {
    if (this.savingDraft() || this.submitting()) {
      return;
    }

    if (!this.validateBeforeSubmit()) {
      return;
    }

    this.submitting.set(true);

    this.merchantsService
      .updateMyProfile(this.buildPayload())
      .pipe(switchMap(() => this.merchantsService.submitMyProfileForApproval()))
      .subscribe({
        next: (updatedProfile) => {
          this.profile.set(updatedProfile);
          this.syncCurrentUserState();
          this.submitting.set(false);
          this.validationRequested.set(false);
          this.successKey.set('shell.merchant.onboarding.success.submitted');
        },
        error: (error) => {
          this.submitting.set(false);
          this.handleSaveError(error);
        },
      });
  }

  logout(): void {
    if (this.savingDraft() || this.submitting()) {
      return;
    }

    this.authService.logout().subscribe();
  }

  private syncCurrentUserState(): void {
    this.authService.refreshAccessToken().subscribe();
  }

  private validateBeforeSubmit(): boolean {
    this.validationRequested.set(true);
    this.saveErrorKey.set(null);
    this.successKey.set(null);
    this.form.markAllAsTouched();

    const openingEnabled = this.openingHoursArray.controls.some(
      (group) => (group as DayHoursGroup).controls.enabled.value,
    );

    const pickupEnabled = this.pickupHoursArray.controls.some(
      (group) => (group as DayHoursGroup).controls.enabled.value,
    );

    if (!openingEnabled) {
      this.saveErrorKey.set(
        'shell.merchant.onboarding.errors.openingHoursRequired',
      );
    } else if (!pickupEnabled) {
      this.saveErrorKey.set(
        'shell.merchant.onboarding.errors.pickupHoursRequired',
      );
    }

    if (this.form.invalid || this.hasInvalidPickupHoursSelection()) {
      this.scrollToTopmostInvalidControl();
      return false;
    }

    if (!openingEnabled || !pickupEnabled) {
      this.scrollToTopmostInvalidControl();
      return false;
    }

    return true;
  }

  private buildDayGroup(
    enabled: boolean,
    startHour: number | null,
    endHour: number | null,
  ): DayHoursGroup {
    return this.fb.group({
      enabled: this.fb.nonNullable.control(enabled),
      startHour: this.fb.control<number | null>(startHour),
      endHour: this.fb.control<number | null>(endHour),
    }) as DayHoursGroup;
  }

  private buildPayload(): UpdateMerchantProfilePayload {
    const raw = this.form.getRawValue();
    const selectedAddressCoordinates =
      this.selectedAddressCoordinates() ?? this.getProfileCoordinates();

    return {
      storeName: raw.storeName,
      businessTypeId: raw.businessTypeId,
      description: raw.description || undefined,
      phone: raw.phone || undefined,
      address: raw.address || undefined,
      city: raw.city || undefined,
      zipCode: raw.zipCode || undefined,
      siret: raw.siret || undefined,
      latitude: selectedAddressCoordinates?.latitude,
      longitude: selectedAddressCoordinates?.longitude,
      pickupSlotCapacity: raw.pickupSlotCapacity,
      openingHours: this.extractEnabledHours(this.openingHoursArray),
      pickupHours: this.extractEnabledHours(this.pickupHoursArray),
    };
  }

  private patchForm(profile: MerchantProfile): void {
    this.form.patchValue({
      storeName: profile.storeName,
      businessTypeId: profile.businessType.id,
      description: profile.description ?? '',
      phone: profile.phone ?? '',
      address: profile.address ?? '',
      city: profile.city ?? '',
      zipCode: profile.zipCode ?? '',
      pickupSlotCapacity: profile.pickupSlotCapacity ?? 10,
    });
    this.searchQuery.set(profile.address ?? '');

    if (profile.latitude !== null && profile.longitude !== null) {
      this.selectedAddressCoordinates.set({
        latitude: profile.latitude,
        longitude: profile.longitude,
      });
      this.setAddressFieldsLocked(true);
    } else {
      this.selectedAddressCoordinates.set(null);
      this.setAddressFieldsLocked(false);
    }

    this.patchDayArray(this.openingHoursArray, profile.openingHours, 8, 18);
    this.patchDayArray(this.pickupHoursArray, profile.pickupHours, 8, 20);
  }

  private setAddressFieldsLocked(locked: boolean): void {
    if (this.isReadOnly()) {
      return;
    }

    this.addressFieldsLocked.set(locked);

    const addressControls = [
      this.form.controls.address,
      this.form.controls.city,
      this.form.controls.zipCode,
    ];

    if (locked) {
      addressControls.forEach((control) =>
        control.disable({ emitEvent: false }),
      );
      return;
    }

    addressControls.forEach((control) => control.enable({ emitEvent: false }));
  }

  private getProfileCoordinates(): {
    latitude: number;
    longitude: number;
  } | null {
    const profile = this.profile();
    if (!profile || profile.latitude === null || profile.longitude === null) {
      return null;
    }

    return {
      latitude: profile.latitude,
      longitude: profile.longitude,
    };
  }

  private patchDayArray(
    array: FormArray<DayHoursGroup>,
    hours: MerchantHours[],
    defaultStart: number,
    defaultEnd: number,
  ): void {
    DAYS.forEach((day, i) => {
      const entry = hours.find((h) => h.dayOfWeek === day);
      const group = array.controls[i] as DayHoursGroup;

      group.patchValue({
        enabled: !!entry,
        startHour: entry?.startHour ?? defaultStart,
        endHour: entry?.endHour ?? defaultEnd,
      });

      if (array === this.pickupHoursArray) {
        this.syncPickupDayGroupState(group);
      }
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
      .filter(
        (
          day,
        ): day is {
          enabled: true;
          dayOfWeek: Weekday;
          startHour: number;
          endHour: number;
        } => day.enabled && day.startHour !== null && day.endHour !== null,
      )
      .map(({ dayOfWeek, startHour, endHour }) => ({
        dayOfWeek,
        startHour,
        endHour,
      }));
  }

  private configurePickupDayGroup(group: DayHoursGroup): void {
    this.syncPickupDayGroupState(group);

    group.controls.enabled.valueChanges.subscribe(() => {
      this.syncPickupDayGroupState(group);
    });
  }

  private syncPickupDayGroupState(group: DayHoursGroup): void {
    if (this.isReadOnly()) {
      group.controls.enabled.disable({ emitEvent: false });
      group.controls.startHour.disable({ emitEvent: false });
      group.controls.endHour.disable({ emitEvent: false });
      return;
    }

    const enabled = group.controls.enabled.value;

    if (enabled) {
      group.controls.startHour.enable({ emitEvent: false });
      group.controls.endHour.enable({ emitEvent: false });
      group.controls.startHour.setValidators(Validators.required);
      group.controls.endHour.setValidators(Validators.required);
    } else {
      group.controls.startHour.clearValidators();
      group.controls.endHour.clearValidators();
      group.controls.startHour.reset(null, { emitEvent: false });
      group.controls.endHour.reset(null, { emitEvent: false });
      group.controls.startHour.disable({ emitEvent: false });
      group.controls.endHour.disable({ emitEvent: false });
    }

    group.controls.startHour.updateValueAndValidity({ emitEvent: false });
    group.controls.endHour.updateValueAndValidity({ emitEvent: false });
  }

  private syncOpeningDayGroupState(group: DayHoursGroup): void {
    if (this.isReadOnly()) {
      group.controls.enabled.disable({ emitEvent: false });
      group.controls.startHour.disable({ emitEvent: false });
      group.controls.endHour.disable({ emitEvent: false });
      return;
    }

    group.controls.enabled.enable({ emitEvent: false });
    group.controls.startHour.enable({ emitEvent: false });
    group.controls.endHour.enable({ emitEvent: false });
  }

  hasInvalidPickupHoursSelection(): boolean {
    return this.pickupDayGroups.some((group) => {
      const enabled = group.controls.enabled.value;

      return (
        enabled &&
        (group.controls.startHour.invalid || group.controls.endHour.invalid)
      );
    });
  }

  isPickupDayGroupInvalid(group: DayHoursGroup): boolean {
    return (
      group.controls.enabled.value &&
      (group.controls.startHour.invalid || group.controls.endHour.invalid)
    );
  }

  private handleSaveError(error: unknown): void {
    const code = extractApiErrorCode(error);
    const errorKey = this.resolveApiErrorKey(error);

    this.saveErrorKey.set(errorKey);

    if (
      code === 'MERCHANT_PROFILE_INCOMPLETE' ||
      code === 'VALIDATION_ERROR' ||
      errorKey === 'shell.merchant.onboarding.errors.pickupHoursRequired'
    ) {
      this.scrollToPickupHoursSectionWhenNeeded();
    }
  }

  private scrollToPickupHoursSectionWhenNeeded(): void {
    if (!this.hasPickupHoursSectionError()) {
      return;
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        this.scrollToPickupHoursSection();
      });
    });
  }

  private scrollToPickupHoursSection(): void {
    const element =
      this.pickupHoursErrorAnchorElement ?? this.pickupHoursSectionElement;
    if (!element) {
      return;
    }

    window.requestAnimationFrame(() => {
      element.focus({ preventScroll: true });
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
        inline: 'nearest',
      });
    });
  }

  private scrollToTopmostInvalidControl(): void {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const elements = Array.from(
          this.hostElement.nativeElement.querySelectorAll(
            'input.ng-invalid, textarea.ng-invalid, mat-select.ng-invalid, mat-checkbox.ng-invalid, [role="spinbutton"].ng-invalid, .day-row.has-error, .opening-hours-error, .pickup-hours-error',
          ),
        ) as HTMLElement[];

        const element = elements
          .filter((candidate) => {
            const rect = candidate.getBoundingClientRect();
            return rect.height > 0 && rect.width > 0;
          })
          .sort((left, right) => {
            const leftTop = left.getBoundingClientRect().top;
            const rightTop = right.getBoundingClientRect().top;
            if (leftTop !== rightTop) {
              return leftTop - rightTop;
            }

            return (
              left.getBoundingClientRect().left -
              right.getBoundingClientRect().left
            );
          })[0];

        if (!element) {
          return;
        }

        element.focus({ preventScroll: true });
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest',
        });
      });
    });
  }

  private scrollToTopAfterDraftSave(): void {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  private resolveApiErrorKey(error: unknown): string {
    const code = extractApiErrorCode(error);
    if (code) {
      return (
        AUTH_ERROR_I18N_KEY_BY_CODE[code] ??
        'auth.apiErrors.INTERNAL_SERVER_ERROR'
      );
    }

    return 'auth.apiErrors.INTERNAL_SERVER_ERROR';
  }
}
