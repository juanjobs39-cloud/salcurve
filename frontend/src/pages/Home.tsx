import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Card, Spinner, TokenCard, TradeRow } from "../components";
import { usePoll } from "../hooks";

const TABS = [
  { id: "new", label: "New" },
  { id: "trending", label: "Trending" },
  { id: "top", label: "Top market cap" },
];

export default function Home() {
  const [sort, setSort] = useState("new");
  const tokens = usePoll(() => api.tokens(sort), 4000, [sort]);
  const trades = usePoll(api.trades, 3000);

  return (
    <div className="grid lg:grid-cols-[1fr_380px] gap-6">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Fair-launch tokens on Salvium</h1>
            <p className="text-ink-400 text-sm">
              Every token is sold by an on-chain bonding curve: no presale, no team allocation, no oracle.
            </p>
          </div>
          <Link to="/launch" className="rounded-xl bg-sal-400 hover:bg-sal-300 text-ink-950 font-semibold px-4 py-2">
            Launch a token
          </Link>
        </div>
        <div className="flex gap-2 mb-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setSort(t.id)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                sort === t.id ? "bg-ink-700 text-white" : "text-ink-400 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {!tokens.data ? (
          <div className="py-16 grid place-items-center">
            <Spinner />
          </div>
        ) : tokens.data.length === 0 ? (
          <Card className="text-center py-12">
            <div className="text-white font-semibold">No tokens yet</div>
            <p className="text-ink-400 text-sm mt-1">Be the first: launch one in a few seconds.</p>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {tokens.data.map((t) => (
              <TokenCard key={t.ticker} t={t} />
            ))}
          </div>
        )}
      </section>
      <aside>
        <Card>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-white">Live trades</h2>
            <span className="flex items-center gap-1.5 text-xs text-up">
              <span className="h-2 w-2 rounded-full bg-up animate-pulse" /> live
            </span>
          </div>
          {trades.data && trades.data.length > 0 ? (
            trades.data.map((tr) => <TradeRow key={tr.tx_hash} tr={tr} />)
          ) : (
            <p className="text-ink-400 text-sm py-6 text-center">No trades yet.</p>
          )}
        </Card>
      </aside>
    </div>
  );
}
