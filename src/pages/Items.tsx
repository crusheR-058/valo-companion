import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { call, toast, useCmd, useContent, useLookups, useNotes, VP } from "../lib";
import { Page, Q } from "../ui";

const hms = (s: number) => `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;

export function Shop() {
  const store = useCmd("valorant_storefront", undefined, { refetchInterval: 30000 });
  return (
    <Page title="Shop">
      <Q q={store}>{(s) => {
        const daily = s.SkinsPanelLayout;
        const night = s.BonusStore?.BonusStoreOffers;
        return (<>
          {s.FeaturedBundle?.Bundle && <Bundle id={s.FeaturedBundle.Bundle.DataAssetID} secs={s.FeaturedBundle.BundleRemainingDurationInSeconds} />}
          <h3>Daily offers <span className="muted">· refreshes in {hms(daily.SingleItemOffersRemainingDurationInSeconds)}</span></h3>
          <div className="tiles">
            {daily.SingleItemStoreOffers.map((o: any) => <Skin key={o.OfferID} level={o.Rewards[0].ItemID} cost={o.Cost[VP]} />)}
          </div>
          {night && (<>
            <h3>Night Market <span className="muted">· ends in {hms(s.BonusStore.BonusStoreRemainingDurationInSeconds)}</span></h3>
            <div className="tiles">
              {night.map((o: any) => <NightOffer key={o.BonusOfferID} o={o} />)}
            </div>
          </>)}
        </>);
      }}</Q>
    </Page>
  );
}

function Bundle({ id, secs }: { id: string; secs: number }) {
  const b = useContent(`bundles/${id}`);
  if (!b.data) return null;
  return (
    <div className="card bundle" style={{ backgroundImage: `url(${b.data.displayIcon})` }}>
      <span className="eyebrow">Featured bundle · {hms(secs)} left</span><h2>{b.data.displayName}</h2>
    </div>
  );
}

/** Night Market cards start face down; reveals are remembered on this device. */
function NightOffer({ o }: { o: any }) {
  const { revealed, reveal } = useNotes();
  const shown = !!revealed[o.BonusOfferID];
  return (
    <div className={`flip ${shown ? "flipped" : ""}`}>
      <button className="card tile reveal flip-front" disabled={shown} aria-hidden={shown} onClick={() => reveal(o.BonusOfferID)}>
        <b>?</b><span className="muted">Reveal offer</span>
      </button>
      <div className="flip-back" aria-hidden={!shown}>
        <Skin level={o.Offer.Rewards[0].ItemID} cost={o.DiscountCosts[VP]} was={o.Offer.Cost[VP]} pct={o.DiscountPercent} />
      </div>
    </div>
  );
}

function Skin({ level, cost, was, pct }: { level: string; cost: number; was?: number; pct?: number }) {
  const s = useLookups().skinLevel(level);
  const tiers = useContent("contenttiers");
  const tier = (tiers.data ?? []).find((t: any) => t.uuid === s?.skin.contentTierUuid);
  return (
    <div className="card tile offer" style={tier ? { "--tier": `#${tier.highlightColor.slice(0, 6)}` } as React.CSSProperties : undefined}>
      {tier && <img className="tier-icon" src={tier.displayIcon} alt={tier.devName} title={tier.devName} />}
      {s && <img className="offer-img" src={s.level.displayIcon ?? s.skin.displayIcon} alt="" />}
      <div className="offer-name">{s?.skin.displayName ?? "Unknown skin"}</div>
      <div className="row price"><b>{cost?.toLocaleString()} VP</b>{was && <s className="muted">{was.toLocaleString()}</s>}{pct && <span className="badge">-{pct}%</span>}</div>
    </div>
  );
}

