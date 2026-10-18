import { useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { inTauri, toast, useLookups, useNotes, useSettings } from "../lib";
import { Page } from "../ui";

export function Strategies() {
  const maps = useLookups().maps.filter((m) => m.tacticalDescription);
  const [mapId, setMapId] = useState("");
  const [color, setColor] = useState("#ff4655");
  const { boards, setBoard } = useNotes();
  const cv = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const map = maps.find((m) => m.uuid === mapId) ?? maps[0];

  useEffect(() => {
    const c = cv.current, ctx = c?.getContext("2d");
    if (!c || !ctx || !map) return;
    ctx.clearRect(0, 0, c.width, c.height);
    const saved = boards[map.uuid];
    if (saved) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0); img.src = saved; }
  }, [map?.uuid]); // eslint-disable-line react-hooks/exhaustive-deps

  const pos = (e: React.PointerEvent) => {
    const r = cv.current!.getBoundingClientRect();
    return [(e.clientX - r.left) * (cv.current!.width / r.width), (e.clientY - r.top) * (cv.current!.height / r.height)];
  };
  const ctx = () => cv.current!.getContext("2d")!;

  return (
    <Page title="Strategy board" actions={<>
      <select value={map?.uuid ?? ""} onChange={(e) => setMapId(e.target.value)}>
        {maps.map((m) => <option key={m.uuid} value={m.uuid}>{m.displayName}</option>)}
      </select>
      <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Pen color" />
      <button onClick={() => { ctx().clearRect(0, 0, 800, 800); setBoard(map.uuid, ""); }}>Clear</button>
    </>}>
      {map && (
        <canvas ref={cv} width={800} height={800} className="board" style={{ backgroundImage: `url(${map.displayIcon})` }}
          onPointerDown={(e) => { drawing.current = true; const [x, y] = pos(e); ctx().beginPath(); ctx().moveTo(x, y); }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const [x, y] = pos(e), c = ctx();
            c.strokeStyle = color; c.lineWidth = 4; c.lineCap = "round"; c.lineTo(x, y); c.stroke();
          }}
          onPointerUp={() => { drawing.current = false; setBoard(map.uuid, cv.current!.toDataURL()); }}
          onPointerLeave={() => { if (drawing.current) { drawing.current = false; setBoard(map.uuid, cv.current!.toDataURL()); } }}
        />
      )}
    </Page>
  );
}

export function Memos() {
  const { memos, setMemo } = useNotes();
  const [id, setId] = useState("");
  const entries = Object.entries(memos).filter(([, t]) => t);
  return (
    <Page title="Player memos">
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (id.includes("#")) { setMemo(id, memos[id] || " "); setId(""); } }}>
        <input placeholder="Name#TAG" value={id} onChange={(e) => setId(e.target.value)} />
        <button>New memo</button>
      </form>
      <p className="muted">Memos show as a badge next to that player in the live match view. Stored only on this PC.</p>
      <div className="list">
        {entries.map(([k, t]) => (
          <div className="card" key={k}>
            <div className="row"><b className="grow">{k}</b><button onClick={() => setMemo(k, "")}>Delete</button></div>
            <textarea value={t} onChange={(e) => setMemo(k, e.target.value)} />
          </div>
        ))}
      </div>
    </Page>
  );
}

const THEMES: [id: string, label: string, swatch: string[]][] = [
  ["kryptix", "Kryptix", ["#0a0a0c", "#141417", "#f4f2f2", "#ff3b4f", "#f4f2f2"]],
  ["midnight", "Midnight", ["#0e1216", "#151b21", "#ece8e1", "#86e0cf", "#d4b27a"]],
  ["daylight", "Daylight", ["#eef0f2", "#f8f9fa", "#11161b", "#1f8f7c", "#9a7333"]],
  ["crimson", "Crimson", ["#140d10", "#1d1418", "#f1e6e3", "#e8a0a6", "#d9b27e"]],
  ["jade", "Jade", ["#0b1412", "#12201c", "#e5efe9", "#9fe0b8", "#d8bd85"]],
];
const CORNERS = [["top-left", "Top left"], ["top-right", "Top right"], ["bottom-left", "Bottom left"], ["bottom-right", "Bottom right"]] as const;

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="setting">
      <span><b>{label}</b>{hint && <small className="muted">{hint}</small>}</span>
      <input type="checkbox" role="switch" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** Click, then press the key combination. Esc cancels. */
