export const queryKeys = {
  preliminary: {
    all: ['preliminary'] as const,
    bundle: (requestId: string) => ['preliminary', 'bundle', requestId] as const,
  },
};
