import { useEffect, useState } from "react";
import Menu from "./pages/Menu";
import Queue from "./pages/Queue";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";

function App() {
  const [mode, setMode] = useState("user"); // "user" | "admin"
  const [order, setOrder] = useState(null);
  const [adminToken, setAdminToken] = useState(null);

  // 🔹 Charger commande user
  useEffect(() => {
    const stored = localStorage.getItem("quandtine_order");
    if (stored) setOrder(JSON.parse(stored));
  }, []);

  // 🔹 Sauvegarder commande user
  useEffect(() => {
    if (order) localStorage.setItem("quandtine_order", JSON.stringify(order));
  }, [order]);

  // 🔹 Charger token admin
  useEffect(() => {
    const t = localStorage.getItem("quandtine_admin_token");
    if (t) setAdminToken(t);
  }, []);

  function logoutAdmin() {
    localStorage.removeItem("quandtine_admin_token");
    setAdminToken(null);
  }

  let content;

  if (mode === "admin") {
    content = !adminToken ? (
      <AdminLogin
        onLogged={(token) => {
          localStorage.setItem("quandtine_admin_token", token);
          setAdminToken(token);
        }}
      />
    ) : (
      <AdminDashboard token={adminToken} />
    );
  } else {
    content = !order ? (
      <Menu onOrderCreated={setOrder} />
    ) : (
      <Queue
        order={order}
        onReset={() => {
          localStorage.removeItem("quandtine_order");
          setOrder(null);
        }}
      />
    );
  }

  return (
    <>
      <div className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <strong>Quand-tine</strong>
            <span>{mode === "admin" ? "Backoffice" : "Commande"}</span>
          </div>

          {mode === "admin" ? (
            <div className="row">
              <button className="btn" onClick={() => setMode("user")}>
                Client
              </button>

              {adminToken && (
                <button className="btn btn-danger" onClick={logoutAdmin}>
                  Logout
                </button>
              )}
            </div>
          ) : (
            <button className="btn" onClick={() => setMode("admin")}>
              Admin
            </button>
          )}
        </div>
      </div>

      <div className="container">{content}</div>
    </>
  );
}

export default App;