function HotkeyRecorder({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [rec, setRec] = useState(false);
  return (
    <button className={`hotkey ${rec ? "rec" : ""}`} aria-label={rec ? "Press a key combination" : `Overlay hotkey: ${value}. Click to change`}
      onClick={() => setRec(true)} onBlur={() => setRec(false)}
      onKeyDown={(e) => {
        if (!rec) return;
        e.preventDefault();
        if (e.key === "Escape") return setRec(false);
        if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
        const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift"].filter(Boolean);
        if (!mods.length) return; // a bare key would fire while typing in game chat
        onChange([...mods, e.code.replace(/^Key|^Digit/, "")].join("+"));
        setRec(false);
      }}>
      {rec ? "Press keys…" : value.split("+").map((k) => <kbd key={k}>{k}</kbd>)}
    </button>
  );
}

export function Settings() {
  const s = useSettings();
  const [auto, setAuto] = useState<boolean>();
  const [update, setUpdate] = useState<string>("");
  useEffect(() => { if (inTauri) isEnabled().then(setAuto).catch(() => setAuto(false)); }, []);

  const checkUpdate = async () => {
    setUpdate("Checking…");
    try {
      const u = await check();
      if (!u) return setUpdate("You're on the latest version.");
      setUpdate(`Installing ${u.version}…`);
      await u.downloadAndInstall();
      await relaunch();
    } catch (e) { setUpdate(`Couldn't check for updates: ${e}`); }
  };

  return (
    <Page title="Settings">
      <section className="settings-group">
        <h3>Appearance</h3>
        <div className="themes" role="radiogroup" aria-label="Theme">
          {THEMES.map(([id, label, c]) => (
            <button key={id} role="radio" aria-checked={s.theme === id} className={`theme ${s.theme === id ? "on" : ""}`} onClick={() => s.set({ theme: id })}>
              <span className="theme-preview" style={{ background: c[0] }}>
                <i style={{ background: c[1] }} /><em style={{ color: c[2] }}>Aa</em><b style={{ background: c[3] }} /><b style={{ background: c[4] }} />
              </span>
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-group">
        <h3>Safety</h3>
        <Toggle label="Safe mode" checked={s.safeMode} onChange={(v) => s.set({ safeMode: v })}
          hint="Hides opponent ranks, skins and levels, and anything about players who hide their name. Checks the live match every 15 s instead of 5 s." />
      </section>

      <section className="settings-group">
        <h3>In-game overlay</h3>
        <Toggle label="Overlay" hint="An always-on-top panel over the game, shown and hidden with the hotkey." checked={s.overlay} onChange={(v) => s.set({ overlay: v })} />
        <div className="setting"><span><b>Hotkey</b><small className="muted">Needs Ctrl, Alt or Shift.</small></span><HotkeyRecorder value={s.hotkey} onChange={(hotkey) => s.set({ hotkey })} /></div>
        <div className="setting"><span><b>Position</b></span>
          <div className="seg" role="radiogroup" aria-label="Overlay position">
            {CORNERS.map(([k, label]) => <button key={k} role="radio" aria-checked={s.overlayCorner === k} className={s.overlayCorner === k ? "on" : ""} onClick={() => s.set({ overlayCorner: k })}>{label}</button>)}
          </div>
        </div>
        <label className="setting"><span><b>Background opacity</b><small className="muted">{Math.round(s.overlayOpacity * 100)}%</small></span>
          <input type="range" min={0.4} max={1} step={0.02} value={s.overlayOpacity} onChange={(e) => s.set({ overlayOpacity: Number(e.target.value) })} />
        </label>
      </section>

      <section className="settings-group">
        <h3>Notifications</h3>
        <Toggle label="Friend finished a match" checked={s.friendNotify} onChange={(v) => s.set({ friendNotify: v })} />
        <Toggle label="New chat messages" checked={s.chatNotify} onChange={(v) => s.set({ chatNotify: v })} />
        <Toggle label="Wishlist skin for sale" hint="Checks your shop every 10 minutes while the app is open." checked={s.wishlistNotify} onChange={(v) => s.set({ wishlistNotify: v })} />
      </section>

      <section className="settings-group">
        <h3>Discord</h3>
        <Toggle label="Show my status on Discord" hint="Your activity, map, agent and rank." checked={s.discord} onChange={(v) => s.set({ discord: v })} />
        <label className="setting"><span><b>Application ID</b><small className="muted">Create an app on the Discord developer portal and paste its ID.</small></span>
          <input inputMode="numeric" placeholder="e.g. 1234567890123456789" value={s.discordId} onChange={(e) => s.set({ discordId: e.target.value.replace(/\D/g, "") })} />
        </label>
        <button className="link" onClick={() => openUrl("https://discord.com/developers/applications")}>Open Discord developer portal</button>
      </section>

      <section className="settings-group">
        <h3>App</h3>
        <Toggle label="Start with Windows" hint="Starts in the tray when you sign in to Windows." checked={!!auto} onChange={async (v) => {
          try { await (v ? enable() : disable()); setAuto(v); } catch (e) { toast(String(e), "error"); }
        }} />
        <Toggle label="Close to tray" hint="The close button hides the window; quit from the tray icon." checked={s.closeToTray} onChange={(v) => s.set({ closeToTray: v })} />
        <div className="setting"><span><b>Updates</b><small className="muted">{update || "Checks GitHub for a newer version."}</small></span><button onClick={checkUpdate}>Check for updates</button></div>
        <div className="setting"><span><b>Patch notes</b></span><button onClick={() => openUrl("https://playvalorant.com/news/tags/patch-notes/")}>Open patch notes</button></div>
      </section>
    </Page>
  );
}
