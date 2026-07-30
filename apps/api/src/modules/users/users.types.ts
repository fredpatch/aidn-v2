export interface CreateUserParams {
  employeeCode: string;
  fullName: string;
  email: string;
  roles: string[];
  createdByUserId: number;
}

export interface UpdateUserParams {
  email?: string;
  active?: boolean;
  roles?: string[];
  updatedByUserId: number;
}

export interface UpdateUserRolesParams {
  roles: string[];
  updatedByUserId: number;
  actorRoles: string[];
}

export interface UserFilters {
  search?: string;
  role?: string;
  active?: boolean;
  firstLogin?: boolean;
  page?: number;
  pageSize?: number;
}

export interface UserView {
  id: number;
  employeeCode: string;
  fullName: string;
  email: string;
  roles: string[];
  active: boolean;
  firstLogin: boolean;
  createdAt: Date;
}

export interface UsersSummary {
  total: number;
  active: number;
  inactive: number;
  firstLoginPending: number;
  rolesAssigned: number;
  byRole: { role: string; count: number }[];
}
