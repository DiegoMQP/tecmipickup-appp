import { useEffect, useState } from "react";
import Link from "next/link";
import ClientShell from "../../components/client/ClientShell";
import { fetchUserPedidos } from "@lib/api";
import { getRecentOrders, mergeRemoteOrders, type ActiveOrder } from "@lib/order";
import { getSession, type AuthUser } from "@lib/session";
import { formatMxn } from "@lib/data/menu";
import styles from "./profile.module.css";

const NOTIFICATIONS_KEY = "tecmipickup.order-notifications";

export default function ClientProfile() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [orders, setOrders] = useState<ActiveOrder[]>([]);
  const [notifications, setNotifications] = useState(true);

  useEffect(() => {
    const session = getSession();
    setUser(session?.user ?? null);
    setOrders(getRecentOrders());
    setNotifications(window.localStorage.getItem(NOTIFICATIONS_KEY) !== "false");

    if (session?.user.id && session.user.id !== "local-user") {
      void fetchUserPedidos(session.user.id)
        .then((remoteOrders) => setOrders(mergeRemoteOrders(remoteOrders)))
        .catch(() => undefined);
    }
  }, []);

  function updateNotifications(value: boolean) {
    setNotifications(value);
    window.localStorage.setItem(NOTIFICATIONS_KEY, String(value));
  }

  return (
    <ClientShell title="Mi perfil">
      <div className={styles.page}>
        <nav className={styles.sectionNav} aria-label="Secciones de perfil">
          <a href="#pedidos">Pedidos</a>
          <a href="#metodos">Métodos de pago</a>
          <a href="#cuenta">Mi cuenta</a>
          <a href="#configuracion">Configuración</a>
        </nav>

        <section id="pedidos" className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>Pedidos</h2>
            <Link href="/client/cart">Ir al carrito</Link>
          </div>
          {orders.length > 0 ? (
            <ul className={styles.orderList}>
              {orders.map((order) => (
                <li key={order.id} className={styles.order}>
                  <div className={styles.orderCopy}>
                    <strong>Pedido {order.displayNumber ? `#${order.displayNumber}` : "reciente"}</strong>
                    <span>{order.lines.map((line) => `${line.quantity}× ${line.name}`).join(", ")}</span>
                  </div>
                  <span className={styles.orderTotal}>{formatMxn(order.total)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>Tus pedidos aparecerán aquí.</p>
          )}
        </section>

        <section id="metodos" className={styles.section}>
          <h2>Métodos de pago</h2>
          <div className={styles.paymentMethod}>
            <span className={styles.cardMark} aria-hidden="true">MC</span>
            <div>
              <strong>Método de pago frecuente</strong>
              <p>{user?.name || "Invitado"} · Mastercard terminación 4444</p>
            </div>
            <span className={styles.demoTag}>Demo</span>
          </div>
          <p className={styles.note}>Tarjeta ficticia; no hay datos bancarios guardados ni se hacen cargos.</p>
        </section>

        <section id="cuenta" className={styles.section}>
          <h2>Mi cuenta</h2>
          <dl className={styles.account}>
            <div><dt>Nombre</dt><dd>{user?.name || "Invitado"}</dd></div>
            <div><dt>Correo</dt><dd>{user?.email || "Sin correo asociado"}</dd></div>
            <div><dt>Matrícula</dt><dd>{user?.matricula || "Sin matrícula"}</dd></div>
          </dl>
          {!user ? <Link className={styles.signIn} href="/auth">Iniciar sesión</Link> : null}
        </section>

        <section id="configuracion" className={styles.section}>
          <h2>Configuración</h2>
          <label className={styles.setting}>
            <span>
              <strong>Notificaciones de pedidos</strong>
              <small>Mostrar avisos de estado en este dispositivo</small>
            </span>
            <input
              type="checkbox"
              checked={notifications}
              onChange={(event) => updateNotifications(event.target.checked)}
            />
          </label>
        </section>
      </div>
    </ClientShell>
  );
}