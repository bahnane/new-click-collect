export type UserRole = 'ADMIN' | 'MERCHANT' | 'CUSTOMER';
export type UserStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED';
export type AppLanguage = 'fr' | 'ar';
export type MerchantAccessState =
  | 'PROFILE_REQUIRED'
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'CHANGES_REQUESTED'
  | 'INACTIVE';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  preferredLanguage: AppLanguage;
  mustChangePassword: boolean;
  merchantAccessState: MerchantAccessState | null;
}
