# Valo Companion

A Valorant companion app with the same design as Xuhana: a Tauri v2 app with a React UI, and a Rust backend that holds all Riot tokens. It is a clean reimplementation. No Xuhana code or assets are used.

## Run
```
npm install
npm run tauri dev      # development
npm run tauri build    # installer in src-tauri/target/release/bundle
npm run dev            # UI only, in a browser, with fake data from src/mock.ts
```
The Riot Client must be running and signed in. VALORANT must have been launched at least once, because the region is read from its log.

## How it works
- `src-tauri/src/riot.rs`:
  1. Reads `%LOCALAPPDATA%\Riot Games\Riot Client\Config\lockfile`.
  2. Gets tokens from the Riot Client's local `/entitlements/v1/token`.
  3. Reads the region and shard from `ShooterGame.log` and the client version from valorant-api.com.
  4. Calls `pd`, `glz` and `shared` with those tokens. On an expired token it signs in again once.
- `src-tauri/src/lib.rs`: one `valorant_*` command per feature, plus Discord RPC, the overlay window and hotkey, and the tray.
- `src/lib.ts`: `useCmd()` calls a backend command through TanStack Query. `useLookups()` loads names and images from valorant-api.com. Settings and notes are stored in zustand `persist` (localStorage).

| Page | Backend commands |
|---|---|
| Dashboard | `valorant_overview`, `valorant_wallet` |
| History | `valorant_match_history`, `valorant_match_details` |
| Players | `valorant_search_player`, `valorant_deep_search` (partial name, recent matches), `valorant_player_profile` |
| Live match and overlay | `valorant_live_match`, `valorant_scout_player`, `valorant_blocked_puuids` |
| Shop / Night Market | `valorant_storefront` (Night Market cards are revealed by click, remembered locally) |
| Loadout | `valorant_loadout_overview`, `valorant_inventory`, `valorant_apply_loadout`, `valorant_item_upgrades`, local presets |
| Friends | `valorant_friends`, `valorant_friend_requests`, `valorant_send_friend_request`, `valorant_decline_friend_request`, `valorant_party`, `valorant_invite_to_party`, `valorant_party_request_join` |
| Chat | `valorant_chat_conversations`, `valorant_chat_history`, `valorant_send_message` |
| Progression | `valorant_contracts`, `valorant_daily_ticket` |
| Startup | `valorant_warmup` |
| Leaderboard | `valorant_content`, `valorant_leaderboard` |
| Weapons, Strategies, Memos, Settings | local only |

## Setup
- **Discord status:** put your Discord Application ID in `DISCORD_CLIENT_ID` in `src-tauri/src/lib.rs`.
- **Rename the app:** change `productName`, `identifier` and the window title in `src-tauri/tauri.conf.json`, the brand in `src/App.tsx`, and the storage names `valo-settings` and `valo-notes` in `src/lib.ts`.

## Deliberately not copied from Xuhana
- **Phoning home:** Xuhana's server calls (`device/check`, `/api/presence`, ban kill switch, dashboard notice) send your ID and every lobby player's ID to the developer. If you build your own server, tell users and get their consent.
- **Hidden players:** a player with "hide my name" on is never unmasked. Their name is never fetched; their rank, peak, account level (unless they hide it too) and recent match stats are shown, without the full scoreboard, which would list their Riot ID.
- **Auto-updater:** not included. It needs a signing key and an update server. Use `tauri-plugin-updater` once you have them.

## Risk
This app uses Riot's undocumented client APIs, as all tools of this kind do. That is against Riot's Terms of Service and can change with any patch. Writing your loadout or sending messages acts on the real account.
