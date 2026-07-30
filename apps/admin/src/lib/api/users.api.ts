import { api } from '../axios';
import type { UserFilters, UsersListResponse, UsersSummary, UserView } from './users.types';

export async function fetchUsers(filters: UserFilters = {}): Promise<UsersListResponse> {
  const { data } = await api.get('/users', { params: filters });
  return data;
}

export async function fetchUsersSummary(): Promise<UsersSummary> {
  const { data } = await api.get('/users/summary');
  return data;
}

export async function createUser(params: {
  employeeCode: string;
  fullName: string;
  email: string;
  roles: string[];
}): Promise<{ user: UserView; emailSent: boolean }> {
  const { data } = await api.post('/users', params);
  return data;
}

export async function updateUserRoles(id: number, roles: string[]): Promise<UserView> {
  const { data } = await api.patch(`/users/${id}/roles`, { roles });
  return data;
}

export async function toggleUserActivation(id: number, active: boolean): Promise<UserView> {
  const { data } = await api.patch(`/users/${id}/activation`, { active });
  return data;
}

export async function resetUserOtp(id: number): Promise<{ emailSent: boolean }> {
  const { data } = await api.post(`/users/${id}/reset-otp`);
  return data;
}
