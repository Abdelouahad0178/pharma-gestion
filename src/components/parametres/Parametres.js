// src/components/parametres/Parametres.js
import React, { useState, useEffect, useCallback } from "react";
import { db } from "../../firebase/config";
import { useUserRole } from "../../contexts/UserRoleContext";
import {
  doc,
  setDoc,
  getDoc,
  Timestamp,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";

export default function Parametres() {
  const { user, societeId, role, loading } = useUserRole();

  /* ===== États pour les paramètres de documents ===== */
  const [entete, setEntete] = useState("");
  const [pied, setPied] = useState("");
  const [typeCachet, setTypeCachet] = useState("texte");
  const [cachetTexte, setCachetTexte] = useState("Cachet Société");
  const [cachetImage, setCachetImage] = useState(null);
  const [afficherCachet, setAfficherCachet] = useState(true);
  const [tailleCachet, setTailleCachet] = useState(120);
  const [uploadingImage, setUploadingImage] = useState(false);

  /* ===== États pour les informations pharmacie ===== */
  const [nomPharmacie, setNomPharmacie] = useState("");
  const [adresse, setAdresse] = useState("");
  const [telephone, setTelephone] = useState("");
  const [email, setEmail] = useState("");
  const [rc, setRc] = useState("");
  const [ice, setIce] = useState("");
  const [if_, setIf] = useState("");
  const [cnss, setCnss] = useState("");

  /* ===== États pour les paramètres de gestion ===== */
  const [seuilAlerteGlobal, setSeuilAlerteGlobal] = useState(10);
  const [delaiPeremptionAlerte, setDelaiPeremptionAlerte] = useState(30);
  const [tvaVente, setTvaVente] = useState(20);

  /* ===== États pour les paramètres multi-lots ===== */
  const [gestionMultiLots, setGestionMultiLots] = useState(true);
  const [alerteLotsExpires, setAlerteLotsExpires] = useState(true);
  const [delaiAlerteLots, setDelaiAlerteLots] = useState(7);
  const [generationAutomatiqueLots, setGenerationAutomatiqueLots] = useState(true);
  const [formatNumerotationLots, setFormatNumerotationLots] = useState("LOT{YYYY}{MM}{DD}{HH}{mm}");

  /* ===== États pour les activités utilisateurs ===== */
  const [utilisateurs, setUtilisateurs] = useState([]);
  const [activites, setActivites] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [filterDateMin, setFilterDateMin] = useState("");
  const [filterDateMax, setFilterDateMax] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [showActivitesFilters, setShowActivitesFilters] = useState(false);

  /* ===== États UI ===== */
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("documents");
  const [waiting, setWaiting] = useState(true);
  const [loadingActivites, setLoadingActivites] = useState(false);
  const [notification, setNotification] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);

  /* ===== Détection taille écran ===== */
  useEffect(() => {
    const checkScreenSize = () => {
      const width = window.innerWidth;
      setIsMobile(width < 768);
      setIsTablet(width >= 768 && width < 1024);
    };
    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  /* ===== Notifications ===== */
  const showNotification = useCallback((message, type = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  }, []);

  /* ===== Attente chargement ===== */
  useEffect(() => {
    setWaiting(loading || !societeId || !user);
  }, [loading, societeId, user]);

  /* ===== Rôles autorisés ===== */
  const isRoleAutorise = (r) =>
    ["pharmacien", "admin", "ADMIN", "docteur"].includes((r || "").toLowerCase());

  /* ===== Upload image (cachet) ===== */
  const handleImageUpload = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      showNotification("Veuillez sélectionner un fichier image valide (JPEG, PNG, GIF, WebP)", "error");
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      showNotification(`L'image est trop volumineuse (${fileSizeMB}MB). Max 5MB.`, "error");
      return;
    }

    setUploadingImage(true);
    setError("");

    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Erreur lors de la lecture du fichier"));
        reader.readAsDataURL(file);
      });

      const img = new Image();
      img.onload = () => {
        setCachetImage(base64);
        setTypeCachet("image");
        showNotification("Image du cachet uploadée avec succès!", "success");
        setUploadingImage(false);
      };
      img.onerror = () => {
        showNotification("Le fichier sélectionné n'est pas une image valide", "error");
        setUploadingImage(false);
      };
      img.src = base64;
    } catch (err) {
      console.error("Erreur upload image:", err);
      showNotification("Erreur lors du téléchargement: " + err.message, "error");
      setUploadingImage(false);
    }
  }, [showNotification]);

  const handleRemoveImage = useCallback(() => {
    setCachetImage(null);
    setTypeCachet("texte");
    setError("");
    const fileInput = document.getElementById("cachet-upload");
    if (fileInput) fileInput.value = "";
    showNotification("Image du cachet supprimée", "info");
  }, [showNotification]);

  /* ===================== Utilitaires Date & Compteurs ===================== */

  // Transforme divers formats Firestore en Date JS
  const toDate = (date) => {
    if (!date) return null;
    if (date instanceof Date) return date;
    if (date?.seconds) return new Date(date.seconds * 1000);
    if (date?.toDate && typeof date.toDate === "function") return date.toDate();
    if (typeof date === "number") return new Date(date);
    if (typeof date === "string") {
      const iso = date.includes("T") ? date : date.replace(" ", "T");
      return new Date(iso);
    }
    return null;
  };

  // Affiche au fuseau Africa/Casablanca
  const formatDate = useCallback((date) => {
    const d = toDate(date);
    if (!d || isNaN(d.getTime())) return "Date invalide";
    const opts = {
      timeZone: "Africa/Casablanca",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    };
    const parts = new Intl.DateTimeFormat("fr-FR", opts).formatToParts(d);
    const get = (t) => parts.find((p) => p.type === t)?.value || "";
    return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
  }, []);

  // >>> Coerceur universel de "nombre d'articles"
  const coerceCount = (value) => {
    if (Array.isArray(value)) return value.length;
    if (typeof value === "number") return value;
    if (value && typeof value === "object") {
      if (Array.isArray(value.items)) return value.items.length;
      if (Array.isArray(value.lignes)) return value.lignes.length;
      if (typeof value.count === "number") return value.count;
      if (typeof value.total === "number") return value.total;
      if (typeof value.value === "number") return value.value;
    }
    return 0;
  };

  // Pour le dédoublonnage (bucket 10 min)
  const minuteBucket = (date) => {
    const d = toDate(date);
    if (!d || isNaN(d.getTime())) return 0;
    return Math.floor(d.getTime() / (10 * 60 * 1000));
    // 10 minutes par bucket
  };

  const normalizeTypeGroup = (type = "") => {
    const t = (type || "").toLowerCase();
    if (t.includes("vente")) return "vente";
    if (t.includes("achat") || t.includes("réception achat")) return "achat";
    if (t.includes("paiement")) return "paiement";
    return t;
  };

  const extractParty = (details = "") => {
    const m1 = /Client:\s*([^•(]+)/i.exec(details);
    if (m1) return m1[1].trim().toLowerCase();
    const m2 = /Fournisseur:\s*([^•(]+)/i.exec(details);
    if (m2) return m2[1].trim().toLowerCase();
    return "";
  };

  /* ===================== FETCH UTILISATEURS ===================== */
  const fetchUtilisateurs = useCallback(async () => {
    if (!societeId) return;
    try {
      const qUsers = query(collection(db, "users"), where("societeId", "==", societeId));
      const snapshot = await getDocs(qUsers);
      const usersList = [];
      snapshot.forEach((d) => {
        const userData = d.data();
        usersList.push({
          id: d.id,
          email: userData.email || "",
          displayName: userData.displayName || userData.nom || userData.email || "",
          nom: userData.nom || "",
          prenom: userData.prenom || "",
          role: userData.role || "vendeuse",
          createdAt: userData.createdAt,
        });
      });
      setUtilisateurs(usersList);
    } catch (err) {
      console.error("Erreur chargement utilisateurs:", err);
      showNotification("Erreur lors du chargement des utilisateurs", "error");
    }
  }, [societeId, showNotification]);

  /* ===================== FETCH ACTIVITÉS (avec dédoublonnage) ===================== */
  const fetchActivites = useCallback(async () => {
    if (!societeId || utilisateurs.length === 0) return;
    setLoadingActivites(true);
    try {
      const list = [];

      const getUserRoleFromList = (userId, email) => {
        if (!userId && !email) return "N/A";
        if (userId) {
          const u = utilisateurs.find((x) => x.id === userId);
          if (u?.role) return u.role;
        }
        if (email) {
          const u = utilisateurs.find((x) => x.email === email);
          if (u?.role) return u.role;
        }
        return "N/A";
      };

      // ---- 1) activities
      try {
        const snap = await getDocs(
          query(
            collection(db, "societe", societeId, "activities"),
            orderBy("timestamp", "desc"),
            limit(200)
          )
        );
        snap.forEach((d) => {
          const data = d.data();
          const details = data.details || {};

          // << corrige nbre d'articles ici >>
          const nArticles =
            coerceCount(details.articles) ||
            coerceCount(details.article_count) ||
            coerceCount(details.items) ||
            coerceCount(details.lignes) ||
            coerceCount(details.nbArticles) ||
            coerceCount(details.count);

          list.push({
            id: d.id,
            type: getActivityTypeLabel(data.type),
            utilisateurId: data.userId || data.utilisateurId || user?.uid,
            utilisateurEmail: data.userEmail || data.utilisateurEmail || user?.email || "",
            utilisateurRole: getUserRoleFromList(
              data.userId || data.utilisateurId,
              data.userEmail || data.utilisateurEmail
            ),
            date: data.timestamp || data.date || Timestamp.now(),
            details: formatActivityDetails(data.type, { ...details, __coercedCount: nArticles }),
            montant: Number(details.montant || 0),
            nombreArticles: nArticles,
            statut: details.statutPaiement || details.action || details.statut || "Effectué",
            collection: "activities",
            hasLots: !!details.hasLots,
            nombreLots: details.nombreLots || 0,
          });
        });
      } catch (e) {
        console.warn("Erreur chargement activities:", e);
      }

      // ---- 2) ventes
      try {
        const snap = await getDocs(
          query(collection(db, "societe", societeId, "ventes"), orderBy("date", "desc"), limit(100))
        );
        snap.forEach((d) => {
          const data = d.data();
          const total = (data.articles || []).reduce(
            (sum, a) => sum + ((a.prixUnitaire || 0) * (a.quantite || 0) - (a.remise || 0)),
            0
          );
          const dateField = data.date || data.creeLe || data.createdAt;
          const hasLots = (data.articles || []).some((a) => a.numeroLot);
          const nombreLots = new Set((data.articles || []).map((a) => a.numeroLot).filter(Boolean)).size;
          const userId = data.creePar || data.userId || data.createdBy || user?.uid;
          const userEmail = data.creeParEmail || data.userEmail || user?.email || "";

          list.push({
            id: `vente:${d.id}`,
            type: "Vente" + (hasLots ? " Multi-Lots" : ""),
            utilisateurId: userId,
            utilisateurEmail: userEmail,
            utilisateurRole: getUserRoleFromList(userId, userEmail),
            date: dateField || Timestamp.now(),
            details: `Client: ${data.client || "N/A"}${hasLots ? ` (${nombreLots} lots)` : ""}`,
            montant: total,
            nombreArticles: (data.articles || []).length,
            statut: data.statutPaiement || "N/A",
            collection: "ventes",
            hasLots,
            nombreLots,
          });
        });
      } catch (e) {
        console.warn("Erreur chargement ventes:", e);
      }

      // ---- 3) achats
      try {
        const snap = await getDocs(
          query(collection(db, "societe", societeId, "achats"), orderBy("date", "desc"), limit(100))
        );
        snap.forEach((d) => {
          const data = d.data();
          const total =
            (data.articles || []).reduce(
              (sum, a) =>
                sum + ((a.prixAchat || a.prixUnitaire || 0) * (a.quantite || 0) - (a.remise || 0)),
              0
            ) - (data.remiseGlobale || 0);

          const dateField = data.date || data.creeLe || data.createdAt;
          const hasLots = (data.articles || []).some((a) => a.numeroLot || a.fournisseurArticle);
          const nombreLots = new Set((data.articles || []).map((a) => a.numeroLot).filter(Boolean)).size;
          const userId = data.creePar || data.userId || data.createdBy || user?.uid;
          const userEmail = data.creeParEmail || data.userEmail || user?.email || "";

          list.push({
            id: `achat:${d.id}`,
            type: "Achat" + (hasLots ? " Multi-Lots" : ""),
            utilisateurId: userId,
            utilisateurEmail: userEmail,
            utilisateurRole: getUserRoleFromList(userId, userEmail),
            date: dateField || Timestamp.now(),
            details: `Fournisseur: ${data.fournisseur || "N/A"}${hasLots ? ` (${nombreLots} lots)` : ""}`,
            montant: total,
            nombreArticles: (data.articles || []).length,
            statut: data.statutPaiement || "N/A",
            collection: "achats",
            hasLots,
            nombreLots,
          });
        });
      } catch (e) {
        console.warn("Erreur chargement achats:", e);
      }

      // ---- 4) paiements
      try {
        const snap = await getDocs(
          query(collection(db, "societe", societeId, "paiements"), orderBy("date", "desc"), limit(100))
        );
        snap.forEach((d) => {
          const data = d.data();
          const dateField = data.date || data.timestamp || data.createdAt;
          const userId = data.creePar || data.userId || data.createdBy || user?.uid;
          const userEmail = data.creeParEmail || data.userEmail || user?.email || "";
          list.push({
            id: `paiement:${d.id}`,
            type: "Paiement",
            utilisateurId: userId,
            utilisateurEmail: userEmail,
            utilisateurRole: getUserRoleFromList(userId, userEmail),
            date: dateField || Timestamp.now(),
            details: `Type: ${data.type || "N/A"} - Mode: ${data.mode || "N/A"}`,
            montant: data.montant || 0,
            statut: "Enregistré",
            collection: "paiements",
          });
        });
      } catch (e) {
        console.warn("Erreur chargement paiements:", e);
      }

      // ===== DÉDOUBLONNAGE =====
      const byKey = new Map();
      const score = (x) => {
        let s = 0;
        if (x.collection !== "activities") s += 10; // métier > activities
        if ((x.montant || 0) > 0) s += 5;
        if (x.nombreArticles > 0) s += 2;
        return s;
      };

      for (const it of list) {
        const group = normalizeTypeGroup(it.type);
        const party = extractParty(it.details) || "";
        const bucket = minuteBucket(it.date);
        const key = `${group}|${party}|${bucket}`;
        const prev = byKey.get(key);
        if (!prev || score(it) > score(prev)) byKey.set(key, it);
      }

      const deduped = Array.from(byKey.values()).sort(
        (a, b) => (toDate(b.date)?.getTime() || 0) - (toDate(a.date)?.getTime() || 0)
      );

      setActivites(deduped);
    } catch (err) {
      console.error("Erreur chargement activités:", err);
      showNotification("Erreur lors du chargement des activités", "error");
    } finally {
      setLoadingActivites(false);
    }
  }, [societeId, user, utilisateurs]); // ok

  /* ===================== Libellés / Détails ===================== */
  const getActivityTypeLabel = useCallback((type) => {
    const labels = {
      vente: "Vente",
      vente_modifiee: "Vente Modifiée",
      vente_supprimee: "Vente Supprimée",
      achat: "Achat",
      paiement: "Paiement",
      stock_ajout: "Ajout Stock",
      stock_modif: "Modification Stock",
      stock_retour: "Retour Stock",
      facture: "Facture",
      devis: "Devis",
      stock_entry: "Entrée Stock Multi-Lots",
      lot_creation: "Création Lot",
      lot_modification: "Modification Lot",
      reception_achat: "Réception Achat",
      transfert_mensuel: "Transfert Stock",
    };
    return labels[type] || type;
  }, []);

  const formatActivityDetails = useCallback((type, details) => {
    switch (type) {
      case "vente":
      case "vente_modifiee":
        return `Client: ${details.client || "N/A"}${
          details.hasLots ? ` (${details.nombreLots || 0} lots)` : ""
        } • ${Number(details.montant || 0).toFixed(2)} DH`;

      case "vente_supprimee":
        return `Client: ${details.client || "N/A"} • ${Number(details.montant || 0).toFixed(2)} DH (Supprimée)`;

      case "achat":
        return `Fournisseur: ${details.fournisseur || "N/A"}${
          details.hasLots ? ` (${details.nombreLots || 0} lots)` : ""
        }`;

      case "paiement":
        return `${details.mode || "Espèces"} - ${details.montant || 0} DH`;

      case "reception_achat": {
        // << corrige le 0 article(s) >>
        const n =
          (typeof details.__coercedCount === "number" ? details.__coercedCount : 0) ||
          coerceCount(details.article_count) ||
          coerceCount(details.articles) ||
          coerceCount(details.items) ||
          coerceCount(details.lignes) ||
          coerceCount(details.nbArticles) ||
          coerceCount(details.count);
        return `Statut: ${details.statut || "N/A"} - ${n} article(s)`;
      }

      case "reception_achat_confirme":
        return `Réception confirmée - ${coerceCount(details.articles)} article(s)`;

      case "transfert_mensuel":
        return `${details.produit || "N/A"} - ${details.quantite || 0} unités (S1->S2)`;

      default:
        return (
          Object.entries(details)
            .filter(([k]) => k !== "montant" && k !== "action" && k !== "__coercedCount")
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ") || "N/A"
        );
    }
  }, []); // ok

  /* ===================== GET USER NAME / ROLE ===================== */
  const getUserName = useCallback(
    (userId, userEmail = "") => {
      const u = utilisateurs.find((x) => x.id === userId);
      if (u) {
        if (u.prenom?.trim()) return u.prenom.trim();
        if (u.displayName?.trim()) return u.displayName.trim();
        if (u.nom?.trim()) return u.nom.trim();
        if (u.email) return u.email.split("@")[0];
        return "Utilisateur inconnu";
      }
      if (userEmail) {
        const u2 = utilisateurs.find((x) => x.email === userEmail);
        if (u2) {
          if (u2.prenom?.trim()) return u2.prenom.trim();
          if (u2.displayName?.trim()) return u2.displayName.trim();
          if (u2.nom?.trim()) return u2.nom.trim();
          return u2.email.split("@")[0];
        }
        return userEmail.split("@")[0];
      }
      if (userId === user?.uid) return user?.email?.split("@")[0] || "Vous";
      return "Utilisateur inconnu";
    },
    [utilisateurs, user]
  );

  const getUserRole = useCallback(
    (userId) => {
      const u = utilisateurs.find((x) => x.id === userId);
      if (u) return u.role;
      if (userId === user?.uid) return role || "N/A";
      return "N/A";
    },
    [utilisateurs, user, role]
  );

  /* ===================== Chargement initial ===================== */
  useEffect(() => {
    if (!user || !societeId) return;
    let mounted = true;
    (async () => {
      try {
        const docRef = doc(db, "societe", societeId, "parametres", "documents");
        const docSnap = await getDoc(docRef);
        if (mounted && docSnap.exists()) {
          const data = docSnap.data();
          setEntete(data.entete || "");
          setPied(data.pied || "");
          setCachetTexte(data.cachetTexte || "Cachet Société");
          const imageData = data.cachetImage || data.cachet || null;
          setCachetImage(imageData);
          setAfficherCachet(data.afficherCachet !== false);
          setTypeCachet(data.typeCachet || (imageData ? "image" : "texte"));
          setTailleCachet(Number(data.tailleCachet) || 120);
        }

        const infoRef = doc(db, "societe", societeId, "parametres", "informations");
        const infoSnap = await getDoc(infoRef);
        if (mounted && infoSnap.exists()) {
          const data = infoSnap.data();
          setNomPharmacie(data.nomPharmacie || "");
          setAdresse(data.adresse || "");
          setTelephone(data.telephone || "");
          setEmail(data.email || "");
          setRc(data.rc || "");
          setIce(data.ice || "");
          setIf(data.if || "");
          setCnss(data.cnss || "");
        }

        const gestionRef = doc(db, "societe", societeId, "parametres", "gestion");
        const gestionSnap = await getDoc(gestionRef);
        if (mounted && gestionSnap.exists()) {
          const data = gestionSnap.data();
          setSeuilAlerteGlobal(data.seuilAlerteGlobal ?? 10);
          setDelaiPeremptionAlerte(data.delaiPeremptionAlerte ?? 30);
          setTvaVente(data.tvaVente ?? 20);
        }

        const multiLotsRef = doc(db, "societe", societeId, "parametres", "multilots");
        const multiLotsSnap = await getDoc(multiLotsRef);
        if (mounted && multiLotsSnap.exists()) {
          const data = multiLotsSnap.data();
          setGestionMultiLots(data.gestionMultiLots !== false);
          setAlerteLotsExpires(data.alerteLotsExpires !== false);
          setDelaiAlerteLots(data.delaiAlerteLots ?? 7);
          setGenerationAutomatiqueLots(data.generationAutomatiqueLots !== false);
          setFormatNumerotationLots(data.formatNumerotationLots || "LOT{YYYY}{MM}{DD}{HH}{mm}");
        }

        await fetchUtilisateurs();
      } catch (err) {
        console.error("Erreur chargement paramètres:", err);
        showNotification("Erreur lors du chargement des paramètres: " + err.message, "error");
      }
    })();
    return () => { mounted = false; };
  }, [user, societeId, fetchUtilisateurs, showNotification]);

  useEffect(() => {
    if (activeTab === "activites" && utilisateurs.length > 0) {
      fetchActivites();
    }
  }, [activeTab, utilisateurs.length, fetchActivites]);

  /* ===================== Filtrage activités ===================== */
  const activitesFiltrees = activites.filter((a) => {
    let keep = true;
    if (selectedUserId && a.utilisateurId !== selectedUserId) keep = false;
    if (filterType && !a.type.toLowerCase().includes(filterType.toLowerCase())) keep = false;
    if (filterRole && (a.utilisateurRole || "").toLowerCase() !== filterRole.toLowerCase()) keep = false;

    const d = toDate(a.date);
    if (filterDateMin && d && d < new Date(filterDateMin)) keep = false;
    if (filterDateMax && d && d > new Date(filterDateMax + "T23:59:59")) keep = false;
    return keep;
  });

  const getTypeColor = useCallback((type) => {
    if ((type || "").includes("Multi-Lots")) return "#667eea";
    if ((type || "").includes("Supprimée")) return "#ef4444";
    if ((type || "").includes("Modifiée")) return "#f59e0b";
    switch ((type || "").split(" ")[0]) {
      case "Vente": return "#48bb78";
      case "Achat": return "#4299e1";
      case "Stock": return "#ed8936";
      case "Retour": return "#f56565";
      case "Paiement": return "#38a169";
      case "Entrée": return "#805ad5";
      case "Lot": return "#d69e2e";
      case "Réception": return "#9f7aea";
      case "Transfert": return "#38b2ac";
      default: return "#6b7280";
    }
  }, []);

  /* ===================== Sauvegardes ===================== */
  const handleSaveDocuments = useCallback(async (e) => {
    e.preventDefault();
    if (!user || !societeId) return;
    setSaving(true); setError("");
    try {
      if (typeCachet === "image" && !cachetImage) {
        showNotification("Veuillez télécharger une image pour le cachet ou choisir le mode texte", "error");
        setSaving(false);
        return;
      }
      await setDoc(doc(db, "societe", societeId, "parametres", "documents"), {
        entete: entete.trim(),
        pied: pied.trim(),
        cachetTexte: cachetTexte.trim(),
        cachetImage: cachetImage || null,
        afficherCachet: !!afficherCachet,
        typeCachet,
        tailleCachet: Number(tailleCachet) || 120,
        modifiePar: user.uid,
        modifieParEmail: user.email || "",
        modifieLe: Timestamp.now(),
        version: "2.0",
      });
      showNotification("Paramètres documents sauvegardés avec succès!", "success");
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Erreur sauvegarde documents:", err);
      showNotification("Erreur lors de la sauvegarde: " + err.message, "error");
    } finally { setSaving(false); }
  }, [user, societeId, typeCachet, cachetImage, cachetTexte, entete, pied, afficherCachet, tailleCachet, showNotification]);

  const handleSaveInformations = useCallback(async (e) => {
    e.preventDefault();
    if (!user || !societeId) return;
    setSaving(true);
    try {
      await setDoc(doc(db, "societe", societeId, "parametres", "informations"), {
        nomPharmacie: nomPharmacie.trim(),
        adresse: adresse.trim(),
        telephone: telephone.trim(),
        email: email.trim(),
        rc: rc.trim(),
        ice: ice.trim(),
        if: if_.trim(),
        cnss: cnss.trim(),
        modifiePar: user.uid,
        modifieParEmail: user.email || "",
        modifieLe: Timestamp.now(),
      });
      showNotification("Informations pharmacie sauvegardées avec succès!", "success");
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Erreur sauvegarde informations:", err);
      showNotification("Erreur lors de la sauvegarde: " + err.message, "error");
    } finally { setSaving(false); }
  }, [user, societeId, nomPharmacie, adresse, telephone, email, rc, ice, if_, cnss, showNotification]);

  const handleSaveGestion = useCallback(async (e) => {
    e.preventDefault();
    if (!user || !societeId) return;
    setSaving(true);
    try {
      await setDoc(doc(db, "societe", societeId, "parametres", "gestion"), {
        seuilAlerteGlobal: Number(seuilAlerteGlobal),
        delaiPeremptionAlerte: Number(delaiPeremptionAlerte),
        tvaVente: Number(tvaVente),
        modifiePar: user.uid,
        modifieParEmail: user.email || "",
        modifieLe: Timestamp.now(),
      });
      showNotification("Paramètres de gestion sauvegardés avec succès!", "success");
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Erreur sauvegarde gestion:", err);
      showNotification("Erreur lors de la sauvegarde: " + err.message, "error");
    } finally { setSaving(false); }
  }, [user, societeId, seuilAlerteGlobal, delaiPeremptionAlerte, tvaVente, showNotification]);

  const handleSaveMultiLots = useCallback(async (e) => {
    e.preventDefault();
    if (!user || !societeId) return;
    setSaving(true);
    try {
      await setDoc(doc(db, "societe", societeId, "parametres", "multilots"), {
        gestionMultiLots: !!gestionMultiLots,
        alerteLotsExpires: !!alerteLotsExpires,
        delaiAlerteLots: Number(delaiAlerteLots),
        generationAutomatiqueLots: !!generationAutomatiqueLots,
        formatNumerotationLots,
        modifiePar: user.uid,
        modifieParEmail: user.email || "",
        modifieLe: Timestamp.now(),
      });
      showNotification("Paramètres multi-lots sauvegardés avec succès!", "success");
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Erreur sauvegarde multi-lots:", err);
      showNotification("Erreur lors de la sauvegarde: " + err.message, "error");
    } finally { setSaving(false); }
  }, [user, societeId, gestionMultiLots, alerteLotsExpires, delaiAlerteLots, generationAutomatiqueLots, formatNumerotationLots, showNotification]);

  /* ===================== Styles ===================== */
  const getResponsiveStyles = () => ({
    container: {
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      minHeight: "100vh",
      padding: isMobile ? "10px" : isTablet ? "15px" : "20px",
      fontFamily: "'Inter', Arial, sans-serif",
    },
    mainCard: {
      background: "white",
      borderRadius: isMobile ? "15px" : "25px",
      boxShadow: isMobile ? "0 15px 30px rgba(0,0,0,0.1)" : "0 30px 60px rgba(0,0,0,0.15)",
      overflow: "hidden",
      margin: "0 auto",
      maxWidth: isMobile ? "100%" : isTablet ? "95%" : activeTab === "activites" ? "1500px" : "1200px",
    },
    header: {
      background: "linear-gradient(135deg, #4a5568 0%, #2d3748 100%)",
      padding: isMobile ? "20px 15px" : isTablet ? "30px 25px" : "40px",
      textAlign: "center",
      color: "white",
      position: "relative",
    },
    title: {
      fontSize: isMobile ? "1.8em" : isTablet ? "2.3em" : "2.8em",
      fontWeight: 800,
      margin: 0,
      textShadow: "3px 3px 6px rgba(0,0,0,0.3)",
      letterSpacing: isMobile ? "1px" : "2px",
    },
    subtitle: {
      fontSize: isMobile ? "0.9em" : isTablet ? "1em" : "1.2em",
      opacity: 0.9,
      marginTop: "15px",
      letterSpacing: "1px",
    },
    content: { padding: isMobile ? "20px 15px" : isTablet ? "35px 25px" : "50px" },
    formCard: {
      background: "linear-gradient(135deg, #f8fafc 0%, #edf2f7 100%)",
      borderRadius: isMobile ? "15px" : "25px",
      padding: isMobile ? "20px 15px" : isTablet ? "30px 20px" : "40px",
      marginBottom: isMobile ? "20px" : "30px",
      border: "3px solid #e2e8f0",
      boxShadow: "0 15px 40px rgba(0,0,0,0.08)",
    },
    button: {
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      border: "none",
      borderRadius: isMobile ? "10px" : "15px",
      padding: isMobile ? "12px 20px" : "14px 25px",
      color: "white",
      fontWeight: 700,
      fontSize: isMobile ? "0.9em" : "1em",
      cursor: "pointer",
      boxShadow: "0 8px 25px rgba(102, 126, 234, 0.4)",
      transition: "all 0.3s ease",
      textTransform: "uppercase",
      letterSpacing: "1px",
    },
    tab: {
      background: "linear-gradient(135deg, #4299e1 0%, #3182ce 100%)",
      border: "none",
      borderRadius: "15px 15px 0 0",
      padding: isMobile ? "12px 16px" : "16px 24px",
      color: "white",
      fontWeight: 700,
      fontSize: isMobile ? "0.8em" : "0.9em",
      cursor: "pointer",
      marginRight: "8px",
      marginBottom: "-2px",
      transition: "all 0.3s ease",
    },
    activeTab: {
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      transform: "translateY(-2px)",
      boxShadow: "0 8px 25px rgba(102, 126, 234, 0.4)",
    },
    notification: {
      position: "fixed",
      top: isMobile ? "15px" : "30px",
      right: isMobile ? "15px" : "30px",
      padding: isMobile ? "15px 20px" : "20px 30px",
      borderRadius: isMobile ? "10px" : "15px",
      color: "white",
      fontWeight: 700,
      zIndex: 1000,
      boxShadow: "0 15px 40px rgba(0,0,0,0.2)",
      backdropFilter: "blur(10px)",
      border: "1px solid rgba(255,255,255,0.2)",
      fontSize: isMobile ? "0.85em" : "1em",
      maxWidth: isMobile ? "calc(100vw - 30px)" : "auto",
      animation: "slideIn 0.3s ease",
    },
    input: {
      width: "100%",
      padding: "12px 15px",
      border: "2px solid #e2e8f0",
      borderRadius: "8px",
      fontSize: "0.9em",
      fontWeight: 600,
      background: "white",
      transition: "border-color 0.3s ease",
      fontFamily: "Arial, sans-serif",
    },
    label: {
      display: "block",
      fontWeight: 700,
      marginBottom: "8px",
      color: "#4a5568",
      fontSize: "0.9em",
      textTransform: "uppercase",
      letterSpacing: "0.5px",
    },
    table: {
      width: "100%",
      borderCollapse: "collapse",
      marginTop: "20px",
      background: "#fff",
      borderRadius: "12px",
      overflow: "hidden",
      boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
    },
    tableHead: {
      background: "linear-gradient(135deg, #0B1220 0%, #1F2937 100%)",
      color: "#E5E7EB",
      fontWeight: 800,
      textTransform: "uppercase",
      fontSize: "12px",
      letterSpacing: "0.5px",
      padding: "12px 10px",
    },
    tableCell: {
      padding: "12px 10px",
      borderBottom: "1px solid #E5E7EB",
      textAlign: "center",
      color: "#0F172A",
      fontWeight: 600,
    },
  });

  const styles = getResponsiveStyles();
  const animationStyle = `@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`;

  /* ===================== Guards ===================== */
  if (waiting) {
    return (
      <div style={{ ...styles.container, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ ...styles.mainCard, padding: "40px", textAlign: "center", color: "#667eea" }}>
          Chargement des paramètres...
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ ...styles.container, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ ...styles.mainCard, padding: "40px", textAlign: "center", color: "#e53e3e" }}>
          Non connecté.
        </div>
      </div>
    );
  }

  if (!societeId) {
    return (
      <div style={{ ...styles.container, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ ...styles.mainCard, padding: "40px", textAlign: "center", color: "#e53e3e" }}>
          Aucune société sélectionnée.
        </div>
      </div>
    );
  }

  if (!isRoleAutorise(role)) {
    return (
      <div style={{ ...styles.container, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ ...styles.mainCard, padding: "40px", textAlign: "center", color: "#e53e3e" }}>
          Accès refusé. Seul le pharmacien (ou admin) peut accéder aux paramètres.
        </div>
      </div>
    );
  }

  /* ===================== UI PRINCIPALE ===================== */
  return (
    <>
      <style>{animationStyle}</style>
      <div style={styles.container}>
        <div style={styles.mainCard}>
          <div style={styles.header}>
            <h1 style={styles.title}>Paramètres Pharmacie</h1>
            <p style={styles.subtitle}>Configuration complète avec gestion avancée des lots et suivi des activités</p>
          </div>

          <div style={styles.content}>
            {notification && (
              <div
                style={{
                  ...styles.notification,
                  background:
                    notification.type === "success"
                      ? "linear-gradient(135deg, #48bb78 0%, #38a169 100%)"
                      : notification.type === "error"
                      ? "linear-gradient(135deg, #f56565 0%, #e53e3e 100%)"
                      : "linear-gradient(135deg, #4299e1 0%, #3182ce 100%)",
                }}
              >
                {notification.message}
              </div>
            )}

            <div style={{ display: "flex", gap: isMobile ? 5 : 10, marginBottom: "20px", borderBottom: "3px solid #667eea", paddingBottom: "10px", flexWrap: "wrap" }}>
              {[
                ["documents", "Documents"],
                ["informations", "Informations"],
                ["gestion", "Gestion"],
                ["multilots", "Multi-Lots"],
                ["activites", "Activités"],
              ].map(([key, label]) => (
                <button key={key} style={{ ...styles.tab, ...(activeTab === key ? styles.activeTab : {}) }} onClick={() => setActiveTab(key)} type="button">
                  {label}
                </button>
              ))}
            </div>

            {/* --- Onglet Documents --- */}
            {activeTab === "documents" && (
              <div style={styles.formCard}>
                <form onSubmit={handleSaveDocuments}>
                  <h3 style={{ color: "#2d3748", fontSize: "1.6em", fontWeight: 800, marginBottom: "30px", textAlign: "center" }}>
                    Personnalisation des Documents
                  </h3>

                  <div style={{ marginBottom: "20px" }}>
                    <label style={styles.label}>Entête des documents</label>
                    <textarea style={{ ...styles.input, minHeight: "100px", resize: "vertical", fontFamily: "monospace" }} rows={4} value={entete} onChange={(e) => setEntete(e.target.value)} placeholder="Ex : PHARMACIE CENTRALE" disabled={saving} />
                  </div>

                  <div style={{ marginBottom: "20px" }}>
                    <label style={styles.label}>Pied de page</label>
                    <textarea style={{ ...styles.input, minHeight: "80px", resize: "vertical", fontFamily: "monospace" }} rows={3} value={pied} onChange={(e) => setPied(e.target.value)} placeholder="Ex : Merci pour votre confiance !" disabled={saving} />
                  </div>

                  <div style={{ marginBottom: "20px" }}>
                    <label style={styles.label}>Type de cachet</label>
                    <select style={styles.input} value={typeCachet} onChange={(e) => setTypeCachet(e.target.value)} disabled={saving}>
                      <option value="texte">Texte</option>
                      <option value="image">Image</option>
                    </select>
                  </div>

                  {typeCachet === "texte" && (
                    <div style={{ marginBottom: "20px" }}>
                      <label style={styles.label}>Texte du cachet</label>
                      <input type="text" style={styles.input} value={cachetTexte} onChange={(e) => setCachetTexte(e.target.value)} placeholder="Cachet Société" disabled={saving} />
                    </div>
                  )}

                  {typeCachet === "image" && (
                    <div style={{ marginBottom: "20px" }}>
                      <label style={styles.label}>Image du cachet</label>
                      <input type="file" id="cachet-upload" accept="image/*" onChange={handleImageUpload} disabled={saving || uploadingImage} style={{ ...styles.input, padding: "10px" }} />
                      {cachetImage && (
                        <button type="button" onClick={handleRemoveImage} style={{ ...styles.button, marginTop: "10px", background: "linear-gradient(135deg, #f56565 0%, #e53e3e 100%)" }} disabled={saving}>
                          Supprimer l'image
                        </button>
                      )}
                    </div>
                  )}

                  <div style={{ marginBottom: "20px" }}>
                    <label style={styles.label}>Taille du cachet (pixels)</label>
                    <input type="number" style={styles.input} value={tailleCachet} onChange={(e) => setTailleCachet(Number(e.target.value))} min="50" max="500" disabled={saving} />
                  </div>

                  <div style={{ marginBottom: "20px" }}>
                    <label style={{ display: "flex", alignItems: "center", fontWeight: 700, color: "#4a5568" }}>
                      <input type="checkbox" checked={afficherCachet} onChange={(e) => setAfficherCachet(e.target.checked)} disabled={saving} style={{ marginRight: "10px", width: "18px", height: "18px", cursor: "pointer" }} />
                      Afficher le cachet sur les documents
                    </label>
                  </div>

                  <div style={{ textAlign: "center", marginTop: "30px" }}>
                    <button type="submit" style={{ ...styles.button, width: isMobile ? "100%" : "auto", minWidth: "250px" }} disabled={saving}>
                      {saving ? "Enregistrement..." : "Enregistrer"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* --- Onglet Informations --- */}
            {activeTab === "informations" && (
              <div style={styles.formCard}>
                <form onSubmit={handleSaveInformations}>
                  <h3 style={{ color: "#2d3748", fontSize: "1.6em", fontWeight: 800, marginBottom: "30px", textAlign: "center" }}>
                    Informations de la Pharmacie
                  </h3>

                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "20px" }}>
                    <div>
                      <label style={styles.label}>Nom de la pharmacie</label>
                      <input type="text" style={styles.input} value={nomPharmacie} onChange={(e) => setNomPharmacie(e.target.value)} disabled={saving} />
                    </div>
                    <div>
                      <label style={styles.label}>Adresse</label>
                      <input type="text" style={styles.input} value={adresse} onChange={(e) => setAdresse(e.target.value)} disabled={saving} />
                    </div>
                    <div>
                      <label style={styles.label}>Téléphone</label>
                      <input type="tel" style={styles.input} value={telephone} onChange={(e) => setTelephone(e.target.value)} disabled={saving} />
                    </div>
                    <div>
                      <label style={styles.label}>Email</label>
                      <input type="email" style={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} disabled={saving} />
                    </div>
                    <div>
                      <label style={styles.label}>RC (Registre de Commerce)</label>
                      <input type="text" style={styles.input} value={rc} onChange={(e) => setRc(e.target.value)} disabled={saving} />
                    </div>
                    <div>
                      <label style={styles.label}>ICE (Identifiant Commun Entreprise)</label>
                      <input type="text" style={styles.input} value={ice} onChange={(e) => setIce(e.target.value)} disabled={saving} />
                    </div>
                    <div>
                      <label style={styles.label}>IF (Identifiant Fiscal)</label>
                      <input type="text" style={styles.input} value={if_} onChange={(e) => setIf(e.target.value)} disabled={saving} />
                    </div>
                    <div>
                      <label style={styles.label}>CNSS (Numéro CNSS)</label>
                      <input type="text" style={styles.input} value={cnss} onChange={(e) => setCnss(e.target.value)} disabled={saving} />
                    </div>
                  </div>

                  <div style={{ textAlign: "center", marginTop: "30px" }}>
                    <button type="submit" style={{ ...styles.button, width: isMobile ? "100%" : "auto", minWidth: "250px" }} disabled={saving}>
                      {saving ? "Enregistrement..." : "Enregistrer"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* --- Onglet Gestion --- */}
            {activeTab === "gestion" && (
              <div style={styles.formCard}>
                <form onSubmit={handleSaveGestion}>
                  <h3 style={{ color: "#2d3748", fontSize: "1.6em", fontWeight: 800, marginBottom: "30px", textAlign: "center" }}>
                    Paramètres de Gestion
                  </h3>

                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: "20px" }}>
                    <div>
                      <label style={styles.label}>Seuil d'alerte global (stock)</label>
                      <input type="number" style={styles.input} value={seuilAlerteGlobal} onChange={(e) => setSeuilAlerteGlobal(Number(e.target.value))} min="0" disabled={saving} />
                    </div>
                    <div>
                      <label style={styles.label}>Délai péremption alerte (jours)</label>
                      <input type="number" style={styles.input} value={delaiPeremptionAlerte} onChange={(e) => setDelaiPeremptionAlerte(Number(e.target.value))} min="1" disabled={saving} />
                    </div>
                    <div>
                      <label style={styles.label}>TVA Vente (%)</label>
                      <input type="number" style={styles.input} value={tvaVente} onChange={(e) => setTvaVente(Number(e.target.value))} min="0" max="100" step="0.1" disabled={saving} />
                    </div>
                  </div>

                  <div style={{ textAlign: "center", marginTop: "30px" }}>
                    <button type="submit" style={{ ...styles.button, width: isMobile ? "100%" : "auto", minWidth: "250px" }} disabled={saving}>
                      {saving ? "Enregistrement..." : "Enregistrer"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* --- Onglet Multi-Lots --- */}
            {activeTab === "multilots" && (
              <div style={styles.formCard}>
                <form onSubmit={handleSaveMultiLots}>
                  <h3 style={{ color: "#2d3748", fontSize: "1.6em", fontWeight: 800, marginBottom: "30px", textAlign: "center" }}>
                    Gestion Multi-Lots
                  </h3>

                  <div style={{ marginBottom: "20px" }}>
                    <label style={{ display: "flex", alignItems: "center", fontWeight: 700, color: "#4a5568" }}>
                      <input type="checkbox" checked={gestionMultiLots} onChange={(e) => setGestionMultiLots(e.target.checked)} disabled={saving} style={{ marginRight: "10px", width: "18px", height: "18px", cursor: "pointer" }} />
                      Activer la gestion multi-lots
                    </label>
                  </div>

                  {gestionMultiLots && (
                    <>
                      <div style={{ marginBottom: "20px" }}>
                        <label style={{ display: "flex", alignItems: "center", fontWeight: 700, color: "#4a5568" }}>
                          <input type="checkbox" checked={alerteLotsExpires} onChange={(e) => setAlerteLotsExpires(e.target.checked)} disabled={saving} style={{ marginRight: "10px", width: "18px", height: "18px", cursor: "pointer" }} />
                          Alerte lots expirés
                        </label>
                      </div>

                      <div style={{ marginBottom: "20px" }}>
                        <label style={styles.label}>Délai alerte lots (jours)</label>
                        <input type="number" style={styles.input} value={delaiAlerteLots} onChange={(e) => setDelaiAlerteLots(Number(e.target.value))} min="1" disabled={saving} />
                      </div>

                      <div style={{ marginBottom: "20px" }}>
                        <label style={{ display: "flex", alignItems: "center", fontWeight: 700, color: "#4a5568" }}>
                          <input type="checkbox" checked={generationAutomatiqueLots} onChange={(e) => setGenerationAutomatiqueLots(e.target.checked)} disabled={saving} style={{ marginRight: "10px", width: "18px", height: "18px", cursor: "pointer" }} />
                          Génération automatique lots
                        </label>
                      </div>

                      <div style={{ marginBottom: "20px" }}>
                        <label style={styles.label}>Format numérotation lots</label>
                        <input type="text" style={styles.input} value={formatNumerotationLots} onChange={(e) => setFormatNumerotationLots(e.target.value)} placeholder="LOT{YYYY}{MM}{DD}{HH}{mm}" disabled={saving} />
                        <small style={{ color: "#6b7280", marginTop: "5px", display: "block" }}>
                          Variables: {"{YYYY}"} (année), {"{MM}"} (mois), {"{DD}"} (jour), {"{HH}"} (heure), {"{mm}"} (minute)
                        </small>
                      </div>
                    </>
                  )}

                  <div style={{ textAlign: "center", marginTop: "30px" }}>
                    <button type="submit" style={{ ...styles.button, width: isMobile ? "100%" : "auto", minWidth: "250px" }} disabled={saving}>
                      {saving ? "Enregistrement..." : "Enregistrer"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* --- Onglet Activités --- */}
            {activeTab === "activites" && (
              <>
                <div style={{ marginBottom: "20px" }}>
                  <button
                    style={{
                      ...styles.button,
                      background: showActivitesFilters
                        ? "linear-gradient(135deg, #f56565 0%, #e53e3e 100%)"
                        : "linear-gradient(135deg, #4299e1 0%, #3182ce 100%)",
                    }}
                    onClick={() => setShowActivitesFilters((v) => !v)}
                    type="button"
                  >
                    {showActivitesFilters ? "Masquer" : "Afficher"} Filtres
                  </button>
                </div>

                {showActivitesFilters && (
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(200px, 1fr))", gap: "15px", marginBottom: "20px", padding: "20px", background: "linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%)", borderRadius: "15px", border: "2px solid #e2e8f0" }}>
                    <div>
                      <label style={styles.label}>Utilisateur</label>
                      <select style={styles.input} value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
                        <option value="">Tous les utilisateurs</option>
                        {utilisateurs.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.prenom || u.nom || u.displayName || u.email} ({u.role})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={styles.label}>Rôle</label>
                      <select style={styles.input} value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
                        <option value="">Tous les rôles</option>
                        <option value="vendeuse">Vendeuse</option>
                        <option value="pharmacien">Pharmacien</option>
                        <option value="docteur">Docteur</option>
                      </select>
                    </div>

                    <div>
                      <label style={styles.label}>Type d'activité</label>
                      <select style={styles.input} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                        <option value="">Tous les types</option>
                        <option value="Vente">Ventes</option>
                        <option value="Achat">Achats</option>
                        <option value="Paiement">Paiements</option>
                        <option value="Multi-Lots">Multi-Lots</option>
                      </select>
                    </div>

                    <div>
                      <label style={styles.label}>Date début</label>
                      <input type="date" style={styles.input} value={filterDateMin} onChange={(e) => setFilterDateMin(e.target.value)} />
                    </div>

                    <div>
                      <label style={styles.label}>Date fin</label>
                      <input type="date" style={styles.input} value={filterDateMax} onChange={(e) => setFilterDateMax(e.target.value)} />
                    </div>

                    {(selectedUserId || filterType || filterRole || filterDateMin || filterDateMax) && (
                      <div style={{ textAlign: "center" }}>
                        <button
                          style={{ ...styles.button, background: "linear-gradient(135deg, #f56565 0%, #e53e3e 100%)", padding: "10px 20px", fontSize: "0.9em", width: "100%" }}
                          type="button"
                          onClick={() => { setSelectedUserId(""); setFilterType(""); setFilterRole(""); setFilterDateMin(""); setFilterDateMax(""); }}
                        >
                          Réinitialiser
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ overflowX: "auto", borderRadius: "15px", border: "1px solid #e2e8f0", boxShadow: "0 15px 40px rgba(0,0,0,0.1)", maxHeight: "70vh", overflowY: "auto" }}>
                  <table style={styles.table}>
                    <thead>
                      <tr style={{ background: "linear-gradient(135deg, #2d3748 0%, #1a202c 100%)", color: "white", position: "sticky", top: 0, zIndex: 10 }}>
                        <th style={styles.tableHead}>DATE & HEURE (MAROC)</th>
                        <th style={styles.tableHead}>UTILISATEUR / RÔLE</th>
                        <th style={styles.tableHead}>TYPE</th>
                        <th style={styles.tableHead}>DÉTAILS</th>
                        {!isMobile && <th style={styles.tableHead}>MONTANT</th>}
                        <th style={styles.tableHead}>STATUT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activitesFiltrees.map((a, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? "#f8fafc" : "white" }}>
                          <td style={styles.tableCell}><strong>{formatDate(a.date)}</strong></td>
                          <td style={styles.tableCell}>
                            <div style={{ fontWeight: 700, color: "#2d3748", fontSize: "0.95em" }}>
                              {getUserName(a.utilisateurId, a.utilisateurEmail)}
                            </div>
                            <div style={{ fontSize: "0.75em", color: "#6b7280", marginTop: "4px", textTransform: "uppercase" }}>
                              {a.utilisateurRole ? `[${a.utilisateurRole}]` : getUserRole(a.utilisateurId)}
                            </div>
                          </td>
                          <td style={styles.tableCell}>
                            <span style={{ display: "inline-block", padding: "5px 10px", borderRadius: "8px", fontSize: "0.75em", fontWeight: 700, background: getTypeColor(a.type) + "30", color: getTypeColor(a.type) }}>
                              {isMobile ? a.type.split(" ")[0] : a.type}
                            </span>
                          </td>
                          <td style={{ ...styles.tableCell, textAlign: "left", fontSize: "0.9em" }}>
                            {a.details}
                            {a.nombreArticles > 0 && <div style={{ fontSize: "0.8em", color: "#6b7280" }}>({a.nombreArticles} articles)</div>}
                            {a.nombreLots > 0 && <div style={{ fontSize: "0.8em", color: "#667eea", fontWeight: 600 }}>{a.nombreLots} lot(s)</div>}
                          </td>
                          {!isMobile && (
                            <td style={styles.tableCell}>
                              {a.montant > 0 ? (
                                <span style={{ color: "#48bb78", fontWeight: 800 }}>{Number(a.montant).toFixed(2)} DH</span>
                              ) : (
                                <span style={{ color: "#9ca3af" }}>-</span>
                              )}
                            </td>
                          )}
                          <td style={styles.tableCell}>
                            <span style={{ display: "inline-block", padding: "5px 10px", borderRadius: "20px", fontSize: "0.75em", fontWeight: 700, background:
                              a.statut.toLowerCase().includes("payé") || a.statut.toLowerCase().includes("effectué")
                                ? "linear-gradient(135deg, #48bb78 0%, #38a169 100%)"
                                : a.statut.toLowerCase().includes("impay")
                                ? "linear-gradient(135deg, #f56565 0%, #e53e3e 100%)"
                                : "linear-gradient(135deg, #4299e1 0%, #3182ce 100%)", color: "white" }}>
                              {a.statut}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {activitesFiltrees.length === 0 && (
                  <div style={{ textAlign: "center", padding: "40px", color: "#6b7280", background: "linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%)", borderRadius: "15px", marginTop: "20px" }}>
                    Aucune activité trouvée
                  </div>
                )}

                <div style={{ textAlign: "center", marginTop: "30px" }}>
                  <button style={{ ...styles.button, background: "linear-gradient(135deg, #4299e1 0%, #3182ce 100%)", width: isMobile ? "100%" : "auto" }} onClick={fetchActivites} disabled={loadingActivites} type="button">
                    {loadingActivites ? "Actualisation..." : "Actualiser"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
