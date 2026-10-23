import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Card, Spinner, TokenAvatar, TradeRow } from "../components";
import { amount, short } from "../format";
import { useSession } from "../hooks";

export default function Portfolio() {
  const { me, refreshMe } = useSession();
  const [msg, setMsg] = useState<string | null>(null);

  if (!me)
    return (
      <div className="py-24 grid place-items-center">
        <Spinner />
      </div>
    );

  const total = me.holdings.reduce((s, h) => s + h.value, 0) + me.sal1.total;

  async function faucet() {
    try {
      await api.faucet();
      setMsg("Test SAL1 on the way: it unlocks after ~10 blocks.");
      refreshMe();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{me.nickname}</h1>
          <div className="text-xs font-mono text-ink-400" title={me.address}>
            {short(me.address, 10)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-ink-400">Portfolio value</div>
          <div className="text-2xl font-mono text-white">{amount(total)} SAL1</div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <div className="text-xs text-ink-400">SAL1 (test coins)</div>
          <div className="text-xl font-mono text-white">{amount(me.sal1.total, 4)}</div>
          <div className="text-xs text-ink-400 mt-1">
            {amount(me.sal1.unlocked, 4)} unlocked
            {me.sal1.blocks_to_unlock > 0 && ` · rest in ${me.sal1.blocks_to_unlock} blocks`}
          </div>
          <button
            onClick={faucet}
            disabled={me.faucet_available_in > 0}
            className="mt-3 rounded-lg bg-ink-700 hover:bg-ink-600 px-3 py-1.5 text-sm text-ink-200 disabled:opacity-40"
          >
            {me.faucet_available_in > 0
              ? `Faucet again in ${Math.ceil(me.faucet_available_in / 3600)}h`
              : "Get more test SAL1"}
          </button>
          {msg && <p className="text-xs text-ink-200 mt-2">{msg}</p>}
        </Card>
        <Card className="md:col-span-2">
          <div className="text-xs text-ink-400 mb-2">Tokens</div>
          {me.holdings.length === 0 ? (
            <p className="text-ink-400 text-sm">
              No tokens yet. <Link to="/" className="text-sal-400 hover:underline">Find one to buy</Link>.
            </p>
          ) : (
            <div className="divide-y divide-ink-800">
              {me.holdings.map((h) => (
                <Link key={h.ticker} to={`/t/${h.ticker}`} className="flex items-center gap-3 py-2 hover:bg-ink-800/50 rounded-lg px-1">
                  <TokenAvatar token={h} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="text-white truncate">{h.name}</div>
                    <div className="text-xs text-ink-400 font-mono">${h.ticker}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-white">{amount(h.amount)}</div>
                    <div className="text-xs text-ink-400">
                      {h.unlocked < h.amount ? `unlocks in ${h.blocks_to_unlock} blocks` : `≈ ${amount(h.value)} SAL1`}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      {me.pending.length > 0 && (
        <Card>
          <div className="text-xs text-ink-400 mb-2">Waiting for the next block</div>
          {me.pending.map((p) => (
            <div key={p.tx_hash} className="text-sm text-ink-200 font-mono">
              {p.op} ${p.ticker} · {short(p.tx_hash)}
            </div>
          ))}
        </Card>
      )}

      <Card>
        <div className="text-xs text-ink-400 mb-2">Your trades</div>
        {me.trades.length ? (
          me.trades.map((t) => <TradeRow key={t.tx_hash} tr={{ ...t, nickname: "you" }} />)
        ) : (
          <p className="text-ink-400 text-sm">No trades yet.</p>
        )}
      </Card>
    </div>
  );
}
