import { useMemo, useState } from "react";
import { useCmd, useContent, useLookups, useNotes, VP } from "../lib";
import { CountUp, Page, Q } from "../ui";

const CHROMA_TYPE = "3ad1b2b2-acdb-4524-852f-954a76ddae0a";

/** Star toggle that adds a skin to the wishlist; the shop notifies you when it appears. */
export function WishStar({ skin, name }: { skin: string; name: string }) {
  const on = useNotes((s) => !!s.wishlist[skin]);
  const toggle = useNotes((s) => s.toggleWish);
  return (
    <button className={`wish ${on ? "on" : ""}`} aria-pressed={on} aria-label={on ? `Remove ${name} from wishlist` : `Add ${name} to wishlist`}
      title={on ? "On your wishlist" : "Add to wishlist"} onClick={(e) => { e.stopPropagation(); toggle(skin); }}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" /></svg>
    </button>
  );
}

export function Collection() {
  const L = useLookups();
  const levels = useCmd("valorant_inventory");
  const chromas = useCmd("valorant_inventory", { itemType: CHROMA_TYPE });
  const offers = useCmd("valorant_offers", undefined, { staleTime: 3600000 });
  const tiers = useContent("contenttiers");
  const wishlist = useNotes((s) => s.wishlist);
  const [view, setView] = useState<"owned" | "all" | "wishlist">("owned");
  const [weapon, setWeapon] = useState("");
  const [q, setQ] = useState("");

  const owned = useMemo(() => new Set([...(levels.data?.Entitlements ?? []), ...(chromas.data?.Entitlements ?? [])].map((e: any) => e.ItemID.toLowerCase())), [levels.data, chromas.data]);
  // Store prices are listed against a skin's first level.
  const price = useMemo(() => Object.fromEntries((offers.data?.Offers ?? []).map((o: any) => [o.Rewards?.[0]?.ItemID?.toLowerCase(), o.Cost?.[VP] ?? 0])), [offers.data]);

  const all = useMemo(() => L.weapons.flatMap((w) => w.skins.filter((s: any) => s.uuid !== w.defaultSkinUuid && !/standard|random/i.test(s.displayName))
    .map((s: any) => ({ w, s, mine: s.levels.some((l: any) => owned.has(l.uuid.toLowerCase())), vp: price[s.levels[0]?.uuid.toLowerCase()] ?? 0 }))), [L.weapons, owned, price]);
  const mine = all.filter((x) => x.mine);
  const value = mine.reduce((n, x) => n + x.vp, 0);
  const shown = all.filter((x) => (view === "owned" ? x.mine : view === "wishlist" ? wishlist[x.s.uuid] : true)
    && (!weapon || x.w.uuid === weapon) && (!q || x.s.displayName.toLowerCase().includes(q.toLowerCase())));

  return (
    <Page title="Collection" sub="Every skin you own, what it cost, and the ones you're waiting for.">
      <Q q={levels}>{() => (<>
        <div className="ledger">
          <div><span className="eyebrow">Skins owned</span><b><CountUp value={mine.length} /></b></div>
          <div><span className="eyebrow">Store value</span><b className="gilt"><CountUp value={value} /> <small>VP</small></b></div>
          <div><span className="eyebrow">Wishlist</span><b><CountUp value={Object.keys(wishlist).length} /></b></div>
        </div>
        <div className="toolbar">
          <div className="seg" role="radiogroup" aria-label="Show">
            {([["owned", "Owned"], ["wishlist", "Wishlist"], ["all", "All skins"]] as const).map(([k, label]) => (
              <button key={k} role="radio" aria-checked={view === k} className={view === k ? "on" : ""} onClick={() => setView(k)}>{label}</button>
            ))}
          </div>
          <select value={weapon} onChange={(e) => setWeapon(e.target.value)} aria-label="Weapon">
            <option value="">All weapons</option>
            {L.weapons.map((w) => <option key={w.uuid} value={w.uuid}>{w.displayName}</option>)}
          </select>
          <input type="search" placeholder="Search skins" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search skins" />
        </div>
        {!shown.length && <p className="muted empty">{view === "wishlist" ? "Star skins in the All skins view or the shop, and you'll be notified when they're for sale." : "Nothing matches these filters."}</p>}
        <div className="tiles">
          {shown.slice(0, 120).map(({ w, s, mine, vp }) => {
            const tier = (tiers.data ?? []).find((t: any) => t.uuid === s.contentTierUuid);
            const lv = s.levels.filter((l: any) => owned.has(l.uuid.toLowerCase())).length;
            const ch = s.chromas.filter((c: any, i: number) => i === 0 ? mine : owned.has(c.uuid.toLowerCase())).length;
            return (
              <div key={s.uuid} className={`card tile offer ${mine ? "" : "unowned"}`} style={tier ? { "--tier": `#${tier.highlightColor.slice(0, 6)}` } as React.CSSProperties : undefined}>
                <WishStar skin={s.uuid} name={s.displayName} />
                <img className="offer-img" src={s.chromas[0]?.fullRender ?? s.displayIcon ?? w.displayIcon} alt="" loading="lazy" />
                <div className="offer-name">{s.displayName}</div>
                <div className="row price">
                  {vp ? <b>{vp.toLocaleString()} VP</b> : <span className="muted">Not sold</span>}
                  {mine && s.levels.length > 1 && <span className="muted mono">Lv {lv}/{s.levels.length}</span>}
                  {mine && s.chromas.length > 1 && <span className="muted mono">Var {ch}/{s.chromas.length}</span>}
                </div>
              </div>
            );
          })}
        </div>
        {shown.length > 120 && <p className="muted">Showing 120 of {shown.length}. Pick a weapon or search to narrow it down.</p>}
      </>)}</Q>
    </Page>
  );
}
