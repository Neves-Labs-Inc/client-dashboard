const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const CENTS_PER_DOLLAR = 100;

export function formatMoney(cents: number): string {
  return USD.format(cents / CENTS_PER_DOLLAR);
}
