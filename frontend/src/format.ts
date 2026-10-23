import { COIN } from "./api";

/** Format an atomic amount (8 decimals) compactly: 1.23M, 45.6K, 0.000123. */
export function amount(atomic: number, maxDecimals = 2): string {
  const v = atomic / COIN;
  const abs = Math.abs(v);
  if (abs >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (abs >= 1e4) return (v / 1e3).toFixed(1) + "K";
  if (abs >= 1) return v.toLocaleString("en-US", { maximumFractionDigits: maxDecimals });
  if (abs === 0) return "0";
  return v.toPrecision(3);
}

/** Price in SAL1 per token (input is SAL1 atomic per whole token). */
export function price(atomicPerToken: number): string {
  const v = atomicPerToken / COIN;
  if (v === 0) return "0";
  if (v >= 1) return v.toFixed(4);
  const s = v.toPrecision(4);
  return s.includes("e") ? v.toFixed(10).replace(/0+$/, "") : s;
}

export function pct(x: number, digits = 1): string {
  return (x * 100).toFixed(digits) + "%";
}

export function ago(ts: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function short(hash: string, n = 6): string {
  return hash.length > 2 * n ? `${hash.slice(0, n)}…${hash.slice(-n)}` : hash;
}
