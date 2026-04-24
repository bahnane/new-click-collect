export type UserRole = 'ADMIN' | 'MERCHANT' | 'CUSTOMER';
export type UserStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED';
export type AppLanguage = 'fr' | 'ar';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  preferredLanguage: AppLanguage;
  mustChangePassword: boolean;
}
