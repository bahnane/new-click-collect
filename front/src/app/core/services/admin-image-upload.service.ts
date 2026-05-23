import { Injectable, inject } from '@angular/core';
import { Observable, switchMap } from 'rxjs';
import { ImageAsset } from '../models/merchant-shop.model';
import {
  FinalizeAdminImageUploadPayload,
  MerchantsService,
} from './merchants.service';

@Injectable({ providedIn: 'root' })
export class AdminImageUploadService {
  private readonly merchantsService = inject(MerchantsService);

  uploadProductImage(
    file: File,
    options?: {
      targetFolder?: string;
      altText?: string;
    },
  ): Observable<ImageAsset> {
    return this.merchantsService
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
                    : {}),
                };

                return this.merchantsService.finalizeAdminImageUpload(payload);
              }),
            ),
        ),
      );
  }
}
