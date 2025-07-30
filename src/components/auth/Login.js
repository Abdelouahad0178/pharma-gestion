import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../firebase/config";
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
} from "@mui/material";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate("/dashboard");
    } catch (err) {
      console.error(err);
      setError("Email ou mot de passe incorrect !");
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        background: "linear-gradient(135deg, #1976d2 0%, #42a5f5 100%)",
      }}
    >
      <Paper
        elevation={6}
        sx={{ p: 4, width: 400, textAlign: "center", borderRadius: 3 }}
      >
        <Typography variant="h5" gutterBottom>
          Connexion à la Gestion Pharmacie
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <form onSubmit={handleLogin}>
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username" // ✅ Correcte pour email/login
            fullWidth
            required
            sx={{ mb: 2 }}
          />
          <TextField
            label="Mot de passe"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password" // ✅ Correction avertissement
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
            Se connecter
          </Button>
        </form>

        <Typography variant="body2" sx={{ mt: 2 }}>
          Pas encore inscrit ?{" "}
          <Button onClick={() => navigate("/register")} variant="text">
            Créez un compte
          </Button>
        </Typography>
      </Paper>
    </Box>
  );
}
