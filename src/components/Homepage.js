import React, { useState, useEffect } from 'react';

export default function Homepage({ onLogin, onRegister }) {
  const [animationClass, setAnimationClass] = useState('');
  const [currentFeature, setCurrentFeature] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimationClass('loaded');
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const features = [
    {
      icon: "💊",
      title: "Gestion Multi-Lots",
      description: "Traçabilité complète avec dates d'expiration"
    },
    {
      icon: "💚",
      title: "Ventes & Achats",
      description: "Interface intuitive pour vos transactions"
    },
    {
      icon: "📋",
      title: "Analytics",
      description: "Rapports et statistiques détaillés"
    },
    {
      icon: "⚕️",
      title: "Équipe",
      description: "Gestion des utilisateurs et permissions"
    }
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentFeature((prev) => (prev + 1) % features.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [features.length]);

  const handleLogin = () => {
    onLogin && onLogin();
  };

  const handleRegister = () => {
    onRegister && onRegister();
  };

  return (
    <div className={`homepage ${animationClass}`}>
      <style>{`
        .homepage {
          min-height: 100vh;
          background: linear-gradient(135deg, #2c3e50 0%, #34495e 50%, #2980b9 100%);
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          position: relative;
          display: flex;
          flex-direction: column;
        }

        .homepage::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 30% 20%, rgba(52, 152, 219, 0.15) 0%, transparent 60%),
                      radial-gradient(circle at 80% 80%, rgba(46, 204, 113, 0.1) 0%, transparent 60%),
                      linear-gradient(45deg, transparent 48%, rgba(255,255,255,0.02) 49%, rgba(255,255,255,0.02) 51%, transparent 52%);
          pointer-events: none;
        }

        .homepage.loaded {
          animation: fadeIn 0.6s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .navbar {
          position: relative;
          z-index: 10;
          padding: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .logo {
          font-size: 1.8rem;
          font-weight: 800;
          color: white;
          letter-spacing: -0.02em;
        }

        .nav-buttons {
          display: flex;
          gap: 12px;
        }

        .nav-btn {
          padding: 10px 20px;
          border: none;
          border-radius: 8px;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          background: rgba(255, 255, 255, 0.15);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .nav-btn:hover {
          background: rgba(255, 255, 255, 0.25);
          transform: translateY(-1px);
        }

        .nav-btn.primary {
          background: linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%);
          color: white;
          border: none;
          box-shadow: 0 4px 15px rgba(255, 107, 107, 0.3);
        }

        .nav-btn.primary:hover {
          background: linear-gradient(135deg, #ff5252 0%, #e53935 100%);
          box-shadow: 0 6px 20px rgba(255, 107, 107, 0.4);
        }

        .main-section {
          flex: 1;
          display: flex;
          align-items: center;
          padding: 40px 20px 80px;
          position: relative;
          z-index: 1;
        }

        .container {
          width: 100%;
          max-width: 1100px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr;
          gap: 60px;
          text-align: center;
        }

        .hero-section {
          max-width: 800px;
          margin: 0 auto;
        }

        .hero-title {
          font-size: clamp(2.5rem, 8vw, 4.5rem);
          font-weight: 900;
          color: white;
          margin: 0 0 24px 0;
          line-height: 1.1;
          letter-spacing: -0.02em;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
        }

        .hero-subtitle {
          font-size: clamp(1.1rem, 3vw, 1.4rem);
          color: rgba(255, 255, 255, 0.9);
          margin: 0 0 20px 0;
          font-weight: 600;
          letter-spacing: -0.01em;
        }

        .hero-description {
          font-size: clamp(1rem, 2.2vw, 1.1rem);
          color: rgba(255, 255, 255, 0.8);
          margin: 0 0 40px 0;
          line-height: 1.7;
          max-width: 600px;
          margin-left: auto;
          margin-right: auto;
          margin-bottom: 40px;
        }

        .cta-section {
          display: flex;
          justify-content: center;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: 60px;
        }

        .cta-btn {
          padding: 16px 32px;
          border: none;
          border-radius: 12px;
          font-size: 1rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s ease;
          min-width: 160px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          position: relative;
          overflow: hidden;
        }

        .cta-btn.primary {
          background: linear-gradient(135deg, #1abc9c 0%, #16a085 100%);
          color: white;
          box-shadow: 0 8px 25px rgba(26, 188, 156, 0.3);
        }

        .cta-btn.primary:hover {
          background: linear-gradient(135deg, #17a2b8 0%, #138496 100%);
          transform: translateY(-2px);
          box-shadow: 0 12px 30px rgba(26, 188, 156, 0.4);
        }

        .cta-btn.secondary {
          background: rgba(255, 255, 255, 0.15);
          color: white;
          border: 2px solid rgba(255, 255, 255, 0.3);
          backdrop-filter: blur(10px);
        }

        .cta-btn.secondary:hover {
          background: rgba(255, 255, 255, 0.25);
          border-color: rgba(255, 255, 255, 0.5);
          transform: translateY(-2px);
        }

        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 24px;
          max-width: 900px;
          margin: 0 auto;
        }

        .feature-card {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(20px);
          border-radius: 16px;
          padding: 30px 20px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          transition: all 0.3s ease;
          text-align: center;
        }

        .feature-card:hover {
          transform: translateY(-4px);
          background: rgba(255, 255, 255, 0.15);
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.2);
        }

        .feature-icon {
          font-size: 2.5rem;
          margin-bottom: 16px;
          display: block;
        }

        .feature-title {
          font-size: 1.2rem;
          font-weight: 700;
          color: white;
          margin: 0 0 8px 0;
        }

        .feature-description {
          font-size: 0.9rem;
          color: rgba(255, 255, 255, 0.8);
          line-height: 1.5;
          margin: 0;
        }

        .bottom-section {
          padding: 40px 20px;
          background: rgba(0, 0, 0, 0.1);
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .stats-row {
          max-width: 600px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
          text-align: center;
        }

        .stat-item {
          padding: 20px 10px;
        }

        .stat-number {
          font-size: 2rem;
          font-weight: 800;
          color: #ff6b6b;
          display: block;
          margin-bottom: 8px;
          text-shadow: 0 2px 10px rgba(255, 107, 107, 0.3);
        }

        .stat-label {
          font-size: 0.9rem;
          color: rgba(255, 255, 255, 0.8);
          font-weight: 600;
        }

        .footer-text {
          text-align: center;
          color: rgba(255, 255, 255, 0.6);
          font-size: 0.85rem;
          margin-top: 30px;
        }

        /* Responsive Design */
        @media (max-width: 768px) {
          .navbar {
            padding: 16px;
            flex-direction: column;
            gap: 16px;
          }

          .nav-buttons {
            order: -1;
          }

          .main-section {
            padding: 30px 16px 60px;
          }

          .cta-section {
            flex-direction: column;
            align-items: center;
          }

          .cta-btn {
            width: 100%;
            max-width: 280px;
          }

          .features-grid {
            grid-template-columns: 1fr;
            gap: 16px;
          }

          .stats-row {
            grid-template-columns: 1fr;
            gap: 16px;
          }

          .stat-number {
            font-size: 1.6rem;
          }
        }

        @media (max-width: 480px) {
          .navbar {
            padding: 12px;
          }

          .main-section {
            padding: 20px 12px 40px;
          }

          .feature-card {
            padding: 24px 16px;
          }

          .bottom-section {
            padding: 30px 12px;
          }
        }

        /* Enhanced accessibility */
        .cta-btn:focus,
        .nav-btn:focus {
          outline: 2px solid rgba(255, 255, 255, 0.8);
          outline-offset: 2px;
        }

        /* Reduced motion */
        @media (prefers-reduced-motion: reduce) {
          * {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>

      {/* Navigation */}
      <nav className="navbar">
        <div className="logo">PharmaGest Pro</div>
        <div className="nav-buttons">
          <button className="nav-btn" onClick={handleLogin}>
            Se Connecter
          </button>
          <button className="nav-btn primary" onClick={handleRegister}>
            S'inscrire
          </button>
        </div>
      </nav>

      {/* Section principale */}
      <main className="main-section">
        <div className="container">
          {/* Hero section */}
          <div className="hero-section">
            <h1 className="hero-title">
              Gestion Pharmaceutique Moderne
            </h1>
            
            <h2 className="hero-subtitle">
              Solution complète pour votre pharmacie
            </h2>
            
            <p className="hero-description">
              Gérez efficacement votre stock, ventes, achats et équipe avec une interface moderne
              et intuitive. Traçabilité multi-lots, analytics avancés et sécurité maximale.
            </p>

            <div className="cta-section">
              <button className="cta-btn primary" onClick={handleLogin}>
                Commencer maintenant
              </button>
              <button className="cta-btn secondary" onClick={handleRegister}>
                Créer un compte
              </button>
            </div>
          </div>

          {/* Fonctionnalités */}
          <div className="features-grid">
            {features.map((feature, index) => (
              <div key={index} className="feature-card">
                <span className="feature-icon">{feature.icon}</span>
                <h3 className="feature-title">{feature.title}</h3>
                <p className="feature-description">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Section inférieure */}
      <section className="bottom-section">
        <div className="stats-row">
          <div className="stat-item">
            <span className="stat-number">100%</span>
            <span className="stat-label">Sécurisé</span>
          </div>
          <div className="stat-item">
            <span className="stat-number">24/7</span>
            <span className="stat-label">Support</span>
          </div>
          <div className="stat-item">
            <span className="stat-number">Cloud</span>
            <span className="stat-label">Sauvegarde</span>
          </div>
        </div>

        <div className="footer-text">
          PharmaGest Pro - Solution professionnelle pour pharmacies
        </div>
      </section>
    </div>
  );
}