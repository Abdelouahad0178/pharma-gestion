// src/components/auth/AcceptInvitation.js
import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  Timestamp, 
  collection, 
  query, 
  where, 
  getDocs 
} from 'firebase/firestore';
import { auth, db } from '../../firebase/config';

export default function AcceptInvitation() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [invitation, setInvitation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [step, setStep] = useState('verification'); // verification, register, complete

  // États du formulaire
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    nom: '',
    prenom: '',
    telephone: ''
  });
  const [submitting, setSubmitting] = useState(false);

  // Vérifier le token d'invitation
  useEffect(() => {
    const verifyInvitation = async () => {
      if (!token) {
        setError('Token d\'invitation manquant');
        setLoading(false);
        return;
      }

      try {
        // Chercher l'invitation par token
        const invitationsRef = collection(db, 'invitations');
        const q = query(invitationsRef, where('inviteToken', '==', token));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
          setError('Invitation introuvable ou expirée');
          setLoading(false);
          return;
        }

        const inviteDoc = snapshot.docs[0];
        const inviteData = inviteDoc.data();

        // Vérifier si l'invitation est encore valide
        const now = new Date();
        const expiresAt = inviteData.expiresAt.toDate();

        if (now > expiresAt) {
          setError('Cette invitation a expiré');
          setLoading(false);
          return;
        }

        if (inviteData.statut !== 'pending') {
          setError('Cette invitation n\'est plus valide');
          setLoading(false);
          return;
        }

        setInvitation({ id: inviteDoc.id, ...inviteData });
        setFormData(prev => ({ ...prev, email: inviteData.email }));
        setStep('register');

      } catch (error) {
        console.error('Erreur vérification invitation:', error);
        setError('Erreur lors de la vérification de l\'invitation');
      } finally {
        setLoading(false);
      }
    };

    verifyInvitation();
  }, [token]);

  // Gérer le formulaire d'inscription
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    if (formData.password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      // 1. Créer l'utilisateur dans Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        formData.email,
        formData.password
      );

      // 2. Créer le document utilisateur dans Firestore
      const userData = {
        email: formData.email,
        role: invitation.role,
        societeId: invitation.societeId,
        nom: formData.nom.trim(),
        prenom: formData.prenom.trim(),
        telephone: formData.telephone.trim(),
        actif: true,
        createdAt: Timestamp.now(),
        creePar: invitation.invitePar,
        creeParInvitation: invitation.id,
        derniereConnexion: Timestamp.now()
      };

      await setDoc(doc(db, 'users', userCredential.user.uid), userData);

      // 3. Mettre à jour le statut de l'invitation
      await updateDoc(doc(db, 'invitations', invitation.id), {
        statut: 'accepted',
        acceptedAt: Timestamp.now(),
        acceptedBy: userCredential.user.uid
      });

      setStep('complete');

    } catch (error) {
      console.error('Erreur inscription:', error);
      
      if (error.code === 'auth/email-already-in-use') {
        // L'email existe déjà, essayer de connecter l'utilisateur existant
        setError('Cet email est déjà utilisé. Si c\'est votre compte, connectez-vous avec votre mot de passe habituel.');
      } else if (error.code === 'auth/weak-password') {
        setError('Le mot de passe est trop faible');
      } else if (error.code === 'auth/invalid-email') {
        setError('Adresse email invalide');
      } else {
        setError('Erreur lors de l\'inscription: ' + error.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Gérer la modification des champs
  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const styles = {
    container: {
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: 'Inter, Arial, sans-serif'
    },
    card: {
      background: 'white',
      borderRadius: '25px',
      padding: '40px',
      maxWidth: '500px',
      width: '100%',
      boxShadow: '0 30px 60px rgba(0,0,0,0.15)',
      textAlign: 'center'
    },
    title: {
      fontSize: '2em',
      fontWeight: '800',
      color: '#2d3748',
      marginBottom: '10px'
    },
    subtitle: {
      color: '#6b7280',
      marginBottom: '30px',
      fontSize: '1.1em'
    },
    input: {
      width: '100%',
      padding: '15px',
      border: '2px solid #e2e8f0',
      borderRadius: '12px',
      fontSize: '1em',
      fontWeight: '600',
      marginBottom: '15px',
      transition: 'border-color 0.3s ease',
      boxSizing: 'border-box'
    },
    button: {
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      border: 'none',
      borderRadius: '12px',
      padding: '15px 30px',
      color: 'white',
      fontWeight: '700',
      fontSize: '1em',
      cursor: 'pointer',
      width: '100%',
      transition: 'all 0.3s ease',
      marginTop: '20px'
    },
    buttonDisabled: {
      background: '#9ca3af',
      cursor: 'not-allowed'
    },
    error: {
      background: 'linear-gradient(135deg, #fed7d7 0%, #feb2b2 100%)',
      color: '#c53030',
      padding: '15px',
      borderRadius: '12px',
      marginBottom: '20px',
      fontWeight: '600'
    },
    success: {
      background: 'linear-gradient(135deg, #c6f6d5 0%, #9ae6b4 100%)',
      color: '#22543d',
      padding: '20px',
      borderRadius: '12px',
      marginBottom: '20px'
    },
    rolebadge: {
      display: 'inline-block',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      padding: '5px 15px',
      borderRadius: '20px',
      fontSize: '0.9em',
      fontWeight: '600',
      margin: '0 5px'
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={{ fontSize: '3em', marginBottom: '20px' }}>⏳</div>
          <h2 style={styles.title}>Vérification...</h2>
          <p style={styles.subtitle}>Vérification de votre invitation en cours</p>
        </div>
      </div>
    );
  }

  if (error && step === 'verification') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={{ fontSize: '3em', marginBottom: '20px', color: '#e53e3e' }}>❌</div>
          <h2 style={styles.title}>Invitation invalide</h2>
          <div style={styles.error}>{error}</div>
          <button
            style={styles.button}
            onClick={() => navigate('/login')}
          >
            Retour à la connexion
          </button>
        </div>
      </div>
    );
  }

  if (step === 'complete') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={{ fontSize: '3em', marginBottom: '20px', color: '#48bb78' }}>✅</div>
          <h2 style={styles.title}>Bienvenue dans l'équipe!</h2>
          <div style={styles.success}>
            <p><strong>Inscription réussie!</strong></p>
            <p>
              Votre compte a été créé avec le rôle{' '}
              <span style={styles.roleType}>{invitation?.role}</span>
            </p>
            <p>Vous pouvez maintenant accéder à votre espace de travail.</p>
          </div>
          <button
            style={styles.button}
            onClick={() => navigate('/dashboard')}
          >
            Accéder au tableau de bord
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={{ fontSize: '3em', marginBottom: '20px' }}>👥</div>
        <h2 style={styles.title}>Rejoindre l'équipe</h2>
        <p style={styles.subtitle}>
          Vous avez été invité(e) en tant que{' '}
          <span style={styles.roleType}>{invitation?.role}</span>
        </p>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            style={{
              ...styles.input,
              backgroundColor: '#f7fafc',
              cursor: 'not-allowed'
            }}
            placeholder="Email"
            value={formData.email}
            readOnly
          />

          <input
            type="password"
            style={styles.input}
            placeholder="Mot de passe (min. 6 caractères)"
            value={formData.password}
            onChange={(e) => handleChange('password', e.target.value)}
            required
            disabled={submitting}
          />

          <input
            type="password"
            style={styles.input}
            placeholder="Confirmer le mot de passe"
            value={formData.confirmPassword}
            onChange={(e) => handleChange('confirmPassword', e.target.value)}
            required
            disabled={submitting}
          />

          <input
            type="text"
            style={styles.input}
            placeholder="Prénom"
            value={formData.prenom}
            onChange={(e) => handleChange('prenom', e.target.value)}
            disabled={submitting}
          />

          <input
            type="text"
            style={styles.input}
            placeholder="Nom"
            value={formData.nom}
            onChange={(e) => handleChange('nom', e.target.value)}
            disabled={submitting}
          />

          <input
            type="tel"
            style={styles.input}
            placeholder="Téléphone (optionnel)"
            value={formData.telephone}
            onChange={(e) => handleChange('telephone', e.target.value)}
            disabled={submitting}
          />

          <button
            type="submit"
            style={{
              ...styles.button,
              ...(submitting ? styles.buttonDisabled : {})
            }}
            disabled={submitting}
          >
            {submitting ? 'Inscription en cours...' : 'Créer mon compte'}
          </button>
        </form>

        <div style={{ 
          marginTop: '30px', 
          padding: '15px',
          background: '#f7fafc',
          borderRadius: '10px',
          fontSize: '0.9em',
          color: '#4a5568'
        }}>
          <p style={{ margin: '0 0 10px 0' }}>
            <strong>Vous avez déjà un compte ?</strong>
          </p>
          <button
            style={{
              background: 'transparent',
              border: '2px solid #667eea',
              color: '#667eea',
              padding: '10px 20px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.9em'
            }}
            onClick={() => navigate('/login')}
          >
            Se connecter
          </button>
        </div>
      </div>
    </div>
  );
}