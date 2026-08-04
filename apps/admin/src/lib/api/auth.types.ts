import type { InternalRole } from '@aidn/shared';

export interface UserPublic {
  id: number;
  employeeCode: string;
  fullName: string;
  roles: InternalRole[];
}

export interface BootstrapStatus {
  initialised: boolean;
}

export interface LoginResult {
  firstLogin: boolean;
}

export interface BootstrapInitInput {
  employeeCode: string;
  fullName: string;
  email: string;
  password: string;
  confirmation: string;
}
