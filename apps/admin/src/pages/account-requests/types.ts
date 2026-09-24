export interface OrganisationCandidate {
  id: number;
  name: string;
  legalAddress: string;
  email: string | null;
  phone: string | null;
  originalApprovalNumber: string | null;
  matchReason: string;
}

export interface AccountRequestView {
  id: number;
  organisationNameInput: string;
  legalAddress: string;
  requestedEmail: string;
  phone: string | null;
  originalApprovalNumber: string | null;
  contactFullName: string;
  contactEmail: string;
  contactPhone: string | null;
  status: string;
  rejectionReason: string | null;
  submittedAt: string;
  candidates: OrganisationCandidate[];
}

export interface ApplicantAccountView {
  id: number;
  organisationId: number;
  organisationName: string;
  fullName: string;
  email: string;
  phone: string | null;
  contactOrder: string;
  active: boolean;
  createdAt: string;
}
