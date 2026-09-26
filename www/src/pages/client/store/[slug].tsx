import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import ClientShell from "../../../components/client/ClientShell";
import { FoodIcon } from "../../../components/client/home/FoodIcons";
import { itemPath, routes } from "@config/Router";
import { fetchProductosByTienda, fetchTiendas } from "@lib/api";
import { formatMxn, type MenuItem } from "@lib/data/menu";
import type { Restaurant } from "@lib/data/restaurants";
import styles from "./store.module.css";

function resolveSlug(query: string | string[] | undefined, asPath: string) {
  const fromQuery = typeof query === "string" ? query : "";
  const fromPath = decodeURIComponent(asPath.split("?")[0].match(/\/client\/store\/([^/]+)/)?.[1] ?? "");
  return fromQuery && fromQuery !== "_" ? fromQuery : fromPath;
}

export default function StorePage() {
  const router = useRouter();
  const slug = resolveSlug(router.query.slug, router.asPath);
  const [store, setStore] = useState<Restaurant | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!router.isReady || !slug) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    const loadMenu = async (initial: boolean) => {
      try {
        const stores = await fetchTiendas();
        const selected = stores.find((entry) => entry.slug === slug);
        if (!selected) throw new Error("Tienda no encontrada");
        const menu = await fetchProductosByTienda(selected.id);
        if (!cancelled) {
          setStore(selected);
          setItems(menu);
          setError(false);
        }
      } catch {
        if (!cancelled && initial) setError(true);
      } finally {
        if (!cancelled && initial) setLoading(false);
      }
    };

    void loadMenu(true);
    const refresh = window.setInterval(() => void loadMenu(false), 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(refresh);
    };
  }, [router.isReady, slug]);

  const groups = useMemo(() => {
    const grouped = new Map<string, MenuItem[]>();
    for (const item of items) {
      const category = item.category || "Menú";
      grouped.set(category, [...(grouped.get(category) ?? []), item]);
    }
    return Array.from(grouped.entries());
  }, [items]);

  if (!router.isReady || loading) {
    return <ClientShell title="Cargando menú..."><div className={styles.loading} aria-busy="true" /></ClientShell>;
  }

  if (error || !store) {
    return (
      <ClientShell title="Tienda no disponible">
        <div className={styles.empty}>
          <p>No pudimos cargar este menú.</p>
          <Link href={routes.client}>Volver a tiendas</Link>
        </div>
      </ClientShell>
    );
  }

  return (
    <ClientShell>
      <header className={styles.header}>
        <Link href={routes.client} className={styles.back}>Volver a tiendas</Link>
        <div className={styles.headingRow}>
          <div>
            <p className={styles.eyebrow}>Menú completo</p>
            <h1>{store.name}</h1>
            <p className={styles.description}>{store.description || store.tags.join(" · ") || "Productos disponibles para recoger"}</p>
          </div>
          <FoodIcon glyph={store.icon} className={styles.storeIcon} />
        </div>
      </header>

      {groups.map(([category, categoryItems]) => (
        <section key={category} className={styles.section}>
          <h2>{category}</h2>
          <div className={styles.grid}>
            {categoryItems.map((item) => (
              <Link key={item.id} href={itemPath(item.slug)} className={styles.item}>
                <div className={styles.image}>
                  {item.image && !failedImages.has(item.id) ? (
                    <Image
                      src={item.image}
                      alt=""
                      fill
                      sizes="(max-width: 700px) 44vw, 220px"
                      className={styles.imageAsset}
                      onError={() => setFailedImages((current) => new Set(current).add(item.id))}
                    />
                  ) : (
                    <FoodIcon glyph={item.glyph} className={styles.itemIcon} />
                  )}
                </div>
                <div className={styles.itemBody}>
                  <h3>{item.name}</h3>
                  <p>{item.description || "Preparado al momento"}</p>
                  <strong>{formatMxn(item.price)}</strong>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}

      {items.length === 0 ? <div className={styles.empty}><p>Esta tienda aún no tiene platillos disponibles.</p></div> : null}
    </ClientShell>
  );
}

export function getStaticPaths() {
  return {
    paths: ["vathi-cafeteria", "jorgillo", "chilaquileria", "_"].map((slug) => ({ params: { slug } })),
    fallback: false,
  };
}

export function getStaticProps() {
  return { props: {} };
}