// src/components/analytics/Analytics.js
import React, { useState, useMemo, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useUserRole } from '../../contexts/UserRoleContext';
import {
  groupVentesByPeriod,
  groupAchatsByPeriod,
  groupPaiementsByPeriod,
  mergeAllData,
  calculateStats,
  formatDH
} from './analyticsUtils';

export default function Analytics() {
  const { societeId } = useUserRole();
  
  // États pour les contrôles
  const [periode, setPeriode] = useState('mois');
  const [metrique, setMetrique] = useState('ca');
  const [typeGraphe, setTypeGraphe] = useState('line');
  const [loading, setLoading] = useState(true);

  // États pour les données brutes
  const [ventesRaw, setVentesRaw] = useState([]);
  const [achatsRaw, setAchatsRaw] = useState([]);
  const [paiementsRaw, setPaiementsRaw] = useState([]);

  // Charger les ventes depuis Firebase
  useEffect(() => {
    if (!societeId) return;

    const unsubVentes = onSnapshot(
      collection(db, 'societe', societeId, 'ventes'),
      (snapshot) => {
        const data = [];
        snapshot.forEach(doc => {
          data.push({ id: doc.id, ...doc.data() });
        });
        setVentesRaw(data);
      },
      (error) => {
        console.error('Erreur chargement ventes:', error);
      }
    );

    return () => unsubVentes();
  }, [societeId]);

  // Charger les achats depuis Firebase
  useEffect(() => {
    if (!societeId) return;

    const unsubAchats = onSnapshot(
      collection(db, 'societe', societeId, 'achats'),
      (snapshot) => {
        const data = [];
        snapshot.forEach(doc => {
          data.push({ id: doc.id, ...doc.data() });
        });
        setAchatsRaw(data);
      },
      (error) => {
        console.error('Erreur chargement achats:', error);
      }
    );

    return () => unsubAchats();
  }, [societeId]);

  // Charger les paiements depuis Firebase
  useEffect(() => {
    if (!societeId) return;

    const unsubPaiements = onSnapshot(
      collection(db, 'societe', societeId, 'paiements'),
      (snapshot) => {
        const data = [];
        snapshot.forEach(doc => {
          data.push({ id: doc.id, ...doc.data() });
        });
        setPaiementsRaw(data);
        setLoading(false);
      },
      (error) => {
        console.error('Erreur chargement paiements:', error);
        setLoading(false);
      }
    );

    return () => unsubPaiements();
  }, [societeId]);

  // Traiter et regrouper les données
  const data = useMemo(() => {
    if (loading) return [];

    const ventesGrouped = groupVentesByPeriod(ventesRaw, periode);
    const achatsGrouped = groupAchatsByPeriod(achatsRaw, periode);
    const paiementsGrouped = groupPaiementsByPeriod(paiementsRaw, periode);

    return mergeAllData(ventesGrouped, achatsGrouped, paiementsGrouped);
  }, [ventesRaw, achatsRaw, paiementsRaw, periode, loading]);

  // Calculer les statistiques
  const stats = useMemo(() => calculateStats(data), [data]);

  // Configuration des couleurs
  const colors = {
    ca: '#10b981',
    achats: '#ef4444',
    paiements: '#3b82f6',
    benefice: '#8b5cf6'
  };

  // Configuration des métriques
  const metriques = [
    { key: 'ca', label: 'Chiffre d\'Affaires', icon: '💰' },
    { key: 'achats', label: 'Achats', icon: '🛒' },
    { key: 'paiements', label: 'Paiements', icon: '💵' },
    { key: 'benefice', label: 'Bénéfice', icon: '📈' }
  ];

  // Données pour le graphique circulaire
  const pieData = useMemo(() => [
    { name: 'CA', value: stats.total.ca, color: colors.ca },
    { name: 'Achats', value: stats.total.achats, color: colors.achats },
    { name: 'Paiements', value: stats.total.paiements, color: colors.paiements }
  ], [stats]);

  if (!societeId) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}>
        <div style={{
          background: 'white',
          padding: '40px',
          borderRadius: '20px',
          textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
        }}>
          <h2>⚠️ Accès non autorisé</h2>
          <p>Vous devez être connecté pour accéder aux statistiques.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        background: 'white',
        borderRadius: '20px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        overflow: 'hidden'
      }}>
        {/* En-tête */}
        <div style={{
          background: 'linear-gradient(135deg, #4a5568 0%, #2d3748 100%)',
          padding: '30px',
          color: 'white',
          textAlign: 'center'
        }}>
          <h1 style={{ margin: '0 0 10px 0', fontSize: '2.5em', fontWeight: 800 }}>
            📊 Tableau de Bord Analytique
          </h1>
          <p style={{ margin: 0, opacity: 0.9, fontSize: '1.1em' }}>
            Analyses et comparaisons des performances de votre pharmacie
          </p>
        </div>

        <div style={{ padding: '30px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{
                width: '60px',
                height: '60px',
                border: '5px solid #e2e8f0',
                borderTop: '5px solid #667eea',
                borderRadius: '50%',
                margin: '0 auto 20px',
                animation: 'spin 1s linear infinite'
              }} />
              <p style={{ color: '#64748b', fontSize: '1.1em' }}>Chargement des données...</p>
              <style>{`
                @keyframes spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
              `}</style>
            </div>
          ) : (
            <>
              {/* Contrôles */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '15px',
                marginBottom: '30px',
                padding: '20px',
                background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
                borderRadius: '15px',
                border: '2px solid #cbd5e1'
              }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 700, marginBottom: '8px', color: '#475569' }}>
                    📅 Période
                  </label>
                  <select
                    value={periode}
                    onChange={(e) => setPeriode(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '10px',
                      border: '2px solid #cbd5e1',
                      fontSize: '15px',
                      fontWeight: 600,
                      background: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="jour">Jour par Jour (30j)</option>
                    <option value="semaine">Semaine (12 sem.)</option>
                    <option value="mois">Mois (12 mois)</option>
                    <option value="annee">Année (5 ans)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 700, marginBottom: '8px', color: '#475569' }}>
                    📈 Métrique
                  </label>
                  <select
                    value={metrique}
                    onChange={(e) => setMetrique(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '10px',
                      border: '2px solid #cbd5e1',
                      fontSize: '15px',
                      fontWeight: 600,
                      background: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    {metriques.map(m => (
                      <option key={m.key} value={m.key}>
                        {m.icon} {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 700, marginBottom: '8px', color: '#475569' }}>
                    🎨 Type de Graphique
                  </label>
                  <select
                    value={typeGraphe}
                    onChange={(e) => setTypeGraphe(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '10px',
                      border: '2px solid #cbd5e1',
                      fontSize: '15px',
                      fontWeight: 600,
                      background: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="line">📉 Ligne</option>
                    <option value="bar">📊 Barres</option>
                  </select>
                </div>
              </div>

              {/* Cartes statistiques */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: '20px',
                marginBottom: '30px'
              }}>
                {metriques.map(m => (
                  <div
                    key={m.key}
                    style={{
                      background: `linear-gradient(135deg, ${colors[m.key]}15, ${colors[m.key]}05)`,
                      border: `3px solid ${colors[m.key]}`,
                      borderRadius: '15px',
                      padding: '20px',
                      cursor: 'pointer',
                      transition: 'all 0.3s',
                      opacity: metrique === m.key ? 1 : 0.6,
                      transform: metrique === m.key ? 'scale(1.05)' : 'scale(1)',
                      boxShadow: metrique === m.key ? `0 10px 30px ${colors[m.key]}40` : 'none'
                    }}
                    onClick={() => setMetrique(m.key)}
                  >
                    <div style={{ fontSize: '2.5em', marginBottom: '10px' }}>{m.icon}</div>
                    <div style={{ fontSize: '0.9em', color: '#64748b', fontWeight: 600, marginBottom: '8px' }}>
                      {m.label}
                    </div>
                    <div style={{ fontSize: '1.8em', fontWeight: 800, color: colors[m.key], marginBottom: '10px' }}>
                      {formatDH(stats.total[m.key])}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85em', color: '#64748b' }}>
                      <span>Moy: {formatDH(stats.avg[m.key])}</span>
                      <span>Max: {formatDH(stats.max[m.key])}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Graphique principal */}
              <div style={{
                background: 'white',
                borderRadius: '15px',
                padding: '25px',
                border: '2px solid #e2e8f0',
                marginBottom: '30px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.05)'
              }}>
                <h3 style={{
                  margin: '0 0 20px 0',
                  color: '#1e293b',
                  fontSize: '1.4em',
                  fontWeight: 700
                }}>
                  📈 Évolution {metriques.find(m => m.key === metrique)?.label}
                </h3>
                {data.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                    <div style={{ fontSize: '3em', marginBottom: '20px' }}>📭</div>
                    <p style={{ fontSize: '1.2em', margin: 0 }}>Aucune donnée disponible pour cette période</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={400}>
                    {typeGraphe === 'line' ? (
                      <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis
                          dataKey="date"
                          stroke="#64748b"
                          style={{ fontSize: '12px', fontWeight: 600 }}
                        />
                        <YAxis
                          stroke="#64748b"
                          style={{ fontSize: '12px', fontWeight: 600 }}
                          tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                        />
                        <Tooltip
                          contentStyle={{
                            background: 'white',
                            border: '2px solid #e2e8f0',
                            borderRadius: '10px',
                            padding: '10px',
                            fontWeight: 600
                          }}
                          formatter={(value) => formatDH(value)}
                        />
                        <Legend wrapperStyle={{ paddingTop: '20px', fontWeight: 600 }} />
                        <Line
                          type="monotone"
                          dataKey={metrique}
                          stroke={colors[metrique]}
                          strokeWidth={3}
                          dot={{ fill: colors[metrique], r: 5 }}
                          activeDot={{ r: 8 }}
                          name={metriques.find(m => m.key === metrique)?.label}
                        />
                      </LineChart>
                    ) : (
                      <BarChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis
                          dataKey="date"
                          stroke="#64748b"
                          style={{ fontSize: '12px', fontWeight: 600 }}
                        />
                        <YAxis
                          stroke="#64748b"
                          style={{ fontSize: '12px', fontWeight: 600 }}
                          tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                        />
                        <Tooltip
                          contentStyle={{
                            background: 'white',
                            border: '2px solid #e2e8f0',
                            borderRadius: '10px',
                            padding: '10px',
                            fontWeight: 600
                          }}
                          formatter={(value) => formatDH(value)}
                        />
                        <Legend wrapperStyle={{ paddingTop: '20px', fontWeight: 600 }} />
                        <Bar
                          dataKey={metrique}
                          fill={colors[metrique]}
                          radius={[8, 8, 0, 0]}
                          name={metriques.find(m => m.key === metrique)?.label}
                        />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                )}
              </div>

              {/* Graphique comparatif multiple */}
              <div style={{
                background: 'white',
                borderRadius: '15px',
                padding: '25px',
                border: '2px solid #e2e8f0',
                marginBottom: '30px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.05)'
              }}>
                <h3 style={{
                  margin: '0 0 20px 0',
                  color: '#1e293b',
                  fontSize: '1.4em',
                  fontWeight: 700
                }}>
                  📊 Comparaison Toutes Métriques
                </h3>
                {data.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                    <div style={{ fontSize: '3em', marginBottom: '20px' }}>📭</div>
                    <p style={{ fontSize: '1.2em', margin: 0 }}>Aucune donnée disponible pour cette période</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="date"
                        stroke="#64748b"
                        style={{ fontSize: '12px', fontWeight: 600 }}
                      />
                      <YAxis
                        stroke="#64748b"
                        style={{ fontSize: '12px', fontWeight: 600 }}
                        tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'white',
                          border: '2px solid #e2e8f0',
                          borderRadius: '10px',
                          padding: '10px',
                          fontWeight: 600
                        }}
                        formatter={(value) => formatDH(value)}
                      />
                      <Legend wrapperStyle={{ paddingTop: '20px', fontWeight: 600 }} />
                      <Line
                        type="monotone"
                        dataKey="ca"
                        stroke={colors.ca}
                        strokeWidth={2}
                        name="Chiffre d'Affaires"
                      />
                      <Line
                        type="monotone"
                        dataKey="achats"
                        stroke={colors.achats}
                        strokeWidth={2}
                        name="Achats"
                      />
                      <Line
                        type="monotone"
                        dataKey="paiements"
                        stroke={colors.paiements}
                        strokeWidth={2}
                        name="Paiements"
                      />
                      <Line
                        type="monotone"
                        dataKey="benefice"
                        stroke={colors.benefice}
                        strokeWidth={2}
                        name="Bénéfice"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Répartition (Pie Chart) */}
              <div style={{
                background: 'white',
                borderRadius: '15px',
                padding: '25px',
                border: '2px solid #e2e8f0',
                boxShadow: '0 4px 6px rgba(0,0,0,0.05)'
              }}>
                <h3 style={{
                  margin: '0 0 20px 0',
                  color: '#1e293b',
                  fontSize: '1.4em',
                  fontWeight: 700
                }}>
                  🥧 Répartition Totale ({periode === 'jour' ? '30 derniers jours' : 
                                         periode === 'semaine' ? '12 dernières semaines' :
                                         periode === 'mois' ? '12 derniers mois' : '5 dernières années'})
                </h3>
                {stats.total.ca === 0 && stats.total.achats === 0 && stats.total.paiements === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                    <div style={{ fontSize: '3em', marginBottom: '20px' }}>📭</div>
                    <p style={{ fontSize: '1.2em', margin: 0 }}>Aucune donnée disponible pour cette période</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatDH(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}