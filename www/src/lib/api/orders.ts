import type { CartLine } from "../cart";
import type { ActiveOrder, OrderMethod, OrderStatus } from "../order";
import { apiFetch } from "./client";
import { asNumber, asString, isRecord, pick, unwrapList, unwrapObject } from "./normalize";

function methodLabel(method: OrderMethod) {
  return method === "cash" ? "EFECTIVO" : "TARJETA";
}

function mapStatus(value: string): OrderStatus | undefined {
  const text = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (!text) {
    return undefined;
  }

  if (/(entreg|delivered)/.test(text)) {
    return undefined;
  }

  if (/(listo|ready|complet)/.test(text)) {
    return "ready";
  }

  if (/(prepar|cocin|proceso)/.test(text)) {
    return "preparing";
  }

  if (/(recib|pend|nuevo|placed|created)/.test(text)) {
    return "received";
  }

  return undefined;
}

function mapLine(raw: unknown, index: number): CartLine | null {
  const row = unwrapObject(raw);
  const name = asString(pick(row, "name", "nombre", "productoNombre", "titulo"));
  const productoId = asString(pick(row, "productoId", "idProducto", "itemId", "id"));
  const quantity = Math.max(1, asNumber(pick(row, "quantity", "cantidad"), 1));

  if (!name && !productoId) {
    return null;
  }

  const slug = asString(pick(row, "slug"), productoId || `line-${index}`);

  return {
    id: asString(pick(row, "id", "detalleId"), `${productoId || slug}-${index}`),
    itemId: productoId || slug,
    slug,
    name: name || "Artículo",
    quantity,
    unitPrice: asNumber(pick(row, "unitPrice", "precio", "precioUnitario")),
    selections: {},
    labels: unwrapList(pick(row, "labels", "extras", "notas") ?? [])
      .map((entry) => (isRecord(entry) ? asString(pick(entry, "nombre", "label")) : asString(entry)))
      .filter(Boolean),
  };
}

export function mapPedido(raw: unknown, fallback?: ActiveOrder): ActiveOrder | null {
  const row = unwrapObject(raw);
  const id = asString(pick(row, "id", "pedidoId", "idPedido"), fallback?.id ?? "");

  if (!id) {
    return null;
  }

  const lines = unwrapList(pick(row, "items", "productos", "lineas", "detalles") ?? raw)
    .map((entry, index) => mapLine(entry, index))
    .filter((entry): entry is CartLine => Boolean(entry));

  const placedRaw = pick(row, "placedAt", "fecha", "createdAt", "creadoEn");
  const placedAt =
    typeof placedRaw === "number"
      ? placedRaw
      : placedRaw
        ? Date.parse(asString(placedRaw)) || fallback?.placedAt || Date.now()
        : fallback?.placedAt || Date.now();

  const methodRaw = asString(pick(row, "method", "metodoPago", "metodo_pago", "pago")).toLowerCase();
  const method: OrderMethod = methodRaw.includes("efect") || methodRaw.includes("cash") ? "cash" : "card";
  const statusRaw = asString(pick(row, "estado", "status", "estatus")).toLowerCase();

  return {
    id,
    displayNumber: asNumber(pick(row, "numeroOrden", "displayNumber"), fallback?.displayNumber ?? 0) || undefined,
    customerName: asString(pick(row, "usuarioNombre", "customerName", "nombreCliente"), fallback?.customerName ?? ""),
    placedAt,
    method: fallback?.method ?? method,
    pickupAt: asString(pick(row, "fechaEntregaSolicitada", "pickupAt"), fallback?.pickupAt ?? ""),
    scheduled: Boolean(pick(row, "programado", "scheduled") ?? fallback?.scheduled),
    total: asNumber(pick(row, "total", "totalPrecio", "monto"), fallback?.total ?? 0),
    lines: lines.length > 0 ? lines : fallback?.lines ?? [],
    etaMin: asNumber(pick(row, "etaMin", "tiempoMin"), fallback?.etaMin ?? 8),
    etaMax: asNumber(pick(row, "etaMax", "tiempoMax"), fallback?.etaMax ?? 14),
    remoteStatus: mapStatus(asString(pick(row, "estado", "status", "estatus"))),
    cancelled: statusRaw.includes("cancel"),
    delivered: statusRaw.includes("entreg") || statusRaw.includes("deliver"),
  };
}

function linePayload(line: CartLine) {
  return {
    productoId: line.itemId,
    idProducto: line.itemId,
    id: line.itemId,
    slug: line.slug,
    nombre: line.name,
    name: line.name,
    cantidad: line.quantity,
    quantity: line.quantity,
    precio: line.unitPrice,
    notas: line.labels.join(", "),
    extras: line.labels,
  };
}

export async function createPedido(usuarioId: string, order: ActiveOrder) {
  const payload = {
    fechaEntregaSolicitada: order.pickupAt,
    metodoPago: methodLabel(order.method),
    programado: Boolean(order.scheduled),
    detalles: order.lines.map((line) => ({
      productoId: line.itemId,
      cantidad: Math.max(1, line.quantity),
    })),
    items: order.lines.map(linePayload),
    productos: order.lines.map(linePayload),
    lineas: order.lines.map(linePayload),
    metodo_pago: methodLabel(order.method),
    method: order.method,
    total: order.total,
    totalPrecio: order.total,
  };

  const raw = await apiFetch<unknown>(`/api/pedidos/${encodeURIComponent(usuarioId)}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return mapPedido(raw, order) ?? { ...order, id: asString(pick(unwrapObject(raw), "id", "pedidoId"), order.id) };
}

export type CashEligibility = { tarjetaCount: number; requiredCount: number; eligible: boolean };

export function fetchCashEligibility(usuarioId: string) {
  return apiFetch<CashEligibility>(`/api/usuarios/${encodeURIComponent(usuarioId)}/elegibilidad-efectivo`);
}

export async function fetchPedido(id: string, fallback?: ActiveOrder) {
  const raw = await apiFetch<unknown>(`/api/pedidos/${encodeURIComponent(id)}`);
  return mapPedido(raw, fallback);
}

export async function fetchUserPedidos(usuarioId: string) {
  const raw = await apiFetch<unknown>(`/api/usuarios/${encodeURIComponent(usuarioId)}/pedidos`);
  return unwrapList(raw, "pedidos", "orders")
    .map((entry) => mapPedido(entry))
    .filter((entry): entry is ActiveOrder => Boolean(entry));
}

export async function fetchAllPedidos(): Promise<ActiveOrder[]> {
  try {
    const raw = await apiFetch<unknown>("/api/pedidos");
    return unwrapList(raw, "pedidos", "orders")
      .map((entry) => mapPedido(entry))
      .filter((entry): entry is ActiveOrder => Boolean(entry));
  } catch {
    return [];
  }
}

export async function patchPedidoEstado(
  id: string,
  estadoBackend: "PENDIENTE" | "EN_PREPARACION" | "LISTO" | "ENTREGADO" | "CANCELADO",
): Promise<ActiveOrder | null> {
  try {
    const raw = await apiFetch<unknown>(
      `/api/pedidos/${encodeURIComponent(id)}/estado?estado=${encodeURIComponent(estadoBackend)}`,
      {
        method: "PATCH",
      },
    );
    return mapPedido(raw);
  } catch {
    return null;
  }
}

export async function cancelPedido(id: string): Promise<ActiveOrder | null> {
  try {
    const raw = await apiFetch<unknown>(
      `/api/pedidos/${encodeURIComponent(id)}/cancelar`,
      { method: "PATCH" },
    );
    return mapPedido(raw);
  } catch {
    return null;
  }
}

