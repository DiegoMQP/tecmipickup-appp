import { getCatalogRestaurants, setCatalog } from "../catalogStore";
import type { MenuItem } from "../data/menu";
import type { Ad, Category, Restaurant } from "../data/restaurants";
import { apiFetch } from "./client";
import {
  applySchedule,
  mapAds,
  mapCategories,
  mapProducts,
  mapRestaurants,
  restaurantsFromProducts,
} from "./mappers";

export type CatalogHome = {
  categories: Category[];
  restaurants: Restaurant[];
  ads: Ad[];
  products: MenuItem[];
};

function hydrate(items: MenuItem[], places: Restaurant[]) {
  setCatalog(items, places);
}

export async function fetchCategorias(): Promise<Category[]> {
  return mapCategories(await apiFetch<unknown>("/api/categorias"));
}

export async function fetchProductos(): Promise<MenuItem[]> {
  return mapProducts(await apiFetch<unknown>("/api/productos", { cache: "no-store" }));
}

export async function fetchTiendas(): Promise<Restaurant[]> {
  return mapRestaurants(await apiFetch<unknown>("/api/tiendas", { cache: "no-store" }));
}

export async function fetchProductosByTienda(tiendaId: string): Promise<MenuItem[]> {
  const items = mapProducts(
    await apiFetch<unknown>(`/api/tiendas/${encodeURIComponent(tiendaId)}/productos`, { cache: "no-store" }),
  );
  hydrate(items, restaurantsFromProducts(items));
  return items;
}

export async function fetchProductosByCategoria(categoriaId: string): Promise<MenuItem[]> {
  const items = mapProducts(await apiFetch<unknown>(`/api/productos/categoria/${encodeURIComponent(categoriaId)}`, { cache: "no-store" }));
  const stores = await fetchTiendas();
  hydrate(items, stores);
  return items;
}

export async function fetchHorarios() {
  return apiFetch<unknown>("/api/horarios");
}

export async function fetchHomeFromApi(): Promise<CatalogHome> {
  const [homeResult, categoriasResult, productosResult, horariosResult] = await Promise.allSettled([
    apiFetch<unknown>("/api/home", { cache: "no-store" }),
    apiFetch<unknown>("/api/categorias", { cache: "no-store" }),
    apiFetch<unknown>("/api/productos", { cache: "no-store" }),
    apiFetch<unknown>("/api/horarios", { cache: "no-store" }),
  ]);

  const home = homeResult.status === "fulfilled" ? homeResult.value : null;
  const categoriasRaw = categoriasResult.status === "fulfilled" ? categoriasResult.value : home;
  const productosRaw = productosResult.status === "fulfilled" ? productosResult.value : home;
  const horariosRaw = horariosResult.status === "fulfilled" ? horariosResult.value : home;

  const categories = mapCategories(categoriasRaw ?? home);
  const products = mapProducts(productosRaw ?? home);
  const listed = mapRestaurants(home);
  const scheduledPlaces = applySchedule(
    listed.length > 0 ? listed : restaurantsFromProducts(products, categories),
    horariosRaw,
  );
  const places = scheduledPlaces.map((place) => {
    const featured = products.find((product) => product.restaurantId === place.id && product.image)
      ?? products.find((product) => product.restaurantId === place.id);
    return featured ? { ...place, featuredSlug: featured.slug } : place;
  });
  const ads = mapAds(home, products, places);

  hydrate(products, places);

  return { categories, restaurants: places, ads, products };
}

export async function restaurantsForCategory(categoriaId: string): Promise<Restaurant[]> {
  const items = await fetchProductosByCategoria(categoriaId);
  const storeIds = new Set(items.map((item) => item.restaurantId));
  return getCatalogRestaurants().filter((store) => storeIds.has(store.id));
}
