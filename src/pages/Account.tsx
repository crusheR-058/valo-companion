import { useEffect, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { call, rankOf, useCmd, useContent, useLookups, useNotes, VP, RADIANITE, KC } from "../lib";
import { AgentIcon, ago, CountUp, Dial, Page, Q, Rank, Ring, tierTitle } from "../ui";

export function Dashboard() {
  const ov = useCmd("valorant_overview");
  const wallet = useCmd("valorant_wallet");
  const lo = useCmd("valorant_loadout_overview", undefined, { retry: false });
  const currencies = useContent("currencies");
  const card = lo.data?.Identity?.PlayerCardID;
  const icon = (id: string) => (currencies.data ?? []).find((c: any) => c.uuid === id)?.displayIcon;
  return (
    <Page title="Dashboard" actions={<button onClick={() => call("valorant_clear_caches").then(() => ov.refetch())}>Reconnect</button>}>
      <Q q={ov}>{(o) => {
        const r = rankOf(o.mmr);
        return (
          <div className="hero-card" style={card ? { "--art": `url(https://media.valorant-api.com/playercards/${card}/wideart.png)` } as React.CSSProperties : undefined}>
            <div className="hero-body">
              <div className="eyebrow">Signed in</div>
              <h2 className="hero-name">{o.session.game_name}</h2>
              <div className="hero-meta"><span className="mono">#{o.session.game_tag}</span><span>Peak <PeakName tier={r.peak} /></span></div>
            </div>
            <Dial tier={r.tier} rr={r.rr} />
          </div>
        );
      }}</Q>
      <Q q={wallet}>{(w) => (
        <div className="wallet">
          {[[VP, "Valorant Points"], [RADIANITE, "Radianite"], [KC, "Kingdom Credits"]].map(([id, label]) => (
            <div className="card stat" key={id}>
              {icon(id) && <img src={icon(id)} alt="" />}
              <div><b><CountUp value={w.Balances[id] ?? 0} /></b><div className="muted">{label}</div></div>
            </div>
          ))}
        </div>
      )}</Q>
      <Performance />
      <div className="section-head"><h3>Recent matches</h3><Link to="/history">Full history →</Link></div>
      <MatchList start={0} end={5} />
    </Page>
  );
}

function PeakName({ tier }: { tier: number }) {
  const t = useLookups().tier(tier);
  return <>{tier ? tierTitle(t?.tierName) : "unrated"}</>;
}

/** Form over your last 10 matches: win rate, K/D, ACS and your most played agent. */
function Performance() {
  const L = useLookups();
  const h = useCmd("valorant_match_history", { start: 0, end: 10 });
  const ids: string[] = (h.data?.History ?? []).map((m: any) => m.MatchID);
  const details = useQueries({ queries: ids.map((matchId) => ({
    queryKey: ["valorant_match_details", { matchId }], queryFn: () => call("valorant_match_details", { matchId }), staleTime: Infinity,
  })) });
  const games = details.flatMap((d) => {
    const p = d.data?.players.find((x: any) => x.subject === h.data.Subject);
    return p ? [{ p, won: !!d.data.teams?.find((t: any) => t.teamId === p.teamId)?.won }] : [];
  });
  if (!games.length) return null;
  const sum = (f: (g: (typeof games)[0]) => number) => games.reduce((n, g) => n + f(g), 0);
  const wins = games.filter((g) => g.won).length;
  const kd = sum((g) => g.p.stats.kills) / Math.max(1, sum((g) => g.p.stats.deaths));
  const acs = sum((g) => g.p.stats.score / Math.max(1, g.p.stats.roundsPlayed)) / games.length;
  const counts: Record<string, number> = {};
  for (const g of games) counts[g.p.characterId] = (counts[g.p.characterId] ?? 0) + 1;
  const top = L.agent(Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]);
  const grad = top?.backgroundGradientColors?.map((c: string) => `#${c.slice(0, 6)}`) ?? [];
  return (<>
    <h3>Last {games.length} matches</h3>
    <div className="perf">
      <div className="card perf-ring">
        <Ring value={wins / games.length} color="var(--win)" label={<><b><CountUp value={(wins / games.length) * 100} suffix="%" /></b><span className="muted">win rate</span></>} />
        <div className="form" aria-label="Results, newest first">{games.map((g, i) => <i key={i} className={g.won ? "w" : "l"} title={g.won ? "Win" : "Loss"} />)}</div>
      </div>
      <div className="card perf-stat"><span className="eyebrow">K / D</span><b className={kd >= 1 ? "good" : "bad"}><CountUp value={kd} decimals={2} /></b><span className="muted">{sum((g) => g.p.stats.kills)} kills</span></div>
      <div className="card perf-stat"><span className="eyebrow">Avg combat score</span><b><CountUp value={acs} /></b><span className="muted">per round</span></div>
      {top && (
        <div className="card perf-agent" style={{ "--a1": grad[0] ?? "var(--accent)", "--a2": grad[2] ?? grad[1] ?? "var(--panel)" } as React.CSSProperties}>
          <img src={top.fullPortrait} alt="" />
          <div><span className="eyebrow">Most played</span><b>{top.displayName}</b><span className="muted">{counts[top.uuid]} of {games.length} games</span></div>
        </div>
      )}
    </div>
  </>);
}

