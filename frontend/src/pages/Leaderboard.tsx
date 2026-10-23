import { Link } from "react-router-dom";
import { api } from "../api";
import { Card, Spinner, TokenAvatar } from "../components";
import { amount } from "../format";
import { usePoll } from "../hooks";

export default function Leaderboard() {
  const { data } = usePoll(api.leaderboard, 5000);
  if (!data)
    return (
      <div className="py-24 grid place-items-center">
        <Spinner />
      </div>
    );
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Leaderboard</h1>
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <h2 className="font-semibold text-white mb-3">Top tokens · 24h volume</h2>
          {data.tokens.length === 0 && <p className="text-ink-400 text-sm">No tokens yet.</p>}
          {data.tokens.map((t, i) => (
            <Link key={t.ticker} to={`/t/${t.ticker}`} className="flex items-center gap-3 py-2 border-b border-ink-800 last:border-0 hover:bg-ink-800/50 rounded-lg px-1">
              <span className="w-6 text-ink-400 font-mono">{i + 1}</span>
              <TokenAvatar token={t} size={36} />
              <div className="flex-1 min-w-0">
                <div className="text-white truncate">{t.name}</div>
                <div className="text-xs font-mono text-sal-400">${t.ticker}</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-white">{amount(t.volume_24h)} SAL1</div>
                <div className="text-xs text-ink-400">mcap {amount(t.market_cap)}</div>
              </div>
            </Link>
          ))}
        </Card>
        <div className="space-y-6">
          <Card>
            <h2 className="font-semibold text-white mb-3">Top traders</h2>
            {data.traders.length === 0 && <p className="text-ink-400 text-sm">No trades yet.</p>}
            {data.traders.map((t, i) => (
              <div key={t.nickname} className="flex justify-between py-1.5 text-sm">
                <span className="text-ink-200">
                  <span className="text-ink-400 font-mono mr-2">{i + 1}</span>
                  {t.nickname}
                </span>
                <span className="font-mono text-white">{amount(t.volume)} SAL1</span>
              </div>
            ))}
          </Card>
          <Card>
            <h2 className="font-semibold text-white mb-3">Top creators</h2>
            {data.creators.length === 0 && <p className="text-ink-400 text-sm">No launches yet.</p>}
            {data.creators.map((c, i) => (
              <div key={c.nickname} className="flex justify-between py-1.5 text-sm">
                <span className="text-ink-200">
                  <span className="text-ink-400 font-mono mr-2">{i + 1}</span>
                  {c.nickname}
                </span>
                <span className="font-mono text-white">{c.launched} launched</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
