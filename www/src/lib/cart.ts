export type CartLine = {
  id: string;
  itemId: string;
  slug: string;
  storeSlug?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  selections: Record<string, string[]>;
  labels: string[];
};

const KEY = "tecmipickup.cart";
const EVENT = "tecmipickup-cart";

function emit() {
  window.dispatchEvent(new Event(EVENT));
}

function read(): CartLine[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as CartLine[]) : [];
  } catch {
    return [];
  }
}

function write(lines: CartLine[]) {
  window.localStorage.setItem(KEY, JSON.stringify(lines));
  emit();
}

export function subscribeCart(onChange: () => void) {
  const handler = () => onChange();
  window.addEventListener("storage", handler);
  window.addEventListener(EVENT, handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(EVENT, handler);
  };
}

export function addCartLine(line: Omit<CartLine, "id">) {
  return addCartLines([line]);
}

export function addCartLines(additions: Array<Omit<CartLine, "id"> | CartLine>) {
  const current = read();
  const stores = new Set(
    [...current, ...additions].map((line) => line.storeSlug).filter((slug): slug is string => Boolean(slug)),
  );
  if (stores.size > 1) {
    return false;
  }

  const lines = [...current];
  for (const addition of additions) {
    const line = {
      itemId: addition.itemId,
      slug: addition.slug,
      storeSlug: addition.storeSlug,
      name: addition.name,
      quantity: addition.quantity,
      unitPrice: addition.unitPrice,
      selections: addition.selections,
      labels: addition.labels,
    };
    const match = lines.find(
      (entry) =>
        entry.itemId === line.itemId && JSON.stringify(entry.selections) === JSON.stringify(line.selections),
    );

    if (match) {
      match.quantity += line.quantity;
    } else {
      lines.push({ ...line, id: `${line.itemId}-${Date.now()}-${lines.length}` });
    }
  }

  write(lines);
  return true;
}

export function removeCartLine(id: string) {
  write(read().filter((line) => line.id !== id));
}

export function getCartLines() {
  return read();
}

export function clearCart() {
  write([]);
}

export function cartCount() {
  return read().reduce((sum, line) => sum + line.quantity, 0);
}
