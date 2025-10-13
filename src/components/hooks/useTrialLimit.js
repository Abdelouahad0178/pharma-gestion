// src/hooks/useTrialLimit.js
import { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';

const TRIAL_LIMIT = 20; // Nombre d'opérations gratuites

export const useTrialLimit = (societeId, user) => {
  const [trialData, setTrialData] = useState({
    operationsCount: 0,
    maxOperations: TRIAL_LIMIT,
    isTrialActive: true,
    isSubscribed: false,
    loading: true
  });

  useEffect(() => {
    if (!societeId || !user) {
      setTrialData(prev => ({ ...prev, loading: false }));
      return;
    }

    const loadTrialData = async () => {
      try {
        const trialRef = doc(db, 'societe', societeId, 'settings', 'trial');
        const trialDoc = await getDoc(trialRef);

        if (trialDoc.exists()) {
          const data = trialDoc.data();
          setTrialData({
            operationsCount: data.operationsCount || 0,
            maxOperations: TRIAL_LIMIT,
            isTrialActive: (data.operationsCount || 0) < TRIAL_LIMIT && !data.isSubscribed,
            isSubscribed: data.isSubscribed || false,
            loading: false
          });
        } else {
          // Initialiser le trial pour une nouvelle société
          await setDoc(trialRef, {
            operationsCount: 0,
            isSubscribed: false,
            createdAt: new Date(),
            societeId: societeId
          });
          setTrialData({
            operationsCount: 0,
            maxOperations: TRIAL_LIMIT,
            isTrialActive: true,
            isSubscribed: false,
            loading: false
          });
        }
      } catch (error) {
        console.error('Erreur chargement trial:', error);
        setTrialData(prev => ({ ...prev, loading: false }));
      }
    };

    loadTrialData();
  }, [societeId, user]);

  // Incrémenter le compteur d'opérations
  const incrementOperations = async () => {
    if (!societeId) return false;

    try {
      const trialRef = doc(db, 'societe', societeId, 'settings', 'trial');
      await updateDoc(trialRef, {
        operationsCount: increment(1),
        lastOperationAt: new Date()
      });

      // Mettre à jour l'état local
      setTrialData(prev => ({
        ...prev,
        operationsCount: prev.operationsCount + 1,
        isTrialActive: (prev.operationsCount + 1) < TRIAL_LIMIT && !prev.isSubscribed
      }));

      return true;
    } catch (error) {
      console.error('Erreur incrémentation:', error);
      return false;
    }
  };

  // Activer l'abonnement
  const activateSubscription = async (subscriptionData) => {
    if (!societeId) return false;

    try {
      const trialRef = doc(db, 'societe', societeId, 'settings', 'trial');
      await updateDoc(trialRef, {
        isSubscribed: true,
        subscriptionData: subscriptionData,
        subscribedAt: new Date()
      });

      setTrialData(prev => ({
        ...prev,
        isSubscribed: true,
        isTrialActive: false
      }));

      return true;
    } catch (error) {
      console.error('Erreur activation abonnement:', error);
      return false;
    }
  };

  const canPerformOperation = () => {
    return trialData.isSubscribed || trialData.operationsCount < TRIAL_LIMIT;
  };

  const remainingOperations = () => {
    if (trialData.isSubscribed) return Infinity;
    return Math.max(0, TRIAL_LIMIT - trialData.operationsCount);
  };

  return {
    ...trialData,
    incrementOperations,
    activateSubscription,
    canPerformOperation,
    remainingOperations
  };
};