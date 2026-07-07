export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface UserPublic {
  id: number;
  employeeCode: string;
  fullName: string;
  roles: string[];
}

export interface LoginResult {
  firstLogin: boolean;
  tokens?: AuthTokens;
  user?: UserPublic;
  message: string;
}
