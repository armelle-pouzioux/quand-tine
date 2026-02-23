import { useEffect, useMemo, useRef, useState } from "react";
import { socket, registerClient } from "../socket";

const STATUS_LABEL = {
  PENDING_PAYMENT: "En attente de paiement",
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

function Queue({ order, onReset }) {
  const [queue, setQueue] = useState(null);
  const [myEvent, setMyEvent] = useState(null);

  const lastStatusRef = useRef(null);

  useEffect(() => {
    async function fetchQueue() {
      const res = await fetch("http://localhost:4000/api/queue");
      const data = await res.json();
      setQueue(data.data);
    }
    fetchQueue();
  }, []);

  // sockets
  useEffect(() => {
    const onConnect = () => {
      registerClient(order.client_token);
    };

    const onQueueUpdate = (data) => setQueue(data);

    const onOrderUpdate = (data) => {
      const status = data?.status ?? data?.newStatus ?? data?.payload?.status ?? null;
      if (status) lastStatusRef.current = status;
      setMyEvent(status ? { ...data, status } : data);
    };

    socket.on("connect", onConnect);
    socket.on("queue:update", onQueueUpdate);
    socket.on("order:update", onOrderUpdate);

    if (socket.connected) onConnect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("queue:update", onQueueUpdate);
      socket.off("order:update", onOrderUpdate);
    };
  }, [order.client_token]);

  const { position, currentStatus } = useMemo(() => {
    if (!queue) {
      const s = myEvent?.status ?? lastStatusRef.current;
      return { position: null, currentStatus: s ?? null };
    }

    const inPayment = queue.paymentQueue.findIndex(
      (o) => o.ticket_number === order.ticket_number
    );

    const inPrep = queue.prepQueue.findIndex(
      (o) => o.ticket_number === order.ticket_number
    );

    if (inPayment !== -1) {
      lastStatusRef.current = "PENDING_PAYMENT";
      return { position: inPayment + 1, currentStatus: "PENDING_PAYMENT" };
    }

    if (inPrep !== -1) {
      const s = queue.prepQueue[inPrep].status;
      lastStatusRef.current = s;
      return { position: inPrep + 1, currentStatus: s };
    }

    const fallback = myEvent?.status ?? lastStatusRef.current ?? "DONE";
    lastStatusRef.current = fallback;

    return { position: null, currentStatus: fallback };
  }, [queue, order.ticket_number, myEvent]);

  const message = useMemo(() => {
    if (!currentStatus) return "Chargement de ta file…";

    switch (currentStatus) {
      case "PENDING_PAYMENT":
        return `Tu es #${position} dans la file de paiement.`;
      case "PAID":
        return position ? `Paiement validé. Tu es #${position} en attente de préparation.` : "Paiement validé.";
      case "PREPARING":
        return "Ta commande est en préparation.";
      case "READY":
        return "Ta commande est prête !";
      case "DONE":
        return "Commande terminée. Bon appétit !";
      case "CANCELLED":
        return "Commande annulée.";
      default:
        return "Mise à jour en cours…";
    }
  }, [currentStatus, position]);

  return (
    <div className="grid">
      <div className="card">
        <h1 className="h1">Ma commande</h1>

        <div
          className="row"
          style={{ alignItems: "center", justifyContent: "space-between" }}
        >
          <div>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>Ticket</div>
            <strong style={{ fontSize: 22 }}>{order.ticket_number}</strong>
          </div>

          <span className={`badge ${badgeClassForStatus(currentStatus)}`}>
            {STATUS_LABEL[currentStatus] ?? "En cours"}
          </span>
        </div>

        <div className="divider" />

        <div className="card" style={{ background: "rgba(255,255,255,.04)" }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Statut</div>
          <div
            style={{
              fontWeight: currentStatus === "READY" ? 900 : 600,
              color: currentStatus === "READY" ? "var(--ok)" : "var(--text)",
            }}
          >
            {message}
          </div>

          {currentStatus === "PENDING_PAYMENT" && (
            <div style={{ marginTop: 8, color: "var(--muted)", fontSize: 12 }}>
              Présente ton ticket à la caisse pour payer.
            </div>
          )}
        </div>

        <div className="divider" />

        <button className="btn btn-primary" onClick={onReset}>
          Nouvelle commande
        </button>
      </div>
    </div>
  );
}

export default Queue;