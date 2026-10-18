// Dev-only fake backend so the UI can be designed in a plain browser (`npm run dev`) without the Riot Client.
// Never loaded inside Tauri: lib.ts only imports it when __TAURI_INTERNALS__ is missing.
const va = (p: string) => fetch(`https://valorant-api.com/v1/${p}`).then((r) => r.json()).then((j) => j.data);
const ME = "me-0000";
const AGENTS = ["add6443a-41bd-e414-f6ad-e58d267f4e95", "a3bfb853-43b2-7238-a4f1-ad90e9e46bcc", "569fdd95-4d10-43ab-ca70-79becc718b46",
  "8e253930-4c05-31dd-1b6c-968525494517", "320b2a48-4d9b-a075-30f1-1f93a9b638fa"];
const MAPS = ["/Game/Maps/Ascent/Ascent", "/Game/Maps/Bonsai/Bonsai", "/Game/Maps/Triad/Triad", "/Game/Maps/Port/Port", "/Game/Maps/Foxtrot/Foxtrot"];
const NAMES = ["Kairo", "nyx", "Pixel Wraith", "Dusk", "tempo", "Ferro", "Lumen", "ash", "Vesper"];
const players = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`).map((s, i) => (i === 0 ? ME : s));

let weapons: any[] | undefined, bundles: any[] | undefined, maps: any[] | undefined;
const VPID = "85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741";
// Deterministic pseudo-random so the mock looks the same on every reload.
const rnd = (seed: number) => { const x = Math.sin(seed * 9301 + 49297) * 233280; return x - Math.floor(x); };
const skins = async () => (weapons ??= await va("weapons")).flatMap((w: any) => w.skins.filter((s: any) => s.contentTierUuid));

export async function mock(cmd: string, args: any = {}): Promise<any> {
  switch (cmd) {
    case "valorant_overview": return {
      puuid: ME, session: { game_name: "Kairo", game_tag: "EUW" },
      mmr: { LatestCompetitiveUpdate: { TierAfterUpdate: 21, RankedRatingAfterUpdate: 64 },
        QueueSkills: { competitive: { SeasonalInfoBySeasonID: { a: { WinsByTier: { 19: 3, 22: 1 } } } } } },
    };
    case "valorant_wallet": return { Balances: { "85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741": 2150, "e59aa87c-4cbf-517a-5983-6e81511be9b7": 340, "85ca954a-41f2-ce94-9b45-8ca3dd39a00d": 8200 } };
    case "valorant_match_history": return { Subject: args.puuid ?? ME, History: Array.from({ length: args.end - args.start }, (_, i) => ({ MatchID: `m${args.start + i}` })) };
    case "valorant_match_details": {
      const n = Number(String(args.matchId).slice(1)) || 0;
      const won = n % 3 !== 1;
      return {
        matchInfo: { mapId: MAPS[n % MAPS.length], queueID: n % 4 ? "competitive" : "unrated", gameStartMillis: Date.now() - (n + 1) * 5.2e6 },
        teams: [{ teamId: "Blue", won, roundsWon: won ? 13 : 9 }, { teamId: "Red", won: !won, roundsWon: won ? 8 : 13 }],
        ...(await rounds(n, won, MAPS[n % MAPS.length])),
        players: players(10).map((s, i) => ({
          subject: s, teamId: i < 5 ? "Blue" : "Red", characterId: AGENTS[(i + n) % 5], competitiveTier: 15 + ((i * 3 + n) % 9),
          gameName: NAMES[i % NAMES.length], tagLine: "0" + i,
          stats: { kills: 8 + ((i * 7 + n) % 18), deaths: 9 + ((i * 5) % 9), assists: (i * 3) % 9, score: 3800 + ((i * 937 + n * 211) % 3600), roundsPlayed: 21 },
        })),
      };
    }
    case "valorant_live_match": {
      const ids = players(10);
      const all = await skins();
      return {
        phase: "ingame", me: ME, match: { MapID: MAPS[0] },
        players: ids.map((s, i) => ({ Subject: s, TeamID: i < 5 ? "Blue" : "Red", CharacterID: AGENTS[i % 5],
          PlayerIdentity: { AccountLevel: 40 + i * 17, Incognito: i === 7, HideAccountLevel: i === 3 } })),
        names: ids.filter((_, i) => i !== 7).map((s, i) => ({ Subject: s, GameName: NAMES[i], TagLine: "0" + i })),
        loadouts: { Loadouts: ids.map((s, i) => ({ Loadout: { Subject: s, Items: Object.fromEntries(
          [all[i * 3], all[i * 5 + 1], all[i * 7 + 2]].filter(Boolean).map((sk: any) => [sk.uuid, { Sockets: { "bcef87d6-209b-46c6-8b19-fbe40bd95abc": { Item: { ID: sk.uuid } } } }])) } })) },
      };
    }
    case "valorant_scout_player": return { LatestCompetitiveUpdate: { TierAfterUpdate: 12 + (args.puuid.length * 3) % 12, RankedRatingAfterUpdate: 37 } };
    case "valorant_storefront": {
      const s = await skins();
      const lvl = (k: number) => s[k * 13 % s.length].levels[0].uuid;
      bundles ??= await va("bundles");
      return {
        FeaturedBundle: { Bundle: { DataAssetID: bundles![bundles!.length - 1].uuid }, BundleRemainingDurationInSeconds: 380000 },
        SkinsPanelLayout: { SingleItemOffersRemainingDurationInSeconds: 41000,
          SingleItemStoreOffers: [1, 2, 3, 4].map((k) => ({ OfferID: `o${k}`, Rewards: [{ ItemID: lvl(k) }], Cost: { "85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741": 875 + k * 300 } })) },
        BonusStore: { BonusStoreRemainingDurationInSeconds: 600000, BonusStoreOffers: [5, 6, 7, 8, 9, 10].map((k) => ({
          BonusOfferID: `b${k}`, DiscountPercent: 20 + k * 3, DiscountCosts: { "85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741": 900 },
          Offer: { Rewards: [{ ItemID: lvl(k) }], Cost: { "85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741": 1775 } } })) },
      };
    }
    case "valorant_friends": return {
      friends: NAMES.map((n, i) => ({ puuid: `f${i}`, pid: `f${i}@eu1.pvp.net`, game_name: n, game_tag: "0" + i })),
      presences: [[0, "MENUS"], [2, "INGAME"], [5, "PREGAME"], [6, "INGAME"]].map(([i, loop]) => ({ puuid: `f${i}`, product: "valorant",
        private: btoa(JSON.stringify({ sessionLoopState: loop, matchMap: MAPS[Number(i) % MAPS.length], partyId: i === 0 ? "party-f0" : "" })) })),
    };
    case "valorant_competitive_updates": {
      let tier = 19, rr = 40;
      const list = Array.from({ length: 20 }, (_, i) => {
        const earned = Math.round((rnd(i + 3) - .42) * 46);
        rr += earned;
        if (rr >= 100) { tier++; rr -= 100; } else if (rr < 0) { tier--; rr += 100; }
        return { MatchID: `c${i}`, MatchStartTime: Date.now() - (19 - i) * 7.2e6, TierAfterUpdate: tier, RankedRatingAfterUpdate: rr, RankedRatingEarned: earned };
      });
      return { Matches: list.reverse() };
    }
    case "valorant_inventory": {
      const all = await skins();
      if (args.itemType) return { Entitlements: all.filter((_: any, i: number) => i % 23 === 0).flatMap((sk: any) => sk.chromas.slice(1, 2).map((c: any) => ({ ItemID: c.uuid }))) };
      return { Entitlements: all.filter((_: any, i: number) => i % 11 === 0).flatMap((sk: any) => sk.levels.slice(0, 1 + (sk.levels.length > 2 ? 2 : 0)).map((l: any) => ({ ItemID: l.uuid }))) };
    }
    case "valorant_offers": {
      const all = await skins();
      return { Offers: all.map((sk: any, i: number) => ({ OfferID: `x${i}`, Cost: { [VPID]: [875, 1275, 1775, 2175, 2475][i % 5] }, Rewards: [{ ItemID: sk.levels[0].uuid }] })) };
    }
    case "valorant_party": {
      const cards = await va("playercards");
      return { ID: "party-me", Accessibility: "CLOSED", MatchmakingData: { QueueID: "competitive" },
        Members: [ME, "f0", "f2"].map((s, i) => ({ Subject: s, IsOwner: i === 0, IsReady: i !== 2, PlayerIdentity: { AccountLevel: 120 + i * 40, PlayerCardID: cards[30 + i * 25].uuid } })) };
    }
    case "valorant_names": return (args.puuids ?? []).map((id: string, i: number) => ({ Subject: id, GameName: id === ME ? "Kairo" : NAMES[Number(id.slice(1)) || i], TagLine: "0" + i }));
    case "valorant_chat_conversations": return { conversations: [
      { cid: "f0@eu1.pvp.net", type: "chat", unread_count: 2 }, { cid: "f2@eu1.pvp.net", type: "chat", unread_count: 0 },
      { cid: "party-me@ares-parties.eu1.pvp.net", type: "groupchat", unread_count: 0 },
    ] };
    case "valorant_chat_history": return { messages: [
      [ME, "Kairo", "ready for ranked?", 40], ["f0", "Kairo", "", 0], ["f0", NAMES[0], "give me 5 min", 38], ["f0", NAMES[0], "finishing a deathmatch", 37.5],
      [ME, "Kairo", "no rush", 36], [ME, "Kairo", "I'll queue when you're in", 35.8], ["f0", NAMES[0], "in", 20],
    ].filter((m) => m[2]).map(([puuid, name, body, minsAgo], i) => ({ id: `m${i}`, puuid, game_name: name, body, time: String(Date.now() - Number(minsAgo) * 60000) })) };
    case "valorant_loadout_overview": {
      const cards = await va("playercards");
      return { Subject: ME, Guns: [], Identity: { PlayerCardID: cards[40].uuid } };
    }
    case "valorant_daily_ticket": return { DailyRewards: { Milestones: [{ Progress: 4 }, { Progress: 4 }, { Progress: 2 }, { Progress: 0 }] } };
    default: return null;
  }
}

/** Round results and kills with minimap-valid positions for the given map. */
async function rounds(n: number, won: boolean, mapUrl: string) {
  maps ??= await va("maps");
  const map = maps!.find((m: any) => m.mapUrl === mapUrl);
  const total = won ? 21 : 22;
  const ids = players(10);
  const loc = (seed: number) => {
    const u = .25 + rnd(seed) * .5, v = .25 + rnd(seed + 1) * .5;
    if (!map?.xMultiplier) return { x: 0, y: 0 };
    return { y: (u - map.xScalarToAdd) / map.xMultiplier, x: (v - map.yScalarToAdd) / map.yMultiplier };
  };
  const roundResults = Array.from({ length: total }, (_, r) => ({
    roundNum: r, winningTeam: rnd(n * 50 + r) < (won ? .62 : .4) ? "Blue" : "Red",
    roundResultCode: ["Elimination", "Elimination", "Defuse", "Detonate", ""][Math.floor(rnd(r + n) * 5)],
    playerStats: [{ subject: ME, economy: { loadoutValue: r % 12 === 0 ? 800 : Math.round(1500 + rnd(r * 7) * 3400) } }],
  }));
  const kills = roundResults.flatMap((rr, r) => Array.from({ length: 5 + Math.floor(rnd(r * 3 + n) * 4) }, (_, k) => {
    const killer = ids[Math.floor(rnd(r * 11 + k + n) * 10)], victim = ids[Math.floor(rnd(r * 13 + k * 3 + n) * 10)];
    return { round: rr.roundNum, roundTime: 8000 + k * 9000, killer, victim: victim === killer ? ids[(ids.indexOf(killer) + 5) % 10] : victim, victimLocation: loc(r * 31 + k * 7 + n) };
  }));
  return { roundResults, kills };
}
