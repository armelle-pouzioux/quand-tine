import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { pool } from "./db.js";
import { requireAdmin } from "./auth.js";
import crypto from "crypto";

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";


const app = express();


app.use(cors({ origin: process.env.CLIENT_ORIGIN }));
app.use(express.json());


const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_ORIGIN },
});


io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("client:register", ({ client_token }) => {
    if (!client_token) return;
    socket.join(`client:${client_token}`);
    console.log("Client registered:", client_token);
  });
});



app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, db: "connected" });
  } catch {
    res.status(500).json({ ok: false, db: "error" });
  }
});


// ADMIN: LOGIN 
app.post("/api/admin/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ success: false, error: "BAD_BODY" });
  }

  const [rows] = await pool.query(`SELECT * FROM admins WHERE email=:email`, { email });
  const admin = rows[0];
  if (!admin) return res.status(401).json({ success: false, error: "BAD_LOGIN" });

  const ok = await bcrypt.compare(password, admin.password_hash);
  if (!ok) return res.status(401).json({ success: false, error: "BAD_LOGIN" });

  const token = jwt.sign(
    { adminId: admin.id, email: admin.email },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );

  res.json({ success: true, data: { token } });
});

// ADMIN: DISHES
app.get("/api/admin/dishes", requireAdmin, async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT id, name, price_cents, is_active FROM dishes ORDER BY id DESC`
  );
  res.json({ success: true, data: rows });
});

app.post("/api/admin/dishes", requireAdmin, async (req, res) => {
  const { name, price_cents } = req.body || {};
  if (!name || typeof price_cents !== "number") {
    return res.status(400).json({ success: false, error: "BAD_BODY" });
  }

  await pool.query(
    `INSERT INTO dishes(name, price_cents, is_active) VALUES(:name, :price_cents, 1)`,
    { name, price_cents }
  );

  await emitMenuUpdate();

  res.status(201).json({ success: true });
});

app.patch("/api/admin/dishes/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { name, price_cents, is_active } = req.body || {};

    await pool.query(
    `UPDATE dishes
     SET
       name = COALESCE(:name, name),
       price_cents = COALESCE(:price_cents, price_cents),
       is_active = COALESCE(:is_active, is_active)
     WHERE id=:id`,
    {
      id,
      name: name ?? null,
      price_cents: typeof price_cents === "number" ? price_cents : null,
      is_active: typeof is_active === "number" ? is_active : null,
    }
  );

  await emitMenuUpdate();

  res.json({ success: true });
});

// PUBLIC: MENU
app.get("/api/menu", async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT id, name, price_cents FROM dishes WHERE is_active=1 ORDER BY id DESC`
  );
  res.json({ success: true, data: rows });
});

app.get("/api/dishes", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, name, price_cents FROM dishes WHERE is_active=1"
    );

    res.json({
      success: true,
      data: rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      error: "SERVER_ERROR"
    });
  }
});

// CLIENT: CREATE ORDER 
app.post("/api/orders", async (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: "BAD_BODY" });
  }

  const client_token = crypto.randomUUID();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[counter]] = await conn.query(
      `SELECT value FROM counters WHERE name='ticket' FOR UPDATE`
    );
    const ticket_number = counter.value + 1;

    await conn.query(
      `UPDATE counters SET value=:v WHERE name='ticket'`,
      { v: ticket_number }
    );

    const [orderRes] = await conn.query(
      `INSERT INTO orders(ticket_number, status, total_cents, client_token)
       VALUES(:ticket, 'PENDING_PAYMENT', 0, :client)`,
      { ticket: ticket_number, client: client_token }
    );

    const orderId = orderRes.insertId;
    let total = 0;

    for (const it of items) {
      const [[dish]] = await conn.query(
        `SELECT price_cents FROM dishes WHERE id=:id AND is_active=1`,
        { id: it.dish_id }
      );
      if (!dish) throw new Error("INVALID_DISH");

      const lineTotal = dish.price_cents * it.qty;
      total += lineTotal;

      await conn.query(
        `INSERT INTO order_items(order_id, dish_id, qty, unit_price_cents)
         VALUES(:o, :d, :q, :p)`,
        {
          o: orderId,
          d: it.dish_id,
          q: it.qty,
          p: dish.price_cents
        }
      );
    }

    await conn.query(
      `UPDATE orders SET total_cents=:t WHERE id=:id`,
      { t: total, id: orderId }
    );

    await conn.commit();
    await emitQueueUpdate();


    res.status(201).json({
      success: true,
      data: {
        order_id: orderId,
        ticket_number,
        client_token
      }
    });
  } catch (e) {
    await conn.rollback();
    res.status(400).json({ success: false, error: e.message });
  } finally {
    conn.release();
  }
});

