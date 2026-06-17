import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ShopShellContextService {
  readonly shopSlug = signal<string | null>(null);
  readonly shopName = signal<string | null>(null);
  readonly searchValue = signal('');
  readonly isSearchOpen = signal(false);

  setShopIdentity(shopSlug: string, shopName: string | null): void {
    const normalizedSlug = shopSlug.trim();
    if (!normalizedSlug) {
      return;
    }

    const slugChanged = this.shopSlug() !== normalizedSlug;
    this.shopSlug.set(normalizedSlug);
    this.shopName.set(shopName?.trim() || null);

    if (slugChanged) {
      this.searchValue.set('');
      this.isSearchOpen.set(false);
    }
  }

  setSearchValue(value: string): void {
    this.searchValue.set(value);
  }

  openSearch(): void {
    this.isSearchOpen.set(true);
  }

  closeSearch(): void {
    this.isSearchOpen.set(false);
  }

  toggleSearch(): void {
    this.isSearchOpen.update((current) => !current);
  }

  reset(): void {
    this.shopSlug.set(null);
    this.shopName.set(null);
    this.searchValue.set('');
    this.isSearchOpen.set(false);
  }
}
