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

  // Lien WhatsApp (numéro fourni : 00212661115240 => +212661115240)
  const whatsappNumberIntl = "0661115240";
  const whatsappHref = `https://wa.me/${whatsappNumberIntl}?text=${encodeURIComponent(
    "Bonjour PharmaGest Pro, j’ai besoin d’aide concernant…"
  )}`;

  return (
    <div className={`homepage ${animationClass}`}>
      <style>{`
        .homepage {
          min-height: 100vh;
          background: linear-gradient(135deg, #0f4c75 0%, #3282b8 50%, #bbe1fa 100%);
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          position: relative;
          display: flex;
          flex-direction: column;
        }

        .homepage::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 20% 30%, rgba(187, 225, 250, 0.2) 0%, transparent 60%),
                      radial-gradient(circle at 80% 70%, rgba(15, 76, 117, 0.3) 0%, transparent 60%),
                      linear-gradient(45deg, transparent 48%, rgba(255,255,255,0.05) 49%, rgba(255,255,255,0.05) 51%, transparent 52%);
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
          background: linear-gradient(135deg, #27ae60 0%, #2ecc71 100%);
          color: white;
          box-shadow: 0 8px 25px rgba(39, 174, 96, 0.3);
        }

        .cta-btn.primary:hover {
          background: linear-gradient(135deg, #229954 0%, #27ae60 100%);
          transform: translateY(-2px);
          box-shadow: 0 12px 30px rgba(39, 174, 96, 0.4);
        }

        .cta-btn.secondary {
          background: rgba(255, 255, 255, 0.2);
          color: white;
          border: 2px solid rgba(255, 255, 255, 0.4);
        }

        .cta-btn.secondary:hover {
          background: rgba(255, 255, 255, 0.3);
          border-color: rgba(255, 255, 255, 0.6);
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
          backdrop-filter: blur(10px);
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

        .support-contact {
          max-width: 800px;
          margin: 30px auto 0;
          padding: 16px 20px;
          background: rgba(255, 255, 255, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.25);
          border-radius: 14px;
          color: #fff;
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
          text-align: center;
        }

        .support-contact a {
          color: #eaffd0;
          text-decoration: none;
          font-weight: 700;
        }

        .support-contact a:hover {
          text-decoration: underline;
        }

        .footer-text {
          text-align: center;
          color: rgba(255, 255, 255, 0.6);
          font-size: 0.85rem;
          margin-top: 20px;
        }

        /* Bouton WhatsApp flottant */
        .floating-whatsapp {
          position: fixed;
          right: 24px;
          bottom: 24px;
          z-index: 50;
        }

        .floating-whatsapp a {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          border-radius: 999px;
          background: linear-gradient(135deg, #19c37d 0%, #128C7E 100%);
          color: #fff;
          font-weight: 800;
          box-shadow: 0 10px 25px rgba(0,0,0,0.25);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .floating-whatsapp a:hover {
          transform: translateY(-2px);
          box-shadow: 0 14px 30px rgba(0,0,0,0.3);
        }

        .wa-icon {
          width: 20px;
          height: 20px;
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

          .floating-whatsapp a span.hide-sm {
            display: none;
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

        /* Accessibility */
        .cta-btn:focus,
        .nav-btn:focus,
        .floating-whatsapp a:focus {
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
              <div key={index} className="feature-card" aria-live={index === currentFeature ? "polite" : "off"}>
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
        {/* On garde la mise en page, mais on précise le support réel */}
          <div className="stat-item">
            <span className="stat-number">24/7</span>
            <span className="stat-label">Support</span>
          </div>
          <div className="stat-item">
            <span className="stat-number">Cloud</span>
            <span className="stat-label">Sauvegarde</span>
          </div>
        </div>

        {/* Coordonnées de support technique */}
        <div className="support-contact" role="contentinfo" aria-label="Coordonnées du support technique">
          <div>
            <strong>Support technique :</strong> WhatsApp&nbsp;
            <strong>00212661112540</strong>
          </div>
          <div>
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
              Ouvrir WhatsApp et nous écrire
            </a>
          </div>
        </div>

        <div className="footer-text">
          PharmaGest Pro - Solution professionnelle pour pharmacies
        </div>
      </section>

      {/* Bouton WhatsApp flottant */}
      <div className="floating-whatsapp">
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Contacter le support sur WhatsApp"
          title="Support WhatsApp"
        >
          {/* Icône WhatsApp en SVG (léger) */}
          <svg className="wa-icon" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M19.11 17.37c-.27-.14-1.6-.78-1.85-.87-.25-.09-.43-.14-.61.14-.18.27-.7.87-.86 1.05-.16.18-.32.2-.59.07-.27-.14-1.14-.42-2.18-1.34-.81-.72-1.35-1.61-1.51-1.88-.16-.27-.02-.41.12-.55.12-.12.27-.32.41-.48.14-.16.18-.27.27-.45.09-.18.05-.34-.02-.48-.07-.14-.61-1.47-.83-2.01-.22-.53-.44-.45-.61-.45-.16 0-.34-.02-.52-.02s-.48.07-.73.34c-.25.27-.96.94-.96 2.28 0 1.34.98 2.64 1.12 2.82.14.18 1.93 2.95 4.69 4.02.66.28 1.17.45 1.57.58.66.21 1.27.18 1.75.11.53-.08 1.6-.65 1.83-1.28.23-.63.23-1.17.16-1.28-.07-.11-.25-.18-.52-.32zM16.03 3.2c-7.07 0-12.8 5.74-12.8 12.8 0 2.26.6 4.39 1.66 6.23L3.2 28.8l6.77-1.77c1.79.98 3.84 1.54 6.05 1.54 7.06 0 12.8-5.74 12.8-12.8 0-7.06-5.74-12.8-12.8-12.8zm0 23.08c-1.97 0-3.8-.58-5.33-1.58l-.38-.24-4.02 1.05 1.07-3.92-.25-.4c-1.04-1.66-1.65-3.63-1.65-5.77 0-5.86 4.77-10.62 10.62-10.62 5.86 0 10.62 4.76 10.62 10.62 0 5.86-4.76 10.62-10.62 10.62z" fill="currentColor"/>
          </svg>
          <span className="hide-sm">Support</span>
        </a>
      </div>
    </div>
  );
}
