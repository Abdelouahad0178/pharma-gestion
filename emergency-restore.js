// scripts/emergency-restore.js
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Configuration Firebase Admin
const serviceAccount = require('./path/to/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'anapharmo'
});

const db = admin.firestore();

async function emergencyRestore(backupFilePath) {
  console.log('🚨 RESTAURATION D\'URGENCE EN COURS...');
  
  try {
    // Lire la sauvegarde
    const backupData = JSON.parse(fs.readFileSync(backupFilePath, 'utf8'));
    
    console.log(`📊 Données trouvées : ${backupData.statistics?.totalDocuments} documents`);
    
    // Restaurer chaque collection
    for (const [collectionName, documents] of Object.entries(backupData.data)) {
      console.log(`🔄 Restauration ${collectionName}...`);
      
      const batch = db.batch();
      let batchCount = 0;
      
      for (const doc of documents) {
        if (!doc.id) continue;
        
        const docData = { ...doc };
        delete docData.id;
        
        // Chemins selon le type de collection
        let docRef;
        if (collectionName === 'users') {
          docRef = db.collection('users').doc(doc.id);
        } else if (collectionName === 'societeInfo') {
          docRef = db.collection('societe').doc(doc.id);
        } else {
          const societeId = backupData.metadata.societeId;
          docRef = db.collection('societe').doc(societeId).collection(collectionName).doc(doc.id);
        }
        
        batch.set(docRef, docData);
        batchCount++;
        
        // Commit par lots de 500 (limite Firestore)
        if (batchCount >= 500) {
          await batch.commit();
          console.log(`  ✅ ${batchCount} documents traités`);
          batchCount = 0;
        }
      }
      
      // Commit final
      if (batchCount > 0) {
        await batch.commit();
        console.log(`  ✅ ${batchCount} documents finalisés`);
      }
      
      console.log(`✅ ${collectionName} restaurée !`);
    }
    
    console.log('🎉 RESTAURATION TERMINÉE !');
    
  } catch (error) {
    console.error('❌ Erreur restauration:', error);
  }
}

// Usage: node emergency-restore.js backup-pharma-2024-01-15.json
const backupFile = process.argv[2];
if (backupFile && fs.existsSync(backupFile)) {
  emergencyRestore(backupFile);
} else {
  console.log('❌ Fichier de sauvegarde non trouvé');
  console.log('Usage: node emergency-restore.js backup-file.json');
}