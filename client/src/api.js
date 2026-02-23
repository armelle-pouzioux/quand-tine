const API_URL = "http://localhost:4000/api";

export async function getDishes() {
  const res = await fetch(`${API_URL}/dishes`);
  const data = await res.json();
  return data.data;
}

export async function createOrder(items) {
  const res = await fetch(`${API_URL}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ items }),
  });

  return res.json();
}