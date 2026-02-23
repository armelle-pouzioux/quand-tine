const API_URL = "http://localhost:4000/api";

export async function adminLogin(email, password) {
  const res = await fetch(`${API_URL}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return res.json();
}

export async function getQueue() {
  const res = await fetch(`${API_URL}/queue`);
  return res.json();
}

export async function markPaid(token, orderId) {
  const res = await fetch(`${API_URL}/admin/orders/${orderId}/pay`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

export async function setStatus(token, orderId, status) {
  const res = await fetch(`${API_URL}/admin/orders/${orderId}/status`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status }),
  });
  return res.json();
}

export async function getDishesAdmin(token) {
  const res = await fetch("http://localhost:4000/api/admin/dishes", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return res.json();
}

export async function createDish(token, data) {
  const res = await fetch("http://localhost:4000/api/admin/dishes", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateDish(token, id, data) {
  const res = await fetch(
    `http://localhost:4000/api/admin/dishes/${id}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }
  );
  return res.json();
}