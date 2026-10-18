import { useEffect, useState, type ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { useLookups, useToasts } from "./lib";

export function Q<T>({ q, children }: { q: UseQueryResult<T>; children: (d: T) => ReactNode }) {
  if (q.isPending) return <div className="skeleton" aria-busy="true" aria-label="Loading" />;
  if (q.isError) return (
    <div className="card error-card" role="alert">
      <b>Couldn't load this</b><span className="muted">{String(q.error)}</span>
      <button onClick={() => q.refetch()}>Retry</button>
    </div>
  );
  return <>{children(q.data)}</>;
}

export function Page({ title, sub, actions, children }: { title: string; sub?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="page">
      <header className="page-head">
        <div><h1>{title}</h1>{sub && <div className="muted sub">{sub}</div>}</div>
        <div className="row">{actions}</div>
      </header>
      {children}
    </section>
  );
}

export function Rank({ tier, rr, big }: { tier?: number; rr?: number; big?: boolean }) {
  const t = useLookups().tier(tier);
  if (!t) return <span className="muted">Unrated</span>;
  if (big) return (
    <div className="rank-big">
      <img src={t.largeIcon} alt="" />
      <div>
        <div className="rank-name" style={{ color: `#${t.color?.slice(0, 6)}` }}>{t.tierName}</div>
        {rr !== undefined && <><div className="bar"><i style={{ width: `${Math.min(100, rr)}%` }} /></div><span className="muted">{rr} / 100 RR</span></>}
      </div>
    </div>
  );
  return (
    <span className="rank">
      {t.smallIcon && <img src={t.smallIcon} alt="" />}
      {t.tierName}{rr !== undefined && tier ? ` · ${rr} RR` : ""}
    </span>
  );
}

export function AgentIcon({ id }: { id?: string }) {
  const a = useLookups().agent(id);
  return a ? <img className="agent" src={a.displayIcon} alt={a.displayName} title={a.displayName} /> : <span className="agent" />;
}

export const ago = (ms: number) => {
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Number that counts up from 0 when it appears or changes. */
export function CountUp({ value, decimals = 0, suffix = "" }: { value: number; decimals?: number; suffix?: string }) {
  const [n, setN] = useState(reduced() ? value : 0);
  useEffect(() => {
    if (reduced()) return setN(value);
    let raf = 0;
    const start = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / 800);
      setN(value * (1 - (1 - p) ** 3));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</>;
}

/** Circular progress ring, 0..1. */
export function Ring({ value, label, color = "var(--accent)" }: { value: number; label: ReactNode; color?: string }) {
  const c = 2 * Math.PI * 42;
  return (
    <div className="ring" role="img" aria-label={`${Math.round(value * 100)}%`}>
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="42" className="ring-track" />
        <circle cx="50" cy="50" r="42" className="ring-fill" stroke={color} strokeDasharray={c}
          style={{ "--off": c * (1 - value), "--c": c } as React.CSSProperties} />
      </svg>
      <div className="ring-label">{label}</div>
    </div>
  );
}

export function Toasts() {
  const list = useToasts((s) => s.list);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
    </div>
  );
}

// Pointer-reactive surfaces: any .fx element gets a cursor spotlight (--mx/--my); .tilt also leans toward the cursor.
document.addEventListener("pointermove", (e) => {
  const el = (e.target as Element).closest?.(".fx") as HTMLElement | null;
  if (!el) return;
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
  el.style.setProperty("--mx", `${x * 100}%`);
  el.style.setProperty("--my", `${y * 100}%`);
  el.style.setProperty("--rx", `${(0.5 - y) * 7}deg`);
  el.style.setProperty("--ry", `${(x - 0.5) * 9}deg`);
});
