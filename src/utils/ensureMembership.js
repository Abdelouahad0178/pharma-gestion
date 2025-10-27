// src/utils/ensureMembership.js
import { db } from "../firebase/config";
import {
  doc, getDoc, setDoc, updateDoc,
  serverTimestamp, collection, query, where, limit, getDocs
} from "firebase/firestore";

/**
 * Garantit que users/{uid} existe ET qu'il est rattaché à la société donnée.
 * - crée le doc s'il n'existe pas
 * - si societeId manquant/différent, le met à jour
 * Retourne { changed: boolean, societeId: string|null }
 */
export async function ensureMembership(user, requiredSocieteId) {
  if (!user) return { changed: false, societeId: null };

  const uid = user.uid;
  const userRef = doc(db, "users", uid);
  const snap = await getDoc(userRef);

  // 1) Si le doc n'existe pas → on le crée minimalement
  if (!snap.exists()) {
    await setDoc(userRef, {
      email: (user.email || "").toLowerCase(),
      role: "vendeuse",
      actif: true,
      societeId: requiredSocieteId || null,
      createdAt: serverTimestamp(),
      modifieLe: serverTimestamp(),
    }, { merge: true });
    return { changed: true, societeId: requiredSocieteId || null };
  }

  // 2) Si le societeId est absent et que l'utilisateur est proprio d'une société, on tente de deviner
  let currentSoc = snap.data()?.societeId || null;
  if (!currentSoc) {
    // essaie de trouver une société dont il est owner
    const q = query(collection(db, "societe"), where("ownerUid", "==", uid), limit(1));
    const rs = await getDocs(q);
    if (!rs.empty) currentSoc = rs.docs[0].id;
  }

  // 3) Si requiredSocieteId est fourni et que ça ne correspond pas, on aligne
  const targetSoc = requiredSocieteId || currentSoc || null;
  if (snap.data()?.societeId !== targetSoc) {
    await updateDoc(userRef, { societeId: targetSoc, modifieLe: serverTimestamp() });
    return { changed: true, societeId: targetSoc };
  }

  return { changed: false, societeId: targetSoc };
}
