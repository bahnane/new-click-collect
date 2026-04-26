import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { environment } from '../../../environments/environment';

const LAST_MERCHANT_SLUG_STORAGE_KEY = 'shop.lastMerchantSlug';
const LEGACY_MERCHANT_ID_STORAGE_KEY = 'shop.lastMerchantId';

export const dashboardRedirectGuard: CanActivateFn = (route) => {
  const router = inject(Router);

  const merchantSlugFromQuery = route.queryParamMap.get('merchantSlug');
  const merchantSlugFromStorage =
    typeof window !== 'undefined'
      ? window.localStorage.getItem(LAST_MERCHANT_SLUG_STORAGE_KEY) ||
        window.localStorage.getItem(LEGACY_MERCHANT_ID_STORAGE_KEY)
      : null;
  const merchantSlugFromConfig = environment.defaultMerchantSlug;

  const targetMerchantSlug =
    merchantSlugFromQuery || merchantSlugFromStorage || merchantSlugFromConfig;

  if (!targetMerchantSlug) {
    return true;
  }

  return router.createUrlTree(['/shop', targetMerchantSlug]);
};
