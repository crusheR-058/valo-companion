import { useEffect, useRef, useState } from "react";
import { HashRouter, NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { call, decodePresence, rankOf, useCmd, useLookups, useSettings } from "./lib";
import { Dashboard, History, Leaderboard, Players, Progression } from "./pages/Account";
import { LiveMatch } from "./pages/Live";
import { Loadout, Shop, Weapons } from "./pages/Items";
import { Chat, Friends } from "./pages/Social";
import { Memos, Settings, Strategies } from "./pages/Local";
import { Toasts } from "./ui";

// Simple 24px stroke icons, one path each.
const ICON: Record<string, string> = {
  dashboard: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
  live: "M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2",
  players: "M11 11m-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0M20 20l-4.5-4.5",
  friends: "M9 8m-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6",
  chat: "M4 5h16v11H9l-5 4z",
  shop: "M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2",
  loadout: "M3 14h11l3-3h4v3l-3 2H9l-2 4H4l1-4H3z",
  progression: "M4 20V14M10 20V9M16 20V12M22 20V4",
  leaderboard: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 6h3a3 3 0 0 1-3 4M7 6H4a3 3 0 0 0 3 4",
  weapons: "M2 12h14l2-2h4v4h-4l-2-2M6 12v4h3v-4",
  strategies: "M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2zM9 4v14M15 6v14",
  memo: "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5",
  settings: "M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1",
};
export const Icon = ({ name }: { name: string }) => (
  <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d={ICON[name]} /></svg>
);

type Item = [path: string, label: string, page: () => React.ReactNode];
const NAV: [string, Item[]][] = [
  ["Play", [["dashboard", "Dashboard", Dashboard], ["live", "Live match", LiveMatch], ["history", "History", History], ["players", "Players", Players]]],
  ["Social", [["friends", "Friends", Friends], ["chat", "Chat", Chat]]],
  ["Collection", [["shop", "Shop", Shop], ["loadout", "Loadout", Loadout], ["weapons", "Weapons", Weapons]]],
  ["Progress", [["progression", "Progression", Progression], ["leaderboard", "Leaderboard", Leaderboard]]],
  ["Tools", [["strategies", "Strategies", Strategies], ["memo", "Memos", Memos], ["settings", "Settings", Settings]]],
];

export default function App() {
  const theme = useSettings((s) => s.theme);
  const loop = useBackground();
  return (
    <HashRouter>
      <div className="app" data-theme={theme}>
        <nav className="side" aria-label="Main">
          <div className="brand"><span className="brand-mark" aria-hidden="true" />VALO<b>COMPANION</b></div>
          <button className="search-btn" onClick={() => dispatchEvent(new Event("palette"))}>
            <Icon name="players" /><span className="grow">Search…</span><kbd>Ctrl K</kbd>
          </button>
          {NAV.map(([group, items]) => (
            <div className="nav-group" key={group}>
              <div className="nav-label">{group}</div>
              {items.map(([path, label]) => (
                <NavLink key={path} to={`/${path}`}>
                  <Icon name={path} />{label}
                  {path === "live" && loop && loop !== "MENUS" && <span className="live-dot" title={LOOP[loop]} />}
                </NavLink>
              ))}
            </div>
          ))}
          <AccountChip loop={loop} />
        </nav>
        <main>
          <Routes>
            {NAV.flatMap(([, items]) => items).map(([path, , C]) => <Route key={path} path={`/${path}`} element={<C />} />)}
            <Route path="*" element={<Navigate to="/dashboard" />} />
          </Routes>
        </main>
        <Palette />
        <Toasts />
      </div>
    </HashRouter>
  );
}

/** Ctrl+K: jump to any page or look up a player. */
function Palette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const nav = useNavigate();
  useEffect(() => {
    const show = () => { setOpen(true); setQ(""); setSel(0); };
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); show(); }
      if (e.key === "Escape") setOpen(false);
    };
    addEventListener("keydown", key);
    addEventListener("palette", show);
    return () => { removeEventListener("keydown", key); removeEventListener("palette", show); };
  }, []);
  if (!open) return null;
  const pages = NAV.flatMap(([, items]) => items).filter(([, label]) => label.toLowerCase().includes(q.toLowerCase().trim()));
  const items = [
    ...pages.map(([path, label]) => ({ key: path, icon: path, label, go: () => nav(`/${path}`) })),
    ...(q.trim() ? [{ key: "search", icon: "players", label: `Find player "${q.trim()}"`, go: () => nav(`/players?q=${encodeURIComponent(q.trim())}`) }] : []),
  ];
  const run = (i: number) => { items[i]?.go(); setOpen(false); };
  return (
    <div className="palette-backdrop" onClick={() => setOpen(false)}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" onClick={(e) => e.stopPropagation()}>
        <input autoFocus placeholder="Jump to a page or find a player (Name#TAG)…" value={q}
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
            if (e.key === "Enter") run(sel);
          }} />
        <div className="palette-list" role="listbox">
          {items.map((it, i) => (
            <button key={it.key} role="option" aria-selected={i === sel} className={i === sel ? "sel" : ""} onMouseEnter={() => setSel(i)} onClick={() => run(i)}>
              <Icon name={it.icon} />{it.label}
            </button>
          ))}
          {!items.length && <p className="muted">No matches.</p>}
        </div>
      </div>
    </div>
  );
}

