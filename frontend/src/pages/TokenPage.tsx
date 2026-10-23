import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, COIN, type Quote } from "../api";
import { Card, CurveProgress, PriceChart, Spinner, TokenAvatar, TradeRow } from "../components";
import { amount, ago, pct, price } from "../format";
import { usePoll, useSession } from "../hooks";

function TradePanel({ ticker }: { ticker: string }) {
  const { me, refreshMe } = useSession();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [value, setValue] = useState("");
  const [slip, setSlip] = useState(2);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const holding = me?.holdings.find((h) => h.ticker === ticker);
  const available = side === "buy" ? me?.sal1.unlocked ?? 0 : holding?.unlocked ?? 0;
  const locked = side === "buy" ? (me?.sal1.total ?? 0) - available : (holding?.amount ?? 0) - available;

  useEffect(() => {
    setQuote(null);
    const v = parseFloat(value);
    if (!v || v <= 0) return;
    const id = setTimeout(() => {
      api.quote(ticker, side, value).then(setQuote).catch(() => setQuote(null));
    }, 250);
    return () => clearTimeout(id);
  }, [ticker, side, value]);

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.trade(ticker, side, value, Math.round(slip * 100));
      setMsg({
        ok: true,
        text:
          side === "buy"
            ? `Bought! You'll receive ~${amount(r.expected_out)} ${ticker} in the next block (unlocks after 60 blocks).`
            : `Sold! ~${amount(r.expected_out)} SAL1 arrives in 1–2 blocks (the fee is paid by a separate rollup tx).`,
      });
      setValue("");
      refreshMe();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const presets = side === "buy" ? ["10", "50", "100", "500"] : ["25%", "50%", "100%"];
  const setPreset = (p: string) => {
    if (p.endsWith("%")) setValue(((available * parseInt(p)) / 100 / COIN).toFixed(8).replace(/\.?0+$/, ""));
    else setValue(p);
  };

  return (
    <Card>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-ink-800 p-1 mb-4">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            onClick={() => {
              setSide(s);
              setValue("");
              setMsg(null);
            }}
            className={`rounded-lg py-2 font-semibold capitalize ${
              side === s ? (s === "buy" ? "bg-up text-ink-950" : "bg-down text-ink-950") : "text-ink-400"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      <label className="block text-xs text-ink-400 mb-1">
        {side === "buy" ? "You pay (SAL1)" : `You sell (${ticker})`}
      </label>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ""))}
        placeholder="0.0"
        className="w-full rounded-xl bg-ink-800 border border-ink-700 focus:border-sal-500 outline-none px-3 py-3 font-mono text-lg text-white"
      />
      <div className="flex flex-wrap gap-2 mt-2">
        {presets.map((p) => (
          <button key={p} onClick={() => setPreset(p)} className="rounded-md bg-ink-800 px-2 py-1 text-xs text-ink-200 hover:bg-ink-700">
            {side === "buy" ? `${p} SAL1` : p}
          </button>
        ))}
      </div>
      <div className="mt-2 text-xs text-ink-400">
        Available: <span className="font-mono text-ink-200">{amount(available, 4)}</span>
        {locked > 0 && <span> · {amount(locked, 2)} still locked</span>}
      </div>

      <div className="mt-4 rounded-xl bg-ink-800 p-3 text-sm space-y-1">
        <div className="flex justify-between">
          <span className="text-ink-400">You receive</span>
          <span className="font-mono text-white">
            {quote ? (quote.filled ? `${amount(quote.amount_out, 4)} ${side === "buy" ? ticker : "SAL1"}` : "cannot fill") : "–"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-400">Fee (1%, burned)</span>
          <span className="font-mono text-ink-200">{quote ? `${amount(quote.fee, 4)} SAL1` : "–"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-400">Price impact</span>
          <span className={`font-mono ${quote && Math.abs(quote.price_impact) > 0.05 ? "text-amber-300" : "text-ink-200"}`}>
            {quote ? pct(quote.price_impact, 2) : "–"}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-ink-400">Max slippage</span>
          <select
            value={slip}
            onChange={(e) => setSlip(parseFloat(e.target.value))}
            className="bg-ink-700 rounded-md px-2 py-0.5 text-ink-200"
          >
            {[0.5, 1, 2, 5, 10].map((s) => (
              <option key={s} value={s}>
                {s}%
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        disabled={busy || !quote?.filled || !value}
        onClick={submit}
        className={`mt-4 w-full rounded-xl py-3 font-semibold text-ink-950 disabled:opacity-40 ${
          side === "buy" ? "bg-up hover:brightness-110" : "bg-down hover:brightness-110"
        }`}
      >
        {busy ? "Sending…" : side === "buy" ? `Buy ${ticker}` : `Sell ${ticker}`}
      </button>
      {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-up" : "text-down"}`}>{msg.text}</p>}
      <p className="mt-3 text-xs text-ink-400">
        If the price moves past your slippage before the next block, the network refunds your burn automatically.
      </p>
    </Card>
  );
}

