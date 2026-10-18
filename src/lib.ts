import { invoke } from "@tauri-apps/api/core";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/* ---------- backend (Rust) commands ---------- */
export const inTauri = "__TAURI_INTERNALS__" in window;
export const call = <T = any>(cmd: string, args?: Record<string, unknown>): Promise<T> =>
  inTauri ? invoke<T>(cmd, args) : import("./mock").then((m) => m.mock(cmd, args));

export function useCmd<T = any>(cmd: string, args?: Record<string, unknown>, opts: Partial<UseQueryOptions<T>> = {}) {
  return useQuery<T>({ queryKey: [cmd, args], queryFn: () => call<T>(cmd, args), ...opts } as UseQueryOptions<T>);
}

/* ---------- public game content (valorant-api.com) ---------- */
const va = (path: string) => fetch(`https://valorant-api.com/v1/${path}`).then((r) => r.json()).then((j) => j.data);
export const useContent = (path: string) => useQuery({ queryKey: ["va", path], queryFn: () => va(path), staleTime: Infinity });

export const VP = "85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741";
export const RADIANITE = "e59aa87c-4cbf-517a-5983-6e81511be9b7";
export const KC = "85ca954a-41f2-ce94-9b45-8ca3dd39a00d";

const index = (arr: any[] | undefined, key = "uuid") =>
  Object.fromEntries((arr ?? []).map((x) => [String(x[key]).toLowerCase(), x]));

export function useLookups() {
  const agents = useContent("agents?isPlayableCharacter=true");
  const maps = useContent("maps");
  const tiers = useContent("competitivetiers");
  const weapons = useContent("weapons");
  return useMemo(() => {
    const a = index(agents.data), m = index(maps.data, "mapUrl"), mu = index(maps.data);
    const tierList: any[] = tiers.data?.at(-1)?.tiers ?? [];
    const levels: Record<string, { skin: any; weapon: any; level: any }> = {};
    const skins: Record<string, { skin: any; weapon: any }> = {};
    for (const w of weapons.data ?? [])
      for (const s of w.skins) {
        skins[s.uuid.toLowerCase()] = { skin: s, weapon: w };
        for (const l of s.levels) levels[l.uuid.toLowerCase()] = { skin: s, weapon: w, level: l };
      }
    return {
      agent: (id?: string) => a[id?.toLowerCase() ?? ""],
      map: (idOrUrl?: string) => m[idOrUrl?.toLowerCase() ?? ""] ?? mu[idOrUrl?.toLowerCase() ?? ""],
      maps: (maps.data ?? []) as any[],
      tier: (n?: number) => tierList.find((t) => t.tier === n),
      skinLevel: (id?: string) => levels[id?.toLowerCase() ?? ""],
      skin: (id?: string) => skins[id?.toLowerCase() ?? ""],
      weapons: (weapons.data ?? []) as any[],
    };
  }, [agents.data, maps.data, tiers.data, weapons.data]);
}

/* ---------- mmr helpers ---------- */
export function rankOf(mmr: any) {
  const u = mmr?.LatestCompetitiveUpdate;
  const seasons = Object.values(mmr?.QueueSkills?.competitive?.SeasonalInfoBySeasonID ?? {}) as any[];
  const peak = Math.max(0, ...seasons.flatMap((s) => Object.keys(s.WinsByTier ?? {}).map(Number)));
  return { tier: u?.TierAfterUpdate ?? 0, rr: u?.RankedRatingAfterUpdate ?? 0, peak };
}

/** Riot presence `private` is base64 JSON; field names moved between patches. */
export function decodePresence(p: any) {
  try {
    const j = JSON.parse(atob(p.private));
    return {
      loop: j.sessionLoopState ?? j.matchPresenceData?.sessionLoopState ?? "",
      partyId: j.partyId ?? j.partyPresenceData?.partyId ?? "",
      queue: j.queueId ?? j.queueEntryTime ?? "",
      map: (j.matchMap ?? j.matchPresenceData?.matchMap ?? "") as string,
    };
  } catch {
    return { loop: "", partyId: "", queue: "", map: "" };
  }
}

/* ---------- persisted local state (never leaves the device) ---------- */
type Settings = {
  theme: string; overlay: boolean; hotkey: string; discord: boolean; discordId: string; closeToTray: boolean; friendNotify: boolean;
  /** Hides opponent and hidden-player details and polls the live match less often. */
  safeMode: boolean;
  overlayCorner: "top-left" | "top-right" | "bottom-left" | "bottom-right"; overlayOpacity: number;
  wishlistNotify: boolean; chatNotify: boolean;
  set: (p: Partial<Omit<Settings, "set">>) => void;
};
export const useSettings = create<Settings>()(persist((set) => ({
  theme: "kryptix", overlay: true, hotkey: "Alt+F", discord: false, discordId: "", closeToTray: false, friendNotify: true,
  safeMode: true, overlayCorner: "top-right", overlayOpacity: 0.92, wishlistNotify: true, chatNotify: true,
  set: (p) => set(p),
}), { name: "kryptix-settings", version: 1 }));

// The overlay is a second window: pick up settings saved by the main window.
addEventListener("storage", (e) => { if (e.key === "kryptix-settings") useSettings.persist.rehydrate(); });

type Notes = {
  memos: Record<string, string>; boards: Record<string, string>;
  presets: Record<string, any>; revealed: Record<string, true>;
  /** Wished skins by skin uuid; `notified` holds offer ids already announced. */
  wishlist: Record<string, true>; notified: Record<string, true>;
  setMemo: (id: string, t: string) => void; setBoard: (map: string, png: string) => void;
  setPreset: (name: string, loadout: any | undefined) => void; reveal: (offerId: string) => void;
  toggleWish: (skin: string) => void; markNotified: (offerId: string) => void;
};
export const useNotes = create<Notes>()(persist((set) => ({
  memos: {}, boards: {}, presets: {}, revealed: {}, wishlist: {}, notified: {},
  toggleWish: (skin) => set((s) => {
    const wishlist = { ...s.wishlist };
    if (wishlist[skin]) delete wishlist[skin]; else wishlist[skin] = true;
    return { wishlist };
  }),
  markNotified: (id) => set((s) => ({ notified: { ...s.notified, [id]: true } })),
  setMemo: (id, t) => set((s) => ({ memos: { ...s.memos, [id]: t } })),
  setBoard: (map, png) => set((s) => ({ boards: { ...s.boards, [map]: png } })),
  setPreset: (name, loadout) => set((s) => {
    const presets = { ...s.presets, [name]: loadout };
    if (!loadout) delete presets[name];
    return { presets };
  }),
  reveal: (id) => set((s) => ({ revealed: { ...s.revealed, [id]: true } })),
}), { name: "kryptix-notes" }));

/* ---------- toasts ---------- */
type Toast = { id: number; text: string; kind: "ok" | "error" };
export const useToasts = create<{ list: Toast[]; push: (text: string, kind?: Toast["kind"]) => void }>()((set) => ({
  list: [],
  push: (text, kind = "ok") => {
    const id = Date.now() + Math.random();
    set((s) => ({ list: [...s.list, { id, text, kind }] }));
    setTimeout(() => set((s) => ({ list: s.list.filter((t) => t.id !== id) })), 4000);
  },
}));
export const toast = (text: string, kind?: Toast["kind"]) => useToasts.getState().push(text, kind);

/** Windows notification; asks for permission the first time. */
export async function notify(body: string, title = "KRYPTIX") {
  if (!inTauri) return toast(body);
  if (!(await isPermissionGranted()) && (await requestPermission()) !== "granted") return;
  sendNotification({ title, body });
}
