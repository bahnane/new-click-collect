import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { ProductCategory } from '../../../core/models/merchant-shop.model';
import { MerchantShopService } from '../../../core/services/merchant-shop.service';

@Component({
  selector: 'app-shop-categories',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TranslocoPipe,
  ],
  templateUrl: './shop-categories.component.html',
  styleUrl: './shop-categories.component.scss',
})
export class ShopCategoriesComponent implements OnInit {
  private readonly merchantShopService = inject(MerchantShopService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly languageService = inject(LanguageService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly merchantSlug = signal('');
  readonly categories = signal<ProductCategory[]>([]);

  readonly currentDirection = this.languageService.currentDirection;

  readonly sortedRootCategories = computed(() =>
    [...this.categories()]
      .filter((category) => !category.parentId)
      .sort((first, second) => first.name.localeCompare(second.name)),
  );

  ngOnInit(): void {
    const merchantSlug = this.route.snapshot.paramMap
      .get('merchantSlug')
      ?.trim();
    if (!merchantSlug) {
      this.router.navigate(['/']);
      return;
    }

    this.merchantSlug.set(merchantSlug);
    this.loadRootCategories();
  }

  selectCategory(category: ProductCategory): void {
    const merchantSlug = this.merchantSlug();
    this.router.navigate(['/shop', merchantSlug], {
      queryParams: { categorie: category.slug },
    });
  }

  private loadRootCategories(): void {
    this.loading.set(true);
    this.error.set(null);

    this.merchantShopService
      .getMerchantRootCategories(this.merchantSlug())
      .subscribe({
        next: (categories) => {
          this.categories.set(categories);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('shop.categoriesLoadFailed');
          this.loading.set(false);
        },
      });
  }
}
