import { DecimalPipe, DOCUMENT } from '@angular/common';
import {
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import { extractApiErrorCode } from '../../core/errors/api-error.util';
import { OrderListItem, PaginatedOrders } from '../../core/models/order.model';
import { AuthService } from '../../core/services/auth.service';
import { MerchantShopService } from '../../core/services/merchant-shop.service';
import { OrdersService } from '../../core/services/orders.service';
import { UiFeedbackService } from '../../core/services/ui-feedback.service';
import { ConfirmationDialogComponent } from '../../shared/dialogs/confirmation-dialog/confirmation-dialog.component';

const CUSTOMER_CANCEL_CONTACT_MERCHANT_CODES = new Set([
  'ORDER_CANCELLATION_NOT_ALLOWED_STATUS',
  'ORDER_CANCELLATION_PICKUP_STARTED',
  'ORDER_CANCELLATION_DEADLINE_PASSED',
]);

const MOROCCAN_CITIES: Array<{
  name: string;
  latitude: number;
  longitude: number;
}> = [
  { name: 'Agadir', latitude: 30.4278, longitude: -9.5981 },
  { name: 'Beni Mellal', latitude: 32.3373, longitude: -6.3498 },
  { name: 'Casablanca', latitude: 33.5731, longitude: -7.5898 },
  { name: 'El Jadida', latitude: 33.2316, longitude: -8.5007 },
  { name: 'Fes', latitude: 34.0331, longitude: -5.0003 },
  { name: 'Kenitra', latitude: 34.261, longitude: -6.58 },
  { name: 'Marrakech', latitude: 31.6295, longitude: -7.9811 },
  { name: 'Meknes', latitude: 33.8731, longitude: -5.5407 },
  { name: 'Mohammedia', latitude: 33.6861, longitude: -7.3829 },
  { name: 'Nador', latitude: 35.1681, longitude: -2.9287 },
  { name: 'Oujda', latitude: 34.6814, longitude: -1.9086 },
  { name: 'Rabat', latitude: 34.0209, longitude: -6.8416 },
  { name: 'Safi', latitude: 32.2994, longitude: -9.2372 },
  { name: 'Sale', latitude: 34.0372, longitude: -6.7985 },
  { name: 'Settat', latitude: 33.001, longitude: -7.6166 },
  { name: 'Tanger', latitude: 35.7595, longitude: -5.834 },
  { name: 'Tetouan', latitude: 35.5889, longitude: -5.3626 },
];

const MOROCCAN_CITY_MATCH_MAX_DISTANCE_KM = 80;

@Component({
  selector: 'app-dashboard',
  imports: [
    MatCardModule,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    DecimalPipe,
    TranslocoPipe,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnDestroy {
  private readonly mapRuntimes: Record<
    'overlay' | 'desktop',
    {
      container: ElementRef<HTMLDivElement> | null;
      instance: import('leaflet').Map | null;
      markersLayer: import('leaflet').LayerGroup | null;
    }
  > = {
    overlay: {
      container: null,
      instance: null,
      markersLayer: null,
    },
    desktop: {
      container: null,
      instance: null,
      markersLayer: null,
    },
  };

  private readonly authService = inject(AuthService);
  private readonly ordersService = inject(OrdersService);
  private readonly merchantShopService = inject(MerchantShopService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly uiFeedback = inject(UiFeedbackService);
  private readonly document = inject(DOCUMENT);
  private originalBodyOverflow: string | null = null;

  @ViewChild('merchantMapContainer')
  set merchantMapContainerRef(
    container: ElementRef<HTMLDivElement> | undefined,
  ) {
    this.mapRuntimes.overlay.container = container ?? null;
    if (this.mapRuntimes.overlay.container && this.isMapOpen()) {
      this.initializeMap('overlay');
    }
  }

  @ViewChild('merchantDesktopMapContainer')
  set merchantDesktopMapContainerRef(
    container: ElementRef<HTMLDivElement> | undefined,
  ) {
    this.mapRuntimes.desktop.container = container ?? null;
    if (this.mapRuntimes.desktop.container) {
      this.initializeMap('desktop');
    }
  }

  readonly currentUser = this.authService.currentUser;
  readonly currentView = signal<'home' | 'orders'>('home');
  readonly merchantSearchQuery = signal('');
  readonly merchantCityFilter = signal<string>('all');
  readonly isMapOpen = signal(false);
  readonly selectedMapMerchantSlug = signal<string | null>(null);

  readonly loadingMerchants = signal(false);
  readonly merchantsErrorKey = signal<string | null>(null);
  readonly merchantSlugsLoading = signal<Record<string, boolean>>({});
  readonly merchants = signal<
    {
      id: string;
      slug: string;
      storeName: string;
      businessType: 'HANOUTE' | 'PATISSERIE';
      description: string | null;
      city: string | null;
      address: string | null;
      latitude: number | null;
      longitude: number | null;
    }[]
  >([]);

  readonly loadingOrders = signal(false);
  readonly ordersErrorKey = signal<string | null>(null);
  readonly orderActionErrorKey = signal<string | null>(null);
  readonly currentActionOrderId = signal<string | null>(null);
  readonly ordersPage = signal<PaginatedOrders | null>(null);
  readonly currentPage = signal(1);
  readonly pageSize = signal(5);

  readonly isCustomer = computed(() => this.currentUser()?.role === 'CUSTOMER');
  readonly isOrdersView = computed(() => this.currentView() === 'orders');
  readonly isHomeView = computed(() => this.currentView() === 'home');
  readonly merchantCityOptions = computed(() => {
    const labels = new Set<string>();

    for (const merchant of this.merchants()) {
      const cityLabel = this.getMerchantCityLabel(merchant);
      if (cityLabel) {
        labels.add(cityLabel);
      }
    }

    return [...labels].sort((first, second) =>
      first.localeCompare(second, undefined, { sensitivity: 'base' }),
    );
  });
  readonly filteredMerchants = computed(() => {
    const normalizedQuery = this.merchantSearchQuery().trim().toLowerCase();
    const filteredByCity = this.merchants().filter((merchant) => {
      const currentCityFilter = this.merchantCityFilter();
      if (currentCityFilter === 'all') {
        return true;
      }

      return this.getMerchantCityLabel(merchant) === currentCityFilter;
    });

    const sorted = [...filteredByCity].sort((first, second) => {
      const cityComparison = (
        this.getMerchantCityLabel(first) ?? ''
      ).localeCompare(this.getMerchantCityLabel(second) ?? '', undefined, {
        sensitivity: 'base',
      });

      if (cityComparison !== 0) {
        return cityComparison;
      }

      return first.storeName.localeCompare(second.storeName, undefined, {
        sensitivity: 'base',
      });
    });

    if (!normalizedQuery) {
      return sorted;
    }

    return sorted.filter((merchant) => {
      const searchable = [
        merchant.storeName,
        this.getMerchantCityLabel(merchant),
        merchant.address,
      ]
        .filter((value): value is string => !!value)
        .join(' ')
        .toLowerCase();

      return searchable.includes(normalizedQuery);
    });
  });
  readonly mappedMerchants = computed(() =>
    this.filteredMerchants().filter(
      (merchant) =>
        merchant.latitude !== null &&
        merchant.longitude !== null &&
        Number.isFinite(merchant.latitude) &&
        Number.isFinite(merchant.longitude),
    ),
  );
  readonly selectedMapMerchant = computed(() => {
    const selectedSlug = this.selectedMapMerchantSlug();
    if (!selectedSlug) {
      return this.mappedMerchants()[0] ?? null;
    }

    return (
      this.mappedMerchants().find(
        (merchant) => merchant.slug === selectedSlug,
      ) ??
      this.mappedMerchants()[0] ??
      null
    );
  });
  private leaflet: typeof import('leaflet') | null = null;

  constructor() {
    effect(() => {
      const currentError =
        this.ordersErrorKey() ??
        this.orderActionErrorKey() ??
        this.merchantsErrorKey();
      if (currentError) {
        this.uiFeedback.showError(currentError);
      } else {
        this.uiFeedback.clearError();
      }
    });

    effect(() => {
      this.filteredMerchants();
      this.selectedMapMerchant();

      queueMicrotask(() => {
        this.refreshAllMaps();
      });
    });

    effect(() => {
      this.toggleBodyScrollLock(this.isMapOpen());
    });

    const routePath = this.route.snapshot.routeConfig?.path;
    this.currentView.set(routePath === 'dashboard/orders' ? 'orders' : 'home');

    if (this.isCustomer()) {
      if (this.isOrdersView()) {
        this.loadMyOrders();
      } else {
        this.loadMerchants();
      }
    }
  }

  loadMerchants(): void {
    if (!this.isCustomer()) {
      return;
    }

    this.loadingMerchants.set(true);
    this.merchantsErrorKey.set(null);

    this.merchantShopService.listPublicMerchants(1, 24).subscribe({
      next: (response) => {
        this.merchants.set(response.data);
        const currentSelectedSlug = this.selectedMapMerchantSlug();
        const hasSelectedMerchant = response.data.some(
          (merchant) =>
            merchant.slug === currentSelectedSlug &&
            merchant.latitude !== null &&
            merchant.longitude !== null,
        );

        this.selectedMapMerchantSlug.set(
          hasSelectedMerchant ? currentSelectedSlug : null,
        );
        this.refreshAllMaps();
        this.loadingMerchants.set(false);
      },
      error: () => {
        this.merchantsErrorKey.set('shell.dashboard.home.errors.loadFailed');
        this.loadingMerchants.set(false);
      },
    });
  }

  loadMyOrders(page = this.currentPage(), pageSize = this.pageSize()): void {
    if (!this.isCustomer()) {
      return;
    }

    this.loadingOrders.set(true);
    this.ordersErrorKey.set(null);
    this.orderActionErrorKey.set(null);

    this.ordersService.getMyOrders(page, pageSize).subscribe({
      next: (response) => {
        this.ordersPage.set(response);
        this.currentPage.set(response.page);
        this.pageSize.set(response.pageSize);
        this.loadingOrders.set(false);
      },
      error: () => {
        this.ordersErrorKey.set('shell.dashboard.orders.errors.loadFailed');
        this.loadingOrders.set(false);
      },
    });
  }

  onOrdersPageChange(event: PageEvent): void {
    this.loadMyOrders(event.pageIndex + 1, event.pageSize);
  }

  goToOrderDetail(orderId: string): void {
    const merchantSlug = this.route.snapshot.queryParamMap
      .get('merchantSlug')
      ?.trim();
    this.router.navigate(['/detail-commande', orderId], {
      queryParams: merchantSlug ? { merchantSlug } : undefined,
    });
  }

  goToMerchantShop(merchantSlug: string): void {
    const normalizedSlug = merchantSlug.trim();
    if (!normalizedSlug) {
      return;
    }

    this.merchantSlugsLoading.update((current) => ({
      ...current,
      [normalizedSlug]: true,
    }));
    this.router.navigate(['/shop', normalizedSlug]).finally(() => {
      this.merchantSlugsLoading.update((current) => {
        const { [normalizedSlug]: _, ...remaining } = current;
        return remaining;
      });
    });
  }

  onMerchantSearchQueryChange(value: string): void {
    this.merchantSearchQuery.set(value);
  }

  onMerchantCityFilterChange(value: string): void {
    const normalizedValue = value.trim();
    const nextValue =
      normalizedValue === 'all' ||
      this.merchantCityOptions().includes(normalizedValue)
        ? normalizedValue
        : 'all';

    this.merchantCityFilter.set(nextValue);
  }

  openMerchantMap(): void {
    this.isMapOpen.set(true);
    this.initializeMap('overlay');
  }

  closeMerchantMap(): void {
    this.isMapOpen.set(false);
    this.destroyMap('overlay');
  }

  focusMerchantOnMap(merchantSlug: string): void {
    this.selectedMapMerchantSlug.set(merchantSlug);

    const merchant = this.mappedMerchants().find(
      (entry) => entry.slug === merchantSlug,
    );
    if (
      !merchant ||
      merchant.latitude === null ||
      merchant.longitude === null
    ) {
      return;
    }

    this.centerMapOnMerchant('desktop', merchant.latitude, merchant.longitude);
    this.centerMapOnMerchant('overlay', merchant.latitude, merchant.longitude);
  }

  isMerchantOpening(merchantSlug: string): boolean {
    return !!this.merchantSlugsLoading()[merchantSlug];
  }

  getMerchantAddress(
    city: string | null,
    address: string | null,
  ): string | null {
    const parts = [city, address]
      .map((value) => value?.trim())
      .filter((value): value is string => !!value);

    return parts.length > 0 ? parts.join(' - ') : null;
  }

  getMerchantCityLabel(merchant: {
    city: string | null;
    latitude: number | null;
    longitude: number | null;
  }): string | null {
    const derivedCity = this.deriveMoroccanCityFromCoordinates(
      merchant.latitude,
      merchant.longitude,
    );

    if (derivedCity) {
      return derivedCity;
    }

    const normalizedCity = merchant.city?.trim();
    return normalizedCity || null;
  }

  canCancelOrder(order: OrderListItem): boolean {
    return (
      order.status === 'PENDING' ||
      order.status === 'CONFIRMED' ||
      order.status === 'READY'
    );
  }

  cancelOrder(order: OrderListItem): void {
    if (order.status === 'CONFIRMED') {
      this.orderActionErrorKey.set(
        'shell.dashboard.orders.errors.contactMerchantForCancellation',
      );
      return;
    }

    if (order.status === 'READY') {
      this.orderActionErrorKey.set(
        'shell.dashboard.orders.errors.readyNoCancel',
      );
      return;
    }

    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '420px',
      data: {
        title: 'shell.dashboard.orders.cancelConfirmTitle',
        message: 'shell.dashboard.orders.cancelConfirmMessage',
        confirmLabel: 'shell.dashboard.orders.cancel',
        confirmColor: 'warn',
        icon: 'warning',
      },
    });

    dialogRef.afterClosed().subscribe((confirmed: boolean | undefined) => {
      if (!confirmed) {
        return;
      }

      this.executeCancelOrder(order.id);
    });
  }

  private executeCancelOrder(orderId: string): void {
    this.currentActionOrderId.set(orderId);
    this.orderActionErrorKey.set(null);

    this.ordersService.cancelMyOrder(orderId).subscribe({
      next: () => {
        this.currentActionOrderId.set(null);
        this.loadMyOrders();
      },
      error: (error: unknown) => {
        const code = extractApiErrorCode(error);
        this.currentActionOrderId.set(null);
        this.orderActionErrorKey.set(
          code && CUSTOMER_CANCEL_CONTACT_MERCHANT_CODES.has(code)
            ? 'shell.dashboard.orders.errors.contactMerchantForCancellation'
            : 'shell.dashboard.orders.errors.cancelFailed',
        );
      },
    });
  }

  private async initializeMap(context: 'overlay' | 'desktop'): Promise<void> {
    const runtime = this.mapRuntimes[context];
    if ((context === 'overlay' && !this.isMapOpen()) || !runtime.container) {
      return;
    }

    if (!this.leaflet) {
      this.leaflet = await import('leaflet');
    }

    if (!runtime.instance) {
      const firstMerchant = this.selectedMapMerchant();
      const initialCenter: [number, number] = firstMerchant
        ? [firstMerchant.latitude!, firstMerchant.longitude!]
        : [33.5731, -7.5898];

      runtime.instance = this.leaflet.map(runtime.container.nativeElement, {
        zoomControl: false,
      });
      runtime.instance.setView(initialCenter, firstMerchant ? 13 : 6);

      this.leaflet
        .tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        })
        .addTo(runtime.instance);

      runtime.markersLayer = this.leaflet.layerGroup().addTo(runtime.instance);
    }

    this.refreshMapMarkers(context);

    requestAnimationFrame(() => {
      runtime.instance?.invalidateSize();
    });
  }

  private refreshMapMarkers(context: 'overlay' | 'desktop'): void {
    const runtime = this.mapRuntimes[context];
    if (!runtime.instance || !runtime.markersLayer || !this.leaflet) {
      return;
    }

    const icon = this.leaflet.divIcon({
      className: 'merchant-map-pin',
      html: '<span></span>',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });

    runtime.markersLayer.clearLayers();

    const mapMerchants = this.mappedMerchants();
    if (mapMerchants.length === 0) {
      return;
    }

    const positions: Array<[number, number]> = [];

    for (const merchant of mapMerchants) {
      const latitude = merchant.latitude!;
      const longitude = merchant.longitude!;
      positions.push([latitude, longitude]);

      const marker = this.leaflet
        .marker([latitude, longitude], { icon })
        .on('click', () => {
          this.selectedMapMerchantSlug.set(merchant.slug);
          this.centerMapOnMerchant('desktop', latitude, longitude);
          if (this.isMapOpen()) {
            this.centerMapOnMerchant('overlay', latitude, longitude);
          }
        });

      runtime.markersLayer.addLayer(marker);
    }

    const selectedMerchant = this.selectedMapMerchantSlug()
      ? mapMerchants.find(
          (merchant) => merchant.slug === this.selectedMapMerchantSlug(),
        )
      : null;

    if (selectedMerchant) {
      runtime.instance.setView(
        [selectedMerchant.latitude!, selectedMerchant.longitude!],
        14,
      );
      return;
    }

    if (positions.length === 1) {
      runtime.instance.setView(positions[0], 14);
      return;
    }

    runtime.instance.fitBounds(positions, {
      padding: [28, 28],
    });
  }

  private refreshAllMaps(): void {
    this.refreshMapMarkers('desktop');

    if (this.isMapOpen()) {
      this.refreshMapMarkers('overlay');
    }
  }

  private destroyMap(context: 'overlay' | 'desktop'): void {
    const runtime = this.mapRuntimes[context];
    runtime.markersLayer?.clearLayers();
    runtime.instance?.remove();
    runtime.markersLayer = null;
    runtime.instance = null;
    runtime.container = null;
  }

  private centerMapOnMerchant(
    context: 'overlay' | 'desktop',
    latitude: number,
    longitude: number,
  ): void {
    const runtime = this.mapRuntimes[context];
    runtime.instance?.flyTo([latitude, longitude], 15, {
      duration: 0.35,
    });
  }

  private toggleBodyScrollLock(shouldLock: boolean): void {
    const body = this.document?.body;
    if (!body) {
      return;
    }

    if (shouldLock) {
      if (this.originalBodyOverflow === null) {
        this.originalBodyOverflow = body.style.overflow || '';
      }

      body.style.overflow = 'hidden';
      return;
    }

    if (this.originalBodyOverflow !== null) {
      body.style.overflow = this.originalBodyOverflow;
      this.originalBodyOverflow = null;
    }
  }

  private deriveMoroccanCityFromCoordinates(
    latitude: number | null,
    longitude: number | null,
  ): string | null {
    if (
      latitude === null ||
      longitude === null ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return null;
    }

    let nearestCity: { name: string; distanceKm: number } | null = null;

    for (const city of MOROCCAN_CITIES) {
      const distanceKm = this.calculateDistanceInKm(
        latitude,
        longitude,
        city.latitude,
        city.longitude,
      );

      if (!nearestCity || distanceKm < nearestCity.distanceKm) {
        nearestCity = { name: city.name, distanceKm };
      }
    }

    if (
      !nearestCity ||
      nearestCity.distanceKm > MOROCCAN_CITY_MATCH_MAX_DISTANCE_KM
    ) {
      return null;
    }

    return nearestCity.name;
  }

  private calculateDistanceInKm(
    firstLatitude: number,
    firstLongitude: number,
    secondLatitude: number,
    secondLongitude: number,
  ): number {
    const toRadians = (value: number) => (value * Math.PI) / 180;
    const earthRadiusKm = 6371;
    const latitudeDelta = toRadians(secondLatitude - firstLatitude);
    const longitudeDelta = toRadians(secondLongitude - firstLongitude);
    const a =
      Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
      Math.cos(toRadians(firstLatitude)) *
        Math.cos(toRadians(secondLatitude)) *
        Math.sin(longitudeDelta / 2) *
        Math.sin(longitudeDelta / 2);

    return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  ngOnDestroy(): void {
    this.toggleBodyScrollLock(false);
  }
}
