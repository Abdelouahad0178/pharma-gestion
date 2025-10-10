// src/components/ventes/VentesHelpers.js

/* ===================== Constantes ===================== */
export const APPLIED_SALES_COLL = "sales_applied";
export const DISMISSED_COLL = "order_dismissed";

export const STOCK_KEYS = [
  "stock",
  "stockSource",
  "originStock",
  "stockId",
  "stockName",
  "stock_label",
  "depot",
  "magasin",
  "source",
];

export const BARCODE_FIELDS = ["codeBarre", "barcode", "ean", "ean13", "upc", "gtin"];

/* ===================== Clé opération unique ===================== */
export const newOpKey = () =>
  `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/* ===================== Normalisation Stock ===================== */
export const normalizeStockValue = (val) => {
  if (val === undefined || val === null) return "unknown";
  if (typeof val === "number") return val === 1 ? "stock1" : val === 2 ? "stock2" : "unknown";
  const raw = String(val).toLowerCase().replace(/[\s_\-]/g, "");
  if (["stock1","s1","magasin1","depot1","principal","primary","p","m1","1"].includes(raw)) return "stock1";
  if (["stock2","s2","magasin2","depot2","secondaire","secondary","s","m2","2"].includes(raw)) return "stock2";
  return "unknown";
};

export const pickDocStock = (docData) => {
  for (const k of STOCK_KEYS) {
    if (docData?.[k] !== undefined) {
      const tag = normalizeStockValue(docData[k]);
      if (tag !== "unknown") return tag;
    }
  }
  return "stock1";
};

export const pickLotStock = (lot) => {
  if (!lot) return "stock1";
  const s1 = Number(lot.stock1 || 0);
  const s2 = Number(lot.stock2 || 0);
  if (s1 > 0 && s2 <= 0) return "stock1";
  if (s2 > 0 && s1 <= 0) return "stock2";
  if (s1 > 0 && s2 > 0) return "stock1";
  return pickDocStock(lot);
};

/* ===================== Utils dates & nombres ===================== */
export const safeParseDate = (dateInput) => {
  if (!dateInput) return null;
  try {
    if (dateInput?.toDate && typeof dateInput.toDate === "function") return dateInput.toDate();
    if (dateInput?.seconds != null) return new Date(dateInput.seconds * 1000);
    if (dateInput instanceof Date) return isNaN(dateInput.getTime()) ? null : dateInput;
    const d = new Date(dateInput);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};

export const formatDateSafe = (dateInput, { withTime = false } = {}) => {
  const d = safeParseDate(dateInput);
  if (!d) return "";
  return withTime ? d.toLocaleString("fr-FR") : d.toLocaleDateString("fr-FR");
};

export const getDateInputValue = (dateInput) => {
  const d = safeParseDate(dateInput);
  if (!d) return "";
  try {
    return d.toISOString().split("T")[0];
  } catch {
    return "";
  }
};

export const getTodayDateString = () => new Date().toISOString().split("T")[0];

export const safeNumber = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

export const safeToFixed = (v, dec = 2) => safeNumber(v).toFixed(dec);

/* ===================== Codes-barres ===================== */
export const findAnyBarcode = (obj) => {
  for (const f of BARCODE_FIELDS) {
    const val = obj?.[f];
    if (val != null && String(val).trim() !== "") return String(val);
  }
  return "";
};