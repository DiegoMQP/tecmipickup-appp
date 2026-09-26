import { useEffect, useState } from "react";
import Head from "next/head";
import RestaurantShell from "../../components/restaurant/RestaurantShell";
import { fetchRestaurantInventory, updateRestaurantProduct, type RestaurantProduct } from "@lib/api";
import { getSession } from "@lib/session";
import styles from "./RestaurantManagement.module.css";

export default function RestaurantInventarioPage() {
  const [storeId, setStoreId] = useState("");
  const [products, setProducts] = useState<RestaurantProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState("");

  useEffect(() => {
    const session = getSession();
    setStoreId(session?.user.tiendaId || (session?.user.email === "jorgillos@admin.com" ? "tienda-central" : ""));
  }, []);

  useEffect(() => {
    if (!storeId) return;
    let active = true;
    void fetchRestaurantInventory(storeId)
      .then((items) => { if (active) setProducts(items); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "No se pudo cargar el inventario."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [storeId]);

  async function saveStock(product: RestaurantProduct) {
    setSavingId(product.id);
    setError("");
    try {
      const updated = await updateRestaurantProduct(storeId, product.id, { stock: Math.max(0, product.stock) });
      setProducts((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la cantidad.");
      void fetchRestaurantInventory(storeId).then(setProducts).catch(() => undefined);
    } finally {
      setSavingId("");
    }
  }

  async function toggleAvailability(product: RestaurantProduct) {
    setSavingId(product.id);
    setError("");
    try {
      const updated = await updateRestaurantProduct(storeId, product.id, { activo: !product.activo });
      setProducts((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo actualizar la disponibilidad.");
    } finally {
      setSavingId("");
    }
  }

  const availableCount = products.filter((product) => product.activo && product.stock > 0).length;
  const lowStockCount = products.filter((product) => product.stock <= 5).length;

  return (
    <>
      <Head><title>Tecmipickup | Inventario</title></Head>
      <RestaurantShell activeKey="inventario">
        <section className={styles.page}>
          <header className={styles.topline}>
            <div>
              <p className={styles.eyebrow}>Operación del restaurante</p>
              <h1 className={styles.title}>Inventario y platillos</h1>
              <p className={styles.subtitle}>Controla cuántas porciones puede preparar tu cocina.</p>
            </div>
          </header>
          <div className={styles.stats}>
            <div className={styles.stat}><span className={styles.statLabel}>Platillos en menú</span><strong className={styles.statValue}>{products.length}</strong></div>
            <div className={styles.stat}><span className={styles.statLabel}>Disponibles para ordenar</span><strong className={styles.statValue}>{availableCount}</strong></div>
            <div className={styles.stat}><span className={styles.statLabel}>Existencias bajas</span><strong className={styles.statValue}>{lowStockCount}</strong></div>
          </div>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          {!storeId ? <p className={styles.empty}>Esta cuenta todavía no está asociada a una tienda.</p> : null}
          {loading ? <p className={styles.empty}>Cargando inventario…</p> : null}
          {!loading && storeId ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Platillo</th><th>Precio</th><th>Porciones disponibles</th><th>Estado</th></tr></thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id}>
                      <td><span className={styles.productName}>{product.nombre}</span><span className={styles.productMeta}>{product.categoria || "Sin categoría"}</span></td>
                      <td>${Number(product.precio).toFixed(2)}</td>
                      <td>
                        <input
                          className={styles.stockInput}
                          type="number"
                          min="0"
                          step="1"
                          aria-label={`Porciones disponibles de ${product.nombre}`}
                          value={product.stock}
                          disabled={savingId === product.id}
                          onChange={(event) => {
                            const stock = Number.parseInt(event.target.value, 10);
                            setProducts((current) => current.map((item) => item.id === product.id ? { ...item, stock: Number.isFinite(stock) ? Math.max(0, stock) : 0 } : item));
                          }}
                          onBlur={() => void saveStock(product)}
                        />
                      </td>
                      <td>
                        <button
                          className={styles.availability}
                          type="button"
                          onClick={() => void toggleAvailability(product)}
                          disabled={savingId === product.id}
                          aria-pressed={product.activo}
                        >
                          <span className={`${styles.dot} ${product.activo ? styles.dotOn : ""}`} />
                          {product.activo ? "Disponible" : "Oculto"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {products.length === 0 ? <tr><td colSpan={4} className={styles.empty}>Todavía no hay platillos registrados para esta tienda.</td></tr> : null}
                </tbody>
              </table>
            </div>
          ) : null}
          <p className={styles.productMeta} role="status">{savingId ? "Guardando cambios…" : "Los cambios se guardan al salir del campo."}</p>
        </section>
      </RestaurantShell>
    </>
  );
}
