export const queryKeys = {
  requests: {
    all: () => ['requests'] as const,
    mine: () => ['requests', 'mine'] as const,
  },
};
