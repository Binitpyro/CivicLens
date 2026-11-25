import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export interface WardDetails {
  id: number;
  name: string;
  lbd_code?: string | null;
  village_id?: number | null;
  village_name?: string | null;
  panchayat_code?: string | null;
}

interface WardContextValue {
  wardId: number;
  ward: WardDetails | null;
  loading: boolean;
  wardLabel: string;
  compactLabel: string;
}

const WardContext = createContext<WardContextValue | null>(null);

interface WardProviderProps {
  children: React.ReactNode;
  wardId?: number;
  wardName?: string;
  villageName?: string;
}

export function WardProvider({ children, wardId = 1, wardName, villageName }: WardProviderProps) {
  const [ward, setWard] = useState<WardDetails | null>(
    wardName ? { id: wardId, name: wardName, village_name: villageName } : null,
  );
  const [loading, setLoading] = useState(!wardName);

  useEffect(() => {
    const controller = new AbortController();
    const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:4000/api';

    setLoading(!wardName);
    if (wardName) {
      setWard({ id: wardId, name: wardName, village_name: villageName });
    }

    fetch(`${API_BASE}/wards/${wardId}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Ward details unavailable');
        return response.json();
      })
      .then((details: WardDetails) => setWard(details))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [wardId, wardName, villageName]);

  const value = useMemo(() => {
    const name = ward?.name || wardName || `Ward ${wardId}`;
    const village = ward?.village_name || villageName;
    return {
      wardId,
      ward,
      loading,
      wardLabel: village ? `${name} · ${village}` : name,
      compactLabel: name,
    };
  }, [ward, wardId, wardName, villageName, loading]);

  return <WardContext.Provider value={value}>{children}</WardContext.Provider>;
}

export function useWard() {
  const context = useContext(WardContext);
  if (!context) throw new Error('useWard must be used inside WardProvider');
  return context;
}
