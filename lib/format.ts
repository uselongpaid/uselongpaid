// Number formatting that gives the same text on the server and in every browser (Intl's compact notation differs
// between ICU versions, which breaks hydration).

const trim = (s: string) => (s.includes(".") ? s.replace(/\.?0+$/, "") : s);

export function groupInt(n: number): string {
  const s = Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return n < 0 ? `-${s}` : s;
}

export function fmtUsd(n: number | null | undefined, compact = true): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a > 0 && a < 0.01) return `${sign}$${trim(a.toPrecision(3))}`;
  if (a < 1) return `${sign}$${trim(a.toFixed(4))}`;
  if (compact && a >= 10_000) {
    for (const [v, u] of [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]] as const) {
      if (a >= v) return `${sign}$${trim((a / v).toFixed(2))}${u}`;
    }
  }
  const [i, f] = a.toFixed(2).split(".");
  return `${sign}$${groupInt(Number(i))}.${f}`;
}
