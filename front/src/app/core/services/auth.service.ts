import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { User } from '../models/user.model';
import { LanguageService } from '../i18n/language.service';

interface LoginCredentials {
  email: string;
  password: string;
}

interface RegisterPayload {
  email: string;
  password: string;
}

interface AuthPayload {
  email: string;
  password: string;
  preferredLanguage: 'fr' | 'ar';
}

interface AuthResponse {
  accessToken: string;
  user: User;
}

interface ForgotPasswordPayload {
  email: string;
}

interface ResetPasswordPayload {
  token: string;
  newPassword: string;
}

interface MessageResponse {
  message: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly languageService = inject(LanguageService);

  private readonly _accessToken = signal<string | null>(null);
  private readonly _currentUser = signal<User | null>(null);

  readonly isAuthenticated = computed(() => this._accessToken() !== null);
  readonly currentUser = this._currentUser.asReadonly();

  register(payload: RegisterPayload) {
    const body = this.withCurrentLanguage(payload);

    return this.http
      .post<AuthResponse>(`${environment.apiUrl}/auth/register`, body, {
        withCredentials: true,
      })
      .pipe(
        tap((response) => {
          this._accessToken.set(response.accessToken);
          this._currentUser.set(response.user);
          this.languageService.setLanguage(response.user.preferredLanguage);
        }),
      );
  }

  login(credentials: LoginCredentials) {
    const body = this.withCurrentLanguage(credentials);

    return this.http
      .post<AuthResponse>(`${environment.apiUrl}/auth/login`, body, {
        withCredentials: true,
      })
      .pipe(
        tap((response) => {
          this._accessToken.set(response.accessToken);
          this._currentUser.set(response.user);
          this.languageService.setLanguage(response.user.preferredLanguage);
        }),
      );
  }

  logout() {
    return this.http
      .post<void>(
        `${environment.apiUrl}/auth/logout`,
        {},
        { withCredentials: true },
      )
      .pipe(
        tap(() => {
          this._accessToken.set(null);
          this._currentUser.set(null);
          this.router.navigate(['/login']);
        }),
      );
  }

  forgotPassword(payload: ForgotPasswordPayload) {
    return this.http.post<MessageResponse>(
      `${environment.apiUrl}/auth/forgot-password`,
      payload,
      {
        withCredentials: true,
      },
    );
  }

  resetPassword(payload: ResetPasswordPayload) {
    return this.http.post<MessageResponse>(
      `${environment.apiUrl}/auth/reset-password`,
      payload,
      {
        withCredentials: true,
      },
    );
  }

  getAccessToken(): string | null {
    return this._accessToken();
  }

  private withCurrentLanguage(
    payload: RegisterPayload | LoginCredentials,
  ): AuthPayload {
    return {
      ...payload,
      preferredLanguage: this.languageService.currentLanguage(),
    };
  }
}