// PUBLIC: QUEUE STATE
app.get("/api/queue", async (_req, res) => {
  const [paymentQueue] = await pool.query(
    `SELECT id, ticket_number, status, total_cents, created_at
     FROM orders
     WHERE status='PENDING_PAYMENT'
     ORDER BY ticket_number ASC`
  );

  const [prepQueue] = await pool.query(
    `SELECT id, ticket_number, status, total_cents, created_at
     FROM orders
     WHERE status IN ('PAID','PREPARING','READY')
     ORDER BY ticket_number ASC`
  );

  const [currentRows] = await pool.query(
    `SELECT id, ticket_number, status
     FROM orders
     WHERE status IN ('PREPARING','PAID')
     ORDER BY (status='PREPARING') DESC, ticket_number ASC
     LIMIT 1`
  );

  res.json({
    success: true,
    data: {
      paymentQueue,
      prepQueue,
      current: currentRows[0] || null
    }
  });
});

// ADMIN: MARK AS PAID 
app.patch("/api/admin/orders/:id/pay", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);

  const [rows] = await pool.query(
  `SELECT status, client_token, ticket_number FROM orders WHERE id=:id`,
  { id }
  );
  const order = rows[0];
  if (!order) return res.status(404).json({ success: false, error: "NOT_FOUND" });

  if (order.status !== "PENDING_PAYMENT") {
    return res.status(403).json({ success: false, error: "NOT_PAYABLE" });
  }

  await pool.query(
    `UPDATE orders SET status='PAID' WHERE id=:id`,
    { id }
  );

  console.log("EMIT PAY:", order.client_token, order.ticket_number);

  await emitQueueUpdate();
  emitOrderUpdate(order.client_token, {
    type: "STATUS",
    order_id: id,
    ticket_number: order.ticket_number,
    status: "PAID",
  });

  res.json({ success: true });
});

// ADMIN: UPDATE ORDER STATUS 
app.patch("/api/admin/orders/:id/status", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};

  const allowed = new Set(["PENDING_PAYMENT", "PAID", "PREPARING", "READY", "DONE", "CANCELLED"]);
  if (!allowed.has(status)) {
    return res.status(400).json({ success: false, error: "BAD_STATUS" });
  }

  const [rows] = await pool.query(
    `SELECT status, client_token, ticket_number FROM orders WHERE id=:id`,
    { id }
  );
  const order = rows[0];
  if (!order) return res.status(404).json({ success: false, error: "NOT_FOUND" });

  if (order.status === "DONE" || order.status === "CANCELLED") {
    return res.status(403).json({ success: false, error: "LOCKED" });
  }

  if (status === "CANCELLED" && order.status !== "PENDING_PAYMENT") {
    return res.status(403).json({ success: false, error: "CANNOT_CANCEL" });
  }

  if (["PREPARING", "READY", "DONE"].includes(status) && order.status === "PENDING_PAYMENT") {
    return res.status(403).json({ success: false, error: "NOT_PAID" });
  }

  await pool.query(
    `UPDATE orders SET status=:status WHERE id=:id`,
    { status, id }
  );

  console.log("EMIT STATUS:", status, order.client_token);

  await emitQueueUpdate();
  emitOrderUpdate(order.client_token, {
    type: "STATUS",
    order_id: id,
    ticket_number: order.ticket_number,
    status,
  });

  res.json({ success: true });
});


async function emitQueueUpdate() {
  const [paymentQueue] = await pool.query(
    `SELECT id, ticket_number, status, total_cents, created_at
     FROM orders
     WHERE status='PENDING_PAYMENT'
     ORDER BY ticket_number ASC`
  );

  const [prepQueue] = await pool.query(
    `SELECT id, ticket_number, status, total_cents, created_at
     FROM orders
     WHERE status IN ('PAID','PREPARING','READY')
     ORDER BY ticket_number ASC`
  );

  const [currentRows] = await pool.query(
    `SELECT id, ticket_number, status
     FROM orders
     WHERE status IN ('PREPARING','PAID')
     ORDER BY (status='PREPARING') DESC, ticket_number ASC
     LIMIT 1`
  );

  io.emit("queue:update", {
    paymentQueue,
    prepQueue,
    current: currentRows[0] || null,
  });
}

async function emitMenuUpdate() {
  const [rows] = await pool.query(
    `SELECT id, name, price_cents FROM dishes WHERE is_active=1 ORDER BY id DESC`
  );
  io.emit("menu:update", rows);
}

function emitOrderUpdate(client_token, payload) {
  io.to(`client:${client_token}`).emit("order:update", payload);
}


const port = process.env.PORT || 4000;
server.listen(port, () => {
  console.log(`Quand-tine server running on http://localhost:${port}`);
});
