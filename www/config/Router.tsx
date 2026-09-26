export const routes = {
  auth: "/auth",
  client: "/client",
  clientCart: "/client/cart",
  clientPay: "/client/pay",
  clientSearch: "/client/search",
  clientStore: "/client/store",
  restaurant: "/restaurant",
  restaurantPedidos: "/restaurant/pedidos",
  restaurantInventario: "/restaurant/inventario",
  restaurantHistorial: "/restaurant/historial",
  restaurantGanancias: "/restaurant/ganancias",
  developer: "/developer",
} as const;

export function itemPath(slug: string) {
  return `/client/item/${slug}`;
}

export function storePath(slug: string) {
  return `/client/store/${slug}`;
}

export function pickupPath(id: string) {
  return `/client/pickup/${id}`;
}
