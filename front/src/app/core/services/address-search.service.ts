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
    const feature = response.features?.[0];
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

    return {
      id: `reverse-${fallbackLatitude}-${fallbackLongitude}`,
      label: isPrecise
        ? (properties.formatted ?? properties.name ?? fallbackLabel)
        : fallbackLabel,
      addressLine: isPrecise
        ? (properties.address_line1 ?? properties.formatted ?? '')
        : fallbackLabel,
      city: isPrecise ? (properties.city ?? properties.county ?? null) : null,
      zipCode: isPrecise ? (properties.postcode ?? null) : null,
      country: isPrecise ? (properties.country ?? null) : null,
      latitude: resultLatitude,
      longitude: resultLongitude,
    };
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
    const neighbourhood = String(properties['suburb'] ?? '').trim();
    const locality = String(properties['city'] ?? '').trim();
    const county = String(properties['county'] ?? '').trim();
    const formatted = String(properties['formatted'] ?? '').trim();

    if (street) {
      return street;
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
}