function AccountChip({ loop }: { loop?: string }) {
  const ov = useCmd("valorant_overview", undefined, { retry: false });
  const lo = useCmd("valorant_loadout_overview", undefined, { retry: false });
  const card = lo.data?.Identity?.PlayerCardID;
  if (!ov.data) return <div className="account muted">{ov.isPending ? "Connecting…" : "Riot Client not found"}</div>;
  return (
    <div className="account">
      {card ? <img src={`https://media.valorant-api.com/playercards/${card}/smallart.png`} alt="" /> : <span className="agent" />}
      <div className="grow">
        <b>{ov.data.session.game_name}</b>
        <div className="muted"><span className={`dot ${loop ? "on" : ""}`} /> {LOOP[loop ?? ""] ?? "Online"}</div>
      </div>
    </div>
  );
}

const LOOP: Record<string, string> = { MENUS: "In menus", PREGAME: "Agent select", INGAME: "In a match" };

/** App-wide jobs: push settings to Rust, friend match-end toasts, Discord status. Returns your own loop state. */
function useBackground() {
  const s = useSettings();
  const ov = useCmd("valorant_overview", undefined, { retry: false });
  const friends = useCmd("valorant_friends", undefined, { refetchInterval: 15000, retry: false });
  const L = useLookups();
  const prev = useRef<Record<string, string>>({});
  const mine = (friends.data?.presences ?? []).find((p: any) => p.puuid === ov.data?.puuid && p.product === "valorant");

  useEffect(() => { call("valorant_warmup").catch(console.warn); }, []);
  useEffect(() => { call("set_overlay_hotkey", { enabled: s.overlay, hotkey: s.hotkey }).catch(console.warn); }, [s.overlay, s.hotkey]);
  useEffect(() => { call("set_close_to_tray", { enabled: s.closeToTray }); }, [s.closeToTray]);
  useEffect(() => { call("set_discord_enabled", { enabled: s.discord }).catch(console.warn); }, [s.discord]);

  useEffect(() => {
    const d = friends.data;
    if (!d) return;
    const names = Object.fromEntries((d.friends ?? []).map((f: any) => [f.puuid, f.game_name]));
    for (const p of d.presences ?? []) {
      if (p.product !== "valorant") continue;
      const loop = decodePresence(p).loop;
      if (s.friendNotify && names[p.puuid] && prev.current[p.puuid] === "INGAME" && loop !== "INGAME") notify(`${names[p.puuid]} just finished a match`);
      prev.current[p.puuid] = loop;
      if (s.discord && p.puuid === ov.data?.puuid) {
        const rank = L.tier(rankOf(ov.data.mmr).tier)?.tierName ?? "Unrated";
        call("update_discord_activity", { details: LOOP[loop] ?? "Online", state: rank }).catch(console.warn);
      }
    }
  }, [friends.data]); // eslint-disable-line react-hooks/exhaustive-deps
  return mine ? decodePresence(mine).loop : undefined;
}

async function notify(body: string) {
  if (!(await isPermissionGranted()) && (await requestPermission()) !== "granted") return;
  sendNotification({ title: "Valo Companion", body });
}
