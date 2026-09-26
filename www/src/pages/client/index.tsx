import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import ClientShell from "../../components/client/ClientShell";
import AdCarousel from "../../components/client/home/AdCarousel";
import CategoryRail from "../../components/client/home/CategoryRail";
import HomeSkeleton from "../../components/client/home/HomeSkeleton";
import RestaurantCard from "../../components/client/home/RestaurantCard";
import { FoodIcon } from "../../components/client/home/FoodIcons";
import { fetchProductosByCategoria, restaurantsForCategory } from "@lib/api";
import { itemPath } from "@config/Router";
import { formatMxn, type MenuItem } from "@lib/data/menu";
import { filterByCategory, type Restaurant } from "@lib/data/restaurants";
import { useFavorites } from "@lib/favorites";
import { getSession } from "@lib/session";
import { useHomeData } from "@lib/useHomeData";
import styles from "../../components/client/home/home.module.css";

function greetingForHour(hour: number) {
  if (hour < 12) {
    return "Buenos días";
  }

  if (hour < 19) {
    return "Buenas tardes";
  }

  return "Buenas noches";
}

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

export default function ClientHome() {
  const reduceMotion = useReducedMotion();
  const { data, loading, counts } = useHomeData();
  const { isFavorite, toggle } = useFavorites();
  const [category, setCategory] = useState("todo");
  const [categoryPlaces, setCategoryPlaces] = useState<Restaurant[] | null>(null);
  const [categoryProducts, setCategoryProducts] = useState<MenuItem[] | null>(null);
  const [greeting, setGreeting] = useState("Hola");
  const [firstName, setFirstName] = useState("");

  useEffect(() => {
    setGreeting(greetingForHour(new Date().getHours()));
    const name = getSession()?.user.name ?? "";
    setFirstName(name.split(" ")[0] ?? "");
  }, []);

  useEffect(() => {
    if (category === "todo") {
      setCategoryPlaces(null);
      setCategoryProducts(null);
      return;
    }

    let cancelled = false;
    void Promise.all([restaurantsForCategory(category), fetchProductosByCategoria(category)])
      .then(([places, products]) => {
        if (!cancelled) {
          setCategoryPlaces(places);
          setCategoryProducts(products);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCategoryPlaces(null);
          setCategoryProducts(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [category, data?.products]);

  const visible = useMemo(() => {
    if (!data) {
      return [];
    }

    if (category !== "todo" && categoryPlaces) {
      return categoryPlaces;
    }

    return filterByCategory(data.restaurants, category);
  }, [data, category, categoryPlaces]);

  const visibleProducts = useMemo(() => {
    if (!data) return [];
    if (category !== "todo" && categoryProducts) return categoryProducts;
    const visibleStoreIds = new Set(visible.map((restaurant) => restaurant.id));
    return data.products.filter((product) => visibleStoreIds.has(product.restaurantId));
  }, [data, category, categoryProducts, visible]);

  if (loading || !data) {
    return (
      <ClientShell>
        <div aria-busy="true" aria-label="Cargando inicio">
          <HomeSkeleton counts={counts} />
        </div>
      </ClientShell>
    );
  }

  return (
    <ClientShell>
      <motion.div
        className={styles.stack}
        initial={reduceMotion ? false : "hidden"}
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.07 } } }}
      >
        <motion.header className={styles.header} variants={fadeUp}>
          <h1 className={styles.greeting}>
            {greeting}
            {firstName ? (
              <>
                , <span className={styles.greetingName}>{firstName}</span>
              </>
            ) : null}
          </h1>
          <p className={styles.tagline}>¿Qué se te antoja hoy?</p>
        </motion.header>

        <motion.div variants={fadeUp}>
          <CategoryRail categories={data.categories} active={category} onSelect={setCategory} />
        </motion.div>

        <motion.div variants={fadeUp}>
          <AdCarousel ads={data.ads} restaurants={data.restaurants} />
        </motion.div>

        {category === "todo" ? (
          <motion.section variants={fadeUp} aria-labelledby="stores-heading">
            <div className={styles.sectionHead}>
              <h2 id="stores-heading" className={styles.sectionTitle}>Tiendas</h2>
              <span className={styles.sectionCount}>{visible.length}</span>
            </div>
            <div className={styles.grid}>
              {visible.map((restaurant) => (
                <RestaurantCard
                  key={restaurant.id}
                  restaurant={restaurant}
                  favorite={isFavorite(restaurant.id)}
                  onToggleFavorite={toggle}
                />
              ))}
            </div>
          </motion.section>
        ) : null}

        <motion.section variants={fadeUp} aria-live="polite">
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Platillos disponibles</h2>
            <motion.span
              key={visibleProducts.length}
              className={styles.sectionCount}
              initial={reduceMotion ? false : { scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
            >
              {visibleProducts.length}
            </motion.span>
          </div>
        </motion.section>

        <motion.div className={styles.menuGrid} layout={!reduceMotion} variants={fadeUp}>
          <AnimatePresence mode="popLayout" initial={false}>
            {visibleProducts.map((product) => {
              const restaurant = data.restaurants.find((place) => place.id === product.restaurantId);
              return (
                <motion.article
                  key={product.id}
                  className={styles.menuCard}
                  layout={!reduceMotion}
                  initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                >
                  <Link href={itemPath(product.slug)} className={styles.menuLink}>
                    <div className={styles.menuImage}>
                      {product.image ? (
                        <Image src={product.image} alt="" fill sizes="(max-width: 620px) 46vw, (max-width: 1000px) 30vw, 240px" className={styles.menuImageAsset} />
                      ) : (
                        <FoodIcon glyph={product.glyph} className={styles.menuImageIcon} />
                      )}
                    </div>
                    <div className={styles.menuCopy}>
                      <p className={styles.menuStore}>{restaurant?.name ?? "Menú"}</p>
                      <h3>{product.name}</h3>
                      <p className={styles.menuDescription}>{product.description}</p>
                      <strong>{formatMxn(product.price)}</strong>
                    </div>
                  </Link>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </motion.div>

        <AnimatePresence>
          {visibleProducts.length === 0 ? (
            <motion.div
              key="empty"
              className={styles.empty}
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <FoodIcon glyph="plate" className={styles.emptyIcon} />
              <h3 className={styles.emptyTitle}>Nada por aquí todavía</h3>
              <p className={styles.emptyCopy}>Prueba con otra categoría o explora todo el campus.</p>
              <button type="button" className={styles.emptyReset} onClick={() => setCategory("todo")}>
                Ver todo
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>

      </motion.div>
    </ClientShell>
  );
}
