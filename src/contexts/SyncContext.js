// contexts/SyncContext.js
import React, { createContext, useEffect, useRef } from 'react';
import { attachRealtimeSalesSync } from '../lib/realtimeSalesSync';

export const SyncContext = createContext({});

export function SyncProvider({ children, db, user, societeId }) {
  const detachRef = useRef(null);

  useEffect(() => {
    if (!societeId || !user?.uid) {
      if (detachRef.current) {
        detachRef.current();
        detachRef.current = null;
      }
      return;
    }

    // Attach une seule fois
    detachRef.current = attachRealtimeSalesSync(db, {
      societeId,
      user,
      enabled: true
    });

    return () => {
      if (detachRef.current) {
        detachRef.current();
        detachRef.current = null;
      }
    };
  }, [db, societeId, user?.uid]);

  return <SyncContext.Provider value={{}}>{children}</SyncContext.Provider>;
}