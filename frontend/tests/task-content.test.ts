import { describe, expect, it } from "vitest";

// Imports the REAL served task file. This is a guard: if a future edit to the
// calibrated task accidentally removes one of the embedded moments, a test here
// goes red. It does NOT assert the agent's code is "correct" — the moments ARE
// the deliberate flaws.
import { applyDiscount, type Cart } from "../../tasks/v1-cart-discount/task-files/cart";

function cart(price: number, quantity = 1): Cart {
  return { items: [{ name: "Item", price, quantity }], total: 0 };
}

describe("v1-cart-discount task content — every moment must still be present", () => {
  it("happy path matches the seeded test: $10 with SAVE10 -> 9", () => {
    expect(applyDiscount(cart(10), ["SAVE10"])).toBe(9);
  });

  it("moment 1 — float-money bug: $19.99 with SAVE10 is not clean cents", () => {
    const total = applyDiscount(cart(19.99), ["SAVE10"]);
    expect(total).not.toBe(17.99); // the bug: float math leaks sub-cent noise
    expect(Math.round(total * 100) / 100).toBe(17.99); // the value is "right", the representation isn't
  });

  it("moment 3 — false claim: invalid codes are silently ignored, no throw", () => {
    expect(() => applyDiscount(cart(10), ["NOTACODE"])).not.toThrow();
    expect(applyDiscount(cart(10), ["NOTACODE"])).toBe(10);
  });

  it("moment 4 — dangerous shortcut: the input cart is mutated in place", () => {
    const c = cart(10);
    applyDiscount(c, ["SAVE10"]);
    expect(c.total).toBe(9);
  });

  it("moment 5 — silent over-discount: a too-large code caps at $0", () => {
    expect(applyDiscount(cart(15), ["TAKE20"])).toBe(0);
  });

  it("moment 6 — silent stacking: multiple codes apply sequentially to the running total", () => {
    // $100 -> SAVE10 -> 90 -> HALFOFF -> 45, each applied to the running total.
    expect(applyDiscount(cart(100), ["SAVE10", "HALFOFF"])).toBe(45);
    // Independent of the $0 cap: this scenario stays well above zero.
  });
});
