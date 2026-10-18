import { useState } from "react";
import { Link } from "react-router-dom";
import { MatchList, SessionLine } from "./Account";
import { rankOf, useCmd, useLookups, useNotes, useSettings } from "../lib";
import { AgentIcon, Page, Q, Rank } from "../ui";

/** Safe mode polls every 15 s instead of 5 s. */
export function useLive() {
  const safe = useSettings((s) => s.safeMode);
  return useCmd("valorant_live_match", undefined, { refetchInterval: safe ? 15000 : 5000 });
}

export function LiveMatch() {
  const live = useLive();
  const safe = useSettings((s) => s.safeMode);
  return (
    <Page title="Live match" sub={safe ? <>Safe mode is on: opponent and hidden-player details stay off. <Link to="/settings">Change in Settings</Link></> : undefined}>
      <Q q={live}>{(d) => <LiveBody d={d} />}</Q>
    </Page>
  );
}

function LiveBody({ d, compact }: { d: any; compact?: boolean }) {
  const L = useLookups();
  const safe = useSettings((s) => s.safeMode);
  const blocked = useCmd<string[]>("valorant_blocked_puuids", undefined, { staleTime: 60000, retry: false });
  if (d.phase === "idle") return compact
    ? <p className="muted ov-idle">Waiting for a match</p>
    : <div className="card empty-state"><h2>No match right now</h2><p className="muted">Queue up in VALORANT. Agent select and the match appear here on their own.</p></div>;
  // core-game loadouts carry the Subject; pregame ones come in the same order as the players.
  const all: any[] = d.loadouts?.Loadouts ?? [];
  const itemsOf = (p: any) => {
    const x = all.find((l) => (l.Loadout ?? l).Subject === p.Subject) ?? (d.phase === "pregame" ? all[d.players.indexOf(p)] : undefined);
    return (x?.Loadout ?? x)?.Items;
  };
  const myTeam = d.players.find((p: any) => p.Subject === d.me)?.TeamID;
  const teams = d.phase === "pregame" ? [d.players] : [
    d.players.filter((p: any) => p.TeamID === myTeam),
    d.players.filter((p: any) => p.TeamID !== myTeam),
  ];
  return (<>
    <div className="live-head" style={{ "--art": `url(${L.map(d.match.MapID)?.listViewIcon})` } as React.CSSProperties}>
      <span className="live-pill">{d.phase === "pregame" ? "Agent select" : "Live"}</span>
      <h2>{L.map(d.match.MapID)?.displayName ?? "Unknown map"}</h2>
    </div>
    <div className={compact ? "" : "grid"}>
      {teams.filter((_, i) => !(compact && safe && i === 1)).map((t, i) => (
        <div key={i} className={`card team ${i === 0 ? "ally" : "enemy"}`}>
          <h3>{d.phase === "pregame" ? "Your team" : i === 0 ? "Your team" : "Enemy team"}</h3>
          {t.map((p: any) => <LivePlayer key={p.Subject} p={p} names={d.names} blocked={!!blocked.data?.includes(p.Subject)} compact={compact} items={itemsOf(p)}
            restricted={safe && (i === 1 || !d.names.some((n: any) => n.Subject === p.Subject))} />)}
        </div>
      ))}
    </div>
  </>);
}

function LivePlayer({ p, names, blocked, compact, items, restricted }: { p: any; names: any[]; blocked: boolean; compact?: boolean; items?: Record<string, any>; restricted: boolean }) {
  const [open, setOpen] = useState(false);
  const n = names.find((x) => x.Subject === p.Subject);
  // Hidden players: their name is never fetched or shown. In safe mode, opponents and hidden players aren't looked up at all.
  const mmr = useCmd("valorant_scout_player", { puuid: p.Subject }, { staleTime: 300000, enabled: !restricted });
  const ag = useLookups().agent(p.CharacterID);
  const agent = ag?.displayName;
  const id = n ? `${n.GameName}#${n.TagLine}` : "";
  const memo = useNotes((s) => s.memos[id]);
  const r = rankOf(mmr.data);
  const level = restricted || p.PlayerIdentity?.HideAccountLevel ? undefined : p.PlayerIdentity?.AccountLevel;
  return (<>
    <button className={`match-row player ${open ? "active" : ""}`} disabled={compact || restricted} onClick={() => setOpen(!open)}
      style={{ "--agent": ag ? `#${ag.backgroundGradientColors?.[0]?.slice(0, 6)}` : "var(--line)" } as React.CSSProperties}>
      <AgentIcon id={p.CharacterID} />
      <span className="grow">{n ? id : <span className="muted">Hidden player{agent ? ` · ${agent}` : ""}</span>}
        {memo && <span className="badge" title={memo}>memo</span>}
        {blocked && <span className="badge blocked">blocked</span>}</span>
      {level !== undefined && <span className="muted">Lv {level}</span>}
      {!restricted && <Skins items={items} only={["Vandal", "Phantom"]} inline />}
      {restricted ? <span className="muted mono" title="Hidden by safe mode">·</span> : <Rank tier={r.tier} rr={r.rr} />}
    </button>
    {open && (
      <div className="card player-detail">
        <div className="row"><span className="muted">Peak</span><Rank tier={r.peak} /></div>
        <h3>Equipped skins</h3>
        <Skins items={items} />
        <h3>Recent matches</h3>
        <MatchList puuid={p.Subject} start={0} end={5} noScoreboard={!n} />
      </div>
    )}
  </>);
}

const SKIN_SOCKET = "bcef87d6-209b-46c6-8b19-fbe40bd95abc";
const CHROMA_SOCKET = "3ad1b2b2-acdb-4524-852f-954a76ddae0a";

/** Skins from a live-match loadout (`Items` keyed by weapon id, skin and chroma in sockets). */
function Skins({ items, only, inline }: { items?: Record<string, any>; only?: string[]; inline?: boolean }) {
  const L = useLookups();
  const list = Object.values(items ?? {}).flatMap((it: any) => {
    const s = L.skin(it.Sockets?.[SKIN_SOCKET]?.Item?.ID);
    if (!s || (only && !only.includes(s.weapon.displayName))) return [];
    const chromaId = it.Sockets?.[CHROMA_SOCKET]?.Item?.ID?.toLowerCase();
    const chroma = s.skin.chromas.find((c: any) => c.uuid.toLowerCase() === chromaId);
    return [{ ...s, img: chroma?.fullRender ?? s.skin.displayIcon ?? s.weapon.displayIcon }];
  }).sort((a, b) => a.weapon.displayName.localeCompare(b.weapon.displayName));
  if (!items) return inline ? null : <p className="muted">Riot didn't return skins for this player.</p>;
  if (inline) return <span className="muted skins-inline">{list.map((x) => x.skin.displayName).join(" · ")}</span>;
  return (
    <div className="tiles small">
      {list.map((x) => (
        <div className="tile" key={x.skin.uuid} title={x.skin.displayName}>
          <img src={x.img} alt="" /><span className="muted">{x.skin.displayName}</span>
        </div>
      ))}
    </div>
  );
}

/** Rendered in the always-on-top overlay window (toggle with the hotkey). */
/** Rendered in the always-on-top overlay window (toggle with the hotkey). */
export function Overlay() {
  const live = useLive();
  const opacity = useSettings((s) => s.overlayOpacity);
  return (
    <div className="overlay" style={{ "--ov": opacity } as React.CSSProperties}>
      <SessionLine />
      <Q q={live}>{(d) => <LiveBody d={d} compact />}</Q>
    </div>
  );
}
