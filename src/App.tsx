import { useEffect, useRef, useState } from "react";
import { HashRouter, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { check } from "@tauri-apps/plugin-updater";
import { call, decodePresence, inTauri, notify, rankOf, toast, useCmd, useLookups, useNotes, useSettings, VP } from "./lib";
import { Dashboard, History, Leaderboard, Players, Progression } from "./pages/Account";
import { LiveMatch } from "./pages/Live";
import { Loadout, Shop, Weapons } from "./pages/Items";
import { Chat, Friends, LOOP, Party, useConversationName } from "./pages/Social";
import { Memos, Settings, Strategies } from "./pages/Local";
import { Stats } from "./pages/Stats";
import { Collection } from "./pages/Collection";
import { Toasts } from "./ui";
import mark from "./assets/kryptix-mark.png";

// Simple 24px stroke icons, one path each.
const ICON: Record<string, string> = {
  dashboard: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
  live: "M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2",
  stats: "M3 20h18M5 16l4-5 4 3 6-8",
  players: "M11 11m-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0M20 20l-4.5-4.5",
  friends: "M9 8m-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6",
  party: "M7 9m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M17 9m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M2 20a5 5 0 0 1 10 0M12 20a5 5 0 0 1 10 0",
  chat: "M4 5h16v11H9l-5 4z",
  shop: "M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2",
  collection: "M4 7h16v13H4zM7 4h10M9 11h6",
  loadout: "M3 14h11l3-3h4v3l-3 2H9l-2 4H4l1-4H3z",
  weapons: "M2 12h14l2-2h4v4h-4l-2-2M6 12v4h3v-4",
  progression: "M4 20V14M10 20V9M16 20V12M22 20V4",
  leaderboard: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 6h3a3 3 0 0 1-3 4M7 6H4a3 3 0 0 0 3 4",
  strategies: "M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2zM9 4v14M15 6v14",
  memo: "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5",
  settings: "M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1",
};
export const Icon = ({ name }: { name: string }) => (
  <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d={ICON[name]} /></svg>
);

type Item = [path: string, label: string, page: () => React.ReactNode];
const NAV: [string, Item[]][] = [
  ["Play", [["dashboard", "Dashboard", Dashboard], ["live", "Live match", LiveMatch], ["history", "History", History], ["stats", "Stats", Stats], ["players", "Players", Players]]],
  ["Social", [["friends", "Friends", Friends], ["party", "Party", Party], ["chat", "Chat", Chat]]],
  ["Collection", [["shop", "Shop", Shop], ["collection", "Collection", Collection], ["loadout", "Loadout", Loadout], ["weapons", "Weapons", Weapons]]],
  ["Progress", [["progression", "Progression", Progression], ["leaderboard", "Leaderboard", Leaderboard]]],
  ["Tools", [["strategies", "Strategies", Strategies], ["memo", "Memos", Memos], ["settings", "Settings", Settings]]],
];
const PAGES = NAV.flatMap(([, items]) => items);
// Pages that work without the Riot Client.
const OFFLINE = new Set(["weapons", "strategies", "memo", "settings"]);

export default function App() {
  const theme = useSettings((s) => s.theme);
  const loop = useBackground();
  return (
    <HashRouter>
      <div className="app" data-theme={theme}>
        <TitleBar />
        <nav className="side" aria-label="Main">
          <div className="brand"><img src={mark} alt="" /><span>KRYPTIX</span></div>
          <button className="search-btn" onClick={() => dispatchEvent(new Event("palette"))}>
            <Icon name="players" /><span className="grow">Search…</span><kbd>Ctrl K</kbd>
          </button>
          {NAV.map(([group, items]) => (
            <div className="nav-group" key={group}>
              <div className="nav-label">{group}</div>
              {items.map(([path, label]) => (
                <NavLink key={path} to={`/${path}`} title={`${label} (Ctrl+${PAGES.findIndex((p) => p[0] === path) + 1 <= 9 ? PAGES.findIndex((p) => p[0] === path) + 1 : "K"})`}>
                  <Icon name={path} /><span>{label}</span>
                  {path === "live" && loop && loop !== "MENUS" && <span className="live-dot" title={LOOP[loop]} />}
                </NavLink>
              ))}
            </div>
          ))}
          <FriendActivity />
          <AccountChip loop={loop} />
        </nav>
        <main>
          <Gate>
            <Routes>
              {PAGES.map(([path, , C]) => <Route key={path} path={`/${path}`} element={<C />} />)}
              <Route path="*" element={<Navigate to="/dashboard" />} />
            </Routes>
          </Gate>
        </main>
        <Shortcuts />
        <Palette />
        <Toasts />
      </div>
    </HashRouter>
  );
}

/** Frameless window chrome: drag anywhere on the bar, double-click to maximise. */
function TitleBar() {
  if (!inTauri) return null;
  const w = getCurrentWindow();
  return (
    <div className="titlebar" data-tauri-drag-region onDoubleClick={() => w.toggleMaximize()}>
      <span className="titlebar-name" data-tauri-drag-region>KRYPTIX</span>
      <div className="titlebar-buttons">
        <button aria-label="Minimise" onClick={() => w.minimize()}><svg viewBox="0 0 10 10"><path d="M1 5h8" /></svg></button>
        <button aria-label="Maximise" onClick={() => w.toggleMaximize()}><svg viewBox="0 0 10 10"><path d="M1.5 1.5h7v7h-7z" /></svg></button>
        <button aria-label="Close" className="close" onClick={() => w.close()}><svg viewBox="0 0 10 10"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" /></svg></button>
      </div>
    </div>
  );
}

/** Shows a clear "start the Riot Client" screen instead of raw errors, and reconnects by itself. */
function Gate({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  const ov = useCmd("valorant_overview", undefined, { retry: false, refetchInterval: (q) => (q.state.status === "error" ? 5000 : false) });
  if (!ov.isError || OFFLINE.has(loc.pathname.slice(1))) return <>{children}</>;
  const msg = String(ov.error);
  // Matches the messages Riot::login() returns, most specific first.
  const [title, body] =
    /not signed in/i.test(msg) ? ["Sign in to the Riot Client", "The Riot Client is open but no account is signed in. Sign in and this page connects on its own."]
    : /VALORANT log|region/i.test(msg) ? ["Launch VALORANT once", "Your region is read from VALORANT's log, which only exists after the game has run. Start VALORANT, then come back."]
    : /lockfile|connect|refused/i.test(msg) ? ["Start the Riot Client", "Open the Riot Client and sign in. KRYPTIX connects as soon as it's running; you don't need to restart anything."]
    : ["Can't reach Riot", "The Riot Client is running but didn't answer. This usually clears up within a few seconds."];
  return (
    <section className="page gate">
      <div className="gate-mark" aria-hidden="true"><span /><span /><span /></div>
      <h1>{title}</h1>
      <p className="muted">{body}</p>
      <div className="row">
        <button className="primary" onClick={() => call("valorant_clear_caches").then(() => ov.refetch())}>Try again now</button>
        <span className="muted mono small">Checking every 5 seconds</span>
      </div>
      <details><summary className="muted">Details</summary><code>{msg}</code></details>
    </section>
  );
}

/** Ctrl+1…9 opens the first nine pages in sidebar order. */
function Shortcuts() {
  const nav = useNavigate();
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || !/^[1-9]$/.test(e.key)) return;
      const page = PAGES[Number(e.key) - 1];
      if (page) { e.preventDefault(); nav(`/${page[0]}`); }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [nav]);
  return null;
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
  const pages = PAGES.filter(([, label]) => label.toLowerCase().includes(q.toLowerCase().trim()));
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
              {PAGES.findIndex((p) => p[0] === it.key) < 9 && PAGES.findIndex((p) => p[0] === it.key) >= 0 && <kbd>Ctrl {PAGES.findIndex((p) => p[0] === it.key) + 1}</kbd>}
            </button>
          ))}
          {!items.length && <p className="muted">No matches.</p>}
        </div>
      </div>
    </div>
  );
}

