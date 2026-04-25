import { HttpClient, HttpContext } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, finalize, map, Observable, of, shareReplay } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { SKIP_AUTH_INTERCEPTOR } from '../http/auth-context';
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

interface RegisterPayloadWithLanguage {
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

interface VerifyEmailPayload {
  token: string;
}

interface ActivateInvitePayload {
  token: string;
  password: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly languageService = inject(LanguageService);

  private readonly _accessToken = signal<string | null>(null);
  private readonly _currentUser = signal<User | null>(null);
  private readonly _loggingOut = signal(false);
  private refreshInFlight$: Observable<string | null> | null = null;

  readonly isAuthenticated = computed(() => this._accessToken() !== null);
  readonly currentUser = this._currentUser.asReadonly();

  register(payload: RegisterPayload) {
    const body = this.withCurrentLanguage(payload);

    return this.http.post<MessageResponse>(
      `${environment.apiUrl}/auth/register`,
      body,
      {
        withCredentials: true,
      },
    );
  }

  login(credentials: LoginCredentials) {
    return this.http
      .post<AuthResponse>(`${environment.apiUrl}/auth/login`, credentials, {
        withCredentials: true,
      })
      .pipe(
        tap((response) => {
          this.setSession(response);
        }),
      );
  }

  logout() {
    this._loggingOut.set(true);

    return this.http
      .post<void>(
        `${environment.apiUrl}/auth/logout`,
        {},
        { withCredentials: true },
      )
      .pipe(
        tap(() => {
          this.clearSession();
          this.router.navigate(['/login']);
        }),
        finalize(() => {
          this._loggingOut.set(false);
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

  verifyEmail(payload: VerifyEmailPayload) {
    return this.http.post<MessageResponse>(
      `${environment.apiUrl}/auth/verify-email`,
      payload,
      {
        withCredentials: true,
      },
    );
  }

  activateInvite(payload: ActivateInvitePayload) {
    return this.http
      .post<AuthResponse>(
        `${environment.apiUrl}/auth/activate-invite`,
        payload,
        {
          withCredentials: true,
        },
      )
      .pipe(
        tap((response) => {
          this.setSession(response);
        }),
      );
  }

  refreshAccessToken(): Observable<string | null> {
    if (this._loggingOut()) {
      return of(null);
    }

    if (this.refreshInFlight$) {
      return this.refreshInFlight$;
    }

    this.refreshInFlight$ = this.http
      .post<AuthResponse>(
        `${environment.apiUrl}/auth/refresh`,
        {},
        {
          withCredentials: true,
          context: new HttpContext().set(SKIP_AUTH_INTERCEPTOR, true),
        },
      )
      .pipe(
        tap((response) => this.setSession(response)),
        map((response) => response.accessToken),
        catchError(() => {
          this.clearSession();
          return of(null);
        }),
        finalize(() => {
          this.refreshInFlight$ = null;
        }),
        shareReplay(1),
      );

    return this.refreshInFlight$;
  }

  clearSession(): void {
    this._accessToken.set(null);
    this._currentUser.set(null);
    this.languageService.clearStoredLanguage();
  }

  getAccessToken(): string | null {
    return this._accessToken();
  }

  isLoggingOut(): boolean {
    return this._loggingOut();
  }

  updatePreferredLanguage(language: 'fr' | 'ar'): Observable<User> {
    return this.http
      .patch<User>(
        `${environment.apiUrl}/auth/me/preferred-language`,
        { preferredLanguage: language },
        { withCredentials: true },
      )
      .pipe(
        tap((updatedUser) => {
          this._currentUser.set(updatedUser);
          this.languageService.setLanguage(language);
        }),
      );
  }

  private setSession(response: AuthResponse): void {
    this._accessToken.set(response.accessToken);
    this._currentUser.set(response.user);
    this.languageService.setLanguage(response.user.preferredLanguage);
  }

  private withCurrentLanguage(
    payload: RegisterPayload,
  ): RegisterPayloadWithLanguage {
    return {
      ...payload,
      preferredLanguage: this.languageService.currentLanguage(),
    };
  }
}
