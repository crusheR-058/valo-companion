// Riot auth + HTTP. Same model as Xuhana: tokens never leave the Rust side.
use reqwest::Method;
use serde_json::Value;
use tokio::sync::Mutex;

// base64 of {"platformType":"PC","platformOS":"Windows","platformOSVersion":"10.0.19042.1.256.64bit","platformChipset":"Unknown"}
const PLATFORM: &str = "ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9";

#[derive(Clone, Copy)]
pub enum Base { Local, Pd, Glz, Shared }

#[derive(Clone)]
pub struct Auth {
    port: String,
    password: String,
    access: String,
    entitlement: String,
    pub puuid: String,
    pub region: String,
    shard: String,
    version: String,
}

pub struct Riot {
    http: reqwest::Client,
    local: reqwest::Client,
    auth: Mutex<Option<Auth>>,
}

fn local_appdata() -> Result<String, String> {
    std::env::var("LOCALAPPDATA").map_err(|_| "LOCALAPPDATA not set".into())
}

// Returns (region, shard) from e.g. "https://glz-eu-1.eu.a.pvp.net".
pub fn parse_glz(log: &str) -> Option<(String, String)> {
    let start = log.rfind("https://glz-")? + "https://glz-".len();
    let rest = &log[start..];
    let host = &rest[..rest.find(".a.pvp.net")?];
    let (region, shard) = host.split_once('.')?;
    Some((region.trim_end_matches("-1").to_string(), shard.to_string()))
}

impl Riot {
    pub fn new() -> Self {
        Riot {
            http: reqwest::Client::new(),
            // The Riot Client's local API uses a self-signed cert on 127.0.0.1 only.
            local: reqwest::Client::builder().danger_accept_invalid_certs(true).build().unwrap(),
            auth: Mutex::new(None),
        }
    }

    pub async fn clear(&self) { *self.auth.lock().await = None; }

    async fn login(&self) -> Result<Auth, String> {
        let base = local_appdata()?;
        let lock = std::fs::read_to_string(format!("{base}\\Riot Games\\Riot Client\\Config\\lockfile"))
            .map_err(|_| "Riot Client lockfile was not found. Is the Riot Client running?")?;
        let parts: Vec<&str> = lock.trim().split(':').collect();
        if parts.len() < 5 { return Err("Riot Client lockfile is malformed.".into()); }
        let (port, password) = (parts[2].to_string(), parts[3].to_string());

        let tok: Value = self.local.get(format!("https://127.0.0.1:{port}/entitlements/v1/token"))
            .basic_auth("riot", Some(&password)).send().await.map_err(|e| e.to_string())?
            .error_for_status().map_err(|_| "Not signed in to the Riot Client.")?
            .json().await.map_err(|e| e.to_string())?;

        let log = std::fs::read_to_string(format!("{base}\\VALORANT\\Saved\\Logs\\ShooterGame.log"))
            .map_err(|_| "VALORANT log not found. Launch VALORANT once.")?;
        let (region, shard) = parse_glz(&log).ok_or("Could not detect region from the VALORANT log.")?;

        let ver: Value = self.http.get("https://valorant-api.com/v1/version").send().await
            .map_err(|e| e.to_string())?.json().await.map_err(|e| e.to_string())?;

        Ok(Auth {
            port, password,
            access: tok["accessToken"].as_str().unwrap_or_default().into(),
            entitlement: tok["token"].as_str().unwrap_or_default().into(),
            puuid: tok["subject"].as_str().unwrap_or_default().into(),
            region, shard,
            version: ver["data"]["riotClientVersion"].as_str().unwrap_or_default().into(),
        })
    }

    pub async fn auth(&self) -> Result<Auth, String> {
        let mut g = self.auth.lock().await;
        if g.is_none() { *g = Some(self.login().await?); }
        Ok(g.clone().unwrap())
    }

    /// `{puuid}` in `path` is replaced with the signed-in player's id.
    pub async fn call(&self, base: Base, method: Method, path: &str, body: Option<Value>) -> Result<Value, String> {
        for attempt in 0..2 {
            let a = self.auth().await?;
            let path = path.replace("{puuid}", &a.puuid);
            let req = match base {
                Base::Local => self.local.request(method.clone(), format!("https://127.0.0.1:{}{path}", a.port))
                    .basic_auth("riot", Some(&a.password)),
                _ => {
                    let host = match base {
                        Base::Pd => format!("https://pd.{}.a.pvp.net", a.shard),
                        Base::Glz => format!("https://glz-{}-1.{}.a.pvp.net", a.region, a.shard),
                        _ => format!("https://shared.{}.a.pvp.net", a.shard),
                    };
                    self.http.request(method.clone(), format!("{host}{path}"))
                        .bearer_auth(&a.access)
                        .header("X-Riot-Entitlements-JWT", &a.entitlement)
                        .header("X-Riot-ClientPlatform", PLATFORM)
                        .header("X-Riot-ClientVersion", &a.version)
                }
            };
            let req = match &body { Some(b) => req.json(b), None => req };
            let res = req.send().await.map_err(|e| e.to_string())?;
            let status = res.status();
            // Expired tokens come back as 400 BAD_CLAIMS or 401; re-login once.
            if attempt == 0 && (status == 400 || status == 401) && !matches!(base, Base::Local) {
                self.clear().await;
                continue;
            }
            let text = res.text().await.map_err(|e| e.to_string())?;
            if !status.is_success() { return Err(format!("{status}: {text}")); }
            return Ok(if text.is_empty() { Value::Null } else { serde_json::from_str(&text).map_err(|e| e.to_string())? });
        }
        unreachable!()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;
    #[test]
    fn glz_parsing() {
        let log = "foo https://glz-eu-1.eu.a.pvp.net/x bar https://glz-ap-1.ap.a.pvp.net/session";
        assert_eq!(parse_glz(log), Some(("ap".into(), "ap".into())));
        assert_eq!(parse_glz("nothing"), None);
    }
    #[test]
    fn platform_header_is_valid_json() {
        let raw = base64::engine::general_purpose::STANDARD.decode(PLATFORM).unwrap();
        let v: Value = serde_json::from_slice(&raw).unwrap();
        assert_eq!(v["platformType"], "PC");
    }
}
