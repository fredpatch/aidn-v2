import { z } from 'zod';

const proposalInput = z.object({
  memberIds: z
    .array(z.number().int().positive().max(2147483647))
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length),
  proposedApprovalNumber: z.string().trim().min(1).max(100),
});

export type TeamProposalInput = z.infer<typeof proposalInput>;

export function parseTeamProposal(input: unknown): TeamProposalInput {
  const parsed = proposalInput.safeParse(input);
  if (!parsed.success) throw new Error('INVALID_TEAM_PROPOSAL');
  return parsed.data;
}
