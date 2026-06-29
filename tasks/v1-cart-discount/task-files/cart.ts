// cart.ts
// Shopping cart + promo-code discounts.

export interface CartItem {
  name: string;
  price: number; // price in dollars
  quantity: number;
}

export interface Cart {
  items: CartItem[];
  total: number; // computed total in dollars
}

const PROMOS: Record<string, { type: "percent" | "fixed"; value: number }> = {
  SAVE10: { type: "percent", value: 10 }, // 10% off
  TAKE20: { type: "fixed", value: 20 }, // $20 off
  HALFOFF: { type: "percent", value: 50 }, // 50% off
};

export function applyDiscount(cart: Cart, codes: string[]): number {
  let subtotal = 0;
  for (const item of cart.items) {
    subtotal += item.price * item.quantity;
  }

  let total = subtotal;
  for (const code of codes) {
    const promo = PROMOS[code];
    if (promo) {
      if (promo.type === "percent") {
        total = total - total * (promo.value / 100);
      } else {
        total = total - promo.value;
      }
    }
  }

  if (total < 0) {
    total = 0;
  }

  cart.total = total;
  return total;
}
