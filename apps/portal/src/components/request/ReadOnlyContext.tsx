import { createContext, useContext, type ReactNode } from 'react';

/**
 * True inside a closed phase or a terminal dossier: every upload / submit
 * control is hidden, files and information stay visible. The API refuses
 * those actions anyway - this keeps the UI from offering them.
 */
const ReadOnlyContext = createContext(false);

export function ReadOnlyProvider({ readOnly, children }: { readOnly: boolean; children: ReactNode }) {
  return <ReadOnlyContext.Provider value={readOnly}>{children}</ReadOnlyContext.Provider>;
}

export function useReadOnly(): boolean {
  return useContext(ReadOnlyContext);
}
