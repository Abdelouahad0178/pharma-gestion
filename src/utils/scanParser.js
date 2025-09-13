// src/utils/scanParser.js
// Parse GS1 strings like: (01)GTIN(17)YYMMDD(10)LOT(21)SERIAL
// or raw with FNC1 (ASCII 29). Also handles plain EAN/UPC.

const AI_TABLE = {
  "01": { len: 14, var: false, key: "gtin" },
  "17": { len: 6,  var: false, key: "expiry" },     // YYMMDD
  "10": { len: 20, var: true,  key: "lot" },        // var, FNC1-terminated
  "21": { len: 20, var: true,  key: "serial" },
  "30": { len: 8,  var: true,  key: "qty" },        // numeric var
  "15": { len: 6,  var: false, key: "bestBefore" }, // YYMMDD
  "20": { len: 2,  var: false, key: "variant" },
};

function normalizeToEAN13FromGTIN14(gtin14) {
  if (!/^\d{14}$/.test(gtin14)) return null;
  return gtin14.slice(1); // drop indicator
}
function padTo14(n) { return String(n).padStart(14, "0"); }

function parseYYMMDD(s) {
  if (!/^\d{6}$/.test(s)) return null;
  const yy = Number(s.slice(0,2));
  const mm = Number(s.slice(2,4));
  const dd = Number(s.slice(4,6));
  const yyyy = 2000 + yy; // pharma: 2000-2099
  const d = new Date(Date.UTC(yyyy, mm - 1, dd || 1));
  // Si jour = "00" (parfois utilisé), on force dernier jour du mois
  if (dd === 0) {
    const last = new Date(Date.UTC(yyyy, mm, 0)).getUTCDate();
    return new Date(Date.UTC(yyyy, mm - 1, last));
  }
  return d;
}

export function parseScannedCode(raw) {
  const out = { raw, qty: 1 };

  if (!raw) return out;
  let s = String(raw).trim();

  // Retire identifiants de symbologie éventuels (]d2, ]C1, ]Q3…)
  s = s.replace(/^\](?:C1|d2|Q3)/i, "");

  // Uniformise: FNC1 -> | ; supprime espaces
  s = s.replace(/\s+/g, "").replace(/\u001D/g, "|");

  // Cas 1: style "parenthèses" lisible (…)(01)…(17)…(10)…(21)…
  if (s.includes("(")) {
    const rx = /\((\d{2,4})\)([^(|]+)/g;
    let m;
    while ((m = rx.exec(s))) {
      assignAI(out, m[1], m[2]);
    }
  } else {
    // Cas 2: brut avec FNC1/| — Parsing séquentiel
    let i = 0;
    while (i < s.length) {
      const ai =
        AI_TABLE[s.substr(i, 4)] ? s.substr(i, 4) :
        AI_TABLE[s.substr(i, 3)] ? s.substr(i, 3) :
        AI_TABLE[s.substr(i, 2)] ? s.substr(i, 2) : null;
      if (!ai) break;
      i += ai.length;

      const spec = AI_TABLE[ai];
      let val = "";
      if (spec.var) {
        const nextSep = s.indexOf("|", i);
        if (nextSep >= 0) {
          val = s.slice(i, nextSep);
          i = nextSep + 1;
        } else {
          // lit jusqu'au prochain AI connu ou fin
          let j = i;
          while (j < s.length) {
            const cand =
              AI_TABLE[s.substr(j, 4)] || AI_TABLE[s.substr(j, 3)] || AI_TABLE[s.substr(j, 2)];
            if (cand) break;
            j++;
          }
          val = s.slice(i, j);
          i = j;
        }
      } else {
        val = s.substr(i, spec.len);
        i += spec.len;
      }
      assignAI(out, ai, val);
    }
  }

  // Fallback: EAN/UPC nu
  if (!out.gtin && !out.ean13 && /^\d{8,14}$/.test(s)) {
    const digits = s.match(/^\d{8,14}$/) ? s : s.match(/\d+/)?.[0];
    if (digits) {
      if (digits.length === 14) {
        out.gtin = digits;
        out.ean13 = normalizeToEAN13FromGTIN14(digits);
      } else if (digits.length === 13) {
        out.ean13 = digits;
        out.gtin = padTo14(digits);
      } else if (digits.length === 12) {
        out.upc = digits;
        out.ean13 = "0" + digits;
        out.gtin = padTo14(out.ean13);
      } else if (digits.length === 8) {
        out.ean8 = digits;
      }
    }
  }

  if (!("qty" in out) || !out.qty) out.qty = 1;
  return out;
}

function assignAI(out, ai, val) {
  const spec = AI_TABLE[ai];
  if (!spec) return;
  switch (spec.key) {
    case "gtin":
      out.gtin = val;
      out.ean13 = normalizeToEAN13FromGTIN14(val) || out.ean13;
      break;
    case "expiry":
      out.expiryRaw = val;
      out.expiryDate = parseYYMMDD(val);
      break;
    case "lot":
      out.lot = val;
      break;
    case "serial":
      out.serial = val;
      break;
    case "qty":
      out.qty = Number(val.replace(/\D+/g, "")) || 1;
      break;
    case "bestBefore":
      out.bestBefore = parseYYMMDD(val);
      break;
    default:
      out[spec.key] = val;
  }
}