const QUEUES = ["", "competitive", "unrated", "swiftplay", "spikerush", "deathmatch", "premier"];

export function History() {
  const [queue, setQueue] = useState("");
  const [page, setPage] = useState(0);
  return (
    <Page title="Match history" actions={<>
      <select value={queue} onChange={(e) => { setQueue(e.target.value); setPage(0); }}>
        {QUEUES.map((q) => <option key={q} value={q}>{q || "All modes"}</option>)}
      </select>
      <button disabled={page === 0} onClick={() => setPage(page - 1)}>‹</button>
      <span>Page {page + 1}</span>
      <button onClick={() => setPage(page + 1)}>›</button>
    </>}>
      <MatchList start={page * 10} end={page * 10 + 10} queue={queue || undefined} />
    </Page>
  );
}

// noScoreboard: the full scoreboard lists Riot IDs, so it is off when the player hides their name.
export function MatchList({ puuid, start, end, queue, noScoreboard }: { puuid?: string; start: number; end: number; queue?: string; noScoreboard?: boolean }) {
  const h = useCmd("valorant_match_history", { puuid, start, end, queue });
  return <Q q={h}>{(d) => (
    <div className="list">
      {d.History.length === 0 && <p className="muted">No matches.</p>}
      {d.History.map((m: any) => <MatchRow key={m.MatchID} id={m.MatchID} puuid={puuid ?? d.Subject} noScoreboard={noScoreboard} />)}
    </div>
  )}</Q>;
}

