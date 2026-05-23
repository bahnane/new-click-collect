import { Injectable, inject } from '@angular/core';
import { from, Observable, switchMap } from 'rxjs';
import { ImageAsset } from '../models/merchant-shop.model';
import {
  FinalizeAdminImageUploadPayload,
  MerchantsService,
} from './merchants.service';

export interface AdminImageMetadataDraft {
  altText: string;
  focalPointX: number;
  focalPointY: number;
  dominantColor: string;
}

@Injectable({ providedIn: 'root' })
export class AdminImageUploadService {
  private readonly merchantsService = inject(MerchantsService);

  uploadProductImage(
    file: File,
    options?: {
      targetFolder?: string;
      altText?: string;
      focalPointX?: number;
      focalPointY?: number;
      dominantColor?: string;
    },
  ): Observable<ImageAsset> {
    return from(this.inferMetadata(file, options?.altText)).pipe(
      switchMap((autoMetadata) =>
        this.merchantsService
          .generateAdminImageUploadUrl({
            fileName: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
            targetFolder: options?.targetFolder,
          })
          .pipe(
            switchMap((upload) =>
              this.merchantsService
                .uploadImageToStorage(
                  upload.uploadUrl,
                  file,
                  upload.requiredHeaders,
                )
                .pipe(
                  switchMap(() => {
                    const payload: FinalizeAdminImageUploadPayload = {
                      storageKey: upload.storageKey,
                      ...(options?.altText?.trim()
                        ? { altText: options.altText.trim() }
                        : autoMetadata.altText
                          ? { altText: autoMetadata.altText }
                          : {}),
                      focalPointX: this.resolveNumericMetadata(
                        options?.focalPointX,
                        autoMetadata.focalPointX,
                      ),
                      focalPointY: this.resolveNumericMetadata(
                        options?.focalPointY,
                        autoMetadata.focalPointY,
                      ),
                      dominantColor:
                        options?.dominantColor?.trim() ||
                        autoMetadata.dominantColor,
                    };

                    return this.merchantsService.finalizeAdminImageUpload(
                      payload,
                    );
                  }),
                ),
            ),
          ),
      ),
    );
  }

  inferMetadata(
    file: File,
    fallbackAltText: string | undefined,
  ): Promise<AdminImageMetadataDraft> {
    const safeAltText = (fallbackAltText || '').trim();

    return this.extractDominantColor(file)
      .then((dominantColor) => ({
        altText: safeAltText,
        focalPointX: 0.5,
        focalPointY: 0.5,
        dominantColor,
      }))
      .catch(() => ({
        altText: safeAltText,
        focalPointX: 0.5,
        focalPointY: 0.5,
        dominantColor: '',
      }));
  }

  private resolveNumericMetadata(
    explicitValue: number | undefined,
    fallbackValue: number,
  ): number {
    return Number.isFinite(explicitValue)
      ? (explicitValue as number)
      : fallbackValue;
  }

  private async extractDominantColor(file: File): Promise<string> {
    const imageBitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
      imageBitmap.close();
      return '';
    }

    const sampleSize = 24;
    canvas.width = sampleSize;
    canvas.height = sampleSize;
    context.drawImage(imageBitmap, 0, 0, sampleSize, sampleSize);
    imageBitmap.close();

    const { data } = context.getImageData(0, 0, sampleSize, sampleSize);
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;

    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha < 16) {
        continue;
      }
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count += 1;
    }

    if (count === 0) {
      return '';
    }

    const toHex = (value: number) =>
      Math.round(value / count)
        .toString(16)
        .padStart(2, '0');

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  }
}
