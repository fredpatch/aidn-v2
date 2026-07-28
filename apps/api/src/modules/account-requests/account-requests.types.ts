export interface SubmitAccountRequestParams {
  organisationNameInput: string;
  legalAddress: string;
  requestedEmail: string;
  phone?: string;
  originalApprovalNumber?: string;
  contactFullName: string;
  contactEmail: string;
  contactPhone?: string;
  password: string;
  formStartedAt: Date;
  honeypot?: string;
}

export interface ApproveAccountRequestParams {
  reviewedBy: number;
  contactOrder: 'primary' | 'secondary' | 'tertiary';
  organisationId?: number;
  createOrganisation?: boolean;
}

export interface RejectAccountRequestParams {
  reviewedBy: number;
  rejectionReason: string;
}

export interface OrganisationCandidate {
  id: number;
  name: string;
  normalizedName: string;
  legalAddress: string;
  email: string | null;
  phone: string | null;
  originalApprovalNumber: string | null;
  active: boolean;
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
  matchedOrganisationId: number | null;
  status: string;
  rejectionReason: string | null;
  reviewedBy: number | null;
  reviewedAt: Date | null;
  submittedAt: Date;
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
  createdAt: Date;
}
