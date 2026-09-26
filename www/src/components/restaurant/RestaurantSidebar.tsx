import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/router";
import { CircleDollarSign, History, Pause, Play } from "lucide-react";
import { routes } from "@config/Router";
import { clearSession, getSession, type Session } from "@lib/session";
import { LOGO_SRC } from "../client/Brand";
import { fetchRestaurantStatus, sendRestaurantHeartbeat, updateRestaurantOrders } from "@lib/api";
import styles from "./RestaurantSidebar.module.css";

type RestaurantNavKey = "inicio" | "pedidos" | "inventario" | "historial" | "ganancias";

interface RestaurantSidebarProps {
  activeKey?: RestaurantNavKey;
}

export default function RestaurantSidebar({ activeKey = "inicio" }: RestaurantSidebarProps) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [storeId, setStoreId] = useState("");
  const [acceptingOrders, setAcceptingOrders] = useState(true);
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");

  useEffect(() => {
    const current = getSession();
    setSession(current);
    const id = current?.user.tiendaId || (current?.user.email === "jorgillos@admin.com" ? "tienda-central" : "");
    setStoreId(id);
    if (!id) return;

    let active = true;
    const heartbeat = () => void sendRestaurantHeartbeat(id).catch(() => undefined);
    void fetchRestaurantStatus(id)
      .then((status) => { if (active) setAcceptingOrders(status.aceptaPedidos !== false); })
      .catch(() => undefined);
    heartbeat();
    const timer = window.setInterval(heartbeat, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const toggleOrders = async () => {
    if (!storeId || availabilityBusy) return;
    setAvailabilityBusy(true);
    setAvailabilityError("");
    try {
      const status = await updateRestaurantOrders(storeId, !acceptingOrders);
      setAcceptingOrders(status.aceptaPedidos !== false);
    } catch (cause) {
      setAvailabilityError(cause instanceof Error ? cause.message : "No se pudo cambiar el estado de pedidos.");
    } finally {
      setAvailabilityBusy(false);
    }
  };

  const handleLogout = () => {
    clearSession();
    void router.push(routes.auth);
  };

  const navItems = [
    {
      key: "inicio" as const,
      label: "Inicio",
      href: routes.restaurant,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      ),
    },
    {
      key: "pedidos" as const,
      label: "Pedidos",
      href: routes.restaurantPedidos,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      ),
    },
    {
      key: "inventario" as const,
      label: "Inventario y platillos",
      href: routes.restaurantInventario,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
          <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
          <line x1="6" y1="1" x2="6" y2="4" />
          <line x1="10" y1="1" x2="10" y2="4" />
          <line x1="14" y1="1" x2="14" y2="4" />
        </svg>
      ),
    },
    {
      key: "historial" as const,
      label: "Historial de pedidos",
      href: routes.restaurantHistorial,
      icon: <History size={20} strokeWidth={1.8} />,
    },
    {
      key: "ganancias" as const,
      label: "Ganancias",
      href: routes.restaurantGanancias,
      icon: <CircleDollarSign size={20} strokeWidth={1.8} />,
    },
  ];

  return (
    <>
      {/* Mobile Top bar */}
      <div className={styles.mobileBar}>
        <Link href={routes.restaurant} className={styles.brandLink}>
          <Image src={LOGO_SRC} alt="Tecmipickup" width={140} height={28} priority className={styles.brandLogo} />
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className={styles.menuToggle}
          aria-label="Abrir menú de navegación"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        {availabilityError ? <span className={styles.availabilityError} role="alert">{availabilityError}</span> : null}
      </div>

      {/* Backdrop for mobile */}
      {mobileOpen && (
        <div
          className={styles.backdrop}
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.brandWrap}>
          <Link href={routes.restaurant} className={styles.brandLink} aria-label="Tecmipickup">
            <Image
              src={LOGO_SRC}
              alt="Tecmipickup"
              width={200}
              height={40}
              priority
              className={styles.brandLogo}
            />
          </Link>
        </div>

        <nav className={styles.nav} aria-label="Menú restaurante">
          <span className={styles.navLabel}>Navegación</span>
          {navItems.map((item) => {
            const isActive = activeKey === item.key;
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
              >
                {isActive && <span className={styles.activeBar} />}
                <span className={styles.navIcon}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={() => void toggleOrders()}
          disabled={!storeId || availabilityBusy}
          className={`${styles.ordersToggle} ${acceptingOrders ? styles.ordersOn : styles.ordersOff}`}
          aria-pressed={!acceptingOrders}
        >
          {acceptingOrders ? <Pause size={17} /> : <Play size={17} />}
          <span>{availabilityBusy ? "Actualizando…" : acceptingOrders ? "Pausar pedidos" : "Activar pedidos"}</span>
        </button>

        <div className={styles.footer}>
          <div className={styles.userCard}>
            <div className={styles.userAvatar}>
              {session?.user?.name ? session.user.name.charAt(0).toUpperCase() : "R"}
            </div>
            <div className={styles.userInfo}>
              <span className={styles.userName}>{session?.user?.name || "Mi Restaurante"}</span>
              <span className={styles.userMatricula}>
                {session?.user?.matricula || "Código Local"}
              </span>
            </div>
          </div>

          <button type="button" onClick={handleLogout} className={styles.logoutBtn}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>
    </>
  );
}
