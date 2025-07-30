import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../firebase/config";
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
} from "@mui/material";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas !");
      return;
    }

    try {
      await createUserWithEmailAndPassword(auth, email, password);
      navigate("/dashboard");
    } catch (err) {
      console.error(err);
      setError("Erreur lors de la création du compte !");
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        background: "linear-gradient(135deg, #43a047 0%, #66bb6a 100%)",
      }}
    >
      <Paper
        elevation={6}
        sx={{ p: 4, width: 400, textAlign: "center", borderRadius: 3 }}
      >
        <Typography variant="h5" gutterBottom>
          Créer un compte
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <form onSubmit={handleRegister}>
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email" // ✅ Pour email
            fullWidth
            required
            sx={{ mb: 2 }}
          />
          <TextField
            label="Mot de passe"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password" // ✅ Création de mot de passe
            fullWidth
            required
            sx={{ mb: 2 }}
          />
          <TextField
            label="Confirmer le mot de passe"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            fullWidth
            required
            sx={{ mb: 2 }}
          />

          <Button
            type="submit"
            variant="contained"
            fullWidth
            sx={{ py: 1.2, fontSize: "16px" }}
          >
            S'inscrire
          </Button>
        </form>

        <Typography variant="body2" sx={{ mt: 2 }}>
          Vous avez déjà un compte ?{" "}
          <Button onClick={() => navigate("/login")} variant="text">
            Connectez-vous
          </Button>
        </Typography>
      </Paper>
    </Box>
  );
}
