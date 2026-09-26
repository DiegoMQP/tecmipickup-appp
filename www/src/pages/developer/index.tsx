import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { fetchAdminDashboard, updateManagedUser, type AdminDashboardData } from "@lib/api";
import { getSession, type Session } from "@lib/session";
import { routes } from "@config/Router";
import styles from "./Developer.module.css";

const money = (value: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);

export default function DeveloperDashboardPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyUser, setBusyUser] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setSession(getSession());
    setSessionChecked(true);
  }, []);

  useEffect(() => {
    if (session?.user.role !== "admin") return;
    let active = true;
    const load = async () => {
      try {
        const dashboard = await fetchAdminDashboard();
        if (active) {
          setData(dashboard);
          setError("");
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "No se pudo actualizar el tablero.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [session]);

  async function toggleUser(userId: string, active: boolean) {
    setBusyUser(userId);
    setError("");
    try {
      const updated = await updateManagedUser(userId, !active);
      setData((current) => current ? {
        ...current,
        users: current.users.map((user) => user.id === updated.id ? updated : user),
      } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cambiar el estado de la cuenta.");
    } finally {
      setBusyUser("");
    }
  }

  const matchingUsers = data?.users.filter((user) =>
    `${user.name} ${user.email} ${user.role}`.toLowerCase().includes(search.trim().toLowerCase()),
  ) ?? [];

  if (!sessionChecked) return null;
  if (session?.user.role !== "admin") {
    return (
      <>
        <Head><title>Tecmipickup | Desarrollador</title></Head>
        <main className={styles.page}>
          <section className={styles.message}>
            <p className={styles.brand}>TECMIPICKUP · CONTROL</p>
            <h1>Panel de desarrollador</h1>
            <p>{session ? "Esta cuenta no tiene permisos de administrador." : "Inicia sesión con una cuenta de desarrollador para ver restaurantes y gestionar usuarios."}</p>
            <Link href={routes.auth}>Ir a iniciar sesión</Link>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <Head><title>Tecmipickup | Panel de desarrollador</title></Head>
      <main className={styles.page}>
        <header className={styles.header}>
          <div>
            <span className={styles.brand}>TECMIPICKUP · CONTROL</span>
            <h1 className={styles.title}>Panel de desarrollador</h1>
            <p className={styles.subtitle}>Estado de tiendas, actividad y cuentas de clientes.</p>
          </div>
          <div className={styles.actions}>
            <button className={styles.refresh} type="button" onClick={() => void fetchAdminDashboard().then(setData).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "No se pudo actualizar."))} disabled={loading}>
              <RefreshCw size={16} aria-hidden="true" /> Actualizar
            </button>
            <Link className={styles.logout} href={routes.auth}>Salir</Link>
          </div>
        </header>

        <div className={styles.content}>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <section className={styles.stats} aria-label="Estadísticas generales">
            <div className={styles.stat}><span className={styles.statLabel}>Restaurantes</span><strong className={styles.statValue}>{data?.stats.storeCount ?? "—"}</strong></div>
            <div className={styles.stat}><span className={styles.statLabel}>Conectados</span><strong className={styles.statValue}>{data?.stats.onlineCount ?? "—"}</strong></div>
            <div className={styles.stat}><span className={styles.statLabel}>Usuarios</span><strong className={styles.statValue}>{data?.stats.userCount ?? "—"}</strong></div>
            <div className={styles.stat}><span className={styles.statLabel}>Pedidos totales</span><strong className={styles.statValue}>{data?.stats.orderCount ?? "—"}</strong></div>
            <div className={styles.stat}><span className={styles.statLabel}>Ventas · 30 días</span><strong className={styles.statValue}>{data ? money(data.stats.sales30d) : "—"}</strong></div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <div><h2 className={styles.sectionTitle}>Restaurantes</h2><span className={styles.sectionMeta}>Conexión activa si reportó actividad en los últimos dos minutos.</span></div>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Restaurante</th><th>Conexión</th><th>Pedidos</th><th>Ventas · 30 días</th><th>Platillos</th><th>Pedidos</th></tr></thead>
                <tbody>
                  {data?.stores.map((store) => (
                    <tr key={store.id}>
                      <td><span className={styles.name}>{store.name}</span><span className={styles.muted}>{store.slug}</span></td>
                      <td><span className={styles.status}><span className={`${styles.statusDot} ${store.online ? styles.online : ""}`} />{store.online ? "Conectado" : "Desconectado"}</span><span className={styles.muted}>{store.lastSeen ? new Date(store.lastSeen).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "Sin actividad reportada"}</span></td>
                      <td><span className={styles.badge}>{store.acceptingOrders ? "Activos" : "Pausados"}</span></td>
                      <td>{money(store.sales30d)}</td>
                      <td>{store.productCount}</td>
                      <td>{store.orders30d}</td>
                    </tr>
                  ))}
                  {!loading && data?.stores.length === 0 ? <tr><td colSpan={6} className={styles.empty}>No hay restaurantes registrados.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <div><h2 className={styles.sectionTitle}>Usuarios</h2><span className={styles.sectionMeta}>Actualización automática cada 15 segundos · {data?.users.length ?? 0} cuentas</span></div>
              <input className={styles.search} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nombre, correo o rol" aria-label="Buscar usuarios" />
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Usuario</th><th>Correo</th><th>Tipo</th><th>Restaurante asociado</th><th>Estado</th><th>Acción</th></tr></thead>
                <tbody>
                  {matchingUsers.map((user) => {
                    const ownAccount = user.email.toLowerCase() === session.user.email.toLowerCase();
                    const storeName = data?.stores.find((store) => store.id === user.tiendaId)?.name;
                    return (
                      <tr key={user.id}>
                        <td className={styles.name}>{user.name}</td>
                        <td>{user.email}</td>
                        <td>{user.role === "CLIENT" ? "Cliente" : user.role === "RESTAURANT" ? "Restaurante" : "Administrador"}</td>
                        <td>{storeName || "—"}</td>
                        <td><span className={styles.badge}>{user.active ? "Activo" : "Suspendido"}</span></td>
                        <td><button type="button" className={`${styles.action} ${user.active ? styles.actionSuspend : ""}`} disabled={ownAccount || busyUser === user.id} onClick={() => void toggleUser(user.id, user.active)}>{busyUser === user.id ? "Guardando…" : user.active ? "Suspender" : "Reactivar"}</button></td>
                      </tr>
                    );
                  })}
                  {!loading && matchingUsers.length === 0 ? <tr><td colSpan={6} className={styles.empty}>No se encontraron cuentas.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
