export interface PrefillUser {
  employeeCode: string;
  fullName: string;
}

export type MainTab = 'users' | 'personnel';

export type UserStatusFilter = 'all' | 'active' | 'inactive' | 'first_login';

export type CreateDrawerState = { prefill: PrefillUser | null } | null;
