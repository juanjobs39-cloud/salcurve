import { useCallback, useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { api, ensureSession, type Me } from "./api";
import { amount } from "./format";
import { Session, usePoll } from "./hooks";
import Home from "./pages/Home";
import Launch from "./pages/Launch";
import Leaderboard from "./pages/Leaderboard";
import Portfolio from "./pages/Portfolio";
import TokenPage from "./pages/TokenPage";

function Logo() {
  return (
    <NavLink to="/" className="flex items-center gap-2">
      <svg viewBox="0 0 32 32" className="h-8 w-8">
        <rect width="32" height="32" rx="8" fill="#131922" />
        <path d="M5 25 C 13 25, 17 21, 27 6" stroke="#3ee0c8" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      </svg>
      <span className="text-lg font-extrabold tracking-tight text-white">
        Sal<span className="text-sal-400">Curve</span>
      </span>
    </NavLink>
  );
}

const navCls = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1.5 rounded-lg text-sm ${isActive ? "bg-ink-700 text-white" : "text-ink-400 hover:text-white"}`;

export default function App() {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [sessionErr, setSessionErr] = useState<string | null>(null);
  const status = usePoll(api.status, 5000);

  const refreshMe = useCallback(() => {
    api.me().then(setMe).catch(() => {});
  }, []);

  useEffect(() => {
    ensureSession()
      .then(() => {
        setReady(true);
        refreshMe();
      })
      .catch((e) => setSessionErr((e as Error).message));
  }, [refreshMe]);

  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => document.visibilityState === "visible" && refreshMe(), 4000);
    return () => clearInterval(id);
  }, [ready, refreshMe]);

  return (
    <Session.Provider value={{ me, refreshMe, ready }}>
      <div className="min-h-screen bg-ink-950 text-ink-200">
        <div className="bg-sal-500/10 border-b border-sal-500/20 text-center text-xs text-sal-300 px-4 py-2">
          Demo on a private Salvium testnet running the CURVE proposal{" "}
          <a className="underline" href="https://github.com/salvium/salvium/pull/139" target="_blank" rel="noreferrer">
            (salvium/salvium#139)
          </a>{" "}
          with graduation{" "}
          <a className="underline" href="https://github.com/salvium/salvium/pull/140" target="_blank" rel="noreferrer">
            (#140)
          </a>
          . Coins have no value.
        </div>
        <header className="sticky top-0 z-10 bg-ink-950/85 backdrop-blur border-b border-ink-800">
          <div className="mx-auto max-w-7xl px-4 h-16 flex items-center gap-4">
            <Logo />
            <nav className="hidden sm:flex gap-1 ml-4">
              <NavLink to="/" end className={navCls}>
                Tokens
              </NavLink>
              <NavLink to="/launch" className={navCls}>
                Launch
              </NavLink>
              <NavLink to="/leaderboard" className={navCls}>
                Leaderboard
              </NavLink>
              <NavLink to="/portfolio" className={navCls}>
                Portfolio
              </NavLink>
            </nav>
            <div className="ml-auto flex items-center gap-3">
              {status.data && (
                <span className="hidden md:flex items-center gap-1.5 text-xs text-ink-400 font-mono">
                  <span className="h-2 w-2 rounded-full bg-up" />
                  block {status.data.height}
                </span>
              )}
              <NavLink to="/portfolio" className="rounded-xl bg-ink-800 border border-ink-700 px-3 py-1.5 text-sm">
                {me ? (
                  <>
                    <span className="font-mono text-white">{amount(me.sal1.total)}</span>
                    <span className="text-ink-400"> SAL1 · {me.nickname}</span>
                  </>
                ) : sessionErr ? (
                  <span className="text-down">offline</span>
                ) : (
                  <span className="text-ink-400">creating your test wallet…</span>
                )}
              </NavLink>
            </div>
          </div>
          <nav className="sm:hidden flex gap-1 px-4 pb-2">
            <NavLink to="/" end className={navCls}>
              Tokens
            </NavLink>
            <NavLink to="/launch" className={navCls}>
              Launch
            </NavLink>
            <NavLink to="/leaderboard" className={navCls}>
              Ranks
            </NavLink>
            <NavLink to="/portfolio" className={navCls}>
              Me
            </NavLink>
          </nav>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">
          {sessionErr && (
            <div className="mb-4 rounded-xl border border-down/40 bg-down/10 p-3 text-sm text-down">
              Could not reach the demo backend: {sessionErr}
            </div>
          )}
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/t/:ticker" element={<TokenPage />} />
            <Route path="/launch" element={<Launch />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
          </Routes>
        </main>
        <footer className="mx-auto max-w-7xl px-4 py-8 text-xs text-ink-400">
          SalCurve is an open-source demo of native bonding-curve tokens for Salvium. Each visitor gets a server-side test
          wallet; never use real funds.
        </footer>
      </div>
    </Session.Provider>
  );
}