export default function TokenPage() {
  const { ticker = "" } = useParams();
  const t = ticker.toUpperCase();
  const { data, error } = usePoll(() => api.token(t), 3000, [t]);

  if (error && !data) return <Card className="text-center py-12 text-ink-400">Token ${t} not found.</Card>;
  if (!data)
    return (
      <div className="py-24 grid place-items-center">
        <Spinner />
      </div>
    );
  const tok = data.token;

  return (
    <div className="grid lg:grid-cols-[1fr_380px] gap-6">
      <div className="space-y-6 min-w-0">
        <Card>
          <div className="flex gap-4 items-start">
            <TokenAvatar token={tok} size={72} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <h1 className="text-2xl font-bold text-white">{tok.name}</h1>
                <span className="font-mono text-sal-400">${tok.ticker}</span>
              </div>
              <div className="text-sm text-ink-400">
                {tok.creator ? `created by ${tok.creator}` : "launched on chain"} · {ago(tok.created_at)}
                {tok.launch_height ? ` · block ${tok.launch_height}` : ""}
              </div>
              {tok.description && <p className="mt-2 text-ink-200 whitespace-pre-wrap">{tok.description}</p>}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            {[
              ["Price", `${price(tok.price)} SAL1`],
              ["Market cap", `${amount(tok.market_cap)} SAL1`],
              ["Reserve", `${amount(tok.reserve)} SAL1`],
              ["24h volume", `${amount(tok.volume_24h)} SAL1`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-ink-800 p-3">
                <div className="text-xs text-ink-400">{k}</div>
                <div className="font-mono text-white truncate">{v}</div>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <CurveProgress progress={tok.progress} />
            <div className="mt-1 text-xs text-ink-400">
              {amount(tok.sold)} of 100M tokens sold by the curve · {tok.trades} trades
            </div>
          </div>
        </Card>
        <Card>
          <h2 className="font-semibold text-white mb-2">Price</h2>
          {data.chart.length > 1 ? (
            <PriceChart points={data.chart} />
          ) : (
            <div className="h-72 grid place-items-center text-ink-400 text-sm">No trades yet: the first buy starts the chart.</div>
          )}
        </Card>
        <Card>
          <h2 className="font-semibold text-white mb-2">Trades</h2>
          {data.trades.length ? (
            data.trades.map((tr) => <TradeRow key={tr.tx_hash} tr={tr} showTicker={false} />)
          ) : (
            <p className="text-ink-400 text-sm py-4">No trades yet.</p>
          )}
        </Card>
      </div>
      <aside className="space-y-4">
        {tok.live ? <TradePanel ticker={tok.ticker} /> : <Card className="text-amber-300 text-sm">Waiting for the launch block…</Card>}
        <Card className="text-xs text-ink-400 space-y-1">
          <div className="text-ink-200 font-semibold text-sm mb-1">How the curve works</div>
          <p>Buying burns SAL1 and the block's protocol transaction mints tokens; selling burns tokens and mints SAL1 from the curve's reserve.</p>
          <p>Price rises with every buy and falls with every sell. The math runs in consensus, on every node.</p>
        </Card>
      </aside>
    </div>
  );
}
