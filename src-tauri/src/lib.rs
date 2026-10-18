mod riot;

use discord_rich_presence::{activity::Activity, DiscordIpc, DiscordIpcClient};
use reqwest::Method;
use riot::{Base::*, Riot};
use serde_json::{json, Value};
use std::{collections::HashMap, sync::{atomic::{AtomicBool, Ordering}, Mutex}, time::{Duration, Instant}};
use tauri::{
    menu::{Menu, MenuItem}, tray::TrayIconBuilder, AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const SKIN_TYPE: &str = "e7c63390-eda7-46e0-bb7a-a6abdacd2433";

type R = Result<Value, String>;
const GET: Method = Method::GET;

struct Flags { close_to_tray: AtomicBool }
struct Discord(Mutex<Option<DiscordIpcClient>>);
/// Short-lived memory cache for data that changes slowly (ranks), keyed by request path.
struct Memo(Mutex<HashMap<String, (Instant, Value)>>);
const MMR_TTL: Duration = Duration::from_secs(300);

async fn mmr(r: &Riot, memo: &Memo, puuid: &str) -> R {
    let key = format!("mmr:{puuid}");
    if let Some((t, v)) = memo.0.lock().unwrap().get(&key) {
        if t.elapsed() < MMR_TTL { return Ok(v.clone()); }
    }
    let v = r.call(Pd, GET, &format!("/mmr/v1/players/{puuid}"), None).await?;
    memo.0.lock().unwrap().insert(key, (Instant::now(), v.clone()));
    Ok(v)
}

/// Riot moves local chat endpoints between versions; try the newest first.
async fn local_first(r: &Riot, paths: &[&str]) -> R {
    let mut last = Err("no endpoint".to_string());
    for p in paths {
        last = r.call(Local, GET, p, None).await;
        if last.is_ok() { return last; }
    }
    last
}

/// Match ids are UUIDs; anything else must never reach the file system.
fn is_uuid(id: &str) -> bool {
    id.len() == 36 && id.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
}

async fn names(r: &Riot, puuids: Vec<String>) -> R {
    if puuids.is_empty() { return Ok(json!([])); }
    r.call(Pd, Method::PUT, "/name-service/v2/players", Some(json!(puuids))).await
}

// ---------- account / dashboard ----------
#[tauri::command]
async fn valorant_overview(r: State<'_, Riot>) -> R {
    let a = r.auth().await?;
    let session = r.call(Local, GET, "/chat/v1/session", None).await?;
    let mmr = r.call(Pd, GET, "/mmr/v1/players/{puuid}", None).await?;
    Ok(json!({ "puuid": a.puuid, "session": session, "mmr": mmr }))
}

#[tauri::command]
async fn valorant_clear_caches(r: State<'_, Riot>) -> R { r.clear().await; Ok(Value::Null) }

// ---------- matches ----------
#[tauri::command]
async fn valorant_match_history(r: State<'_, Riot>, puuid: Option<String>, start: u32, end: u32, queue: Option<String>) -> R {
    let who = puuid.unwrap_or("{puuid}".into());
    let q = queue.map(|q| format!("&queue={q}")).unwrap_or_default();
    r.call(Pd, GET, &format!("/match-history/v1/history/{who}?startIndex={start}&endIndex={end}{q}"), None).await
}

#[tauri::command]
// Finished matches never change, so details are kept on disk and served from there next time.
async fn valorant_match_details(app: AppHandle, r: State<'_, Riot>, match_id: String) -> R {
    if !is_uuid(&match_id) { return Err("Invalid match id.".into()); }
    let file = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("matches").join(format!("{match_id}.json"));
    if let Ok(text) = std::fs::read_to_string(&file) {
        if let Ok(v) = serde_json::from_str(&text) { return Ok(v); }
    }
    let v = r.call(Pd, GET, &format!("/match-details/v1/matches/{match_id}"), None).await?;
    if let Some(dir) = file.parent() { let _ = std::fs::create_dir_all(dir); }
    let _ = std::fs::write(&file, v.to_string());
    Ok(v)
}

/// Ranked RR changes per match, newest first.
#[tauri::command]
async fn valorant_competitive_updates(r: State<'_, Riot>, puuid: Option<String>, start: u32, end: u32) -> R {
    let who = puuid.unwrap_or("{puuid}".into());
    r.call(Pd, GET, &format!("/mmr/v1/players/{who}/competitiveupdates?startIndex={start}&endIndex={end}&queue=competitive"), None).await
}

// ---------- players ----------
#[tauri::command]
async fn valorant_search_player(r: State<'_, Riot>, name: String, tag: String) -> R {
    let q = format!("/player-account/aliases/v1/lookup?gameName={}&tagLine={}", urlencode(&name), urlencode(&tag));
    r.call(Local, GET, &q, None).await
}

#[tauri::command]
async fn valorant_player_profile(r: State<'_, Riot>, memo: State<'_, Memo>, puuid: String) -> R {
    let mmr = mmr(&r, &memo, &puuid).await?;
    let name = names(&r, vec![puuid.clone()]).await?;
    Ok(json!({ "puuid": puuid, "name": name[0], "mmr": mmr }))
}

// Fallback when the exact Name#TAG lookup fails: partial match over the players in your recent matches.
// shortcut: 10 matches fetched one by one, widen it once the details are cached.
#[tauri::command]
async fn valorant_deep_search(r: State<'_, Riot>, query: String) -> R {
    let h = r.call(Pd, GET, "/match-history/v1/history/{puuid}?startIndex=0&endIndex=10", None).await?;
    let mut out: Vec<Value> = vec![];
    for m in h["History"].as_array().into_iter().flatten() {
        let id = m["MatchID"].as_str().unwrap_or_default();
        let Ok(d) = r.call(Pd, GET, &format!("/match-details/v1/matches/{id}"), None).await else { continue };
        for p in match_players(&d, &query) {
            if !out.iter().any(|o| o["puuid"] == p["puuid"]) { out.push(p); }
        }
    }
    Ok(json!(out))
}

fn match_players(details: &Value, query: &str) -> Vec<Value> {
    let q = query.trim().to_lowercase();
    details["players"].as_array().into_iter().flatten()
        .filter(|p| format!("{}#{}", p["gameName"].as_str().unwrap_or(""), p["tagLine"].as_str().unwrap_or("")).to_lowercase().contains(&q))
        .map(|p| json!({ "puuid": p["subject"], "gameName": p["gameName"], "tagLine": p["tagLine"] }))
        .collect()
}

#[tauri::command]
async fn valorant_names(r: State<'_, Riot>, puuids: Vec<String>) -> R { names(&r, puuids).await }

// ---------- live match ----------
#[tauri::command]
async fn valorant_live_match(r: State<'_, Riot>) -> R {
    let me = r.auth().await?.puuid;
    let (phase, m, players, kind, id) = if let Ok(p) = r.call(Glz, GET, "/core-game/v1/players/{puuid}", None).await {
        let id = p["MatchID"].as_str().unwrap_or("").to_string();
        let m = r.call(Glz, GET, &format!("/core-game/v1/matches/{id}"), None).await?;
        let players = m["Players"].clone();
        ("ingame", m, players, "core-game", id)
    } else if let Ok(p) = r.call(Glz, GET, "/pregame/v1/players/{puuid}", None).await {
        let id = p["MatchID"].as_str().unwrap_or("").to_string();
        let m = r.call(Glz, GET, &format!("/pregame/v1/matches/{id}"), None).await?;
        let players = m["AllyTeam"]["Players"].clone();
        ("pregame", m, players, "pregame", id)
    } else {
        return Ok(json!({ "phase": "idle" }));
    };
    // Players with "Hide my name" on stay hidden: their names are never requested.
    let visible: Vec<String> = players.as_array().into_iter().flatten()
        .filter(|p| p["Subject"] == me || p["PlayerIdentity"]["Incognito"] != true)
        .filter_map(|p| p["Subject"].as_str().map(String::from)).collect();
    // Equipped skins. Optional: the match view still works if Riot refuses this.
    let loadouts = r.call(Glz, GET, &format!("/{kind}/v1/matches/{id}/loadouts"), None).await.unwrap_or(Value::Null);
    Ok(json!({ "phase": phase, "me": me, "match": m, "players": players, "loadouts": loadouts, "names": names(&r, visible).await? }))
}

#[tauri::command]
async fn valorant_scout_player(r: State<'_, Riot>, memo: State<'_, Memo>, puuid: String) -> R {
    mmr(&r, &memo, &puuid).await
}

// Blocked players, used to flag them in the live match. Riot Client local chat API.
#[tauri::command]
async fn valorant_blocked_puuids(r: State<'_, Riot>) -> R {
    let b = local_first(&r, &["/chat/v6/blocked", "/chat/v5/blocked", "/chat/v4/blocked"]).await?;
    Ok(json!(b["blocked"].as_array().into_iter().flatten().map(|p| p["puuid"].clone()).collect::<Vec<_>>()))
}

// ---------- loadout / inventory / store ----------
#[tauri::command]
async fn valorant_loadout_overview(r: State<'_, Riot>) -> R {
    r.call(Pd, GET, "/personalization/v3/players/{puuid}/playerloadout", None).await
}

#[tauri::command]
async fn valorant_apply_loadout(r: State<'_, Riot>, loadout: Value) -> R {
    r.call(Pd, Method::PUT, "/personalization/v3/players/{puuid}/playerloadout", Some(loadout)).await
}

#[tauri::command]
async fn valorant_inventory(r: State<'_, Riot>, item_type: Option<String>) -> R {
    let t = item_type.unwrap_or(SKIN_TYPE.into());
    r.call(Pd, GET, &format!("/store/v1/entitlements/{{puuid}}/{t}"), None).await
}

#[tauri::command]
async fn valorant_storefront(r: State<'_, Riot>) -> R {
    r.call(Pd, Method::POST, "/store/v3/storefront/{puuid}", Some(json!({}))).await
}

#[tauri::command]
async fn valorant_wallet(r: State<'_, Riot>) -> R { r.call(Pd, GET, "/store/v1/wallet/{puuid}", None).await }

/// Every store item's price; used to value the collection.
#[tauri::command]
async fn valorant_offers(r: State<'_, Riot>) -> R { r.call(Pd, GET, "/store/v1/offers/", None).await }

// ---------- social (Riot Client local API) ----------
#[tauri::command]
async fn valorant_friends(r: State<'_, Riot>) -> R {
    let friends = local_first(&r, &["/chat/v6/friends", "/chat/v4/friends"]).await?;
    let presences = local_first(&r, &["/chat/v4/presences", "/chat/v6/presences"]).await?;
    Ok(json!({ "friends": friends["friends"], "presences": presences["presences"] }))
}

#[tauri::command]
async fn valorant_friend_requests(r: State<'_, Riot>) -> R { local_first(&r, &["/chat/v6/friendrequests", "/chat/v4/friendrequests"]).await }

// Sending a request back to someone who requested you accepts it.
#[tauri::command]
async fn valorant_send_friend_request(r: State<'_, Riot>, name: String, tag: String) -> R {
    r.call(Local, Method::POST, "/chat/v4/friendrequests", Some(json!({ "game_name": name, "game_tag": tag }))).await
}

#[tauri::command]
async fn valorant_decline_friend_request(r: State<'_, Riot>, puuid: String) -> R {
    r.call(Local, Method::DELETE, "/chat/v4/friendrequests", Some(json!({ "puuid": puuid }))).await
}

#[tauri::command]
async fn valorant_chat_conversations(r: State<'_, Riot>) -> R { r.call(Local, GET, "/chat/v6/conversations", None).await }

#[tauri::command]
async fn valorant_chat_history(r: State<'_, Riot>, cid: String) -> R {
    r.call(Local, GET, &format!("/chat/v6/messages?cid={}", urlencode(&cid)), None).await
}

#[tauri::command]
async fn valorant_send_message(r: State<'_, Riot>, cid: String, message: String, msg_type: Option<String>) -> R {
    let body = json!({ "cid": cid, "message": message, "type": msg_type.unwrap_or("chat".into()) });
    r.call(Local, Method::POST, "/chat/v6/messages", Some(body)).await
}

#[tauri::command]
async fn valorant_party(r: State<'_, Riot>) -> R {
    let p = r.call(Glz, GET, "/parties/v1/players/{puuid}", None).await?;
    r.call(Glz, GET, &format!("/parties/v1/parties/{}", p["CurrentPartyID"].as_str().unwrap_or("")), None).await
}

#[tauri::command]
async fn valorant_invite_to_party(r: State<'_, Riot>, party_id: String, name: String, tag: String) -> R {
    let path = format!("/parties/v1/parties/{party_id}/invites/name/{}/tag/{}", urlencode(&name), urlencode(&tag));
    r.call(Glz, Method::POST, &path, None).await
}

// Removing a player from your party (only works when you own it).
#[tauri::command]
async fn valorant_party_kick(r: State<'_, Riot>, puuid: String) -> R {
    if !is_uuid(&puuid) { return Err("Invalid player id.".into()); }
    r.call(Glz, Method::DELETE, &format!("/parties/v1/players/{puuid}"), None).await
}

#[tauri::command]
async fn valorant_party_request_join(r: State<'_, Riot>, party_id: String) -> R {
    r.call(Glz, Method::POST, &format!("/parties/v1/parties/{party_id}/request"), None).await
}

// ---------- progression / content / leaderboard ----------
#[tauri::command]
async fn valorant_contracts(r: State<'_, Riot>) -> R { r.call(Pd, GET, "/contracts/v1/contracts/{puuid}", None).await }

// expected_puuid guards against showing a ticket from an account the user just switched away from.
#[tauri::command]
async fn valorant_daily_ticket(r: State<'_, Riot>, expected_puuid: Option<String>) -> R {
    let a = r.auth().await?;
    if expected_puuid.is_some_and(|e| e != a.puuid) { return Err("The Riot account changed. Reload the page.".into()); }
    r.call(Pd, GET, "/daily-ticket/v1/{puuid}", None).await
}

#[tauri::command]
async fn valorant_item_upgrades(r: State<'_, Riot>) -> R { r.call(Pd, GET, "/contract-definitions/v3/item-upgrades", None).await }

// Signs in at startup so the first page doesn't wait for the lockfile, token and log reads.
#[tauri::command]
async fn valorant_warmup(r: State<'_, Riot>) -> R {
    let a = r.auth().await?;
    Ok(json!({ "puuid": a.puuid, "region": a.region }))
}

#[tauri::command]
async fn valorant_content(r: State<'_, Riot>) -> R { r.call(Shared, GET, "/content-service/v3/content", None).await }

#[tauri::command]
async fn valorant_leaderboard(r: State<'_, Riot>, season_id: String, start: u32, size: u32) -> R {
    let a = r.auth().await?;
    let region = &a.region;
    r.call(Pd, GET, &format!("/mmr/v1/leaderboards/affinity/{region}/queue/competitive/season/{season_id}?startIndex={start}&size={size}"), None).await
}

// ---------- Discord Rich Presence ----------
#[tauri::command]
// client_id: the Application ID from https://discord.com/developers/applications, entered in Settings.
fn set_discord_enabled(d: State<'_, Discord>, enabled: bool, client_id: String) -> Result<(), String> {
    let mut g = d.0.lock().unwrap();
    if let Some(mut c) = g.take() { let _ = c.close(); }
    if enabled {
        if client_id.len() < 17 || !client_id.chars().all(|c| c.is_ascii_digit()) {
            return Err("Enter your Discord Application ID in Settings.".into());
        }
        let mut c = DiscordIpcClient::new(&client_id).map_err(|e| e.to_string())?;
        c.connect().map_err(|_| "Discord is not running.")?;
        *g = Some(c);
    }
    Ok(())
}

#[tauri::command]
fn update_discord_activity(d: State<'_, Discord>, details: String, state: String, start: Option<i64>) -> Result<(), String> {
    match d.0.lock().unwrap().as_mut() {
        Some(c) => {
            let mut a = Activity::new().details(&details).state(&state);
            if let Some(s) = start { a = a.timestamps(discord_rich_presence::activity::Timestamps::new().start(s)); }
            c.set_activity(a).map_err(|e| e.to_string())
        }
        None => Ok(()),
    }
}

#[tauri::command]
fn clear_discord_activity(d: State<'_, Discord>) -> Result<(), String> {
    match d.0.lock().unwrap().as_mut() { Some(c) => c.clear_activity().map_err(|e| e.to_string()), None => Ok(()) }
}

// ---------- window: overlay, hotkey, tray ----------
fn toggle_overlay(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("overlay") {
        if w.is_visible().unwrap_or(false) { let _ = w.hide(); } else { let _ = w.show(); }
    }
}

#[tauri::command]
fn set_overlay_hotkey(app: AppHandle, enabled: bool, hotkey: String) -> Result<(), String> {
    let gs = app.global_shortcut();
    gs.unregister_all().map_err(|e| e.to_string())?;
    if enabled {
        gs.register(hotkey.as_str()).map_err(|e| e.to_string())?;
    } else if let Some(w) = app.get_webview_window("overlay") {
        let _ = w.hide();
    }
    Ok(())
}

/// Moves the overlay to a screen corner: "top-left", "top-right", "bottom-left" or "bottom-right".
#[tauri::command]
fn set_overlay_position(app: AppHandle, corner: String) -> Result<(), String> {
    let w = app.get_webview_window("overlay").ok_or("No overlay window.")?;
    let m = w.current_monitor().map_err(|e| e.to_string())?.or(w.primary_monitor().map_err(|e| e.to_string())?).ok_or("No monitor.")?;
    let (ms, mp, ws) = (m.size(), m.position(), w.outer_size().map_err(|e| e.to_string())?);
    let pad = 24;
    let x = if corner.ends_with("left") { mp.x + pad } else { mp.x + ms.width as i32 - ws.width as i32 - pad };
    let y = if corner.starts_with("top") { mp.y + pad } else { mp.y + ms.height as i32 - ws.height as i32 - pad * 3 };
    w.set_position(tauri::PhysicalPosition::new(x, y)).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_close_to_tray(f: State<'_, Flags>, enabled: bool) { f.close_to_tray.store(enabled, Ordering::Relaxed); }

fn urlencode(s: &str) -> String {
    s.bytes().map(|b| match b {
        b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
        _ => format!("%{b:02X}"),
    }).collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--minimized"])))
        .plugin(tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, _sc, e| if e.state() == ShortcutState::Pressed { toggle_overlay(app) })
            .build())
        .manage(Riot::new())
        .manage(Discord(Mutex::new(None)))
        .manage(Memo(Mutex::new(HashMap::new())))
        .manage(Flags { close_to_tray: AtomicBool::new(false) })
        .setup(|app| {
            WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("index.html".into()))
                .title("Overlay").inner_size(340.0, 460.0).always_on_top(true).decorations(false)
                .transparent(true).skip_taskbar(true).visible(false).build()?;
            // Started by Windows at sign-in: stay in the tray until the user opens the app.
            if std::env::args().any(|a| a == "--minimized") {
                if let Some(w) = app.get_webview_window("main") { let _ = w.hide(); }
            }

            let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&Menu::with_items(app, &[&show, &quit])?)
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "show" => if let Some(w) = app.get_webview_window("main") { let _ = w.show(); let _ = w.set_focus(); },
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|w, e| {
            if let WindowEvent::CloseRequested { api, .. } = e {
                if w.label() == "main" && w.state::<Flags>().close_to_tray.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = w.hide();
                } else if w.label() == "main" {
                    w.app_handle().exit(0);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            valorant_overview, valorant_clear_caches, valorant_match_history, valorant_match_details,
            valorant_search_player, valorant_player_profile, valorant_names, valorant_deep_search, valorant_competitive_updates, valorant_offers, valorant_party_kick, set_overlay_position, valorant_blocked_puuids, valorant_live_match, valorant_scout_player,
            valorant_loadout_overview, valorant_apply_loadout, valorant_inventory, valorant_storefront, valorant_wallet,
            valorant_friends, valorant_friend_requests, valorant_send_friend_request, valorant_decline_friend_request,
            valorant_chat_conversations, valorant_chat_history, valorant_send_message,
            valorant_party, valorant_invite_to_party, valorant_party_request_join,
            valorant_contracts, valorant_daily_ticket, valorant_item_upgrades, valorant_warmup, valorant_content, valorant_leaderboard,
            set_discord_enabled, update_discord_activity, clear_discord_activity,
            set_overlay_hotkey, set_close_to_tray,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    #[test]
    fn urlencode_riot_id() { assert_eq!(super::urlencode("Ab c#1"), "Ab%20c%231"); }

    #[test]
    fn match_ids_must_be_uuids() {
        assert!(super::is_uuid("7f3a9c2e-1b4d-4e8f-9a6b-2c5d8e1f3a7b"));
        assert!(!super::is_uuid("../../../../Windows/system32/x"));
        assert!(!super::is_uuid("7f3a9c2e-1b4d-4e8f-9a6b-2c5d8e1f3a7"));
    }

    #[test]
    fn deep_search_matches_partial_riot_id() {
        let d = serde_json::json!({ "players": [
            { "subject": "a", "gameName": "TenZ", "tagLine": "0505" },
            { "subject": "b", "gameName": "Other", "tagLine": "EU1" },
        ]});
        let hits = super::match_players(&d, " tenz#05");
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0]["puuid"], "a");
        assert!(super::match_players(&d, "nobody").is_empty());
    }
}
