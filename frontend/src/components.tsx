import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { createChart, type IChartApi, type UTCTimestamp } from "lightweight-charts";
import type { Token, Trade } from "./api";
import { COIN } from "./api";
import { ago, amount, pct } from "./format";

/** Token image, or a deterministic gradient badge built from the ticker. */
export function TokenAvatar({ token, size = 56 }: { token: Pick<Token, "ticker" | "has_image">; size?: number }) {
  if (token.has_image) {
    return (
      <img
        src={`/api/tokens/${token.ticker}/image`}
        alt=""
        width={size}
        height={size}
        className="rounded-xl object-cover bg-ink-800 shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  let h = 0;
  for (const c of token.ticker) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <div
      className="rounded-xl grid place-items-center font-bold text-ink-950 shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: size / 3.4,
        background: `linear-gradient(135deg, hsl(${h} 80% 62%), hsl(${(h + 70) % 360} 85% 55%))`,
      }}
    >
      {token.ticker.slice(0, 2)}
    </div>
  );
}

export function GraduatedBadge() {
  return (
    <span
      title="The curve sold out: its reserve now trades in a pool whose liquidity is locked forever"
      className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-full border border-amber-300/40 bg-amber-300/10 px-2 py-0.5 text-[11px] font-semibold text-amber-200"
    >
      ★ Graduated
    </span>
  );
}

export function CurveProgress({
  progress,
  graduated = false,
  compact = false,
}: {
  progress: number;
  graduated?: boolean;
  compact?: boolean;
}) {
  return (
    <div className="w-full">
      {!compact && (
        <div className="flex justify-between text-xs text-ink-400 mb-1">
          <span>{graduated ? "Graduated: trading in the locked pool" : "Progress to graduation"}</span>
          <span className="font-mono text-ink-200">{pct(graduated ? 1 : progress)}</span>
        </div>
      )}
      <div className={`w-full rounded-full bg-ink-700 overflow-hidden ${compact ? "h-1.5" : "h-2.5"}`}>
        <div
          className={`h-full rounded-full bg-gradient-to-r transition-[width] duration-700 ${
            graduated ? "from-amber-500 to-amber-200" : "from-sal-600 to-sal-300"
          }`}
          style={{ width: `${Math.min(100, progress * 100).toFixed(2)}%` }}
        />
      </div>
    </div>
  );
}

export function TokenCard({ t }: { t: Token }) {
  return (
    <Link
      to={`/t/${t.ticker}`}
      className="group block rounded-2xl border border-ink-700 bg-ink-900 p-4 hover:border-sal-500/60 hover:bg-ink-800 transition-colors"
    >
      <div className="flex gap-3">
        <TokenAvatar token={t} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-white truncate">{t.name}</span>
            <span className="text-xs font-mono text-sal-400">${t.ticker}</span>
          </div>
          <div className="text-xs text-ink-400 truncate">
            {t.creator ? `by ${t.creator}` : "launched on chain"} · {ago(t.created_at)}
          </div>
          <div className="mt-1 text-sm text-ink-200 line-clamp-2 min-h-[1.25rem]">{t.description}</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-ink-400">Market cap</div>
          <div className="font-mono text-white">{amount(t.market_cap)} SAL1</div>
        </div>
        <div className="text-right">
          <div className="text-ink-400">24h volume</div>
          <div className="font-mono text-white">{amount(t.volume_24h)} SAL1</div>
        </div>
      </div>
      <div className="mt-3">
        {t.graduated && (
          <div className="mb-1.5 flex items-center justify-between text-[11px]">
            <GraduatedBadge />
            <span className="text-ink-400">liquidity locked in pool</span>
          </div>
        )}
        <CurveProgress progress={t.progress} graduated={t.graduated} compact />
      </div>
      {!t.live && <div className="mt-2 text-xs text-amber-300">Waiting for the launch block…</div>}
    </Link>
  );
}

