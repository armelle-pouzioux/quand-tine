import { useEffect, useMemo, useState } from "react";
import { getDishes, createOrder } from "../api";
import { socket } from "../socket";

function Menu({ onOrderCreated }) {
  const [dishes, setDishes] = useState([]);
  const [cart, setCart] = useState([]);

  const totalItems = useMemo(
    () => cart.reduce((sum, item) => sum + item.qty, 0),
    [cart]
  );

  const totalEuros = useMemo(() => {
    const map = new Map(dishes.map((d) => [d.id, d.price_cents]));
    const totalCents = cart.reduce((sum, it) => {
      const price = map.get(it.dish_id) ?? 0;
      return sum + price * it.qty;
    }, 0);
    return (totalCents / 100).toFixed(2);
  }, [cart, dishes]);

  useEffect(() => {
    async function fetchDishes() {
      const data = await getDishes();
      setDishes(data);
    }
    fetchDishes();
  }, []);

  useEffect(() => {
    const onMenuUpdate = (rows) => setDishes(rows);
    socket.on("menu:update", onMenuUpdate);
    return () => socket.off("menu:update", onMenuUpdate);
  }, []);

  function addToCart(dish) {
    setCart((prev) => {
      const existing = prev.find((item) => item.dish_id === dish.id);
      if (existing) {
        return prev.map((item) =>
          item.dish_id === dish.id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prev, { dish_id: dish.id, qty: 1 }];
    });
  }

  function decFromCart(dishId) {
    setCart((prev) => {
      const item = prev.find((x) => x.dish_id === dishId);
      if (!item) return prev;
      if (item.qty <= 1) return prev.filter((x) => x.dish_id !== dishId);
      return prev.map((x) => (x.dish_id === dishId ? { ...x, qty: x.qty - 1 } : x));
    });
  }

  function qtyOf(dishId) {
    return cart.find((x) => x.dish_id === dishId)?.qty ?? 0;
  }

  async function handleOrder() {
    const result = await createOrder(cart);
    if (result.success) onOrderCreated(result.data);
    else alert("Erreur commande: " + result.error);
  }

  return (
    <div className="grid">
      <div className="card">
        <h1 className="h1">Menu</h1>

        <div className="kpi">
          <span>Articles dans le panier</span>
          <strong>{totalItems}</strong>
        </div>

        <div className="row" style={{ marginTop: 10, justifyContent: "space-between" }}>
          <span className="badge ok">Total: {totalEuros}€</span>
        </div>
      </div>

      <div className="card">
        <div className="menu-list">
          {dishes.length === 0 && (
            <span className="badge info">Aucun plat disponible</span>
          )}

          {dishes.map((dish) => {
            const q = qtyOf(dish.id);

            return (
              <div className="menu-item" key={dish.id}>
                <div className="menu-left">
                  <strong>{dish.name}</strong>
                  <span>{(dish.price_cents / 100).toFixed(2)}€</span>
                </div>

                {q === 0 ? (
                  <button className="btn btn-primary" onClick={() => addToCart(dish)}>
                    Ajouter
                  </button>
                ) : (
                  <div className="row" style={{ alignItems: "center" }}>
                    <button className="btn" onClick={() => decFromCart(dish.id)}>
                      –
                    </button>
                    <span className="badge info">{q}</span>
                    <button className="btn btn-primary" onClick={() => addToCart(dish)}>
                      +
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="sticky-bottom">
          <div className="divider" />
          <button
            className="btn btn-primary"
            disabled={cart.length === 0}
            onClick={handleOrder}
          >
            Commander • {totalEuros}€
          </button>
        </div>
      </div>
    </div>
  );
}

export default Menu;