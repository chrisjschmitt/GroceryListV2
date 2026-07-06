import React, { createContext, useContext, ReactNode } from "react";
import { useOfflineStoreState, OfflineStore } from "./use-offline-store";

const OfflineStoreContext = createContext<OfflineStore | null>(null);

export interface OfflineStoreProviderProps {
  children: ReactNode;
}

export function OfflineStoreProvider({ children }: OfflineStoreProviderProps) {
  const store = useOfflineStoreState();

  return (
    <OfflineStoreContext.Provider value={store}>
      {children}
    </OfflineStoreContext.Provider>
  );
}

export function useOfflineStore(): OfflineStore {
  const context = useContext(OfflineStoreContext);
  if (context === null) {
    throw new Error("useOfflineStore must be used within an OfflineStoreProvider");
  }
  return context;
}
