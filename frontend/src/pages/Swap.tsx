import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, COIN, type Quote, type Token } from "../api";
import { Card, GraduatedBadge, Spinner, TokenAvatar } from "../components";
import { amount, pct, price, short } from "../format";
import { usePoll, useSession } from "../hooks";

type Side = "buy" | "sell"; // buy = SAL1 -> token, sell = token -> SAL1

const SLIPPAGES = [0.5, 1, 2, 5];

function Sal1Icon({ size = 28 }: { size?: number }) {
  return (
    <div
      className="grid place-items-center rounded-full bg-gradient-to-br from-sal-300 to-sal-600 font-bold text-ink-950"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      SAL
    </div>
  );
}

function AssetButton({ token, onClick }: { token: Token | null; onClick?: () => void }) {
  const inner = token ? (
    <>
      <TokenAvatar token={token} size={28} />
      <span className="font-semibold text-white">{token.ticker}</span>
    </>
  ) : (
    <span className="font-semibold text-white px-1">Select token</span>
  );
  if (!onClick)
    return (
      <div className="flex items-center gap-2 rounded-full bg-ink-700 px-2 py-1.5">
        <Sal1Icon />
        <span className="font-semibold text-white pr-1">SAL1</span>
      </div>
    );
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-2 rounded-full px-2 py-1.5 ${
        token ? "bg-ink-700 hover:bg-ink-600" : "bg-sal-400 text-ink-950 hover:bg-sal-300"
      }`}
    >
      {inner}
      <span className="text-ink-400 pr-1">▾</span>
    </button>
  );
}

/** Search graduated tokens by name, ticker, asset type (salXXX) or launch tx hash. */
function TokenPicker({ onPick, onClose }: { onPick: (t: Token) => void; onClose: () => void }) {
  const { me } = useSession();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ tokens: Token[]; on_curve: Token[] } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    const id = setTimeout(() => {
      api
        .swapTokens(q)
        .then((r) => {
          setRes(r);
          // an exact id (asset type or launch tx hash) selects the token directly
          const ql = q.trim().toLowerCase();
          const exactId = r.tokens.find((t) => ql && (ql === t.asset_type.toLowerCase() || ql === (t.launch_tx ?? "").toLowerCase()));
          if (exactId) onPick(exactId);
        })
        .catch(() => setRes({ tokens: [], on_curve: [] }));
    }, 200);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const held = (t: string) => me?.holdings.find((h) => h.ticker === t)?.amount ?? 0;
  const mine = (res?.tokens ?? []).filter((t) => held(t.ticker) > 0);

  return (
    <div className="fixed inset-0 z-30 grid place-items-start sm:place-items-center bg-black/60 px-4 pt-20 sm:pt-0" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-white">Select a graduated token</h2>
          <button onClick={onClose} className="text-ink-400 hover:text-white text-xl leading-none" aria-label="Close">
            ×
          </button>
        </div>
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && res?.tokens[0]) onPick(res.tokens[0]);
            if (e.key === "Escape") onClose();
          }}
          placeholder="Name, ticker, salXXX or launch tx hash"
          className="w-full rounded-xl bg-ink-800 border border-ink-700 focus:border-sal-500 outline-none px-3 py-2.5 text-white"
        />
        {!q && mine.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {mine.map((t) => (
              <button
                key={t.ticker}
                onClick={() => onPick(t)}
                className="flex items-center gap-1.5 rounded-full border border-ink-700 px-2 py-1 text-sm text-ink-200 hover:bg-ink-800"
              >
                <TokenAvatar token={t} size={20} />
                {t.ticker}
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 max-h-[55vh] overflow-y-auto -mx-2">
          {!res && (
            <div className="py-8 grid place-items-center">
              <Spinner />
            </div>
          )}
          {res?.tokens.map((t) => (
            <button
              key={t.ticker}
              onClick={() => onPick(t)}
              className="w-full flex items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-ink-800"
            >
              <TokenAvatar token={t} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-white truncate">{t.name}</span>
                  <span className="text-xs font-mono text-sal-400">{t.ticker}</span>
                </div>
                <div className="text-xs text-ink-400 truncate font-mono">
                  {t.asset_type}
                  {t.launch_tx ? ` · ${short(t.launch_tx)}` : ""}
                </div>
              </div>
              <div className="text-right text-xs shrink-0">
                <div className="font-mono text-white">{price(t.price)} SAL1</div>
                <div className="text-ink-400">
                  {held(t.ticker) > 0 ? `you hold ${amount(held(t.ticker))}` : `${amount(t.pool_sal)} SAL1 locked`}
                </div>
              </div>
            </button>
          ))}
          {res && res.tokens.length === 0 && res.on_curve.length === 0 && (
            <p className="py-6 text-center text-sm text-ink-400">
              {q ? "No token matches." : "No token has graduated yet."}
            </p>
          )}
          {res && res.on_curve.length > 0 && (
            <div className="mt-2 border-t border-ink-800 pt-2 px-2">
              <div className="text-xs text-ink-400 mb-1">Still on their bonding curve (trade them on their page):</div>
              {res.on_curve.map((t) => (
                <Link
                  key={t.ticker}
                  to={`/t/${t.ticker}`}
                  className="flex items-center justify-between rounded-lg px-1 py-1.5 text-sm hover:bg-ink-800"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <TokenAvatar token={t} size={24} />
                    <span className="text-ink-200 truncate">{t.name}</span>
                    <span className="text-xs font-mono text-sal-400">{t.ticker}</span>
                  </span>
                  <span className="text-xs text-ink-400 shrink-0">{pct(t.progress)} to graduation →</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Swap() {
  const { me, refreshMe } = useSession();
  const [params, setParams] = useSearchParams();
  const side: Side = params.get("side") === "sell" ? "sell" : "buy";
  const wanted = (params.get("token") ?? "").toUpperCase();

  const { data: list } = usePoll(() => api.swapTokens(""), 5000);
  const graduated = list?.tokens ?? [];
  const token = useMemo(() => graduated.find((t) => t.ticker === wanted) ?? null, [graduated, wanted]);
  const [notGraduated, setNotGraduated] = useState<Token | null>(null);

  const [value, setValue] = useState("");
  const [slip, setSlip] = useState(1);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; tx?: string } | null>(null);

  const setParam = (k: string, v: string | null) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p, { replace: true });
  };

  // default to the deepest pool; explain when the linked token has not graduated yet
  useEffect(() => {
    if (!list) return;
    if (!wanted && graduated[0]) setParam("token", graduated[0].ticker);
    if (wanted && !token)
      api
        .swapTokens(wanted)
        .then((r) => setNotGraduated(r.on_curve.find((t) => t.ticker === wanted) ?? null))
        .catch(() => setNotGraduated(null));
    else setNotGraduated(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, wanted]);

  useEffect(() => {
    setQuote(null);
    const v = parseFloat(value);
    if (!token || !v || v <= 0) return;
    setQuoting(true);
    const id = setTimeout(() => {
      api
        .quote(token.ticker, side, value)
        .then(setQuote)
        .catch(() => setQuote(null))
        .finally(() => setQuoting(false));
    }, 300);
    return () => {
      clearTimeout(id);
      setQuoting(false);
    };
  }, [token, side, value]);

  const holding = token ? me?.holdings.find((h) => h.ticker === token.ticker) : undefined;
  const payTotal = side === "buy" ? me?.sal1.total ?? 0 : holding?.amount ?? 0;
  const payUnlocked = side === "buy" ? me?.sal1.unlocked ?? 0 : holding?.unlocked ?? 0;
  const payBlocks = side === "buy" ? me?.sal1.blocks_to_unlock ?? 0 : holding?.blocks_to_unlock ?? 0;
  const receiveHeld = side === "buy" ? holding?.amount ?? 0 : me?.sal1.total ?? 0;
  const inAtomic = Math.round((parseFloat(value) || 0) * COIN);
  const minOut = quote ? Math.floor((quote.amount_out * (10000 - Math.round(slip * 100))) / 10000) : 0;
  const payTicker = side === "buy" ? "SAL1" : token?.ticker ?? "";
  const getTicker = side === "buy" ? token?.ticker ?? "" : "SAL1";

  let label = "Swap";
  let ready = false;
  if (!token) label = "Select a token";
  else if (!inAtomic) label = "Enter an amount";
  else if (inAtomic > payTotal) label = `Insufficient ${payTicker} balance`;
  else if (inAtomic > payUnlocked) label = `Funds unlock in ~${payBlocks} blocks`;
  else if (quoting) label = "Getting quote…";
  else if (quote && !quote.filled) label = "The pool cannot fill this amount";
  else if (quote) ready = true;
  if (busy) label = "Sending…";

  function flip() {
    setParam("side", side === "buy" ? "sell" : null);
    setValue(quote?.filled ? (quote.amount_out / COIN).toFixed(8).replace(/\.?0+$/, "") : "");
    setMsg(null);
  }

  async function submit() {
    if (!token) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.trade(token.ticker, side, value, Math.round(slip * 100));
      setMsg({
        ok: true,
        tx: r.tx_hashes[r.tx_hashes.length - 1],
        text:
          side === "buy"
            ? `Swap sent: ~${amount(r.expected_out)} ${token.ticker} arrive in the next block (unlocked after 60 blocks).`
            : `Swap sent: ~${amount(r.expected_out)} SAL1 arrive in 1–2 blocks (the network fee goes in a separate rollup tx).`,
      });
      setValue("");
      refreshMe();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const box = "rounded-2xl bg-ink-800 border border-ink-700 p-4";

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Swap</h1>
        <p className="text-sm text-ink-400">
          Trade graduated tokens against their locked pools. Every swap is priced and settled by Salvium consensus.
        </p>
      </div>

      {notGraduated && (
        <Card className="text-sm text-amber-200">
          ${notGraduated.ticker} is still on its bonding curve ({pct(notGraduated.progress)} to graduation).{" "}
          <Link className="underline" to={`/t/${notGraduated.ticker}`}>
            Trade it on its page
          </Link>
          .
        </Card>
      )}

      <Card className="space-y-1 p-3">
        <div className={box}>
          <div className="flex justify-between text-xs text-ink-400">
            <span>You pay</span>
            <button
              className="hover:text-ink-200"
              onClick={() => payUnlocked && setValue((payUnlocked / COIN).toFixed(8).replace(/\.?0+$/, ""))}
              title="Use the whole unlocked balance"
            >
              Balance: <span className="font-mono">{amount(payUnlocked, 4)}</span>
              {payTotal > payUnlocked && <span> (+{amount(payTotal - payUnlocked, 2)} locked)</span>}
            </button>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <input
              inputMode="decimal"
              value={value}
              onChange={(e) => {
                setValue(e.target.value.replace(/[^0-9.]/g, ""));
                setMsg(null);
              }}
              placeholder="0"
              className="min-w-0 flex-1 bg-transparent outline-none font-mono text-3xl text-white"
            />
            <AssetButton token={side === "buy" ? null : token} onClick={side === "buy" ? undefined : () => setPicker(true)} />
          </div>
        </div>

        <div className="relative h-0 flex justify-center z-10">
          <button
            onClick={flip}
            aria-label="Switch direction"
            className="-translate-y-1/2 grid h-10 w-10 place-items-center rounded-xl border-4 border-ink-900 bg-ink-700 text-lg text-white hover:bg-ink-600"
          >
            ⇅
          </button>
        </div>

        <div className={box}>
          <div className="flex justify-between text-xs text-ink-400">
            <span>You receive</span>
            <span>
              Balance: <span className="font-mono">{amount(receiveHeld, 4)}</span>
            </span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div className="min-w-0 flex-1 font-mono text-3xl text-white truncate">
              {quoting ? <span className="text-ink-600">…</span> : quote?.filled ? amount(quote.amount_out, 4) : <span className="text-ink-600">0</span>}
            </div>
            <AssetButton token={side === "buy" ? token : null} onClick={side === "buy" ? () => setPicker(true) : undefined} />
          </div>
        </div>

        {token && (
          <div className="px-2 pt-2 text-sm space-y-1.5">
            <div className="flex justify-between">
              <span className="text-ink-400">Price</span>
              <span className="font-mono text-ink-200">
                1 {token.ticker} = {price(token.price)} SAL1
              </span>
            </div>
            {quote?.filled && (
              <>
                <div className="flex justify-between">
                  <span className="text-ink-400">Price impact</span>
                  <span className={`font-mono ${Math.abs(quote.price_impact) > 0.05 ? "text-amber-300" : "text-ink-200"}`}>
                    {pct(quote.price_impact, 2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-400">Fee (1%, kept by the pool)</span>
                  <span className="font-mono text-ink-200">{amount(quote.fee, 4)} SAL1</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-400">Minimum received</span>
                  <span className="font-mono text-ink-200">
                    {amount(minOut, 4)} {getTicker}
                  </span>
                </div>
              </>
            )}
            <div className="flex justify-between items-center">
              <span className="text-ink-400">Max slippage</span>
              <div className="flex gap-1">
                {SLIPPAGES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSlip(s)}
                    className={`rounded-md px-2 py-0.5 text-xs font-mono ${
                      slip === s ? "bg-sal-400 text-ink-950" : "bg-ink-800 text-ink-200 hover:bg-ink-700"
                    }`}
                  >
                    {s}%
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-ink-400 shrink-0">Locked pool</span>
              <span className="font-mono text-ink-200 text-right">
                {amount(token.pool_sal)} SAL1 + {amount(token.pool_tokens)} {token.ticker}
              </span>
            </div>
          </div>
        )}

        <button
          disabled={!ready || busy}
          onClick={submit}
          className="mt-3 w-full rounded-2xl bg-sal-400 py-3.5 text-lg font-semibold text-ink-950 hover:bg-sal-300 disabled:bg-ink-700 disabled:text-ink-400"
        >
          {label}
        </button>
        {msg && (
          <p className={`px-2 pt-2 text-sm ${msg.ok ? "text-up" : "text-down"}`}>
            {msg.text}
            {msg.tx && <span className="block font-mono text-xs text-ink-400 mt-1">tx {short(msg.tx, 10)}</span>}
          </p>
        )}
      </Card>

      {token && (
        <div className="flex items-center justify-between text-xs text-ink-400 px-1">
          <span className="flex items-center gap-2">
            <GraduatedBadge /> pool since block {token.graduation_height ?? "–"}
          </span>
          <Link to={`/t/${token.ticker}`} className="hover:text-ink-200">
            Chart & trades →
          </Link>
        </div>
      )}
      <p className="text-xs text-ink-400 px-1">
        A swap burns what you pay; the block's protocol transaction mints what you receive. If the price moves past your
        slippage before the next block, the network refunds your burn automatically.
      </p>

      {picker && (
        <TokenPicker
          onClose={() => setPicker(false)}
          onPick={(t) => {
            setPicker(false);
            setParam("token", t.ticker);
            setValue("");
            setMsg(null);
          }}
        />
      )}
    </div>
  );
}
