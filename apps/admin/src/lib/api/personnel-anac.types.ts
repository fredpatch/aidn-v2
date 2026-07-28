export interface PersonnelAnacResult {
  employeeCode: string;
  lastName: string | null;
  firstName: string | null;
  fullName: string;
  organisationLabel: string | null;
  hasAccount: boolean;
}

export interface PersonnelAnacListResponse {
  data: PersonnelAnacResult[];
  total: number;
  page: number;
  limit: number;
}

