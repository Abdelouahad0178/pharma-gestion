// src/contexts/useCatalogueMedicaments.js
import { useEffect, useMemo, useState, useCallback } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  setDoc,
  doc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { useUserRole } from "../contexts/UserRoleContext";

/**
 * Hook catalogue — lecture partagée + helpers CRUD (protégés par rôle)
 * Collection utilisée: /catalogue_medicaments (racine)
 */
export function useCatalogueMedicaments(opts = {}) {
  const { onlyActive = true, pageLimit = 5000 } = opts;
  const { user, role } = useUserRole() || {};
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // Capacité d'édition (tu peux adapter selon ton UserRoleContext)
  const canEdit = role === "admin" || role === "owner" || role === "proprietaire" || role === "docteur" || role === "pharmacien";

  useEffect(() => {
    const ref = collection(db, "catalogue_medicaments");
    const q = onlyActive
      ? query(ref, where("actifs", "==", true), orderBy("nom"), limit(pageLimit))
      : query(ref, orderBy("nom"), limit(pageLimit));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const arr = [];
        snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
        setItems(arr);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, [onlyActive, pageLimit]);

  const addOne = useCallback(
    async (data) => {
      if (!canEdit) throw new Error("Permission refusée");
      const payload = {
        nom: data.nom?.trim() || "",
        dci: data.dci?.trim() || "",
        forme: data.forme?.trim() || "",
        dosage: data.dosage?.trim() || "",
        atc: data.atc?.trim() || "",
        lab: data.lab?.trim() || "",
        presentation: data.presentation?.trim() || "",
        codeBarre: (data.codeBarre || "").toString().trim(),
        ean13: Array.isArray(data.ean13) ? data.ean13.map(String) : (data.ean13 ? [String(data.ean13)] : []),
        photoUrl: data.photoUrl || "",
        prixPub: Number(data.prixPub || 0),
        actifs: data.actifs !== false, // par défaut true
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user?.email || user?.uid || "system",
        updatedBy: user?.email || user?.uid || "system",
        nom_norm: (data.nom || "").toString().normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase(),
      };
      // Si un code-barres unique est donné, on l'utilise comme id stable
      if (payload.codeBarre) {
        await setDoc(doc(db, "catalogue_medicaments", payload.codeBarre), payload, { merge: true });
        return payload.codeBarre;
      }
      const ref = await addDoc(collection(db, "catalogue_medicaments"), payload);
      return ref.id;
    },
    [canEdit, user]
  );

  const updateOne = useCallback(
    async (id, patch) => {
      if (!canEdit) throw new Error("Permission refusée");
      const payload = {
        ...patch,
        updatedAt: serverTimestamp(),
        updatedBy: user?.email || user?.uid || "system",
      };
      if (payload.nom) {
        payload.nom_norm = String(payload.nom)
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .toLowerCase();
      }
      await setDoc(doc(db, "catalogue_medicaments", id), payload, { merge: true });
    },
    [canEdit, user]
  );

  const removeOne = useCallback(
    async (id) => {
      if (!canEdit) throw new Error("Permission refusée");
      await deleteDoc(doc(db, "catalogue_medicaments", id));
    },
    [canEdit]
  );

  const bulkImport = useCallback(
    async (arrayOfItems = []) => {
      if (!canEdit) throw new Error("Permission refusée");
      const results = [];
      for (const raw of arrayOfItems) {
        try {
          const id = await addOne(raw);
          results.push({ ok: true, id });
        } catch (e) {
          results.push({ ok: false, error: e?.message || String(e) });
        }
      }
      return results;
    },
    [canEdit, addOne]
  );

  const byBarcode = useCallback(
    (code) => {
      const s = String(code || "").trim();
      if (!s) return null;
      return items.find(
        (m) =>
          String(m.codeBarre || "") === s ||
          (Array.isArray(m.ean13) && m.ean13.some((x) => String(x) === s))
      );
    },
    [items]
  );

  const list = useMemo(
    () =>
      [...items].sort((a, b) => String(a.nom || "").localeCompare(String(b.nom || ""))),
    [items]
  );

  return { list, loading, canEdit, addOne, updateOne, removeOne, bulkImport, byBarcode };
}
