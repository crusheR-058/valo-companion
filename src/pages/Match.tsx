import { useMemo, useState } from "react";
import { useLookups } from "../lib";
import { AgentIcon, Rank } from "../ui";

type Kill = { round: number; time: number; killer: string; victim: string; loc?: { x: number; y: number } };

/** Every kill in the match, from the top-level list or (older payloads) from each round. */
function killsOf(m: any): Kill[] {
  if (m.kills?.length) return m.kills.map((k: any) => ({ round: k.round, time: k.roundTime ?? k.gameTime, killer: k.killer, victim: k.victim, loc: k.victimLocation }));
  return (m.roundResults ?? []).flatMap((r: any) => (r.playerStats ?? []).flatMap((ps: any) =>
    (ps.kills ?? []).map((k: any) => ({ round: r.roundNum, time: k.roundTime ?? k.timeSinceRoundStartMillis, killer: k.killer, victim: k.victim, loc: k.victimLocation }))));
}

const RESULT: Record<string, string> = { Elimination: "Elimination", Defuse: "Spike defused", Detonate: "Spike detonated", "": "Time ran out" };

/** Expanded view of one match: scoreboard, round timeline with your impact, and where you fought. */
export function MatchDetail({ m, me }: { m: any; me: any }) {
  const [tab, setTab] = useState<"board" | "rounds" | "map">("board");
  const hasRounds = (m.roundResults ?? []).length > 0;
  return (
    <div className="match-detail">
      <div className="tabs" role="tablist">
        {([["board", "Scoreboard"], ["rounds", "Rounds"], ["map", "Fights"]] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} disabled={k !== "board" && !hasRounds} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      {tab === "board" && <Scoreboard m={m} me={me} />}
      {tab === "rounds" && <Rounds m={m} me={me} />}
      {tab === "map" && <Fights m={m} me={me} />}
    </div>
  );
}

function Scoreboard({ m, me }: { m: any; me: any }) {
  return (
    <table className="scoreboard">
      <tbody>
        {[...m.players].sort((a: any, b: any) => a.teamId.localeCompare(b.teamId) || b.stats.score - a.stats.score).map((p: any) => (
          <tr key={p.subject} className={`${p.teamId === me?.teamId ? "ally" : "enemy"} ${p.subject === me?.subject ? "me" : ""}`}>
            <td><AgentIcon id={p.characterId} /></td>
            <td>{p.gameName}<span className="muted">#{p.tagLine}</span></td>
            <td><Rank tier={p.competitiveTier} /></td>
            <td className="mono">{p.stats.kills} / {p.stats.deaths} / {p.stats.assists}</td>
            <td className="mono">{Math.round(p.stats.score / Math.max(1, p.stats.roundsPlayed))} ACS</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Rounds({ m, me }: { m: any; me: any }) {
  const kills = useMemo(() => killsOf(m), [m]);
  const rounds: any[] = m.roundResults ?? [];
  const per = rounds.map((r) => {
    const rk = kills.filter((k) => k.round === r.roundNum).sort((a, b) => a.time - b.time);
    const mine = r.playerStats?.find((ps: any) => ps.subject === me.subject);
    return {
      r, won: r.winningTeam === me.teamId, myKills: rk.filter((k) => k.killer === me.subject).length,
      fb: rk[0]?.killer === me.subject, fd: rk[0]?.victim === me.subject, spent: mine?.economy?.loadoutValue ?? 0,
    };
  });
  const multi = (n: number) => per.filter((x) => (n === 5 ? x.myKills >= 5 : x.myKills === n)).length;
  return (<>
    <div className="impact">
      <span><b>{per.filter((x) => x.fb).length}</b>first kills</span>
      <span><b>{per.filter((x) => x.fd).length}</b>first deaths</span>
      <span><b>{multi(3)}</b>3K</span><span><b>{multi(4)}</b>4K</span><span><b>{multi(5)}</b>Aces</span>
      <span><b>{Math.round(per.reduce((n, x) => n + x.spent, 0) / Math.max(1, per.length)).toLocaleString()}</b>avg loadout</span>
    </div>
    <ol className="rounds" aria-label="Rounds, in order">
      {per.map((x, i) => (
        <li key={i} className={`${x.won ? "w" : "l"} ${i === 12 ? "half" : ""}`} title={`Round ${i + 1}: ${x.won ? "won" : "lost"} · ${RESULT[x.r.roundResultCode] ?? x.r.roundResult}${x.myKills ? ` · ${x.myKills} kill${x.myKills > 1 ? "s" : ""}` : ""}${x.fb ? " · first kill" : ""}`}>
          <span className="rn">{i + 1}</span>
          <span className="pips">{Array.from({ length: Math.min(x.myKills, 5) }, (_, k) => <i key={k} />)}</span>
          {x.fb && <span className="fb" aria-hidden="true" />}
        </li>
      ))}
    </ol>
    <p className="muted legend">Filled squares are rounds your team won. Dots are your kills; the gold notch marks the round's first kill.</p>
  </>);
}

function Fights({ m, me }: { m: any; me: any }) {
  const L = useLookups();
  const [show, setShow] = useState<"kills" | "deaths">("deaths");
  const map = L.map(m.matchInfo.mapId);
  const kills = useMemo(() => killsOf(m), [m]);
  const pts = kills.filter((k) => k.loc && (show === "kills" ? k.killer === me.subject : k.victim === me.subject));
  if (!map?.xMultiplier) return <p className="muted">No map data for this match.</p>;
  // valorant-api.com map transform: game x/y are swapped relative to the minimap image.
  const pos = (l: { x: number; y: number }) => ({ left: `${(l.y * map.xMultiplier + map.xScalarToAdd) * 100}%`, top: `${(l.x * map.yMultiplier + map.yScalarToAdd) * 100}%` });
  return (
    <div className="fights">
      <div className="minimap" style={{ backgroundImage: `url(${map.displayIcon})` }} role="img" aria-label={`${pts.length} ${show} on ${map.displayName}`}>
        {pts.map((k, i) => <i key={i} className={show} style={pos(k.loc!)} title={`Round ${k.round + 1}`} />)}
      </div>
      <div className="fights-side">
        <div className="seg" role="radiogroup" aria-label="Show">
          {(["deaths", "kills"] as const).map((v) => <button key={v} role="radio" aria-checked={show === v} className={show === v ? "on" : ""} onClick={() => setShow(v)}>Your {v}</button>)}
        </div>
        <p className="muted">{pts.length} {show} on {map.displayName}. Clusters are spots where the same fight keeps going the same way.</p>
      </div>
    </div>
  );
}
