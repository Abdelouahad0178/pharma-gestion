// src/utils/coOwners.js
import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp,
  query, collection, where, getDocs, arrayUnion, arrayRemove
} from "firebase/firestore";
import { db } from "../firebase/config";

/** Trouver un user par email dans /users */
export async function findUserByEmail(email) {
  const q = query(
    collection(db, "users"),
    where("email", "==", String(email || "").trim().toLowerCase())
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { uid: d.id, data: d.data() };
}

/** Ajoute un co-owner (par email) */
export async function addCoOwnerByEmail(societeId, email) {
  const socRef = doc(db, "societe", societeId);
  const s = await getDoc(socRef);
  if (!s.exists()) throw new Error("Société introuvable.");

  const found = await findUserByEmail(email);
  if (!found) {
    throw new Error("Utilisateur introuvable dans /users. Il doit s'inscrire d'abord.");
  }
  const coUid = found.uid;

  await updateDoc(socRef, {
    coOwnerUids: arrayUnion(coUid),
    membres: arrayUnion(coUid),
  });

  // Rattache le user à la société si besoin
  await setDoc(doc(db, "users", coUid), { societeId }, { merge: true });

  return { addedUid: coUid };
}

/** Retire un co-owner (par email) */
export async function removeCoOwnerByEmail(societeId, email) {
  const socRef = doc(db, "societe", societeId);
  const found = await findUserByEmail(email);
  if (!found) throw new Error("Utilisateur introuvable.");
  const coUid = found.uid;

  await updateDoc(socRef, { coOwnerUids: arrayRemove(coUid) });
  return { removedUid: coUid };
}
