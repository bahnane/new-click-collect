import {
  Component,
  effect,
  ElementRef,
  inject,
  signal,
  ViewChild,
} from '@angular/core';
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
import { Router } from '@angular/router';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import {
  AddressSearchService,
  AddressSearchSuggestion,
} from '../../../core/services/address-search.service';
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

function normalizeText(value: string): string {
  return value.trim();
}

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
  private readonly addressSearchService = inject(AddressSearchService);
  private readonly uiFeedback = inject(UiFeedbackService);
  private readonly router = inject(Router);
  private readonly destroy$ = new Subject<void>();
  private readonly searchInput$ = new Subject<string>();
  private leaflet: typeof import('leaflet') | null = null;
  private mapInstance: import('leaflet').Map | null = null;
  private markerInstance: import('leaflet').Marker | null = null;
  private mapContainerElement: HTMLElement | null = null;

  readonly DAYS = DAYS;
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly loadErrorKey = signal<string | null>(null);
  readonly saveErrorKey = signal<string | null>(null);
  readonly profile = signal<MerchantProfile | null>(null);
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
  readonly mapOverlayVisible = signal(false);
  readonly mapPreviewReady = signal(false);
  readonly mapPreviewError = signal<string | null>(null);

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

  @ViewChild('addressSection')
  set addressSection(element: ElementRef<HTMLElement> | undefined) {
    this.addressSectionElement = element?.nativeElement ?? null;
  }

  private addressSectionElement: HTMLElement | null = null;

  constructor() {
    this.searchInput$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((query) => {
        const normalized = normalizeText(query);
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

  goBack(): void {
    this.router.navigate(['/merchant', 'account']);
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

  onSubmit(): void {
    if (this.form.invalid || this.saving()) return;

    const pickupEnabled = this.pickupHoursArray.controls.some(
      (g) => (g as DayHoursGroup).controls.enabled.value,
    );
    if (!pickupEnabled) {
      this.saveErrorKey.set('shell.merchant.profile.pickupHoursRequired');
      return;
    }

    if (!this.isAddressSelectionComplete()) {
      this.saveErrorKey.set(
        'shell.merchant.profile.errors.addressSelectionRequired',
      );
      this.scrollToAddressSection();
      return;
    }

    const raw = this.form.getRawValue();
    const selectedAddressCoordinates =
      this.selectedAddressCoordinates() ?? this.getProfileCoordinates();
    const payload: UpdateMerchantProfilePayload = {
      storeName: raw.storeName,
      description: raw.description || undefined,
      phone: raw.phone || undefined,
      address: raw.address || undefined,
      city: raw.city || undefined,
      zipCode: raw.zipCode || undefined,
      latitude: selectedAddressCoordinates?.latitude,
      longitude: selectedAddressCoordinates?.longitude,
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
      },
      error: () => {
        this.saveErrorKey.set('shell.merchant.profile.errors.saveFailed');
        this.saving.set(false);
      },
    });
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

  private setAddressFieldsLocked(locked: boolean): void {
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

  private isAddressSelectionComplete(): boolean {
    return Boolean(this.selectedAddressCoordinates());
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

  private scrollToAddressSection(): void {
    if (!this.addressSectionElement) {
      return;
    }

    window.requestAnimationFrame(() => {
      this.addressSectionElement?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
        inline: 'nearest',
      });
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

  private ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    if (this.mapInstance) {
      this.mapInstance.remove();
      this.mapInstance = null;
    }
  }
}
