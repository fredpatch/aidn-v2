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

/** Raw PATCH values: the service validates types. Absent key = unchanged. */
export interface UpdateApplicantAccountInput {
  fullName?: unknown;
  email?: unknown;
  phone?: unknown;
  contactOrder?: unknown;
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
  /** ACCOUNT-V2 - a temporary password is waiting to be replaced. */
  mustChangePassword: boolean;
  createdAt: Date;
}

/** ACCOUNT-V2 - the statuses GET /account-requests?status= accepts (the
 *  account_request_status enum, validated before the query). */
export const ACCOUNT_REQUEST_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type AccountRequestStatus = (typeof ACCOUNT_REQUEST_STATUSES)[number];

/** ACCOUNT-V2 - the reset answer: the temporary password, shown once. */
export interface ApplicantPasswordReset {
  account: ApplicantAccountView;
  temporaryPassword: string;
}
