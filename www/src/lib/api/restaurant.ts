import { apiFetch } from "./client";

export type RestaurantProduct = {
  id: string;
  nombre: string;
  descripcion?: string;
  precio: number;
  stock: number;
  categoria?: string;
  activo: boolean;
  tiendaId: string;
};

export type RestaurantStatus = {
  id: string;
  nombre: string;
  aceptaPedidos: boolean;
  ultimaConexion?: string;
};

function storePath(tiendaId: string) {
  return `/api/restaurants/${encodeURIComponent(tiendaId)}`;
}

export function fetchRestaurantInventory(tiendaId: string) {
  return apiFetch<RestaurantProduct[]>(`${storePath(tiendaId)}/inventory`);
}

export function fetchRestaurantStatus(tiendaId: string) {
  return apiFetch<RestaurantStatus>(storePath(tiendaId));
}

export function updateRestaurantProduct(
  tiendaId: string,
  productoId: string,
  update: { stock?: number; activo?: boolean },
) {
  return apiFetch<RestaurantProduct>(
    `${storePath(tiendaId)}/inventory/${encodeURIComponent(productoId)}`,
    { method: "PATCH", body: JSON.stringify(update) },
  );
}

export function updateRestaurantOrders(tiendaId: string, aceptaPedidos: boolean) {
  return apiFetch<RestaurantStatus>(`${storePath(tiendaId)}/orders`, {
    method: "PATCH",
    body: JSON.stringify({ aceptaPedidos }),
  });
}

export function sendRestaurantHeartbeat(tiendaId: string) {
  return apiFetch<void>(`${storePath(tiendaId)}/heartbeat`, { method: "POST" });
}
