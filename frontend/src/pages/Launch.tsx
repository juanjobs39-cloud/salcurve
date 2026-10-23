import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { Card, TokenAvatar } from "../components";
import { amount } from "../format";
import { useSession } from "../hooks";

export default function Launch() {
  const nav = useNavigate();
  const { me, refreshMe } = useSession();
  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const tickerOk = /^[A-Z0-9]{4}$/.test(ticker) && !ticker.startsWith("SAL");

  useEffect(() => {
    if (!tickerOk) return setCost(null);
    api.launchPrice(ticker).then((r) => setCost(r.price)).catch(() => setCost(null));
  }, [ticker, tickerOk]);

  useEffect(() => {
    if (!file) return setPreview(null);
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const f = new FormData();
      f.set("ticker", ticker);
      f.set("name", name);
      f.set("description", desc);
      if (file) f.set("image", file);
      const r = await api.launch(f);
      refreshMe();
      nav(`/t/${r.ticker}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const afford = cost !== null && me ? me.sal1.unlocked >= cost : true;

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-1">Launch a token</h1>
      <p className="text-ink-400 text-sm mb-6">
        Your token's entire supply (100M) is sold by the curve. You get no free allocation, and the launch fee is burned.
      </p>
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <div className="flex gap-4 items-center">
            {preview ? (
              <img src={preview} alt="" className="h-20 w-20 rounded-xl object-cover" />
            ) : (
              <TokenAvatar token={{ ticker: ticker || "????", has_image: false }} size={80} />
            )}
            <label className="flex-1 cursor-pointer rounded-xl border border-dashed border-ink-600 p-4 text-sm text-ink-400 hover:border-sal-500">
              {file ? file.name : "Image (png/jpg/gif/webp, max 512 KB) — optional"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <div>
            <label className="block text-xs text-ink-400 mb-1">Ticker (exactly 4 letters/digits)</label>
            <input
              value={ticker}
              maxLength={4}
              onChange={(e) => setTicker(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              placeholder="MOON"
              className="w-full rounded-xl bg-ink-800 border border-ink-700 focus:border-sal-500 outline-none px-3 py-2.5 font-mono text-white tracking-widest"
            />
            {ticker.length === 4 && !tickerOk && <p className="text-xs text-down mt-1">Tickers cannot start with SAL.</p>}
          </div>
          <div>
            <label className="block text-xs text-ink-400 mb-1">Name</label>
            <input
              value={name}
              maxLength={32}
              onChange={(e) => setName(e.target.value)}
              placeholder="To the Moon"
              className="w-full rounded-xl bg-ink-800 border border-ink-700 focus:border-sal-500 outline-none px-3 py-2.5 text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-ink-400 mb-1">Description</label>
            <textarea
              value={desc}
              maxLength={500}
              rows={3}
              onChange={(e) => setDesc(e.target.value)}
              className="w-full rounded-xl bg-ink-800 border border-ink-700 focus:border-sal-500 outline-none px-3 py-2.5 text-white"
            />
          </div>
          <div className="rounded-xl bg-ink-800 p-3 text-sm flex justify-between">
            <span className="text-ink-400">Launch fee (burned)</span>
            <span className="font-mono text-white">{cost !== null ? `${amount(cost)} SAL1` : "–"}</span>
          </div>
          {!afford && <p className="text-sm text-amber-300">Not enough unlocked SAL1 yet: wait a few blocks for your faucet coins.</p>}
          {err && <p className="text-sm text-down">{err}</p>}
          <button
            disabled={busy || !tickerOk || !name.trim() || !afford}
            className="w-full rounded-xl bg-sal-400 hover:bg-sal-300 text-ink-950 font-semibold py-3 disabled:opacity-40"
          >
            {busy ? "Launching…" : "Launch"}
          </button>
        </form>
      </Card>
    </div>
  );
}