function MatchRow({ id, puuid, noScoreboard }: { id: string; puuid: string; noScoreboard?: boolean }) {
  const [open, setOpen] = useState(false);
  const q = useCmd("valorant_match_details", { matchId: id }, { staleTime: Infinity });
  const L = useLookups();
  return <Q q={q}>{(m) => {
    const me = m.players.find((p: any) => p.subject === puuid);
    const team = m.teams?.find((t: any) => t.teamId === me?.teamId);
    const score = m.teams?.map((t: any) => t.roundsWon).join(" – ");
    return (
      <div className={`match ${team?.won ? "win" : "loss"} ${open ? "open" : ""}`} style={{ "--map": `url(${L.map(m.matchInfo.mapId)?.listViewIcon})` } as React.CSSProperties}>
        <button className="match-row" disabled={noScoreboard} onClick={() => setOpen(!open)}>
          <AgentIcon id={me?.characterId} />
          <span className="grow">
            <b className="result">{team?.won ? "Victory" : "Defeat"}</b>
            <span className="muted">{L.map(m.matchInfo.mapId)?.displayName ?? "Unknown"} · {m.matchInfo.queueID || "custom"}</span>
          </span>
          <Rank tier={me?.competitiveTier} />
          <span className="kda"><b>{me?.stats.kills}</b> / {me?.stats.deaths} / {me?.stats.assists}<small className="muted">K / D / A</small></span>
          <b className="score">{score}</b>
          <span className="muted when">{ago(m.matchInfo.gameStartMillis)}</span>
        </button>
        {open && (
          <table className="scoreboard">
            <tbody>
              {[...m.players].sort((a: any, b: any) => a.teamId.localeCompare(b.teamId) || b.stats.score - a.stats.score).map((p: any) => (
                <tr key={p.subject} className={p.teamId === me?.teamId ? "ally" : "enemy"}>
                  <td><AgentIcon id={p.characterId} /></td>
                  <td>{p.gameName}#{p.tagLine}</td>
                  <td><Rank tier={p.competitiveTier} /></td>
                  <td>{p.stats.kills}/{p.stats.deaths}/{p.stats.assists}</td>
                  <td>{Math.round(p.stats.score / Math.max(1, p.stats.roundsPlayed))} ACS</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }}</Q>;
}

export function Players() {
  const [input, setInput] = useState("");
  const [puuid, setPuuid] = useState<string>();
  const [err, setErr] = useState("");
  const [hits, setHits] = useState<any[]>([]);
  const [params] = useSearchParams();
  useEffect(() => {
    const q = params.get("q");
    if (q) { setInput(q); search(q); }
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps
  const search = async (input: string) => {
    const [name, tag] = input.split("#");
    setErr(""); setHits([]); setPuuid(undefined);
    try {
      if (name?.trim() && tag?.trim()) {
        const r: any = await call("valorant_search_player", { name: name.trim(), tag: tag.trim() }).catch(() => null);
        const id = Array.isArray(r) ? r[0]?.puuid : r?.puuid;
        if (id) return setPuuid(id);
      }
      if (!input.trim()) return;
      // Deep search: partial name over the players in your recent matches.
      const found: any[] = await call("valorant_deep_search", { query: input });
      found.length === 1 ? setPuuid(found[0].puuid) : found.length ? setHits(found) : setErr("Player not found, including in your last 10 matches.");
    } catch (e) { setErr(String(e)); }
  };
  return (
    <Page title="Players">
      <form className="row" onSubmit={(e) => { e.preventDefault(); search(input); }}>
        <input placeholder="Name#TAG or part of a name" value={input} onChange={(e) => setInput(e.target.value)} />
        <button>Search</button>
      </form>
      {err && <p className="error">{err}</p>}
      {hits.length > 0 && !puuid && (
        <div className="list">
          <p className="muted">Found in your recent matches:</p>
          {hits.map((h) => <button key={h.puuid} className="match-row" onClick={() => setPuuid(h.puuid)}>{h.gameName}#{h.tagLine}</button>)}
        </div>
      )}
      {puuid && <Profile puuid={puuid} />}
    </Page>
  );
}

function Profile({ puuid }: { puuid: string }) {
  const p = useCmd("valorant_player_profile", { puuid });
  const { memos, setMemo } = useNotes();
  return <Q q={p}>{(d) => {
    const r = rankOf(d.mmr);
    const id = `${d.name.GameName}#${d.name.TagLine}`;
    return (<>
      <div className="card hero">
        <h2>{id}</h2>
        <div className="row"><Rank tier={r.tier} rr={r.rr} /><span className="muted">Peak</span><Rank tier={r.peak} /></div>
        <textarea placeholder="Private memo about this player…" value={memos[id] ?? ""} onChange={(e) => setMemo(id, e.target.value)} />
      </div>
      <h3>Recent matches</h3>
      <MatchList puuid={puuid} start={0} end={10} />
    </>);
  }}</Q>;
}

export function Progression() {
  const c = useCmd("valorant_contracts");
  const defs = useContent("contracts");
  const ov = useCmd("valorant_overview", undefined, { retry: false });
  const ticket = useCmd("valorant_daily_ticket", { expectedPuuid: ov.data?.puuid }, { enabled: !!ov.data, retry: false });
  const milestones: any[] = ticket.data?.DailyRewards?.Milestones ?? [];
  return (
    <Page title="Progression">
      <Q q={c}>{(d) => {
        const name = (id: string) => (defs.data ?? []).find((x: any) => x.uuid === id)?.displayName ?? id.slice(0, 8);
        const active = d.Contracts.find((x: any) => x.ContractDefinitionID === d.ActiveSpecialContract);
        const done = d.Missions.filter((m: any) => m.Complete).length;
        return (<>
          <div className="grid">
            {active && <div className="card hero"><div className="muted">Active contract</div><h2>{name(active.ContractDefinitionID)}</h2>
              <div>Level {active.ProgressionLevelReached} · {active.ProgressionTowardsNextLevel} XP into next</div></div>}
            <div className="card"><div className="muted">Missions</div><h2>{done}/{d.Missions.length}</h2><div className="muted">completed</div></div>
            {milestones.length > 0 && <div className="card"><div className="muted">Daily ticket</div>
              <h2>{milestones.filter((m) => m.Progress >= 4).length}/{milestones.length}</h2><div className="muted">checkpoints today</div></div>}
          </div>
          <h3>All contracts</h3>
          <div className="list">
            {d.Contracts.filter((x: any) => x.ProgressionLevelReached > 0).map((x: any) => (
              <div className="match-row" key={x.ContractDefinitionID}><span className="grow">{name(x.ContractDefinitionID)}</span>Level {x.ProgressionLevelReached}</div>
            ))}
          </div>
        </>);
      }}</Q>
    </Page>
  );
}

export function Leaderboard() {
  const content = useCmd("valorant_content", undefined, { staleTime: Infinity });
  const act = content.data?.Seasons?.find((s: any) => s.IsActive && s.Type === "act");
  const lb = useCmd("valorant_leaderboard", { seasonId: act?.ID, start: 0, size: 50 }, { enabled: !!act });
  return (
    <Page title={`Leaderboard${act ? ` · ${act.Name}` : ""}`}>
      <Q q={lb}>{(d) => (
        <table className="scoreboard">
          <tbody>
            {d.Players.map((p: any) => (
              <tr key={p.leaderboardRank}>
                <td>#{p.leaderboardRank}</td>
                <td>{p.IsAnonymized ? <span className="muted">Secret agent</span> : `${p.gameName}#${p.tagLine}`}</td>
                <td><Rank tier={p.competitiveTier} /></td>
                <td>{p.rankedRating} RR</td>
                <td>{p.numberOfWins} wins</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}</Q>
    </Page>
  );
}
