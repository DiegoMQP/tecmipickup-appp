import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cancelPedido, fetchPedido } from "@lib/api";
import {
  applyRemoteOrder,
  getActiveOrder,
  orderMods,
  orderReadyAt,
  orderStatus,
  pickupAbsoluteUrl,
  clearOrder,
  statusCopy,
  subscribeOrder,
  type ActiveOrder,
  type OrderStatus,
} from "@lib/order";
import { formatMxn } from "@lib/data/menu";
import { getCatalogRestaurants } from "@lib/catalogStore";
import { getMenuItem, restaurantOf } from "@lib/data/menu";
import CutleryQr from "./CutleryQr";
import { OrderStatusIcon } from "./OrderStatusIcons";
import styles from "./OrderIsland.module.css";

const spring = { type: "spring" as const, stiffness: 380, damping: 32 };

function countItems(order: ActiveOrder) {
  return order.lines.reduce((sum, line) => sum + line.quantity, 0);
}

function restaurantName(order: ActiveOrder) {
  for (const line of order.lines) {
    const placeBySlug = getCatalogRestaurants().find((place) => place.slug === line.storeSlug);
    if (placeBySlug) return placeBySlug.name;
    const item = getMenuItem(line.slug);
    const place = item ? restaurantOf(item, getCatalogRestaurants()) : null;
    if (place) return place.name;
  }
  return "Restaurante";
}

