import React, { useState, useEffect } from "react";
import { db } from "../../firebase/config";
import { collection, getDocs } from "firebase/firestore";
import { useUserRole } from "../../contexts/UserRoleContext";

export default function Dashboard() {
  const { societeId, user, loading } = useUserRole();

  const [totalVentes, setTotalVentes] = useState(0);
  const [totalAchats, setTotalAchats] = useState(0);
  const [produitsStock, setProduitsStock] = useState(0);
  const [alertes, setAlertes] = useState([]);
  const [periode, setPeriode] = useState("jour");
  const [dateMin, setDateMin] = useState("");
  const [dateMax, setDateMax] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [waiting, setWaiting] = useState(true);

  // Synchronisation du chargement
  useEffect(() => {
    setWaiting(loading || !societeId || !user);
  }, [loading, societeId, user]);

  // ➡ Charger données Firestore PAR SOCIÉTÉ
  const fetchData = async () => {
    if (!societeId) return;

    const ventesSnap = await getDocs(collection(db, "societe", societeId, "ventes"));
    const achatsSnap = await getDocs(collection(db, "societe", societeId, "achats"));
    const stockSnap = await getDocs(collection(db, "societe", societeId, "stock"));

    let ventesArr = [];
    ventesSnap.forEach((doc) => ventesArr.push(doc.data()));

    let achatsArr = [];
    achatsSnap.forEach((doc) => achatsArr.push(doc.data()));

    let stockArr = [];
    stockSnap.forEach((doc) => stockArr.push(doc.data()));

    setProduitsStock(stockArr.length);

    // ➡ Filtrer par période/date
    const filteredVentes = filterByPeriodeOuDates(ventesArr, periode, dateMin, dateMax);
    const filteredAchats = filterByPeriodeOuDates(achatsArr, periode, dateMin, dateMax);

    setTotalVentes(
      filteredVentes.reduce((total, vente) => {
        const articles = Array.isArray(vente.articles) ? vente.articles : [];
        return total + articles.reduce((sum, a) =>
          sum + (((a.prixUnitaire || 0) * (a.quantite || 0)) - (a.remise || 0)), 0);
      }, 0)
    );
    setTotalAchats(
      filteredAchats.reduce((total, achat) => {
        const articles = Array.isArray(achat.articles) ? achat.articles : [];
        return total + articles.reduce((sum, a) =>
          sum + (((a.prixUnitaire || 0) * (a.quantite || 0)) - (a.remise || 0)), 0);
      }, 0)
    );

    // ➡ Alertes stock bas / péremption
    const alertList = [];
    const today = new Date();
    stockArr.forEach((item) => {
      if ((item.quantite || 0) <= (item.seuil || 0)) {
        alertList.push({ type: "Stock bas", message: `${item.nom || ""} (Qté: ${item.quantite || 0})` });
      }
      if (item.datePeremption) {
        const diffDays = (new Date(item.datePeremption) - today) / (1000 * 3600 * 24);
        if (diffDays <= 30) {
          alertList.push({ type: "Péremption proche", message: `${item.nom || ""} (${Math.ceil(diffDays)} j)` });
        }
      }
    });
    setAlertes(alertList);
  };

  // ➡ Filtrer par période OU par dates
  const filterByPeriodeOuDates = (data, period, min, max) => {
    const now = new Date();
    return data.filter((item) => {
      if (!item.date) return false;
      const d = item.date.toDate ? item.date.toDate() : new Date(item.date);

      if (min) {
        if (d < new Date(min)) return false;
      }
      if (max) {
        const maxDate = new Date(max + "T23:59:59");
        if (d > maxDate) return false;
      }

      if (!min && !max) {
        switch (period) {
          case "jour": return d.toDateString() === now.toDateString();
          case "semaine": {
            const start = new Date(now); start.setDate(now.getDate() - 7);
            return d >= start;
          }
          case "mois": return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
          case "annee": return d.getFullYear() === now.getFullYear();
          default: return true;
        }
      }
      return true;
    });
  };

  useEffect(() => {
    if (societeId) {
      fetchData();
    }
    // eslint-disable-next-line
  }, [societeId, periode, dateMin, dateMax]);

  // --- STYLES DIRECTS ---
  const dashboardStyle = {
    maxWidth: 1250,
    margin: "30px auto 0 auto",
    padding: 0,
    fontFamily: "'Inter', Arial, sans-serif",
    color: "#e8ecf4",
    minHeight: "92vh"
  };
  const cardStyle = {
    background: "linear-gradient(120deg, #223049 0%, #3a4c67 100%)",
    borderRadius: 16,
    boxShadow: "0 8px 48px #202a3c80",
    padding: "28px 26px 18px 26px",
    border: "1.5px solid #415377",
    color: "#e8ecf4",
    minHeight: 145,
    marginBottom: 15,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    filter: "drop-shadow(0 30px 12px #1b253c40)"
  };
  const statNumberStyle = {
    fontWeight: 800,
    fontSize: "2.1rem",
    letterSpacing: "0.03em",
    color: "#7ee4e6",
    margin: "5px 0 0 0"
  };
  const statLabelStyle = {
    color: "#e3eaff",
    fontSize: "1.12rem",
    fontWeight: 600,
    letterSpacing: "0.04em"
  };
  const alertTableStyle = {
    background: "#283c55",
    borderRadius: 13,
    boxShadow: "0 8px 32px #17203245",
    border: "1px solid #334568",
    marginTop: 18
  };

  // Responsive slide pour filtres
  const filterContainerStyle = {
    display: showFilters ? "flex" : "none",
    flexWrap: "wrap",
    gap: 18,
    alignItems: "center",
    margin: "22px 0 17px 0",
    background: "#283c55",
    borderRadius: 11,
    padding: showFilters ? "17px 23px" : 0,
    transition: "all 0.24s cubic-bezier(.6,.15,.43,1.1)"
  };

  // Gestion du chargement
  if (waiting) {
    return (
      <div style={{ padding: 30, textAlign: "center", color: "#1c355e" }}>
        Chargement...
      </div>
    );
  }
  if (!user) {
    return (
      <div style={{ padding: 30, textAlign: "center", color: "#a32" }}>
        Non connecté.
      </div>
    );
  }

  return (
    <div style={dashboardStyle}>
      <div style={{
        fontSize: "2.1rem",
        fontWeight: 800,
        color: "#e3eaff",
        padding: "26px 26px 9px 26px",
        background: "#293b53",
        filter: "drop-shadow(0 30px 12px #1b253c40)",
        marginBottom: "0",
        textAlign: "left",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
      }}>
        <span>Tableau de bord</span>
        <button
          type="button"
          className="btn-neumorph"
          style={{
            background: "linear-gradient(90deg,#2bd2a6 40%,#6ee9df 100%)",
            color: "#1a2230",
            fontSize: 22,
            borderRadius: 12,
            minWidth: 42,
            height: 42,
            boxShadow: "0 3px 13px #1b243a22",
            marginRight: 0,
            marginLeft: 14,
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
          onClick={() => setShowFilters(f => !f)}
          title={showFilters ? "Masquer les filtres" : "Afficher les filtres"}
          aria-label={showFilters ? "Masquer les filtres" : "Afficher les filtres"}
        >
          {/* Icône simple (+ ou -) */}
          {showFilters ? (
            <span style={{ fontSize: 25, fontWeight: 800, color: "#f55974" }}>–</span>
          ) : (
            <span style={{ fontSize: 25, fontWeight: 800, color: "#1f7a7a" }}>+</span>
          )}
        </button>
      </div>

      {/* Filtres toggle */}
      <div style={filterContainerStyle}>
        <span style={{ fontWeight: 600, fontSize: 16 }}>Filtrer par :</span>
        <select value={periode} onChange={e => setPeriode(e.target.value)}
          className="input" style={{ minWidth: 110 }}>
          <option value="jour">Jour</option>
          <option value="semaine">Semaine</option>
          <option value="mois">Mois</option>
          <option value="annee">Année</option>
        </select>
        <span style={{ fontWeight: 600, marginLeft: 14 }}>Ou dates personnalisées :</span>
        <span>Du</span>
        <input type="date" className="input" value={dateMin} onChange={e => setDateMin(e.target.value)} />
        <span>au</span>
        <input type="date" className="input" value={dateMax} onChange={e => setDateMax(e.target.value)} />
        {(dateMin || dateMax) &&
          <button className="btn danger" type="button"
            onClick={() => { setDateMin(""); setDateMax(""); }}
            style={{ marginLeft: 12 }}>
            Effacer dates
          </button>
        }
        <button className="btn" style={{ marginLeft: 22, minWidth: 120 }} onClick={fetchData}>Actualiser</button>
      </div>

      {/* Statistiques */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
        gap: "26px",
        marginBottom: "29px"
      }}>
        <div style={cardStyle}>
          <div style={statLabelStyle}>Ventes</div>
          <div style={statNumberStyle}>{totalVentes} DH</div>
        </div>
        <div style={cardStyle}>
          <div style={statLabelStyle}>Achats</div>
          <div style={{ ...statNumberStyle, color: "#90e0a0" }}>{totalAchats} DH</div>
        </div>
        <div style={cardStyle}>
          <div style={statLabelStyle}>Produits en stock</div>
          <div style={{ ...statNumberStyle, color: "#e7e074" }}>{produitsStock}</div>
        </div>
        <div style={cardStyle}>
          <div style={statLabelStyle}>Alertes</div>
          <div style={{ ...statNumberStyle, color: "#fd6565" }}>{alertes.length}</div>
        </div>
      </div>

      {/* Alertes */}
      <div style={alertTableStyle}>
        <div style={{
          fontWeight: 700, fontSize: "1.17rem", letterSpacing: "0.02em",
          color: "#a1e8e7", background: "#233354", borderRadius: "13px 13px 0 0",
          padding: "14px 22px"
        }}>Alertes</div>
        {alertes.length === 0 ? (
          <div style={{ padding: "17px 22px", color: "#b5bed4" }}>Aucune alerte actuellement.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{
                  padding: "12px", borderBottom: "1.5px solid #334568",
                  color: "#7ee4e6", background: "#25355a", fontWeight: 700, letterSpacing: "0.02em"
                }}>Type</th>
                <th style={{
                  padding: "12px", borderBottom: "1.5px solid #334568",
                  color: "#7ee4e6", background: "#25355a", fontWeight: 700, letterSpacing: "0.02em"
                }}>Détail</th>
              </tr>
            </thead>
            <tbody>
              {alertes.map((a, i) => (
                <tr key={i}
                  style={{
                    background: a.type === "Stock bas" ? "#38304d" : "#3c2f21"
                  }}>
                  <td style={{ padding: "13px 11px", fontWeight: 600 }}>{a.type}</td>
                  <td style={{ padding: "13px 11px" }}>{a.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}