import { api } from '../axios';

export interface DossierTeamMember {
  id: number;
  fullName: string;
  employeeCode: string;
}
export interface TeamProposal {
  id: number;
  proposedApprovalNumber: string;
  proposedBy: number;
  proposedAt: string;
  updatedAt: string;
  members: DossierTeamMember[];
}
export interface DossierTeamState {
  proposal: TeamProposal | null;
  team: {
    id: number;
    approvalNumber: string;
    finalizedBy: number;
    finalizedAt: string;
    members: DossierTeamMember[];
  } | null;
}
export interface TeamProposalInput {
  memberIds: number[];
  proposedApprovalNumber: string;
}

export async function fetchDossierTeam(requestId: string) {
  return (await api.get<DossierTeamState>(`/requests/${requestId}/team`)).data;
}
export async function fetchEligibleTeamMembers() {
  return (await api.get<DossierTeamMember[]>('/dossier-teams/eligible-members')).data;
}
export async function saveTeamProposal(requestId: string, input: TeamProposalInput) {
  return (await api.put<DossierTeamState>(`/requests/${requestId}/team-proposal`, input)).data;
}
