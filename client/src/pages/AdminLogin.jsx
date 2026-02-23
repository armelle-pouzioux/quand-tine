import { useState } from "react";
import { adminLogin } from "../apiAdmin";

function AdminLogin({ onLogged }) {
  const [email, setEmail] = useState("admin@quandtine.fr");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const result = await adminLogin(email.trim(), password);

      if (!result.success) {
        setError(result.error || "LOGIN_ERROR");
        return;
      }

      onLogged(result.data.token);
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = email.trim().length > 3 && password.length >= 3 && !busy;

  return (
    <div className="grid">
      <div className="card">
        <h1 className="h1">Backoffice</h1>
        
        <div className="divider" />

        {error && (
          <div className="card" style={{ borderColor: "rgba(239,68,68,.35)", background: "rgba(239,68,68,.08)" }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Erreur</div>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>
              {String(error)}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ marginTop: 12 }}>
          <div className="grid" style={{ gap: 10 }}>
            <div>
              <div className="h2" style={{ margin: "0 0 6px" }}>Email</div>
              <input
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                placeholder="admin@quandtine.fr"
              />
            </div>

            <div>
              <div className="h2" style={{ margin: "0 0 6px" }}>Mot de passe</div>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </div>

            <button className="btn btn-primary" type="submit" disabled={!canSubmit}>
              Se connecter
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AdminLogin;