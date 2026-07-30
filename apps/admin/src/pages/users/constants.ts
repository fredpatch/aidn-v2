export const ROLE_LABELS: Record<string, string> = {
  reception: 'Reception',
  assistant_dg: 'Assistant DG',
  dn_agent: 'Agent DN',
  dn_supervisor: 'Superviseur DN',
  r3_agent: 'Agent R3',
  s5_agent: 'Agent S5',
  SU: 'Super Admin',
};

export const ROLE_GROUP_LABELS: Record<string, string> = {
  reception: 'Reception',
  assistant_dg: 'Circuit DG',
  dn_agent: 'DN',
  dn_supervisor: 'DN',
  r3_agent: 'R3',
  s5_agent: 'S5',
  SU: 'Admin',
};

export const ALL_ROLES = Object.keys(ROLE_LABELS);
export const USERS_PAGE_SIZE = 10;
export const PERSONNEL_ANAC_PAGE_SIZE = 8;
