import { create } from 'zustand';

interface UiState {
  preliminaryActionError: string | null;
  setPreliminaryActionError: (value: string | null) => void;
  clearPreliminaryActionError: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  preliminaryActionError: null,
  setPreliminaryActionError: (value) => set({ preliminaryActionError: value }),
  clearPreliminaryActionError: () => set({ preliminaryActionError: null }),
}));
