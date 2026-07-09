export interface UserPublic {
  id: number;
  employeeCode: string;
  fullName: string;
  roles: string[];
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