export function Loadout() {
  const qc = useQueryClient();
  const lo = useCmd("valorant_loadout_overview");
  const inv = useCmd("valorant_inventory");
  const up = useCmd("valorant_item_upgrades", undefined, { staleTime: Infinity });
  const L = useLookups();
  const owned = new Set((inv.data?.Entitlements ?? []).map((e: any) => e.ItemID.toLowerCase()));
  // Radianite price per skin level / chroma, keyed by the item the upgrade unlocks.
  const upgradeCost = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of up.data?.Definitions ?? [])
      for (const sg of d.Sidegrades ?? []) for (const o of sg.Options ?? []) for (const r of o.Rewards ?? [])
        if (o.Cost?.Amount) m[r.ItemID.toLowerCase()] = o.Cost.Amount;
    return m;
  }, [up.data]);

  const put = async (loadout: any) => {
    try {
      await call("valorant_apply_loadout", { loadout });
      toast("Loadout applied. It shows in game on the next round or menu refresh.");
      qc.invalidateQueries({ queryKey: ["valorant_loadout_overview"] });
    } catch (e) { toast(String(e), "error"); }
  };
  const apply = (loadout: any, gunId: string, skin: any) => {
    const level = [...skin.levels].reverse().find((l: any) => owned.has(l.uuid.toLowerCase())) ?? skin.levels[0];
    put({ ...loadout, Guns: loadout.Guns.map((g: any) => g.ID !== gunId ? g : { ...g, SkinID: skin.uuid, SkinLevelID: level.uuid, ChromaID: skin.chromas[0].uuid }) });
  };

  return (
    <Page title="Loadout">
      <Q q={lo}>{(d) => (<>
        <Presets loadout={d} onApply={(p) => put({ ...d, Guns: p.Guns, Sprays: p.Sprays, Identity: p.Identity })} />
        <div className="tiles">
          {d.Guns.map((g: any) => {
            const w = L.weapons.find((x) => x.uuid.toLowerCase() === g.ID.toLowerCase());
            if (!w) return null;
            const skins = w.skins.filter((s: any) => s.uuid === w.defaultSkinUuid || s.levels.some((l: any) => owned.has(l.uuid.toLowerCase())));
            const cur = w.skins.find((s: any) => s.uuid.toLowerCase() === g.SkinID.toLowerCase());
            const next = [...(cur?.levels ?? []), ...(cur?.chromas ?? [])].find((x: any) => !owned.has(x.uuid.toLowerCase()) && upgradeCost[x.uuid.toLowerCase()]);
            return (
              <div className="card tile" key={g.ID}>
                <img src={cur?.displayIcon ?? cur?.chromas[0]?.fullRender ?? w.displayIcon} alt="" />
                <div className="muted">{w.displayName}</div>
                <select value={cur?.uuid ?? ""} onChange={(e) => apply(d, g.ID, w.skins.find((s: any) => s.uuid === e.target.value))}>
                  {skins.map((s: any) => <option key={s.uuid} value={s.uuid}>{s.displayName}</option>)}
                </select>
                {next && <div className="muted">Next upgrade: {upgradeCost[next.uuid.toLowerCase()]} Radianite</div>}
              </div>
            );
          })}
        </div>
      </>)}</Q>
    </Page>
  );
}

/** Saved loadouts (guns, sprays, card and title), kept per Riot account on this device. */
function Presets({ loadout, onApply }: { loadout: any; onApply: (p: any) => void }) {
  const { presets, setPreset } = useNotes();
  const [name, setName] = useState("");
  const mine = Object.entries(presets).filter(([, p]) => p.Subject === loadout.Subject);
  const save = () => {
    setPreset(`${loadout.Subject}:${name.trim()}`, { Subject: loadout.Subject, Name: name.trim(), Guns: loadout.Guns, Sprays: loadout.Sprays, Identity: loadout.Identity });
    setName("");
  };
  return (
    <div className="card row presets">
      <b>Presets</b>
      {mine.length === 0 && <span className="muted">None saved yet.</span>}
      {mine.map(([key, p]) => (
        <span key={key} className="chip">
          <button onClick={() => onApply(p)}>{p.Name}</button>
          <button aria-label={`Delete preset ${p.Name}`} onClick={() => setPreset(key, undefined)}>×</button>
        </span>
      ))}
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (name.trim()) save(); }}>
        <input placeholder="Name this loadout" value={name} onChange={(e) => setName(e.target.value)} />
        <button disabled={!name.trim()}>Save current</button>
      </form>
    </div>
  );
}

export function Weapons() {
  const L = useLookups();
  return (
    <Page title="Weapon library">
      <div className="tiles">
        {L.weapons.map((w) => (
          <div className="card tile" key={w.uuid}>
            <img src={w.displayIcon} alt="" />
            <b>{w.displayName}</b>
            <div className="muted">{w.category.split("::").pop()} · {w.shopData?.cost ?? 0} credits</div>
            {w.weaponStats && <div className="muted">{w.weaponStats.fireRate}/s · mag {w.weaponStats.magazineSize} · {w.skins.length} skins</div>}
          </div>
        ))}
      </div>
    </Page>
  );
}
