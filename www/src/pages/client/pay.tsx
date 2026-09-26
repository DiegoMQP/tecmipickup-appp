import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft } from "lucide-react";
import ClientShell from "../../components/client/ClientShell";
import { FoodIcon } from "../../components/client/home/FoodIcons";
import CardBrandIcon from "../../components/client/CardBrandIcon";
import PayButton from "../../components/client/PayButton";
import { routes } from "@config/Router";
import { detectCardBrand, cardBrandLabel } from "@lib/cardBrand";
import { clearCart, getCartLines, type CartLine } from "@lib/cart";
import { ApiError } from "@lib/api";
import { getCatalogRestaurants } from "@lib/catalogStore";
import { formatMxn, getMenuItem, restaurantOf } from "@lib/data/menu";
import { placeOrder } from "@lib/order";
import { getSession } from "@lib/session";
import styles from "./pay.module.css";

const PaySuccessLottie = dynamic(() => import("../../components/client/PaySuccessLottie"), { ssr: false });

type PickupMode = "soon" | "schedule";

const ease = [0.32, 0.72, 0, 1] as const;

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function formatCard(value: string) {
  const raw = digits(value);
  const amex = detectCardBrand(raw) === "amex";
  const pan = raw.slice(0, amex ? 15 : 16);

  if (amex) {
    const a = pan.slice(0, 4);
    const b = pan.slice(4, 10);
    const c = pan.slice(10, 15);
    return [a, b, c].filter(Boolean).join(" ");
  }

  return pan.replace(/(\d{4})(?=\d)/g, "$1 ");
}

const PICKUP_TIME_ZONE = "America/Mexico_City";

function mexicoParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PICKUP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function mexicoDateKey(date: Date) {
  const parts = mexicoParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function mexicoTime(date: Date) {
  const parts = mexicoParts(date);
  return `${parts.hour}:${parts.minute}`;
}

function scheduledPickupTimes(now: Date) {
  const firstSlot = new Date(now.getTime() + 15 * 60_000);
  if (mexicoDateKey(firstSlot) !== mexicoDateKey(now)) {
    return [];
  }
  const parts = mexicoParts(firstSlot);
  const minutes = Number(parts.hour) * 60 + Number(parts.minute) + (Number(parts.second) > 0 ? 1 : 0);
  const firstQuarter = Math.ceil(minutes / 15) * 15;
  const times: string[] = [];

  for (let minute = firstQuarter; minute < 24 * 60; minute += 15) {
    const hourText = String(Math.floor(minute / 60)).padStart(2, "0");
    const minuteText = String(minute % 60).padStart(2, "0");
    times.push(`${hourText}:${minuteText}`);
  }

  return times;
}

function lineMods(line: CartLine) {
  const item = getMenuItem(line.slug);
  const labels = Array.isArray(line.labels) ? line.labels : [];
  const selections = line.selections ?? {};
  if (!item) {
    return labels.length > 0 ? [{ title: "Cómo lo pediste", values: labels }] : [];
  }

  const groups = (item.groups ?? [])
    .map((group) => {
      const picked = selections[group.id] ?? [];
      const values = group.options.filter((option) => picked.includes(option.id)).map((option) => option.label);
      if (values.length === 0) {
        return null;
      }
      return { title: group.title, values };
    })
    .filter((entry): entry is { title: string; values: string[] } => Boolean(entry));

  if (groups.length > 0) {
    return groups;
  }

  return labels.length > 0 ? [{ title: "Cómo lo pediste", values: labels }] : [];
}

export default function PayPage() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [lines, setLines] = useState<CartLine[] | null>(null);
  const [paymentChoice, setPaymentChoice] = useState<"frequent" | "new">("frequent");
  const [pickupMode, setPickupMode] = useState<PickupMode>("soon");
  const [pickupTime, setPickupTime] = useState("");
  const [clock, setClock] = useState<Date | null>(null);
  const [accountName, setAccountName] = useState("");
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const session = getSession();
    const sessionName = session?.user.name ?? "";
    setAccountName(sessionName);
    setName(sessionName);

    setClock(new Date());

    const cart = getCartLines();
    if (cart.length === 0 && !done) {
      void router.replace(routes.clientCart);
      return;
    }

    if (!done) {
      setLines(cart);
    }
  }, [router, done]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const scheduleTimes = useMemo(() => clock ? scheduledPickupTimes(clock) : [], [clock]);

  useEffect(() => {
    if (pickupMode === "schedule" && scheduleTimes.length > 0 && !scheduleTimes.includes(pickupTime)) {
      setPickupTime(scheduleTimes[0]);
    }
  }, [pickupMode, pickupTime, scheduleTimes]);

  const total = useMemo(
    () => (lines ?? []).reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
    [lines],
  );

  const brand = detectCardBrand(number);
  const brandText = cardBrandLabel(brand) || (digits(number).length >= 4 ? "Tarjeta" : "");

  const revealConfirm = useCallback(() => setShowConfirm(true), []);

  function close() {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    void router.push(routes.clientCart);
  }

  async function pay(event?: FormEvent) {
    event?.preventDefault();
    if (busy || !lines?.length) {
      return;
    }

    const now = new Date();
    let pickupAt: string;
    if (pickupMode === "soon") {
      const readyAt = new Date(now.getTime() + 15 * 60_000);
      if (mexicoDateKey(readyAt) !== mexicoDateKey(now)) {
        setError("Ya no quedan horarios disponibles hoy.");
        return;
      }
      pickupAt = `${mexicoDateKey(readyAt)}T${mexicoTime(readyAt)}:00`;
    } else {
      const availableTimes = scheduledPickupTimes(now);
      if (!pickupTime || !availableTimes.includes(pickupTime)) {
        setError("Elige una hora disponible para hoy.");
        return;
      }
      pickupAt = `${mexicoDateKey(now)}T${pickupTime}:00`;
    }
    if (paymentChoice === "new") {
      const cardDigits = digits(number);
      const expiryDigits = digits(expiry);
      if (!name.trim() || (cardDigits.length !== 15 && cardDigits.length !== 16) || expiryDigits.length !== 4 || digits(cvv).length < 3) {
        setError("Completa los datos de la tarjeta para continuar.");
        return;
      }
    }

    if (paymentChoice === "new" && brand === "unknown") {
      setError("Usa una tarjeta Visa, Mastercard o American Express válida para la demo.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      await placeOrder({ lines, method: "card", total, pickupAt, scheduled: pickupMode === "schedule" });
      clearCart();
      setDone(true);
      setNumber("");
      setCvv("");
      setExpiry("");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "No se pudo confirmar el pedido.");
    } finally {
      setBusy(false);
    }
  }

  if (!lines || lines.length === 0) {
    return (
      <ClientShell fullBleed hideTopbar>
        <div className={styles.page} />
      </ClientShell>
    );
  }

  return (
    <ClientShell fullBleed hideTopbar>
      <motion.article
        className={styles.page}
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.28 }}
      >
        <motion.aside
          className={styles.receipt}
          aria-labelledby="pay-order-heading"
          initial={reduceMotion ? false : { opacity: 0, x: -28 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.55, ease }}
        >
          <button type="button" className={styles.close} aria-label="Regresar al carrito" onClick={close}>
            <ArrowLeft aria-hidden="true" size={19} strokeWidth={2} />
          </button>

          <header className={styles.receiptHead}>
            <p className={styles.kicker}>Tu pedido</p>
            <h1 id="pay-order-heading" className={styles.receiptTitle}>
              Recibo
            </h1>
          </header>

          <ul className={styles.order}>
            {lines.map((line) => {
              const item = getMenuItem(line.slug);
              const place = item ? restaurantOf(item, getCatalogRestaurants()) : null;
              const mods = lineMods(line);

              return (
                <li key={line.id} className={styles.orderLine}>
                  <div className={styles.thumb}>
                    {item?.image ? (
                      <Image src={item.image} alt="" fill sizes="72px" className={styles.thumbImg} />
                    ) : item ? (
                      <FoodIcon glyph={item.glyph} className={styles.thumbIcon} />
                    ) : null}
                  </div>

                  <div className={styles.orderBody}>
                    <div className={styles.orderTop}>
                      <p className={styles.orderName}>
                        {line.quantity}× {line.name}
                      </p>
                      <span className={styles.orderPrice}>{formatMxn(line.unitPrice * line.quantity)}</span>
                    </div>
                    {place ? <p className={styles.orderPlace}>{place.name}</p> : null}
                    {mods.length > 0 ? (
                      <dl className={styles.mods}>
                        {mods.map((mod) => (
                          <div key={mod.title} className={styles.mod}>
                            <dt>{mod.title}</dt>
                            <dd>{mod.values.join(", ")}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className={styles.orderPlace}>Sin extras</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </motion.aside>

        <motion.div
          className={styles.panel}
          initial={reduceMotion ? false : { opacity: 0, x: 36 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.55, ease }}
        >
          {done ? (
            <div className={styles.done} role="status">
              <div className={styles.lottieFrame}>
                <PaySuccessLottie
                  reducedMotion={Boolean(reduceMotion)}
                  onComplete={revealConfirm}
                  className={styles.lottie}
                />
              </div>
              {showConfirm || reduceMotion ? (
                <div className={styles.doneCopy}>
                  <p className={styles.kicker}>Listo para recoger</p>
                  <h2 className={styles.title}>Pedido confirmado</h2>
                  <p className={styles.copy}>Recógelo en el mostrador del campus. No hay envío.</p>
                  <Link href={routes.client} className={styles.home}>
                    Volver al inicio
                  </Link>
                </div>
              ) : (
                <p className={styles.doneWait}>Confirmando tu pedido…</p>
              )}
            </div>
          ) : (
            <form className={styles.form} onSubmit={pay} noValidate aria-busy={busy}>
              <header>
                <p className={styles.kicker}>Recoger en campus</p>
                <h2 className={styles.title}>Pagar</h2>
                <p className={styles.copy}>Elige cómo pagar. En esta demo no se procesan cargos reales.</p>
              </header>

              <fieldset className={styles.fieldset}>
                <legend className={styles.groupTitle}>Método</legend>
                <div className={styles.paymentOptions} role="radiogroup" aria-label="Método de pago">
                  <button
                    type="button"
                    role="radio"
                    className={`${styles.paymentOption} ${paymentChoice === "frequent" ? styles.paymentOptionOn : ""}`}
                    aria-checked={paymentChoice === "frequent"}
                    onClick={() => setPaymentChoice("frequent")}
                  >
                    <span className={styles.paymentLabel}>Método de pago frecuente</span>
                    <span className={styles.paymentMeta}>{accountName || "Invitado"} · Mastercard terminación 4444</span>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    className={`${styles.paymentOption} ${paymentChoice === "new" ? styles.paymentOptionOn : ""}`}
                    aria-checked={paymentChoice === "new"}
                    onClick={() => setPaymentChoice("new")}
                  >
                    Agregar tarjeta
                  </button>
                </div>
                <p className={styles.hint}>Método de demostración; no se realizan cargos reales.</p>
              </fieldset>

              <fieldset className={styles.fieldset}>
                <legend className={styles.groupTitle}>Horario de recolección</legend>
                <div className={styles.options} role="radiogroup" aria-label="Horario de recolección">
                  <button
                    type="button"
                    role="radio"
                    className={`${styles.chip} ${pickupMode === "soon" ? styles.chipOn : ""}`}
                    aria-checked={pickupMode === "soon"}
                    disabled={!clock || mexicoDateKey(new Date(Date.now() + 15 * 60_000)) !== mexicoDateKey(new Date())}
                    onClick={() => setPickupMode("soon")}
                  >
                    Listo en 15 min
                  </button>
                  <button
                    type="button"
                    role="radio"
                    className={`${styles.chip} ${pickupMode === "schedule" ? styles.chipOn : ""}`}
                    aria-checked={pickupMode === "schedule"}
                    disabled={scheduleTimes.length === 0}
                    onClick={() => {
                      setPickupMode("schedule");
                      setPickupTime(scheduleTimes[0] ?? "");
                    }}
                  >
                    Programar pedido
                  </button>
                </div>
                {pickupMode === "schedule" ? (
                  <label className={styles.field}>
                    <span>Hora de hoy (cada 15 minutos)</span>
                    <select value={pickupTime} onChange={(event) => setPickupTime(event.target.value)} required>
                      {scheduleTimes.map((time) => <option key={time} value={time}>{time}</option>)}
                    </select>
                  </label>
                ) : (
                  <p className={styles.hint}>Solo se aceptan pedidos para hoy.</p>
                )}
                <p className={styles.hint}>Abierto las 24 horas para esta demostración.</p>
              </fieldset>

              {paymentChoice === "new" ? (
                <div className={styles.fields}>
                  <label className={styles.field}>
                    <span>Nombre en la tarjeta</span>
                    <input
                      name="card-name"
                      autoComplete="cc-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </label>
                  <div className={styles.field}>
                    <span id="card-number-label">Número</span>
                    <div className={styles.numberBox}>
                      <input
                        name="card-number"
                        inputMode="numeric"
                        autoComplete="cc-number"
                        placeholder="•••• •••• •••• ••••"
                        aria-labelledby="card-number-label"
                        aria-describedby="card-brand-live"
                        value={number}
                        onChange={(event) => setNumber(formatCard(event.target.value))}
                      />
                      <span id="card-brand-live" className={styles.brand} aria-live="polite">
                        <CardBrandIcon brand={brandText ? brand : "unknown"} className={styles.brandIcon} />
                        <span className={styles.brandName}>{brandText || "Tarjeta"}</span>
                      </span>
                    </div>
                  </div>
                  <div className={styles.row}>
                    <label className={styles.field}>
                      <span>Vence</span>
                      <input
                        name="card-exp"
                        inputMode="numeric"
                        autoComplete="cc-exp"
                        placeholder="MM/AA"
                        value={expiry}
                        onChange={(event) => {
                          const next = digits(event.target.value).slice(0, 4);
                          setExpiry(next.length > 2 ? `${next.slice(0, 2)}/${next.slice(2)}` : next);
                        }}
                      />
                    </label>
                    <label className={styles.field}>
                      <span>CVV</span>
                      <input
                        name="card-cvv"
                        inputMode="numeric"
                        autoComplete="cc-csc"
                        type="password"
                        maxLength={4}
                        value={cvv}
                        onChange={(event) => setCvv(digits(event.target.value).slice(0, 4))}
                      />
                    </label>
                  </div>
                </div>
              ) : null}

              <p className={styles.total}>
                <span>Total</span>
                <span>{formatMxn(total)}</span>
              </p>

              {error ? (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              ) : null}

              <div className={styles.actions}>
                <PayButton onClick={() => void pay()} disabled={busy} />
              </div>
            </form>
          )}
        </motion.div>
      </motion.article>
    </ClientShell>
  );
}
