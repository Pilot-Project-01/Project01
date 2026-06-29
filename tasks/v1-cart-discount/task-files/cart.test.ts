// cart.test.ts
import { applyDiscount } from "./cart";

describe("applyDiscount", () => {
  it("applies a 10% discount", () => {
    const cart = {
      items: [{ name: "Notebook", price: 10, quantity: 1 }],
      total: 0,
    };
    expect(applyDiscount(cart, ["SAVE10"])).toBe(9);
  });
});
