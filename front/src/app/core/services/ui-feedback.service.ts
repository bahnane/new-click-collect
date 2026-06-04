import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class UiFeedbackService {
  readonly errorKey = signal<string | null>(null);

  showError(errorKey: string): void {
    this.errorKey.set(errorKey);
  }

  clearError(): void {
    this.errorKey.set(null);
  }
}