function formatRemain(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes <= 0) {
    return `${seconds}s`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function OrderIsland() {
  const reduceMotion = useReducedMotion();
  const detailsId = useId();
  const qrCloseRef = useRef<HTMLButtonElement>(null);
  const cancellationNoticeOrderRef = useRef<string | null>(null);
  const [order, setOrder] = useState<ActiveOrder | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [isPhone, setIsPhone] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showCancellationNotice, setShowCancellationNotice] = useState(false);

  useEffect(() => {
    setOrder(getActiveOrder());
    return subscribeOrder(() => setOrder(getActiveOrder()));
  }, []);

  useEffect(() => {
    const openOrder = () => setOpen(true);
    window.addEventListener("tecmipickup-open-order", openOrder);
    return () => window.removeEventListener("tecmipickup-open-order", openOrder);
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 640px), ((hover: none) and (pointer: coarse))");
    const update = () => setIsPhone(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const qrFullscreen = qrOpen && isPhone;

  useEffect(() => {
    if (!qrFullscreen) {
      return;
    }

    const previous = document.activeElement as HTMLElement | null;
    qrCloseRef.current?.focus();

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setQrOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [qrFullscreen]);

  useEffect(() => {
    if (!order) {
      return;
    }

    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [order]);

  useEffect(() => {
    if (!order) {
      cancellationNoticeOrderRef.current = null;
      return;
    }
    if (cancellationNoticeOrderRef.current === order.id) return;

    const pickupTime = order.pickupAt ? new Date(order.pickupAt).getTime() : Number.POSITIVE_INFINITY;
    if (order.scheduled && pickupTime - now <= 30 * 60_000) {
      cancellationNoticeOrderRef.current = order.id;
      setShowCancelConfirm(false);
      setShowCancellationNotice(true);
    }
  }, [order, now]);

  useEffect(() => {
    if (!order?.id) {
      return;
    }

    const orderId = order.id;
    let cancelled = false;

    const refresh = async () => {
      try {
        const current = getActiveOrder();
        if (!current || current.id !== orderId) {
          return;
        }

        if (!orderId.startsWith("ord-")) {
          const remote = await fetchPedido(orderId, current);
          if (!cancelled && remote) {
            if (remote.cancelled || remote.delivered) {
              applyRemoteOrder(remote);
              clearOrder();
              setOrder(null);
            } else {
              applyRemoteOrder(remote);
            }
          }
        }
      } catch {
        // El temporizador local sigue mostrando el estado.
      }
    };

    void refresh();
    const poll = window.setInterval(() => void refresh(), 2_500);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [order?.id]);

  if (!order) {
    return null;
  }

  const status: OrderStatus = orderStatus(order, now);
  const cancelBlockedByReady = status === "ready" && (!order.scheduled || order.remoteStatus === "ready");
  const copy = statusCopy[status];
  const items = countItems(order);
  const expanded = open || qrOpen;
  const remainMs = Math.max(0, orderReadyAt(order) - now);
  const pickupCode = order.displayNumber ? String(order.displayNumber).padStart(4, "0") : "----";
  const minutesToPickup = order.pickupAt ? new Date(order.pickupAt).getTime() - now : Number.POSITIVE_INFINITY;
  const cancellationWindowClosed = Boolean(order.scheduled && minutesToPickup <= 30 * 60_000);

  async function cancelCurrentOrder() {
    const currentOrder = order;
    if (!currentOrder || cancelBusy || cancellationWindowClosed || cancelBlockedByReady) return;
    setCancelBusy(true);
    setCancelError("");
    const isBackendOrder = /^[0-9a-f]{24}$/i.test(currentOrder.id);
    const cancelledOrder = isBackendOrder
      ? await cancelPedido(currentOrder.id)
      : { ...currentOrder, cancelled: true };
    if (!cancelledOrder) {
      setCancelError("No se pudo cancelar. El pedido puede estar listo o dentro del límite de cancelación.");
      setCancelBusy(false);
      return;
    }
    applyRemoteOrder({ ...cancelledOrder, cancelled: true });
    clearOrder();
    setOrder(null);
    setShowCancelConfirm(false);
    setCancelBusy(false);
  }

  function collapse() {
    if (qrOpen) {
      return;
    }
    setOpen(false);
  }

  function onToggle() {
    if (qrOpen) {
      setOpen(false);
      return;
    }

    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      return;
    }
    setOpen((value) => !value);
  }

  return (
    <>
      <div className={styles.wrap}>
      <motion.div
        className={`${styles.pill} ${expanded ? styles.pillOpen : ""}`}
        layout
        transition={reduceMotion ? { duration: 0.2 } : spring}
        onPointerEnter={() => setOpen(true)}
        onPointerLeave={collapse}
        onFocusCapture={() => setOpen(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            collapse();
          }
        }}
      >
        <button
          type="button"
          className={styles.summary}
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={onToggle}
        >
          <span className={`${styles.icon} ${styles[`icon_${status}`]}`}>
            <OrderStatusIcon status={status} className={styles.iconSvg} />
          </span>
          <span className={styles.summaryCopy}>
            <span className={styles.status}>{copy.short}</span>
            {!expanded ? (
              <span className={styles.meta}>
                {items} {items === 1 ? "artículo" : "artículos"}
                {status === "ready" ? " · Pasa a recoger" : ` · ${formatRemain(remainMs)}`}
              </span>
            ) : null}
          </span>
        </button>

        <AnimatePresence initial={false}>
          {expanded ? (
            <motion.div
              id={detailsId}
              className={styles.details}
              initial={reduceMotion ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
              transition={reduceMotion ? { duration: 0.15 } : { duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            >
              <p className={styles.long}>{copy.long}</p>
              <p className={styles.restaurantName}>{restaurantName(order)}</p>
              <p className={styles.eta}>
                Preparación estimada · 10–15 min
                {order.pickupAt ? ` · Recolección ${new Date(order.pickupAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}` : ""} ·{" "}
                {order.method === "cash" ? "Efectivo" : "Tarjeta"}
              </p>
              {cancellationWindowClosed ? (
                <p className={styles.cancelHint} role="status">Ya no es posible cancelar: faltan 30 minutos o menos para la recolección.</p>
              ) : !cancelBlockedByReady ? (
                <button type="button" className={styles.cancelButton} disabled={cancelBusy} onClick={() => setShowCancelConfirm(true)}>
                  Cancelar pedido
                </button>
              ) : null}
              {cancelError ? <p className={styles.cancelHint} role="alert">{cancelError}</p> : null}

              {qrOpen && !isPhone ? (
                <>
                  <CutleryQr
                    value={pickupAbsoluteUrl(order)}
                    label={`Código QR del pedido ${order.displayNumber ?? ""}`}
                  />
                  <p className={styles.pickupCode}>Código de entrega <strong>{pickupCode}</strong></p>
                </>
              ) : (
                <>
                  <ul className={styles.lines}>
                    {order.lines.map((line) => {
                      const mods = orderMods(line);

                      return (
                        <li key={line.id}>
                          <div className={styles.lineTop}>
                            <span>
                              {line.quantity}× {line.name}
                            </span>
                            <span className={styles.linePrice}>{formatMxn(line.unitPrice * line.quantity)}</span>
                          </div>
                          {mods.length === 0 ? <p className={styles.place}>Sin extras</p> : null}
                          {mods.map((mod) => (
                            <p key={mod.title} className={styles.mod}>
                              <strong>{mod.title}.</strong> {mod.values.join(", ")}
                            </p>
                          ))}
                        </li>
                      );
                    })}
                  </ul>

                  <p className={styles.total}>
                    <span>Total</span>
                    <span>{formatMxn(order.total)}</span>
                  </p>
                </>
              )}

              <button
                type="button"
                className={styles.dismiss}
                onClick={(event) => {
                  event.stopPropagation();
                  setQrOpen((value) => !value);
                }}
              >
                {qrOpen && !isPhone ? "Ocultar código" : "Ver código"}
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
      </div>

      <AnimatePresence>
        {showCancelConfirm ? (
          <motion.div
            className={styles.cancelBackdrop}
            role="presentation"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { if (!cancelBusy) setShowCancelConfirm(false); }}
          >
            <motion.section
              className={styles.cancelDialog}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="cancel-order-title"
              aria-describedby="cancel-order-copy cancel-refund-copy"
              initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              onClick={(event) => event.stopPropagation()}
            >
              <h2 id="cancel-order-title">¿Cancelar este pedido?</h2>
              <p id="cancel-order-copy">Se cancelarán los artículos de {restaurantName(order)}.</p>
              <p id="cancel-refund-copy">Si corresponde un reembolso, puede tardar de 1 a 5 días hábiles en reflejarse según tu banco.</p>
              {cancelError ? <p className={styles.cancelHint} role="alert">{cancelError}</p> : null}
              <div className={styles.cancelActions}>
                <button type="button" className={styles.cancelKeep} disabled={cancelBusy} onClick={() => setShowCancelConfirm(false)}>
                  Conservar pedido
                </button>
                <button type="button" className={styles.cancelConfirm} disabled={cancelBusy} onClick={() => void cancelCurrentOrder()}>
                  {cancelBusy ? "Cancelando…" : "Confirmar cancelación"}
                </button>
              </div>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showCancellationNotice ? (
          <motion.div
            className={styles.cancelBackdrop}
            role="presentation"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.section
              className={styles.cancelDialog}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="cancellation-window-title"
              aria-describedby="cancellation-window-copy"
              initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
            >
              <h2 id="cancellation-window-title">Ya no puedes cancelar este pedido</h2>
              <p id="cancellation-window-copy">
                Los pedidos agendados solo se pueden cancelar hasta 30 minutos antes de la hora de recolección.
              </p>
              <button
                type="button"
                className={styles.cancellationNoticeButton}
                onClick={() => setShowCancellationNotice(false)}
              >
                Entendido
              </button>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {qrFullscreen ? (
          <motion.div
            className={styles.qrScreen}
            role="dialog"
            aria-modal="true"
            aria-label={`Código QR del pedido ${order.displayNumber ?? ""}`}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className={styles.qrHead}>
              <div className={styles.qrHeadCopy}>
                <span className={styles.qrTitle}>{copy.short}</span>
                <span className={styles.qrMeta}>Pedido #{order.displayNumber ?? "—"}</span>
              </div>
              <button
                ref={qrCloseRef}
                type="button"
                className={styles.qrClose}
                aria-label="Cerrar código QR"
                onClick={() => setQrOpen(false)}
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <CutleryQr
              fullscreen
              value={pickupAbsoluteUrl(order)}
              label={`Código QR del pedido ${order.displayNumber ?? ""}`}
            />

            <p className={styles.pickupCode}>Código de entrega <strong>{pickupCode}</strong></p>

            <p className={styles.qrFoot}>
              {items} {items === 1 ? "artículo" : "artículos"} · {formatMxn(order.total)} ·{" "}
              {order.method === "cash" ? "Efectivo" : "Tarjeta"}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