export function TradeRow({ tr, showTicker = true, compact = false }: { tr: Trade; showTicker?: boolean; compact?: boolean }) {
  const buy = tr.op === "buy";
  const sal = buy ? tr.amount_in : tr.amount_out;
  const tokens = buy ? tr.amount_out : tr.amount_in;
  return (
    <div className="flex items-center gap-3 py-2 border-b border-ink-800 last:border-0 text-sm">
      <span
        className={`w-12 text-center rounded-md text-xs font-semibold py-0.5 ${
          !tr.filled ? "bg-ink-700 text-ink-400" : buy ? "bg-up/15 text-up" : "bg-down/15 text-down"
        }`}
      >
        {tr.filled ? tr.op.toUpperCase() : "REFUND"}
      </span>
      <span className="text-ink-200 truncate flex-1 min-w-0">
        {tr.nickname ?? "on-chain wallet"}
        {showTicker && (
          <Link to={`/t/${tr.ticker}`} className="ml-2 font-mono text-sal-400 hover:underline">
            ${tr.ticker}
          </Link>
        )}
      </span>
      <span className={`font-mono text-ink-200 text-right ${compact ? "w-20" : "w-28"}`}>{amount(sal)} SAL1</span>
      {!compact && <span className="font-mono text-ink-400 text-right w-28 hidden sm:block">{amount(tokens)} tok</span>}
      {!compact && <span className="text-ink-400 text-xs w-16 text-right">{ago(tr.ts)}</span>}
    </div>
  );
}

/** Price line chart (one point per filled trade). */
export function PriceChart({ points }: { points: { ts: number; price: number }[] }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ReturnType<IChartApi["addAreaSeries"]> | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const box = el.current;
    const c = createChart(box, {
      width: box.clientWidth || 600,
      height: 288,
      layout: { background: { color: "transparent" }, textColor: "#7d8a9c", fontFamily: "Inter, system-ui" },
      grid: { vertLines: { color: "#131922" }, horzLines: { color: "#131922" } },
      rightPriceScale: { borderColor: "#1c2430" },
      timeScale: { borderColor: "#1c2430", timeVisible: true, secondsVisible: true },
      crosshair: { mode: 0 },
      // the chart formats times with the browser locale by default, which throws
      // "Incorrect locale information provided" for some locales: pin it
      localization: { locale: "en-US" },
    });
    series.current = c.addAreaSeries({
      lineColor: "#3ee0c8",
      topColor: "rgba(62,224,200,0.35)",
      bottomColor: "rgba(62,224,200,0.02)",
      lineWidth: 2,
      // per-token prices are ~1e-4 SAL1, too small for the chart's price scale: plot SAL1 per 1M tokens
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });
    chart.current = c;
    // size the chart explicitly from its container (autoSize did not size the canvases)
    const ro = new ResizeObserver(() => c.applyOptions({ width: box.clientWidth }));
    ro.observe(box);
    return () => {
      ro.disconnect();
      c.remove();
    };
  }, []);

  useEffect(() => {
    if (!series.current) return;
    // lightweight-charts needs strictly increasing times: nudge trades in the same second
    const data: { time: UTCTimestamp; value: number }[] = [];
    let last = 0;
    for (const p of points) {
      const t = Math.max(p.ts, last + 1);
      last = t;
      data.push({ time: t as UTCTimestamp, value: (p.price / COIN) * 1_000_000 });
    }
    series.current.setData(data);
    chart.current?.timeScale().fitContent();
  }, [points]);

  return (
    <div>
      <div className="text-xs text-ink-400 mb-1">SAL1 per 1M tokens</div>
      <div ref={el} className="w-full h-72" />
    </div>
  );
}

export function Spinner() {
  return <div className="h-5 w-5 rounded-full border-2 border-sal-400 border-t-transparent animate-spin" />;
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-ink-700 bg-ink-900 p-4 ${className}`}>{children}</div>;
}
