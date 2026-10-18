// Dev-only fake backend so the UI can be designed in a plain browser (`npm run dev`) without the Riot Client.
// Never loaded inside Tauri: lib.ts only imports it when __TAURI_INTERNALS__ is missing.
const va = (p: string) => fetch(`https://valorant-api.com/v1/${p}`).then((r) => r.json()).then((j) => j.data);
const ME = "me-0000";
const AGENTS = ["add6443a-41bd-e414-f6ad-e58d267f4e95", "a3bfb853-43b2-7238-a4f1-ad90e9e46bcc", "569fdd95-4d10-43ab-ca70-79becc718b46",
  "8e253930-4c05-31dd-1b6c-968525494517", "320b2a48-4d9b-a075-30f1-1f93a9b638fa"];
const MAPS = ["/Game/Maps/Ascent/Ascent", "/Game/Maps/Bonsai/Bonsai", "/Game/Maps/Triad/Triad", "/Game/Maps/Port/Port", "/Game/Maps/Foxtrot/Foxtrot"];
const NAMES = ["Kairo", "nyx", "Pixel Wraith", "Dusk", "tempo", "Ferro", "Lumen", "ash", "Vesper"];
const players = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`).map((s, i) => (i === 0 ? ME : s));

let weapons: any[] | undefined, bundles: any[] | undefined;
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
      friends: NAMES.map((n, i) => ({ puuid: `f${i}`, game_name: n, game_tag: "0" + i })),
      presences: [0, 2, 5].map((i) => ({ puuid: `f${i}`, product: "valorant", private: btoa(JSON.stringify({ sessionLoopState: i ? "INGAME" : "MENUS" })) })),
    };
    case "valorant_loadout_overview": {
      const cards = await va("playercards");
      return { Subject: ME, Guns: [], Identity: { PlayerCardID: cards[40].uuid } };
    }
    default: return null;
  }
}
