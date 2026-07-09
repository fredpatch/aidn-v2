import { api } from '../axios';
import type { BootstrapInitInput, BootstrapStatus, LoginResult, UserPublic } from './auth.types';

export async function fetchBootstrapStatus(): Promise<BootstrapStatus> {
  try {
    const { data } = await api.get('/bootstrap/status');
    return data;
  } catch {
    return { initialised: false };
  }
}

export async function fetchAuthMe(): Promise<UserPublic | null> {
  try {
    const { data } = await api.get('/auth/me');
    return data;
  } catch {
    return null;
  }
}

export async function login(params: {
  employeeCode: string;
  password?: string;
  otp?: string;
}): Promise<LoginResult> {
  const { data } = await api.post('/auth/login', params);
  return data;
}

export async function setPassword(params: {
  password: string;
  confirmation: string;
}): Promise<void> {
  await api.post('/auth/set-password', params);
}

export async function bootstrapInit(input: BootstrapInitInput): Promise<void> {
  await api.post('/bootstrap/init', input);
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout').catch(() => undefined);
}
