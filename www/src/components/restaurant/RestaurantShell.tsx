import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { routes } from "@config/Router";
import { getSession } from "@lib/session";
import RestaurantSidebar from "./RestaurantSidebar";
import styles from "./RestaurantShell.module.css";

interface RestaurantShellProps {
  children?: ReactNode;
  activeKey?: "inicio" | "pedidos" | "inventario" | "historial" | "ganancias";
}

export default function RestaurantShell({ children, activeKey = "inicio" }: RestaurantShellProps) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const role = getSession()?.user.role;
    if (role === "restaurant" || role === "admin") {
      setAuthorized(true);
      return;
    }
    void router.replace(routes.auth);
  }, [router]);

  if (!authorized) {
    return <div className={styles.authCheck} role="status">Validando acceso…</div>;
  }

  return (
    <div className={styles.layout}>
      <RestaurantSidebar activeKey={activeKey} />
      <main className={styles.content}>
        {children}
      </main>
    </div>
  );
}
