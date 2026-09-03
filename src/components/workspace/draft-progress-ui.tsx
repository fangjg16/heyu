import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type DraftProgressUiValue = {
  openDialogRunId: string | null;
  setOpenDialogRunId: (id: string | null) => void;
};

const DraftProgressUiContext = createContext<DraftProgressUiValue>({
  openDialogRunId: null,
  setOpenDialogRunId: () => {},
});

export function DraftProgressUiProvider({ children }: { children: ReactNode }) {
  const [openDialogRunId, setOpenDialogRunId] = useState<string | null>(null);
  const value = useMemo(
    () => ({ openDialogRunId, setOpenDialogRunId }),
    [openDialogRunId],
  );
  return (
    <DraftProgressUiContext.Provider value={value}>
      {children}
    </DraftProgressUiContext.Provider>
  );
}

export function useDraftProgressUi() {
  return useContext(DraftProgressUiContext);
}
