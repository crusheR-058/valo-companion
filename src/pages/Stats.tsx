import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { call, useCmd, useLookups } from "../lib";
import { AgentIcon, CountUp, Page, Q, tierTitle } from "../ui";

/** Your last `n` matches with your own player row and the result, loaded through the shared match cache. */
export function useMyGames(n: number) {
  const h = useCmd("valorant_match_history", { start: 0, end: n });
  const ids: string[] = (h.data?.History ?? []).map((m: any) => m.MatchID);
  const details = useQueries({ queries: ids.map((matchId) => ({
    queryKey: ["valorant_match_details", { matchId }], queryFn: () => call("valorant_match_details", { matchId }), staleTime: Infinity,
  })) });
  const games = details.flatMap((d) => {
    const p = d.data?.players.find((x: any) => x.subject === h.data.Subject);
    return p ? [{ p, m: d.data, won: !!d.data.teams?.find((t: any) => t.teamId === p.teamId)?.won }] : [];
  });
  return { games, loading: h.isPending || details.some((d) => d.isPending), error: h.error };
}

export type Game = ReturnType<typeof useMyGames>["games"][number];
export const acsOf = (g: Game) => g.p.stats.score / Math.max(1, g.p.stats.roundsPlayed);

/** Today's ranked games, RR change and current streak, from the competitive updates feed. */
export function useSession() {
  const u = useCmd("valorant_competitive_updates", { start: 0, end: 20 }, { refetchInterval: 120000, retry: false });
  return useMemo(() => {
    const all: any[] = u.data?.Matches ?? [];
    const midnight = new Date().setHours(0, 0, 0, 0);
    const today = all.filter((m) => m.MatchStartTime >= midnight);
    let streak = 0;
    const sign = Math.sign(all[0]?.RankedRatingEarned ?? 0);
    for (const m of all) { if (sign !== 0 && Math.sign(m.RankedRatingEarned) === sign) streak++; else break; }
    return {
      ready: !!u.data, games: today.length, rr: today.reduce((n, m) => n + (m.RankedRatingEarned ?? 0), 0),
      streak: sign === 0 ? "" : `${sign > 0 ? "W" : "L"}${streak}`,
    };
  }, [u.data]);
}

export function Stats() {
  const { games, loading } = useMyGames(20);
  return (
    <Page title="Stats" sub="Your competitive rank over time, and how you play each agent and map.">
      <RankHistory />
      <h3>By agent · last {games.length} matches</h3>
      {loading && !games.length ? <div className="skeleton" /> : <Breakdown games={games} by="agent" />}
      <h3>By map</h3>
      {loading && !games.length ? <div className="skeleton" /> : <Breakdown games={games} by="map" />}
    </Page>
  );
}

