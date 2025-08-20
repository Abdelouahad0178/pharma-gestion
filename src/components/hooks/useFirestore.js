// src/hooks/useFirestore.js
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { db } from '../firebase/config';
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query as fsQuery,
  orderBy as fsOrderBy,
  where as fsWhere,
  limit as fsLimit,
} from 'firebase/firestore';
import { useUserRole } from '../contexts/UserRoleContext';

/* ----------------------------------------------------------------
   Helpers
----------------------------------------------------------------- */

// Construit une requête Firestore à partir d’options souples
function buildQuery(baseRef, options = {}) {
  let q = fsQuery(baseRef);

  // where: objet unique {field, operator, value} OU tableau de ces objets
  if (options.where) {
    const wheres = Array.isArray(options.where) ? options.where : [options.where];
    wheres.forEach((w) => {
      if (w && w.field && w.operator !== undefined) {
        q = fsQuery(q, fsWhere(w.field, w.operator, w.value));
      }
    });
  }

  // orderBy: objet unique {field, direction} OU tableau
  if (options.orderBy) {
    const orders = Array.isArray(options.orderBy) ? options.orderBy : [options.orderBy];
    orders.forEach((o) => {
      if (o && o.field) {
        q = fsQuery(q, fsOrderBy(o.field, o.direction || 'asc'));
      }
    });
  }

  // limit: nombre
  if (options.limit && Number.isFinite(options.limit)) {
    q = fsQuery(q, fsLimit(Number(options.limit)));
  }

  return q;
}

// Retry basique pour mitiger “The database connection is closing” (IndexedDB)
async function withIdbRetry(fn, { retries = 1, delayMs = 150 } = {}) {
  try {
    return await fn();
  } catch (err) {
    const msg = String(err?.message || err || '');
    const isIdbClosing =
      msg.includes('The database connection is closing') ||
      msg.includes('app/idb-get') ||
      msg.includes('app/idb-set');

    if (isIdbClosing && retries > 0) {
      await new Promise((res) => setTimeout(res, delayMs));
      return withIdbRetry(fn, { retries: retries - 1, delayMs: delayMs * 2 });
    }
    throw err;
  }
}

// Transforme un snapshot en array {id, ...data}
function snapToArray(snap) {
  const arr = [];
  snap?.forEach((d) => arr.push({ id: d.id, ...d.data() }));
  return arr;
}

