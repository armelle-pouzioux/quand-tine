import { useEffect, useMemo, useState } from "react";
import { socket } from "../socket";
// import AdminStats from "./AdminStats";
import {
  getQueue,
  markPaid,
  setStatus,
  getDishesAdmin,
  createDish,
  updateDish,
} from "../apiAdmin";

const STATUS_LABEL = {
  PENDING_PAYMENT: "Paiement",
  PAID: "Payé",
  PREPARING: "Préparation",
  READY: "Prêt",
  DONE: "Terminé",
  CANCELLED: "Annulé",
};

function badgeClassForStatus(status) {
  switch (status) {
    case "PENDING_PAYMENT":
      return "warn";
    case "PAID":
      return "info";
    case "PREPARING":
      return "warn";
    case "READY":
      return "ok";
    case "DONE":
      return "ok";
    case "CANCELLED":
      return "bad";
    default:
      return "info";
  }
}

function AdminDashboard({ token }) {
  const [tab, setTab] = useState("orders");

  const [data, setData] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const [dishes, setDishes] = useState([]);
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");

  const [confirmCancel, setConfirmCancel] = useState(null);

  useEffect(() => {
    async function fetchAll() {
      const [q, d] = await Promise.all([getQueue(), getDishesAdmin(token)]);
      if (q?.success) setData(q.data);
      if (d?.success) setDishes(d.data);
    }
    fetchAll();
  }, [token]);

  useEffect(() => {
    const onQueueUpdate = (payload) => setData(payload);
    socket.on("queue:update", onQueueUpdate);
    return () => socket.off("queue:update", onQueueUpdate);
  }, []);

  async function refreshDishes() {
    const res = await getDishesAdmin(token);
    if (res.success) setDishes(res.data);
  }

  async function runBusy(orderId, fn) {
    try {
      setBusyId(orderId);
      await fn();
    } finally {
      setBusyId(null);
    }
  }

  async function handlePay(orderId) {
    await runBusy(orderId, () => markPaid(token, orderId));
  }

  async function handleStatus(orderId, status) {
    await runBusy(orderId, () => setStatus(token, orderId, status));
  }

  const paymentCount = data?.paymentQueue?.length ?? 0;
  const prepCount = data?.prepQueue?.length ?? 0;

  const canCancel = (o) => o.status === "PENDING_PAYMENT";
  const canSetPreparing = (o) => o.status === "PAID";
  const canSetReady = (o) => o.status === "PREPARING";
  const canSetDone = (o) => o.status === "READY";
  const canPay = (o) => o.status === "PENDING_PAYMENT";

  const priceIsValid = useMemo(() => {
    const n = Number(newPrice);
    return Number.isFinite(n) && n > 0;
  }, [newPrice]);

  if (!data) {
    return (
      <div className="container">
        <div className="card">
          <div className="kpi">
            <strong>Dashboard admin</strong>
            <span>Chargement…</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      {/* Header */}
      <div className="card">
        <div className="kpi">
          <strong>Dashboard admin</strong>
          <span>
            Paiement: {paymentCount} • Préparation: {prepCount}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="card" style={{ marginTop: 12 }}>
        <div
          className="row"
          style={{ justifyContent: "space-around", alignItems: "center" }}
        >
          <div className="row">
            <button
              className={`btn ${tab === "orders" ? "btn-primary" : ""}`}
              onClick={() => setTab("orders")}
            >
              Commandes
              <span className="badge info" style={{ marginLeft: 8 }}>
                {paymentCount + prepCount}
              </span>
            </button>

            <button
              className={`btn ${tab === "menu" ? "btn-primary" : ""}`}
              onClick={() => setTab("menu")}
            >
              Menu
              <span className="badge info" style={{ marginLeft: 8 }}>
                {dishes.length}
              </span>
            </button>

            <button className={`btn ${tab === "stats" ? "btn-primary" : ""}`}disabled title="Bientôt disponible">Statistiques</button>
          </div>
        </div>
      </div>

      {/* =========================
          TAB: COMMANDES
         ========================= */}
      {tab === "orders" && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="admin-columns">
            {/* Paiements */}
            <section>
              <h2 className="h2">
                File Paiement{" "}
                <span className="badge warn" style={{ marginLeft: 8 }}>
                  {paymentCount}
                </span>
              </h2>

              {paymentCount === 0 && (
                <p style={{ color: "var(--muted)", marginTop: 0 }}>
                  Aucune commande
                </p>
              )}

              {data.paymentQueue.map((o) => (
                <div key={o.id} className="card" style={{ marginTop: 12 }}>
                  <div
                    className="row"
                    style={{ justifyContent: "space-between" }}
                  >
                    <div>
                      <div className="row" style={{ alignItems: "center" }}>
                        <strong>Ticket {o.ticket_number}</strong>
                        <span
                          className={`badge ${badgeClassForStatus(o.status)}`}
                        >
                          {STATUS_LABEL[o.status] ?? o.status}
                        </span>
                      </div>
                      <div style={{ color: "var(--muted)", fontSize: 12 }}>
                        Total: {(o.total_cents / 100).toFixed(2)}€
                      </div>
                    </div>

                    {busyId === o.id && <span className="badge info">Action…</span>}
                  </div>

                  <div className="row" style={{ marginTop: 10 }}>
                    <button
                      className="btn btn-primary"
                      disabled={busyId === o.id || !canPay(o)}
                      onClick={() => handlePay(o.id)}
                      title={!canPay(o) ? "Déjà payé / statut incompatible" : ""}
                    >
                      Marquer payé
                    </button>

                    <button
                      className="btn btn-danger"
                      disabled={busyId === o.id || !canCancel(o)}
                      onClick={() => setConfirmCancel(o.id)}
                      title={
                        !canCancel(o)
                          ? "Annulation uniquement si en paiement"
                          : ""
                      }
                    >
                      Annuler
                    </button>
                  </div>

                  {/* Confirm annulation */}
                  {confirmCancel === o.id && (
                    <div className="card" style={{ marginTop: 10 }}>
                      <div style={{ fontWeight: 700, marginBottom: 8 }}>
                        Confirmer l’annulation ?
                      </div>
                      <div className="row">
                        <button
                          className="btn btn-danger"
                          disabled={busyId === o.id}
                          onClick={async () => {
                            await handleStatus(o.id, "CANCELLED");
                            setConfirmCancel(null);
                          }}
                        >
                          Oui, annuler
                        </button>
                        <button
                          className="btn"
                          disabled={busyId === o.id}
                          onClick={() => setConfirmCancel(null)}
                        >
                          Non
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </section>

            {/* Préparation */}
            <section>
              <h2 className="h2">
                Préparation{" "}
                <span className="badge info" style={{ marginLeft: 8 }}>
                  {prepCount}
                </span>
              </h2>

              {prepCount === 0 && (
                <p style={{ color: "var(--muted)", marginTop: 0 }}>
                  Aucune commande
                </p>
              )}

              {data.prepQueue.map((o) => (
                <div key={o.id} className="card" style={{ marginTop: 12 }}>
                  <div
                    className="row"
                    style={{ justifyContent: "space-between" }}
                  >
                    <div>
                      <div className="row" style={{ alignItems: "center" }}>
                        <strong>Ticket {o.ticket_number}</strong>
                        <span
                          className={`badge ${badgeClassForStatus(o.status)}`}
                        >
                          {STATUS_LABEL[o.status] ?? o.status}
                        </span>
                      </div>
                      <div style={{ color: "var(--muted)", fontSize: 12 }}>
                        Statut: {o.status}
                      </div>
                    </div>

                    {busyId === o.id && <span className="badge info">Action…</span>}
                  </div>

                  <div className="row" style={{ marginTop: 10 }}>
                    <button
                      className="btn"
                      disabled={busyId === o.id || !canSetPreparing(o)}
                      onClick={() => handleStatus(o.id, "PREPARING")}
                      title={
                        !canSetPreparing(o) ? "Disponible seulement après PAID" : ""
                      }
                    >
                      PREPARING
                    </button>

                    <button
                      className="btn"
                      disabled={busyId === o.id || !canSetReady(o)}
                      onClick={() => handleStatus(o.id, "READY")}
                      title={
                        !canSetReady(o)
                          ? "Disponible seulement après PREPARING"
                          : ""
                      }
                    >
                      READY
                    </button>

                    <button
                      className="btn"
                      disabled={busyId === o.id || !canSetDone(o)}
                      onClick={() => handleStatus(o.id, "DONE")}
                      title={!canSetDone(o) ? "Disponible seulement après READY" : ""}
                    >
                      DONE
                    </button>
                  </div>
                </div>
              ))}
            </section>
          </div>
        </div>
      )}

      {/* =========================
          TAB: MENU
         ========================= */}
      {tab === "menu" && (
        <div className="card" style={{ marginTop: 12 }}>
          <h2 className="h2">Gestion des plats</h2>

          <div className="card">
            <div style={{ fontWeight: 800, marginBottom: 10 }}>
              Ajouter un plat
            </div>

            <div className="row">
              <input
                className="input"
                placeholder="Nom"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <input
                className="input"
                placeholder="Prix en €"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                inputMode="decimal"
              />
              <button
                className="btn btn-primary"
                disabled={!newName.trim() || !priceIsValid}
                onClick={async () => {
                  await createDish(token, {
                    name: newName.trim(),
                    price_cents: Math.round(Number(newPrice) * 100),
                  });

                  setNewName("");
                  setNewPrice("");
                  await refreshDishes();
                }}
                title={
                  !newName.trim()
                    ? "Nom requis"
                    : !priceIsValid
                    ? "Prix invalide"
                    : ""
                }
              >
                Ajouter
              </button>
            </div>
          </div>

          <div className="divider" />

          <div className="row" style={{ justifyContent: "space-between" }}>
            <div style={{ fontWeight: 800 }}>Liste des plats</div>
            <span className="badge info">{dishes.length}</span>
          </div>

          {dishes.length === 0 && (
            <p style={{ color: "var(--muted)" }}>Aucun plat</p>
          )}

          <div className="menu-list" style={{ marginTop: 10 }}>
            {dishes.map((d) => (
              <div key={d.id} className="menu-item">
                <div className="menu-left">
                  <strong>{d.name}</strong>
                  <span>{(d.price_cents / 100).toFixed(2)}€</span>
                </div>

                <div className="row" style={{ alignItems: "center" }}>
                  <span className={`badge ${d.is_active ? "ok" : "bad"}`}>
                    {d.is_active ? "Actif" : "Inactif"}
                  </span>

                  <button
                    className={`btn ${d.is_active ? "" : "btn-primary"}`}
                    onClick={async () => {
                      await updateDish(token, d.id, {
                        is_active: d.is_active ? 0 : 1,
                      });
                      await refreshDishes();
                    }}
                  >
                    {d.is_active ? "Désactiver" : "Activer"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =========================
          TAB: STATS
         ========================= */}
      {tab === "stats" && (
        <div style={{ marginTop: 12 }}>
          {/* Si tu as créé AdminStats.jsx, ça s'affiche */}
          {AdminStats ? (
            <AdminStats token={token} />
          ) : (
            <div className="card">
              <span className="badge info">Stats à brancher</span>
              <div className="divider" />
              <div style={{ color: "var(--muted)", fontSize: 12 }}>
                Crée <strong>AdminStats.jsx</strong> pour afficher KPIs + camembert.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;