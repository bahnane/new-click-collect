import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('address-search')
export class AddressSearchController {
  constructor(private readonly configService: ConfigService) {}

  @Get('autocomplete')
  async autocomplete(@Query('text') text: string) {
    const query = text?.trim();
    if (!query) {
      throw new BadRequestException('Missing query');
    }

    const apiKey = this.configService.get<string>('GEOAPIFY_API_KEY');
    if (!apiKey) {
      return { features: [] };
    }

    const response = await fetch(
      `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(query)}&lang=fr&limit=6&filter=countrycode:ma&apiKey=${encodeURIComponent(apiKey)}`,
    );

    if (!response.ok) {
      throw new BadRequestException('Geoapify lookup failed');
    }

    return response.json();
  }

  @Get('reverse')
  async reverse(@Query('lat') lat: string, @Query('lon') lon: string) {
    const latitude = Number(lat);
    const longitude = Number(lon);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new BadRequestException('Invalid coordinates');
    }

    const apiKey = this.configService.get<string>('GEOAPIFY_API_KEY');
    if (!apiKey) {
      return { features: [] };
    }

    const response = await fetch(
      `https://api.geoapify.com/v1/geocode/reverse?lat=${encodeURIComponent(latitude.toString())}&lon=${encodeURIComponent(longitude.toString())}&lang=fr&limit=1&apiKey=${encodeURIComponent(apiKey)}`,
    );

    if (!response.ok) {
      throw new BadRequestException('Geoapify reverse lookup failed');
    }

    return response.json();
  }
}
