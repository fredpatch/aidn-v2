export interface UserView {
  id: number;
  employeeCode: string;
  fullName: string;
  email: string;
  roles: string[];
  active: boolean;
  firstLogin: boolean;
  createdAt: string;
}

export interface UsersListResponse {
  data: UserView[];
  total: number;
}

export interface UsersSummary {
  total: number;
  active: number;
  inactive: number;
  firstLoginPending: number;
  rolesAssigned: number;
  byRole: { role: string; count: number }[];
}

export interface UserFilters {
  search?: string;
  role?: string;
  active?: boolean;
  firstLogin?: boolean;
  page?: number;
  pageSize?: number;
}
