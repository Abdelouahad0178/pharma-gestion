import React, { useState, useEffect } from "react";
import { db } from "../../firebase/config";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { Box, Paper, TextField, Button, Typography } from "@mui/material";

export default function Parametres() {
  const [entete, setEntete] = useState("");
  const [pied, setPied] = useState("");

  useEffect(() => {
    const fetchParams = async () => {
      const ref = doc(db, "parametres", "documents");
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        setEntete(data.entete || "");
        setPied(data.pied || "");
      }
    };
    fetchParams();
  }, []);

  const handleSave = async () => {
    await setDoc(doc(db, "parametres", "documents"), { entete, pied });
    alert("Paramètres enregistrés !");
  };

  return (
    <Box sx={{ maxWidth: 800, margin: "30px auto" }}>
      <Typography variant="h4" gutterBottom>Paramètres des Documents</Typography>
      <Paper sx={{ p: 3 }}>
        <form onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
          <TextField
            label="Entête du document"
            multiline
            rows={3}
            value={entete}
            onChange={(e) => setEntete(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
          />
          <TextField
            label="Pied de page du document"
            multiline
            rows={3}
            value={pied}
            onChange={(e) => setPied(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
          />
          <Button type="submit" variant="contained">Enregistrer</Button>
        </form>
      </Paper>
    </Box>
  );
}
