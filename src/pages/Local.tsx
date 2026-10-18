import { useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useLookups, useNotes, useSettings } from "../lib";
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

const THEMES = ["midnight", "daylight", "crimson", "jade"];

export function Settings() {
  const s = useSettings();
  return (
    <Page title="Settings">
      <div className="card settings">
        <label>Theme
          <select value={s.theme} onChange={(e) => s.set({ theme: e.target.value })}>
            {THEMES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label><input type="checkbox" checked={s.overlay} onChange={(e) => s.set({ overlay: e.target.checked })} /> In-game overlay</label>
        <label>Overlay hotkey
          <input value={s.hotkey} onChange={(e) => s.set({ hotkey: e.target.value })} placeholder="Alt+F" />
        </label>
        <label><input type="checkbox" checked={s.discord} onChange={(e) => s.set({ discord: e.target.checked })} /> Show status on Discord</label>
        <label><input type="checkbox" checked={s.closeToTray} onChange={(e) => s.set({ closeToTray: e.target.checked })} /> Close to tray</label>
        <label><input type="checkbox" checked={s.friendNotify} onChange={(e) => s.set({ friendNotify: e.target.checked })} /> Notify when a friend's match ends</label>
        <button onClick={() => openUrl("https://playvalorant.com/news/tags/patch-notes/")}>Open patch notes</button>
      </div>
    </Page>
  );
}
