# KRYPTIX

A Valorant companion app: a Tauri v2 app with a React UI, and a Rust backend that holds all Riot tokens. It is a clean reimplementation. No Xuhana code or assets are used.

## Run
```
npm install
npm run tauri dev      # development
npm run tauri build    # installers in src-tauri/target/release/bundle (needs the signing key, see Setup)
npm run dev            # UI only, in a browser, with fake data from src/mock.ts
```
In the browser preview, `?theme=daylight` previews a theme and `?overlay` shows the overlay window's view.
The Riot Client must be running and signed in. VALORANT must have been launched at least once, because the region is read from its log.

## How it works
- `src-tauri/src/riot.rs`:
  1. Reads `%LOCALAPPDATA%\Riot Games\Riot Client\Config\lockfile`.
  2. Gets tokens from the Riot Client's local `/entitlements/v1/token`.
  3. Reads the region and shard from `ShooterGame.log` and the client version from valorant-api.com.
  4. Calls `pd`, `glz` and `shared` with those tokens. On an expired token it signs in again once.
- `src-tauri/src/lib.rs`: one `valorant_*` command per feature, plus Discord RPC, the overlay window, hotkey and position, the tray, updates and start-with-Windows.
- Caching: finished match details are saved under the app's cache folder and never fetched twice; ranks are kept in memory for 5 minutes. Local chat endpoints fall back from `v6` to older versions when Riot moves them.
- `src/lib.ts`: `useCmd()` calls a backend command through TanStack Query. `useLookups()` loads names and images from valorant-api.com. Settings and notes are stored in zustand `persist` (localStorage).

| Page | Backend commands |
|---|---|
| Dashboard | `valorant_overview`, `valorant_wallet`, `valorant_competitive_updates` (today's session) |
| History (scoreboard, rounds, fights map) | `valorant_match_history`, `valorant_match_details` |
| Stats (rank history, agents, maps) | `valorant_competitive_updates`, `valorant_match_history`, `valorant_match_details` |
| Players | `valorant_search_player`, `valorant_deep_search` (partial name, recent matches), `valorant_player_profile` |
| Live match and overlay | `valorant_live_match`, `valorant_scout_player`, `valorant_blocked_puuids`. Safe mode (on by default) skips opponents and hidden players and polls every 15 s |
| Shop / Night Market | `valorant_storefront` (Night Market cards are revealed by click, remembered locally) |
| Loadout | `valorant_loadout_overview`, `valorant_inventory`, `valorant_apply_loadout`, `valorant_item_upgrades`, local presets, randomiser |
| Collection and wishlist | `valorant_inventory` (skins and colour variants), `valorant_offers`; wishlist alerts poll `valorant_storefront` every 10 min |
| Friends | `valorant_friends`, `valorant_friend_requests`, `valorant_send_friend_request`, `valorant_decline_friend_request`, `valorant_invite_to_party`, `valorant_party_request_join` |
| Party | `valorant_party`, `valorant_names`, `valorant_scout_player`, `valorant_invite_to_party`, `valorant_party_kick` |
| Chat | `valorant_chat_conversations`, `valorant_chat_history`, `valorant_send_message` |
| Progression | `valorant_contracts`, `valorant_daily_ticket` |
| Startup | `valorant_warmup` |
| Leaderboard | `valorant_content`, `valorant_leaderboard` |
| Weapons, Strategies, Memos, Settings | local only |

## Setup
- **Discord status:** create an application at https://discord.com/developers/applications and paste its Application ID in Settings → Discord.
- **Releases and auto-update:** `.github/workflows/release.yml` builds the installer when you push a tag (`git tag v0.2.0 && git push origin v0.2.0`). It needs the repository secret `TAURI_SIGNING_PRIVATE_KEY` set to the contents of `~/.tauri/valo-companion.key` (keep that file private and backed up; losing it means existing installs can't verify new updates). For a local `npm run tauri build`, first set `TAURI_SIGNING_PRIVATE_KEY` to the key file's contents and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` to an empty string. The app checks `releases/latest/download/latest.json`; GitHub only serves that anonymously from a **public** repository, so with a private repo the update check fails quietly and you install new versions by hand.

## Deliberately not copied from Xuhana
- **Phoning home:** Xuhana's server calls (`device/check`, `/api/presence`, ban kill switch, dashboard notice) send your ID and every lobby player's ID to the developer. If you build your own server, tell users and get their consent.
- **Hidden players:** a player with "hide my name" on is never unmasked. Their name is never fetched; their rank, peak, account level (unless they hide it too) and recent match stats are shown, without the full scoreboard, which would list their Riot ID.
- **Auto-updater:** not included. It needs a signing key and an update server. Use `tauri-plugin-updater` once you have them.

## Risk
This app uses Riot's undocumented client APIs, as all tools of this kind do. That is against Riot's Terms of Service and can change with any patch. Writing your loadout or sending messages acts on the real account.