/* ----------------------------------------------------------------
   1) Collections SOCIETE (fetch “one-shot”)
----------------------------------------------------------------- */
export function useSocieteCollection(collectionName, queryOptions = null) {
  const { societeId } = useUserRole();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  // Stabilise les options pour les deps
  const optionsKey = useMemo(
    () => (queryOptions ? JSON.stringify(queryOptions) : ''),
    [queryOptions]
  );

  const fetchData = useCallback(async () => {
    if (!societeId) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const baseRef = collection(db, 'societe', societeId, collectionName);
      const q = queryOptions ? buildQuery(baseRef, queryOptions) : baseRef;

      const snap = await withIdbRetry(() => getDocs(q), { retries: 2 });
      const arr = snapToArray(snap);

      if (mounted.current) {
        setData(arr);
      }
    } catch (err) {
      if (mounted.current) {
        setError(err);
        setData([]);
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [societeId, collectionName, optionsKey]); // optionsKey capture les options

  useEffect(() => {
    mounted.current = true;
    fetchData();
    return () => {
      mounted.current = false;
    };
  }, [fetchData]);

  const addItem = useCallback(
    async (item) => {
      if (!societeId) throw new Error('Aucune société sélectionnée');
      const ref = await addDoc(collection(db, 'societe', societeId, collectionName), item);
      await fetchData();
      return ref;
    },
    [societeId, collectionName, fetchData]
  );

  const updateItem = useCallback(
    async (id, updates) => {
      if (!societeId) throw new Error('Aucune société sélectionnée');
      await updateDoc(doc(db, 'societe', societeId, collectionName, id), updates);
      await fetchData();
    },
    [societeId, collectionName, fetchData]
  );

  const deleteItem = useCallback(
    async (id) => {
      if (!societeId) throw new Error('Aucune société sélectionnée');
      await deleteDoc(doc(db, 'societe', societeId, collectionName, id));
      await fetchData();
    },
    [societeId, collectionName, fetchData]
  );

  return {
    data,
    loading,
    error,
    refresh: fetchData,
    addItem,
    updateItem,
    deleteItem,
  };
}

/* ----------------------------------------------------------------
   2) Collections SOCIETE (temps réel)
   - supporte where/orderBy/limit multiples
----------------------------------------------------------------- */
export function useSocieteCollectionRealtime(collectionName, queryOptions = null) {
  const { societeId } = useUserRole();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const unsubRef = useRef(null);

  const optionsKey = useMemo(
    () => (queryOptions ? JSON.stringify(queryOptions) : ''),
    [queryOptions]
  );

  useEffect(() => {
    if (!societeId) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const baseRef = collection(db, 'societe', societeId, collectionName);
    const q = queryOptions ? buildQuery(baseRef, queryOptions) : baseRef;

    // Nettoyage ancienne souscription
    if (unsubRef.current) {
      try {
        unsubRef.current();
      } catch (e) {
        // ignore
      }
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setData(snapToArray(snapshot));
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    unsubRef.current = unsubscribe;
    return () => {
      if (unsubRef.current) {
        try {
          unsubRef.current();
        } catch (e) {
          // ignore
        } finally {
          unsubRef.current = null;
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [societeId, collectionName, optionsKey]);

  const addItem = useCallback(
    async (item) => {
      if (!societeId) throw new Error('Aucune société sélectionnée');
      return addDoc(collection(db, 'societe', societeId, collectionName), item);
    },
    [societeId, collectionName]
  );

  const updateItem = useCallback(
    async (id, updates) => {
      if (!societeId) throw new Error('Aucune société sélectionnée');
      await updateDoc(doc(db, 'societe', societeId, collectionName, id), updates);
    },
    [societeId, collectionName]
  );

  const deleteItem = useCallback(
    async (id) => {
      if (!societeId) throw new Error('Aucune société sélectionnée');
      await deleteDoc(doc(db, 'societe', societeId, collectionName, id));
    },
    [societeId, collectionName]
  );

  return {
    data,
    loading,
    error,
    addItem,
    updateItem,
    deleteItem,
  };
}

/* ----------------------------------------------------------------
   3) Collections UTILISATEUR (ancienne structure / à migrer)
----------------------------------------------------------------- */
export function useUserCollection(collectionName, queryOptions = null) {
  const { user } = useUserRole();
  const uid = user?.uid || null;

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  const optionsKey = useMemo(
    () => (queryOptions ? JSON.stringify(queryOptions) : ''),
    [queryOptions]
  );

  const fetchData = useCallback(async () => {
    if (!uid) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const baseRef = collection(db, 'users', uid, collectionName);
      const q = queryOptions ? buildQuery(baseRef, queryOptions) : baseRef;

      const snap = await withIdbRetry(() => getDocs(q), { retries: 2 });
      const arr = snapToArray(snap);

      if (mounted.current) {
        setData(arr);
      }
    } catch (err) {
      if (mounted.current) {
        setError(err);
        setData([]);
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [uid, collectionName, optionsKey]);

  useEffect(() => {
    mounted.current = true;
    fetchData();
    return () => {
      mounted.current = false;
    };
  }, [fetchData]);

  const addItem = useCallback(
    async (item) => {
      if (!uid) throw new Error('Utilisateur non connecté');
      const ref = await addDoc(collection(db, 'users', uid, collectionName), item);
      await fetchData();
      return ref;
    },
    [uid, collectionName, fetchData]
  );

  const updateItem = useCallback(
    async (id, updates) => {
      if (!uid) throw new Error('Utilisateur non connecté');
      await updateDoc(doc(db, 'users', uid, collectionName, id), updates);
      await fetchData();
    },
    [uid, collectionName, fetchData]
  );

  const deleteItem = useCallback(
    async (id) => {
      if (!uid) throw new Error('Utilisateur non connecté');
      await deleteDoc(doc(db, 'users', uid, collectionName, id));
      await fetchData();
    },
    [uid, collectionName, fetchData]
  );

  return {
    data,
    loading,
    error,
    refresh: fetchData,
    addItem,
    updateItem,
    deleteItem,
  };
}
