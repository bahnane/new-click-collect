import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-merchant-store-offers-page',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, TranslocoPipe],
  templateUrl: './merchant-store-offers-page.component.html',
  styleUrl: './merchant-store-offers-page.component.scss',
})
export class MerchantStoreOffersPageComponent {}
