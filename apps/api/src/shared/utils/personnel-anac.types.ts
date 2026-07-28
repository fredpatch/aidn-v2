export interface PersonnelAnacRaw {
  id: number;
  internalNumber: string | null;
  identity: {
    matricule: number;
    firstName: string | null;
    lastName: string | null;
    gender: string | null;
  };
  organization: {
    service: { id: number; name: string; abbreviation: string | null } | null;
    direction: { id: number; name: string } | null;
    function: { id: number; name: string } | null;
  };
}

export interface PersonnelAnacListMeta {
  page: number;
  limit: number;
  sortBy: 'id' | 'lastName';
  order: 'asc' | 'desc';
  count: number;
  total: number;
}