/** Friends currently in VALORANT, with what they're doing. */
function FriendActivity() {
  const f = useCmd("valorant_friends", undefined, { refetchInterval: 15000, retry: false });
  const L = useLookups();
  const nav = useNavigate();
  const names = Object.fromEntries((f.data?.friends ?? []).map((x: any) => [x.puuid, x.game_name]));
  const online = (f.data?.presences ?? []).filter((p: any) => p.product === "valorant" && names[p.puuid])
    .map((p: any) => ({ puuid: p.puuid, name: names[p.puuid], ...decodePresence(p) }))
    .sort((a: any, b: any) => (b.loop === "INGAME" ? 1 : 0) - (a.loop === "INGAME" ? 1 : 0)).slice(0, 5);
  if (!online.length) return null;
  return (
    <div className="nav-group activity">
      <div className="nav-label">Online now</div>
      {online.map((p: any) => (
        <button key={p.puuid} className="activity-row" onClick={() => nav("/friends")}>
          <span className={`dot ${p.loop === "INGAME" ? "busy" : "on"}`} />
          <span className="grow">{p.name}</span>
          <span className="muted">{p.loop === "INGAME" ? L.map(p.map)?.displayName ?? "In match" : p.loop === "PREGAME" ? "Selecting" : "Menus"}</span>
        </button>
      ))}
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

/** App-wide jobs: settings → Rust, friend and chat alerts, wishlist alerts, Discord status. Returns your own loop state. */
function useBackground() {
  const s = useSettings();
  const ov = useCmd("valorant_overview", undefined, { retry: false });
  const friends = useCmd("valorant_friends", undefined, { refetchInterval: 15000, retry: false });
  const L = useLookups();
  const prev = useRef<Record<string, string>>({});
  const mine = (friends.data?.presences ?? []).find((p: any) => p.puuid === ov.data?.puuid && p.product === "valorant");
  const me = mine ? decodePresence(mine) : undefined;

  useEffect(() => { call("valorant_warmup").catch(console.warn); }, []);
  useEffect(() => { call("set_overlay_hotkey", { enabled: s.overlay, hotkey: s.hotkey }).catch((e) => toast(`Overlay hotkey: ${e}`, "error")); }, [s.overlay, s.hotkey]);
  useEffect(() => { call("set_overlay_position", { corner: s.overlayCorner }).catch(console.warn); }, [s.overlayCorner]);
  useEffect(() => { call("set_close_to_tray", { enabled: s.closeToTray }); }, [s.closeToTray]);
  useEffect(() => {
    if (!s.discord) { call("set_discord_enabled", { enabled: false, clientId: "" }).catch(console.warn); return; }
    call("set_discord_enabled", { enabled: true, clientId: s.discordId.trim() }).catch((e) => toast(`Discord: ${e}`, "error"));
  }, [s.discord, s.discordId]);

  // Quiet update check at startup; installing happens from Settings.
  useEffect(() => {
    if (!inTauri) return;
    check().then((u) => { if (u) toast(`Version ${u.version} is available. Install it from Settings.`); }).catch(() => {});
  }, []);

  // Friend finished a match.
  useEffect(() => {
    const d = friends.data;
    if (!d) return;
    const names = Object.fromEntries((d.friends ?? []).map((f: any) => [f.puuid, f.game_name]));
    for (const p of d.presences ?? []) {
      if (p.product !== "valorant") continue;
      const loop = decodePresence(p).loop;
      if (s.friendNotify && names[p.puuid] && prev.current[p.puuid] === "INGAME" && loop !== "INGAME") notify(`${names[p.puuid]} just finished a match`);
      prev.current[p.puuid] = loop;
    }
  }, [friends.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Discord: what you're doing, on which map, with which agent, since when.
  const inMatch = me?.loop === "INGAME" || me?.loop === "PREGAME";
  const live = useCmd("valorant_live_match", undefined, { enabled: s.discord && inMatch, refetchInterval: 30000, retry: false });
  const since = useRef<{ loop?: string; at: number }>({ at: Date.now() });
  useEffect(() => {
    if (!s.discord || !ov.data || !me) return;
    if (since.current.loop !== me.loop) since.current = { loop: me.loop, at: Date.now() };
    const rank = L.tier(rankOf(ov.data.mmr).tier)?.tierName;
    const agentId = live.data?.players?.find((p: any) => p.Subject === ov.data.puuid)?.CharacterID;
    const where = [L.map(me.map)?.displayName, L.agent(agentId)?.displayName].filter(Boolean).join(" · ");
    call("update_discord_activity", {
      details: `${LOOP[me.loop] ?? "Online"}${inMatch && where ? ` — ${where}` : ""}`,
      state: rank ? rank.toLowerCase().replace(/(^|\s)\S/g, (c: string) => c.toUpperCase()) : "Unrated",
      start: Math.floor(since.current.at / 1000),
    }).catch(console.warn);
  }, [s.discord, me?.loop, me?.map, live.data, ov.data]); // eslint-disable-line react-hooks/exhaustive-deps

  useWishlistWatch();
  useChatWatch();
  return me?.loop;
}

/** Notifies once per offer when a wished skin is in your daily shop or Night Market. */
function useWishlistWatch() {
  const on = useSettings((s) => s.wishlistNotify);
  const { wishlist, notified, markNotified } = useNotes();
  const L = useLookups();
  const any = Object.keys(wishlist).length > 0;
  const store = useCmd("valorant_storefront", undefined, { enabled: on && any, refetchInterval: 600000, retry: false });
  useEffect(() => {
    const d = store.data;
    if (!d || !on) return;
    const offers = [
      ...(d.SkinsPanelLayout?.SingleItemStoreOffers ?? []).map((o: any) => ({ id: o.OfferID, item: o.Rewards?.[0]?.ItemID, cost: o.Cost?.[VP], where: "daily shop" })),
      ...(d.BonusStore?.BonusStoreOffers ?? []).map((o: any) => ({ id: o.BonusOfferID, item: o.Offer?.Rewards?.[0]?.ItemID, cost: o.DiscountCosts?.[VP], where: "Night Market" })),
    ];
    for (const o of offers) {
      const s = L.skinLevel(o.item)?.skin;
      // Offer ids repeat across days, so the day is part of the key.
      const key = `${o.id}:${new Date().toDateString()}`;
      if (s && wishlist[s.uuid] && !notified[key]) {
        markNotified(key);
        notify(`${s.displayName} is in your ${o.where} for ${o.cost?.toLocaleString()} VP`, "Wishlist skin for sale");
      }
    }
  }, [store.data, L]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Toast plus a Windows notification when a new chat message arrives while you're not reading it. */
function useChatWatch() {
  const on = useSettings((s) => s.chatNotify);
  const convs = useCmd("valorant_chat_conversations", undefined, { enabled: on, refetchInterval: 10000, retry: false });
  const nameOf = useConversationName();
  const seen = useRef<Record<string, number>>(undefined);
  useEffect(() => {
    const list: any[] = convs.data?.conversations ?? [];
    if (!list.length) return;
    const first = !seen.current;
    seen.current ??= {};
    for (const c of list) {
      const was = seen.current[c.cid] ?? 0;
      seen.current[c.cid] = c.unread_count;
      if (!first && c.unread_count > was && c.type === "chat") {
        const text = `New message from ${nameOf(c)}`;
        if (document.hasFocus()) toast(text); else notify(text);
      }
    }
  }, [convs.data]); // eslint-disable-line react-hooks/exhaustive-deps
}