/* ---------- rank history ---------- */
function RankHistory() {
  const u = useCmd("valorant_competitive_updates", { start: 0, end: 20 });
  const L = useLookups();
  const [hover, setHover] = useState<number>();
  return <Q q={u}>{(d) => {
    // Oldest first; a "ladder" value of tier*100 + RR makes promotions continuous.
    const pts = [...(d.Matches ?? [])].filter((m: any) => m.TierAfterUpdate > 0).reverse()
      .map((m: any) => ({ v: m.TierAfterUpdate * 100 + m.RankedRatingAfterUpdate, m }));
    if (pts.length < 2) return <p className="muted">Play a few competitive matches and your rank history appears here.</p>;
    const W = 720, H = 220, pad = { l: 8, r: 8, t: 18, b: 22 };
    const lo = Math.floor(Math.min(...pts.map((p) => p.v)) / 100) * 100, hi = Math.ceil(Math.max(...pts.map((p) => p.v)) / 100) * 100 || lo + 100;
    const x = (i: number) => pad.l + (i / (pts.length - 1)) * (W - pad.l - pad.r);
    const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
    const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
    const bands = Array.from({ length: (hi - lo) / 100 }, (_, i) => lo + i * 100);
    const h = hover !== undefined ? pts[hover] : pts[pts.length - 1];
    const net = pts[pts.length - 1].v - pts[0].v;
    return (
      <div className="card chart-card">
        <div className="chart-head">
          <div>
            <span className="eyebrow">{hover !== undefined ? new Date(h.m.MatchStartTime).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "Now"}</span>
            <div className="chart-value">{tierTitle(L.tier(h.m.TierAfterUpdate)?.tierName)} <span>{h.m.RankedRatingAfterUpdate} RR</span></div>
          </div>
          <div className="chart-net">
            <span className="eyebrow">Last {pts.length} ranked</span>
            <b className={net >= 0 ? "good" : "bad"}>{net >= 0 ? "+" : "−"}<CountUp value={Math.abs(net)} /> RR</b>
          </div>
        </div>
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Rank over the last ${pts.length} competitive matches`}
          onMouseLeave={() => setHover(undefined)}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setHover(Math.max(0, Math.min(pts.length - 1, Math.round(((e.clientX - r.left) / r.width * W - pad.l) / (W - pad.l - pad.r) * (pts.length - 1)))));
          }}>
          <defs>
            <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--gilt)" stopOpacity=".22" /><stop offset="1" stopColor="var(--gilt)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {bands.map((b) => (
            <g key={b}>
              <line x1={pad.l} x2={W - pad.r} y1={y(b)} y2={y(b)} className="chart-grid" />
              <text x={W - pad.r} y={y(b) - 6} className="chart-label" textAnchor="end">{tierTitle(L.tier(b / 100)?.tierName)}</text>
            </g>
          ))}
          <path d={`${line}L${x(pts.length - 1)},${H - pad.b}L${x(0)},${H - pad.b}Z`} fill="url(#area)" />
          <path d={line} className="chart-line" pathLength={1} />
          {pts.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.v)} r={hover === i ? 5 : 2.5} className={p.m.RankedRatingEarned >= 0 ? "pt up" : "pt down"} />)}
          {hover !== undefined && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} className="chart-cursor" />}
        </svg>
      </div>
    );
  }}</Q>;
}

/* ---------- per agent / per map ---------- */
function Breakdown({ games, by }: { games: Game[]; by: "agent" | "map" }) {
  const L = useLookups();
  const rows = useMemo(() => {
    const groups: Record<string, Game[]> = {};
    for (const g of games) (groups[by === "agent" ? g.p.characterId : g.m.matchInfo.mapId] ??= []).push(g);
    return Object.entries(groups).map(([key, gs]) => {
      const k = gs.reduce((n, g) => n + g.p.stats.kills, 0), dth = gs.reduce((n, g) => n + g.p.stats.deaths, 0);
      return { key, n: gs.length, win: gs.filter((g) => g.won).length / gs.length, kd: k / Math.max(1, dth), acs: gs.reduce((n, g) => n + acsOf(g), 0) / gs.length };
    }).sort((a, b) => b.n - a.n);
  }, [games, by]);
  if (!rows.length) return <p className="muted">No matches yet.</p>;
  return (
    <div className="breakdown">
      {rows.map((r) => {
        const map = by === "map" ? L.map(r.key) : undefined;
        return (
          <div className="bd-row" key={r.key} style={map ? { "--art": `url(${map.listViewIcon})` } as React.CSSProperties : undefined}>
            {by === "agent" ? <AgentIcon id={r.key} /> : <span className="map-thumb" />}
            <span className="bd-name">{by === "agent" ? L.agent(r.key)?.displayName : map?.displayName ?? "Unknown"}<small>{r.n} {r.n === 1 ? "match" : "matches"}</small></span>
            <span className="bd-bar" aria-label={`${Math.round(r.win * 100)}% wins`}><i style={{ width: `${r.win * 100}%` }} /></span>
            <span className="bd-num"><b>{Math.round(r.win * 100)}%</b><small>win</small></span>
            <span className="bd-num"><b className={r.kd >= 1 ? "good" : "bad"}>{r.kd.toFixed(2)}</b><small>K/D</small></span>
            <span className="bd-num"><b>{Math.round(r.acs)}</b><small>ACS</small></span>
          </div>
        );
      })}
    </div>
  );
}
