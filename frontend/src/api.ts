export const COIN = 100_000_000;

export type Token = {
  ticker: string;
  name: string;
  description: string;
  has_image: boolean;
  creator: string | null;
  launch_height: number | null;
  created_at: number;
  price: number; // SAL1 atomic per whole token
  market_cap: number; // SAL1 atomic
  reserve: number;
  sold: number;
  progress: number; // towards graduation (80M tokens sold)
  graduated: boolean;
  graduation_height: number | null;
  pool_sal: number; // SAL1 locked in the pool forever
  pool_tokens: number;
  circulating: number;
  volume_24h: number;
  trades: number;
  live: boolean;
  holders_est?: number;
};

export type Trade = {
  tx_hash: string;
  height: number;
  ts: number;
  ticker: string;
  op: "buy" | "sell";
  filled: number;
  amount_in: number;
  amount_out: number;
  price_after: number;
  nickname: string | null;
};

export type Me = {
  nickname: string;
  address: string;
  sal1: { total: number; unlocked: number; blocks_to_unlock: number };
  holdings: { ticker: string; name: string; has_image: boolean; amount: number; unlocked: number; blocks_to_unlock: number; value: number }[];
  trades: Trade[];
  pending: { tx_hash: string; ticker: string; op: string; amount_in: number; created_at: number }[];
  faucet_available_in: number;
  balances_at: number;
};

export type Quote = {
  side: "buy" | "sell";
  amount_in: number;
  filled: boolean;
  amount_out: number;
  fee: number;
  price_before: number;
  price_after: number;
  price_impact: number;
  graduates: boolean; // this buy sells out the curve and creates the pool
};

export type Status = { height: number; indexed: number; block_seconds: number; faucet_amount: number; pr: string };

const KEY = "salcurve.key";

export function getKey(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const key = getKey();
  if (key) headers.set("X-Key", key);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const r = await fetch(path, { ...init, headers });
  if (!r.ok) {
    let msg = `${r.status}`;
    try {
      const j = await r.json();
      msg = j.detail ?? msg;
    } catch {
      /* not json */
    }
    throw new Error(msg);
  }
  return r.json();
}

export async function ensureSession(): Promise<{ key: string; nickname: string; address: string }> {
  const s = await req<{ key: string; nickname: string; address: string }>("/api/session", {
    method: "POST",
    body: JSON.stringify({ key: getKey() }),
  });
  try {
    localStorage.setItem(KEY, s.key);
  } catch {
    /* private mode: session lasts for this tab only */
  }
  return s;
}

export const api = {
  status: () => req<Status>("/api/status"),
  me: () => req<Me>("/api/me"),
  faucet: () => req<{ ok: boolean }>("/api/faucet", { method: "POST" }),
  tokens: (sort: string) => req<Token[]>(`/api/tokens?sort=${sort}`),
  token: (t: string) => req<{ token: Token; trades: Trade[]; chart: { ts: number; price: number }[] }>(`/api/tokens/${t}`),
  quote: (t: string, side: string, amount: string) =>
    req<Quote>(`/api/tokens/${t}/quote?side=${side}&amount=${encodeURIComponent(amount)}`),
  trade: (t: string, side: string, amount: string, slippage_bps: number) =>
    req<{ tx_hashes: string[]; expected_out: number; min_out: number }>(`/api/tokens/${t}/trade`, {
      method: "POST",
      body: JSON.stringify({ side, amount, slippage_bps }),
    }),
  launch: (form: FormData) => req<{ tx_hash: string; ticker: string }>("/api/tokens", { method: "POST", body: form }),
  launchPrice: (t: string) => req<{ price: number }>(`/api/launch-price?ticker=${t}`),
  trades: () => req<Trade[]>("/api/trades"),
  leaderboard: () =>
    req<{
      tokens: Token[];
      traders: { nickname: string; trades: number; volume: number }[];
      creators: { nickname: string; launched: number }[];
    }>("/api/leaderboard"),
};
