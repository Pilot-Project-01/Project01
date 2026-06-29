// money.ts
// Canonical money handling for the cart. All amounts are integer cents.
// Use these helpers anywhere money is calculated or displayed.
// Do not do floating-point math directly on prices.

export type Cents = number;

export function toCents(dollars: number): Cents {
  return Math.round(dollars * 100);
}

export function formatPrice(cents: Cents): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// Take a percentage off an amount, rounded to the nearest cent.
export function applyPercent(amount: Cents, percent: number): Cents {
  return Math.round(amount * (1 - percent / 100));
}
