import { environment } from '../../../environments/environment';

const LAST_MERCHANT_SLUG_STORAGE_KEY = 'shop.lastMerchantSlug';
const LEGACY_MERCHANT_ID_STORAGE_KEY = 'shop.lastMerchantId';

export function resolvePostAuthMerchantSlug(
  merchantSlugFromQuery?: string | null,
): string | null {
  const normalizedQuerySlug = merchantSlugFromQuery?.trim() || null;
  const merchantSlugFromStorage =
    typeof window !== 'undefined'
      ? window.localStorage.getItem(LAST_MERCHANT_SLUG_STORAGE_KEY) ||
        window.localStorage.getItem(LEGACY_MERCHANT_ID_STORAGE_KEY)
      : null;
  const merchantSlugFromConfig =
    environment.defaultMerchantSlug?.trim() || null;

  return (
    normalizedQuerySlug || merchantSlugFromStorage || merchantSlugFromConfig
  );
}
