import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable, of } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AddressSearchSuggestion {
  id: string;
  label: string;
  addressLine: string;
  city: string | null;
  zipCode: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
}

@Injectable({
  providedIn: 'root',
})
export class AddressSearchService {
  private readonly http = inject(HttpClient);

  search(query: string): Observable<AddressSearchSuggestion[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return of([]);
    }

    return this.searchBackend(normalizedQuery);
  }

  reverseGeocode(
    latitude: number,
    longitude: number,
  ): Observable<AddressSearchSuggestion | null> {
    const params = new HttpParams()
      .set('lat', latitude.toString())
      .set('lon', longitude.toString())
      .set('lang', 'fr');

    return this.http
      .get<{
        features?: Array<{
          properties: any;
          geometry?: { coordinates?: [number, number] };
        }>;
      }>(`${environment.apiUrl}/address-search/reverse`, { params })
      .pipe(
        map((response) => this.toSuggestion(response, latitude, longitude)),
      );
  }

  private searchBackend(query: string): Observable<AddressSearchSuggestion[]> {
    const params = new HttpParams()
      .set('text', query)
      .set('lang', 'fr')
      .set('limit', '6');

    return this.http
      .get<{
        features?: Array<{
          properties: any;
          geometry?: { coordinates?: [number, number] };
        }>;
      }>(`${environment.apiUrl}/address-search/autocomplete`, { params })
      .pipe(map((response) => this.toSuggestions(response, query)));
  }

  private toSuggestions(
    response: {
      features?: Array<{
        properties: any;
        geometry?: { coordinates?: [number, number] };
      }>;
    },
    query: string,
  ): AddressSearchSuggestion[] {
    return (response.features ?? []).map((feature, index) => {
      const properties = feature.properties ?? {};
      const [longitude, latitude] = feature.geometry?.coordinates ?? [];

      return {
        id: `${properties.place_id ?? 'geoapify'}-${index}`,
        label: properties.formatted ?? properties.name ?? query,
        addressLine: properties.address_line1 ?? properties.formatted ?? query,
        city: properties.city ?? properties.county ?? null,
        zipCode: properties.postcode ?? null,
        country: properties.country ?? null,
        latitude: latitude ?? 0,
        longitude: longitude ?? 0,
      };
    });
  }

  private toSuggestion(
    response: {
      features?: Array<{
        properties: any;
        geometry?: { coordinates?: [number, number] };
      }>;
    },
    fallbackLatitude: number,
    fallbackLongitude: number,
  ): AddressSearchSuggestion | null {
    const feature = this.pickBestReverseFeature(
      response.features ?? [],
      fallbackLatitude,
      fallbackLongitude,
    );
    if (!feature) {
      return null;
    }

    const properties = feature.properties ?? {};
    const [longitude, latitude] = feature.geometry?.coordinates ?? [];
    const resultLatitude = latitude ?? fallbackLatitude;
    const resultLongitude = longitude ?? fallbackLongitude;
    const isPrecise = this.isReverseGeocodePrecise(
      fallbackLatitude,
      fallbackLongitude,
      resultLatitude,
      resultLongitude,
    );
    const fallbackLabel = this.buildFallbackLabel(properties);
    const city = this.extractCity(properties);
    const zipCode = this.extractPostalCode(properties);
    const country = this.extractCountry(properties);

    return {
      id: `reverse-${fallbackLatitude}-${fallbackLongitude}`,
      label: isPrecise
        ? (properties.formatted ?? properties.name ?? fallbackLabel)
        : fallbackLabel,
      addressLine: isPrecise
        ? (properties.address_line1 ?? properties.formatted ?? '')
        : fallbackLabel,
      city,
      zipCode,
      country,
      latitude: resultLatitude,
      longitude: resultLongitude,
    };
  }

  private pickBestReverseFeature(
    features: Array<{
      properties: any;
      geometry?: { coordinates?: [number, number] };
    }>,
    markerLatitude: number,
    markerLongitude: number,
  ) {
    if (!features.length) {
      return null;
    }

    return [...features].sort((left, right) => {
      const rightScore = this.scoreReverseFeature(
        right,
        markerLatitude,
        markerLongitude,
      );
      const leftScore = this.scoreReverseFeature(
        left,
        markerLatitude,
        markerLongitude,
      );

      return rightScore - leftScore;
    })[0];
  }

  private scoreReverseFeature(
    feature: {
      properties: any;
      geometry?: { coordinates?: [number, number] };
    },
    markerLatitude: number,
    markerLongitude: number,
  ): number {
    const properties = feature.properties ?? {};
    const [longitude, latitude] = feature.geometry?.coordinates ?? [];
    const resultLatitude = latitude ?? markerLatitude;
    const resultLongitude = longitude ?? markerLongitude;
    const distanceMeters = this.calculateDistanceMeters(
      markerLatitude,
      markerLongitude,
      resultLatitude,
      resultLongitude,
    );

    return (
      (this.extractPostalCode(properties) ? 1000 : 0) +
      (this.extractCity(properties) ? 500 : 0) +
      (this.hasReadableStreetLabel(properties) ? 250 : 0) -
      distanceMeters / 1000
    );
  }

  private isReverseGeocodePrecise(
    markerLatitude: number,
    markerLongitude: number,
    resultLatitude: number,
    resultLongitude: number,
  ): boolean {
    const distanceMeters = this.calculateDistanceMeters(
      markerLatitude,
      markerLongitude,
      resultLatitude,
      resultLongitude,
    );

    return distanceMeters <= 80;
  }

  private calculateDistanceMeters(
    startLatitude: number,
    startLongitude: number,
    endLatitude: number,
    endLongitude: number,
  ): number {
    const toRadians = (value: number): number => (value * Math.PI) / 180;
    const earthRadiusMeters = 6371000;
    const deltaLatitude = toRadians(endLatitude - startLatitude);
    const deltaLongitude = toRadians(endLongitude - startLongitude);
    const startLat = toRadians(startLatitude);
    const endLat = toRadians(endLatitude);

    const a =
      Math.sin(deltaLatitude / 2) ** 2 +
      Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLongitude / 2) ** 2;
    const distance =
      2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return distance;
  }

  private buildFallbackLabel(properties: Record<string, unknown>): string {
    const street = String(properties['street'] ?? '').trim();
    const addressLine1 = String(properties['address_line1'] ?? '').trim();
    const neighbourhood = String(properties['suburb'] ?? '').trim();
    const locality = String(properties['city'] ?? '').trim();
    const county = String(properties['county'] ?? '').trim();
    const formatted = String(properties['formatted'] ?? '').trim();

    if (street) {
      return street;
    }

    if (addressLine1) {
      return addressLine1.replace(/^\d+\s+/, '');
    }

    if (neighbourhood) {
      return neighbourhood;
    }

    if (formatted) {
      const withoutNumber = formatted.replace(/^\d+\s+/, '');
      return withoutNumber;
    }

    if (locality || county) {
      return locality || county;
    }

    return 'Adresse approchée';
  }

  private hasReadableStreetLabel(properties: Record<string, unknown>): boolean {
    return Boolean(
      String(properties['street'] ?? '').trim() ||
      String(properties['address_line1'] ?? '').trim() ||
      String(properties['suburb'] ?? '').trim() ||
      String(properties['city'] ?? '').trim() ||
      String(properties['county'] ?? '').trim(),
    );
  }

  private extractCity(properties: Record<string, unknown>): string | null {
    const candidates = [
      properties['city'],
      properties['town'],
      properties['village'],
      properties['municipality'],
      properties['district'],
      properties['suburb'],
      properties['county'],
      properties['state_district'],
    ];

    for (const candidate of candidates) {
      const value = String(candidate ?? '').trim();
      if (value) {
        return value;
      }
    }

    return null;
  }

  private extractPostalCode(
    properties: Record<string, unknown>,
  ): string | null {
    const candidates = [
      properties['postcode'],
      properties['postal_code'],
      properties['zip'],
    ];

    for (const candidate of candidates) {
      const value = String(candidate ?? '').trim();
      if (value) {
        return value;
      }
    }

    return null;
  }

  private extractCountry(properties: Record<string, unknown>): string | null {
    const candidates = [properties['country'], properties['country_code']];

    for (const candidate of candidates) {
      const value = String(candidate ?? '').trim();
      if (value) {
        return value;
      }
    }

    return null;
  }
}
