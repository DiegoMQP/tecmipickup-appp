import { useEffect, useMemo, useState } from "react";
import { fetchAllPedidos, fetchRestaurantInventory, type RestaurantProduct } from "@lib/api";
import { getSession } from "@lib/session";
import type { ActiveOrder } from "@lib/order";
import styles from "./RestaurantManagement.module.css";

type Period = "day" | "week" | "month";
type Props = { mode: "history" | "earnings" };

const periodLabels: Record<Period, string> = { day: "Hoy", week: "Esta semana", month: "Este mes" };

function periodStart(period: Period, now: Date) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === "week") {
    const offset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - offset);
  } else if (period === "month") {
    start.setDate(1);
  }
  return start.getTime();
}

function storeTotal(order: ActiveOrder, productIds: Set<string>) {
  return order.lines
    .filter((line) => productIds.has(line.itemId))
    .reduce((total, line) => total + line.unitPrice * line.quantity, 0);
}

export default function RestaurantAnalytics({ mode }: Props) {
  const [storeId, setStoreId] = useState("");
  const [products, setProducts] = useState<RestaurantProduct[]>([]);
  const [orders, setOrders] = useState<ActiveOrder[]>([]);
  const [period, setPeriod] = useState<Period>("day");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = getSession();
    setStoreId(session?.user.tiendaId || (session?.user.email === "jorgillos@admin.com" ? "tienda-central" : ""));
  }, []);

  useEffect(() => {
    if (!storeId) return;
    let active = true;
    const load = async () => {
      const [inventoryResult, ordersResult] = await Promise.allSettled([
        fetchRestaurantInventory(storeId),
        fetchAllPedidos(),
      ]);
      if (!active) return;
      if (inventoryResult.status === "fulfilled") setProducts(inventoryResult.value);
      else setError(inventoryResult.reason instanceof Error ? inventoryResult.reason.message : "No se pudieron cargar los datos del restaurante.");
      if (ordersResult.status === "fulfilled") setOrders(ordersResult.value);
      setLoading(false);
    };
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [storeId]);

  const productIds = useMemo(() => new Set(products.map((product) => product.id)), [products]);
  const restaurantOrders = useMemo(
    () => orders
      .filter((order) => order.lines.some((line) => productIds.has(line.itemId)))
      .sort((a, b) => b.placedAt - a.placedAt),
    [orders, productIds],
  );
  const periodOrders = useMemo(() => {
    const start = periodStart(period, new Date());
    return restaurantOrders.filter((order) => order.placedAt >= start && !order.cancelled);
  }, [period, restaurantOrders]);
  const periodSales = periodOrders.reduce((sum, order) => sum + storeTotal(order, productIds), 0);
  const completedCount = periodOrders.filter((order) => order.remoteStatus === "ready").length;

  return (
    <section className={styles.page}>
      <header className={styles.topline}>
        <div>
          <p className={styles.eyebrow}>{mode === "history" ? "Actividad" : "Rendimiento"}</p>
          <h1 className={styles.title}>{mode === "history" ? "Historial de pedidos" : "Ganancias por ventas"}</h1>
          <p className={styles.subtitle}>{mode === "history" ? "Pedidos recibidos y el importe correspondiente a tus platillos." : "Resumen de ventas calculado a partir de los pedidos registrados."}</p>
        </div>
        {mode === "earnings" ? (
          <div className={styles.periods} role="group" aria-label="Periodo de ganancias">
            {(Object.keys(periodLabels) as Period[]).map((item) => (
              <button key={item} type="button" className={`${styles.period} ${period === item ? styles.periodActive : ""}`} aria-pressed={period === item} onClick={() => setPeriod(item)}>{periodLabels[item]}</button>
            ))}
          </div>
        ) : null}
      </header>

      {mode === "earnings" ? (
        <div className={styles.stats}>
          <div className={styles.stat}><span className={styles.statLabel}>Ventas · {periodLabels[period].toLowerCase()}</span><strong className={styles.statValue}>${periodSales.toFixed(2)}</strong></div>
          <div className={styles.stat}><span className={styles.statLabel}>Pedidos válidos</span><strong className={styles.statValue}>{periodOrders.length}</strong></div>
          <div className={styles.stat}><span className={styles.statLabel}>Pedidos listos</span><strong className={styles.statValue}>{completedCount}</strong></div>
        </div>
      ) : (
        <div className={styles.stats}>
          <div className={styles.stat}><span className={styles.statLabel}>Pedidos registrados</span><strong className={styles.statValue}>{restaurantOrders.length}</strong></div>
          <div className={styles.stat}><span className={styles.statLabel}>Ventas hoy</span><strong className={styles.statValue}>${periodOrders.filter((order) => order.placedAt >= periodStart("day", new Date())).reduce((sum, order) => sum + storeTotal(order, productIds), 0).toFixed(2)}</strong></div>
          <div className={styles.stat}><span className={styles.statLabel}>Productos vinculados</span><strong className={styles.statValue}>{products.length}</strong></div>
        </div>
      )}

      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {!storeId ? <p className={styles.empty}>Esta cuenta todavía no está asociada a una tienda.</p> : null}
      {loading ? <p className={styles.empty}>Cargando pedidos…</p> : null}
      {!loading && storeId ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Pedido</th><th>Fecha</th><th>Platillos</th><th>Estado</th><th>Importe</th></tr></thead>
            <tbody>
              {restaurantOrders.map((order) => {
                const lines = order.lines.filter((line) => productIds.has(line.itemId));
                return (
                  <tr key={order.id}>
                    <td><span className={styles.productName}>#{order.displayNumber ?? "—"}</span></td>
                    <td>{new Date(order.placedAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}</td>
                    <td>{lines.map((line) => `${line.quantity} × ${line.name}`).join(", ")}</td>
                    <td>{order.cancelled ? "Cancelado" : order.remoteStatus === "ready" ? "Listo" : order.remoteStatus === "preparing" ? "En cocina" : "Recibido"}</td>
                    <td>${storeTotal(order, productIds).toFixed(2)}</td>
                  </tr>
                );
              })}
              {restaurantOrders.length === 0 ? <tr><td colSpan={5} className={styles.empty}>Aún no hay pedidos de este restaurante.</td></tr> : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
