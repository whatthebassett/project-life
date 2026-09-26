// Connected accounts (Settings → Connected accounts, PLAN.md Phase 8):
// signing in to Microsoft and Google, and their calendars.
//
// - Sign-in opens the browser (OAuth 2.0 with PKCE) and waits for the answer
//   on a loopback address, so it's the providers' own pages, with the
//   passwords and two-step sign-in the browser already has.
// - The refresh token lives in Windows' Credential Manager ("account:<id>");
//   access tokens only in memory. Nothing about signing in is written to
//   Data\.
// - Calendar calls happen here, so the page never holds a token. Events come
//   back as local wall times ("YYYY-MM-DDTHH:MM") like events.json uses.
use crate::{err, oauth_ids, system, web};
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

const MS_AUTH: &str = "https://login.microsoftonline.com/common/oauth2/v2.0";
const MS_SCOPES: &str = "openid profile email offline_access User.Read Calendars.ReadWrite";
// Teams meetings on their own (for events on Project Life's own calendars).
// Work and school accounts only, asked for the first time one is made.
const MS_MEETINGS: &str = "OnlineMeetings.ReadWrite";
// Personal Microsoft accounts (Outlook.com, Hotmail) all sign in from this tenant.
const MS_CONSUMERS: &str = "9188040d-6c67-4c5b-b112-36a304b66dad";
const GRAPH: &str = "https://graph.microsoft.com/v1.0";

const GOOGLE_AUTH: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPES: &str = "openid email profile https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/meetings.space.created";
const GCAL: &str = "https://www.googleapis.com/calendar/v3";

// Errors the page acts on: sign in again, or allow Teams meetings.
const RECONNECT: &str = "RECONNECT:";
const CONSENT: &str = "CONSENT:";

#[derive(Clone, Copy, PartialEq)]
enum Provider {
    Microsoft,
    Google,
}

fn provider_of(account: &str) -> Result<Provider, String> {
    if account.starts_with("ms-") {
        Ok(Provider::Microsoft)
    } else if account.starts_with("google-") {
        Ok(Provider::Google)
    } else {
        Err("That isn't a connected account.".into())
    }
}

fn parse_provider(name: &str) -> Result<Provider, String> {
    match name {
        "microsoft" => Ok(Provider::Microsoft),
        "google" => Ok(Provider::Google),
        _ => Err("Project Life connects to Microsoft and Google.".into()),
    }
}

fn set_up(p: Provider) -> bool {
    match p {
        Provider::Microsoft => !oauth_ids::MICROSOFT_CLIENT_ID.is_empty(),
        Provider::Google => !oauth_ids::GOOGLE_CLIENT_ID.is_empty() && !oauth_ids::GOOGLE_CLIENT_SECRET.is_empty(),
    }
}

// Which providers have an app registration built in (oauth_ids.rs).
#[tauri::command]
pub fn accounts_available() -> HashMap<&'static str, bool> {
    HashMap::from([("microsoft", set_up(Provider::Microsoft)), ("google", set_up(Provider::Google))])
}

// ----- signing in -----

fn random_text(bytes: usize) -> Result<String, String> {
    let mut buf = vec![0u8; bytes];
    getrandom::fill(&mut buf).map_err(err)?;
    Ok(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(buf))
}

fn challenge_of(verifier: &str) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

const PAGE: &str = r#"<!doctype html><meta charset="utf-8"><title>Project Life</title>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#0e1016;color:#e8e9f0;font:16px/1.5 system-ui,sans-serif">
<div style="text-align:center;max-width:420px;padding:24px"><div style="font-size:22px;font-weight:700;margin-bottom:8px">{title}</div>
<div style="color:#9a9db0">{body}</div></div>"#;

fn answer(stream: &mut TcpStream, status: &str, title: &str, body: &str) {
    let html = PAGE.replace("{title}", title).replace("{body}", body);
    let _ = write!(stream, "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{html}", html.len());
    let _ = stream.flush();
}

// One request to the loopback address: the provider's answer, or something
// else (a favicon) to ignore.
fn read_answer(stream: &mut TcpStream, state: &str) -> Option<Result<String, String>> {
    stream.set_nonblocking(false).ok()?;
    stream.set_read_timeout(Some(Duration::from_secs(5))).ok()?;
    let mut buf = Vec::new();
    let mut chunk = [0u8; 2048];
    while !buf.windows(4).any(|w| w == b"\r\n\r\n") && buf.len() < 16 * 1024 {
        match stream.read(&mut chunk) {
            Ok(0) | Err(_) => break,
            Ok(n) => buf.extend_from_slice(&chunk[..n]),
        }
    }
    let head = String::from_utf8_lossy(&buf);
    let path = head.lines().next()?.split_whitespace().nth(1)?.to_string();
    let url = url::Url::parse(&format!("http://localhost{path}")).ok()?;
    let q: HashMap<String, String> = url.query_pairs().into_owned().collect();
    if let Some(e) = q.get("error") {
        answer(stream, "200 OK", "Not connected", "Sign-in was cancelled. You can close this tab.");
        let why = q.get("error_description").cloned().unwrap_or_else(|| e.clone());
        return Some(Err(if e == "access_denied" { "Sign-in was cancelled.".into() } else { format!("Sign-in didn't finish: {why}") }));
    }
    let Some(code) = q.get("code") else {
        answer(stream, "404 Not Found", "Project Life", "Nothing here.");
        return None;
    };
    if q.get("state").map(String::as_str) != Some(state) {
        answer(stream, "400 Bad Request", "Not connected", "That sign-in didn't come from Project Life. Try Connect again.");
        return Some(Err("That sign-in didn't come from Project Life. Try Connect again.".into()));
    }
    answer(stream, "200 OK", "You're connected", "You can close this tab and go back to Project Life.");
    Some(Ok(code.clone()))
}

// The browser comes back to http://localhost:<port> (Microsoft) or
// http://127.0.0.1:<port> (Google); both addresses listen, in case the
// browser tries IPv6 for "localhost".
fn wait_for_code(listeners: &[TcpListener], state: &str, timeout: Duration) -> Result<String, String> {
    for l in listeners {
        l.set_nonblocking(true).map_err(err)?;
    }
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        for l in listeners {
            if let Ok((mut stream, _)) = l.accept() {
                if let Some(result) = read_answer(&mut stream, state) {
                    return result;
                }
            }
        }
        std::thread::sleep(Duration::from_millis(80));
    }
    Err("Sign-in took too long. Try Connect again.".into())
}

struct Tokens {
    access: String,
    expires_in: u64,
    refresh: Option<String>,
    id_token: Option<String>,
}

fn post_form(url: &str, pairs: &[(&str, &str)]) -> Result<Value, String> {
    let body = url::form_urlencoded::Serializer::new(String::new()).extend_pairs(pairs).finish();
    let agent = web::web_agent(30, "ProjectLife/0.1");
    let mut res = agent
        .post(url)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .header("Accept", "application/json")
        .send(body)
        .map_err(|e| format!("Couldn't reach the sign-in server: {e}."))?;
    let status = res.status().as_u16();
    let text = res.body_mut().read_to_string().unwrap_or_default();
    let v: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
    if (200..300).contains(&status) {
        return Ok(v);
    }
    let code = v["error"].as_str().unwrap_or("");
    let why = v["error_description"].as_str().unwrap_or(code).lines().next().unwrap_or("").to_string();
    if code == "invalid_grant" || code == "interaction_required" {
        // AADSTS65001: the scope was never agreed to (Teams meetings).
        if why.contains("AADSTS65001") || why.contains("consent") {
            return Err(format!("{CONSENT}{why}"));
        }
        return Err(format!("{RECONNECT}{why}"));
    }
    if code == "consent_required" || code == "invalid_scope" {
        return Err(format!("{CONSENT}{why}"));
    }
    Err(format!("Sign-in didn't work: {why}"))
}

fn tokens_of(v: &Value) -> Result<Tokens, String> {
    Ok(Tokens {
        access: v["access_token"].as_str().ok_or("The sign-in server didn't send a token.")?.to_string(),
        expires_in: v["expires_in"].as_u64().unwrap_or(3600),
        refresh: v["refresh_token"].as_str().map(String::from),
        id_token: v["id_token"].as_str().map(String::from),
    })
}

// The browser part: open the provider's page, wait for its answer, and trade
// the code for tokens.
fn authorize(app: &AppHandle, p: Provider, scopes: &str, login_hint: Option<&str>) -> Result<Tokens, String> {
    if !set_up(p) {
        return Err("This build doesn't have its app registration yet (docs/ACCOUNTS.md).".into());
    }
    let v4 = TcpListener::bind("127.0.0.1:0").map_err(err)?;
    let port = v4.local_addr().map_err(err)?.port();
    let mut listeners = vec![v4];
    if let Ok(v6) = TcpListener::bind(("::1", port)) {
        listeners.push(v6);
    }
    let verifier = random_text(48)?;
    let state = random_text(18)?;
    let challenge = challenge_of(&verifier);
    let (redirect, auth_url) = match p {
        Provider::Microsoft => {
            let redirect = format!("http://localhost:{port}");
            let mut u = url::Url::parse(&format!("{MS_AUTH}/authorize")).map_err(err)?;
            u.query_pairs_mut()
                .append_pair("client_id", oauth_ids::MICROSOFT_CLIENT_ID)
                .append_pair("response_type", "code")
                .append_pair("redirect_uri", &redirect)
                .append_pair("response_mode", "query")
                .append_pair("scope", scopes)
                .append_pair("state", &state)
                .append_pair("code_challenge", &challenge)
                .append_pair("code_challenge_method", "S256")
                .append_pair("prompt", if login_hint.is_some() { "consent" } else { "select_account" });
            if let Some(hint) = login_hint {
                u.query_pairs_mut().append_pair("login_hint", hint);
            }
            (redirect, u)
        }
        Provider::Google => {
            let redirect = format!("http://127.0.0.1:{port}");
            let mut u = url::Url::parse(GOOGLE_AUTH).map_err(err)?;
            u.query_pairs_mut()
                .append_pair("client_id", oauth_ids::GOOGLE_CLIENT_ID)
                .append_pair("response_type", "code")
                .append_pair("redirect_uri", &redirect)
                .append_pair("scope", scopes)
                .append_pair("state", &state)
                .append_pair("code_challenge", &challenge)
                .append_pair("code_challenge_method", "S256")
                // A refresh token every time, even when signing in again.
                .append_pair("access_type", "offline")
                .append_pair("prompt", "consent select_account");
            if let Some(hint) = login_hint {
                u.query_pairs_mut().append_pair("login_hint", hint);
            }
            (redirect, u)
        }
    };
    app.opener().open_url(auth_url.as_str(), None::<&str>).map_err(err)?;
    let code = wait_for_code(&listeners, &state, Duration::from_secs(300));
    // Back to Project Life, whatever happened in the browser.
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
    let code = code?;
    let v = match p {
        Provider::Microsoft => post_form(
            &format!("{MS_AUTH}/token"),
            &[
                ("client_id", oauth_ids::MICROSOFT_CLIENT_ID),
                ("grant_type", "authorization_code"),
                ("code", &code),
                ("redirect_uri", &redirect),
                ("code_verifier", &verifier),
                ("scope", scopes),
            ],
        )?,
        Provider::Google => post_form(
            GOOGLE_TOKEN,
            &[
                ("client_id", oauth_ids::GOOGLE_CLIENT_ID),
                ("client_secret", oauth_ids::GOOGLE_CLIENT_SECRET),
                ("grant_type", "authorization_code"),
                ("code", &code),
                ("redirect_uri", &redirect),
                ("code_verifier", &verifier),
            ],
        )?,
    };
    tokens_of(&v)
}

// What the ID token says about who signed in (it came straight from the
// provider over HTTPS, so it's read, not verified).
fn claims_of(id_token: &str) -> Value {
    let part = id_token.split('.').nth(1).unwrap_or("");
    base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(part.trim_end_matches('='))
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or(Value::Null)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountInfo {
    id: String,
    provider: &'static str,
    email: String,
    name: String,
    // A work or school Microsoft account, which can make Teams meetings.
    work: bool,
}

fn token_cache() -> &'static Mutex<HashMap<String, (String, Instant)>> {
    static CACHE: OnceLock<Mutex<HashMap<String, (String, Instant)>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn remember(account: &str, meetings: bool, t: &Tokens) -> Result<(), String> {
    if let Some(r) = &t.refresh {
        system::entry(&format!("account:{account}"))?.set_password(r).map_err(err)?;
    }
    let until = Instant::now() + Duration::from_secs(t.expires_in.saturating_sub(90));
    token_cache().lock().map_err(err)?.insert(format!("{account}|{meetings}"), (t.access.clone(), until));
    Ok(())
}

#[tauri::command(async)]
pub fn account_connect(app: AppHandle, provider: String) -> Result<AccountInfo, String> {
    let p = parse_provider(&provider)?;
    let scopes = match p {
        Provider::Microsoft => MS_SCOPES,
        Provider::Google => GOOGLE_SCOPES,
    };
    let t = authorize(&app, p, scopes, None)?;
    let c = t.id_token.as_deref().map(claims_of).unwrap_or(Value::Null);
    let text = |k: &str| c[k].as_str().unwrap_or("").to_string();
    let info = match p {
        Provider::Microsoft => {
            let id = if text("oid").is_empty() { text("sub") } else { text("oid") };
            let email = [text("email"), text("preferred_username")].into_iter().find(|s| !s.is_empty()).unwrap_or_default();
            AccountInfo { id: format!("ms-{id}"), provider: "microsoft", email, name: text("name"), work: text("tid") != MS_CONSUMERS }
        }
        Provider::Google => AccountInfo { id: format!("google-{}", text("sub")), provider: "google", email: text("email"), name: text("name"), work: false },
    };
    if info.id.ends_with('-') {
        return Err("The sign-in didn't say who you are. Try Connect again.".into());
    }
    if t.refresh.is_none() {
        return Err("The sign-in didn't allow staying signed in. Try Connect again.".into());
    }
    remember(&info.id, false, &t)?;
    Ok(info)
}

// Teams meetings for events on Project Life's own calendars need one more
// permission, asked for the first time one is made.
#[tauri::command(async)]
pub fn account_allow_meetings(app: AppHandle, account: String, email: String) -> Result<(), String> {
    if provider_of(&account)? != Provider::Microsoft {
        return Ok(());
    }
    let t = authorize(&app, Provider::Microsoft, &format!("{MS_SCOPES} {MS_MEETINGS}"), Some(&email))?;
    remember(&account, true, &t)
}

#[tauri::command(async)]
pub fn account_disconnect(account: String) -> Result<(), String> {
    let p = provider_of(&account)?;
    let entry = system::entry(&format!("account:{account}"))?;
    // Google can be told to forget the sign-in too; Microsoft's lasts until it expires.
    if p == Provider::Google {
        if let Ok(refresh) = entry.get_password() {
            let _ = post_form("https://oauth2.googleapis.com/revoke", &[("token", &refresh)]);
        }
    }
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => {}
        Err(e) => return Err(err(e)),
    }
    token_cache().lock().map_err(err)?.retain(|k, _| !k.starts_with(&format!("{account}|")));
    Ok(())
}

// An access token, from memory or by refreshing.
fn access_token(account: &str, meetings: bool) -> Result<String, String> {
    let key = format!("{account}|{meetings}");
    if let Some((t, until)) = token_cache().lock().map_err(err)?.get(&key) {
        if *until > Instant::now() {
            return Ok(t.clone());
        }
    }
    let refresh = match system::entry(&format!("account:{account}"))?.get_password() {
        Ok(r) => r,
        Err(keyring::Error::NoEntry) => return Err(format!("{RECONNECT}Sign in again.")),
        Err(e) => return Err(err(e)),
    };
    let v = match provider_of(account)? {
        Provider::Microsoft => {
            let scopes = if meetings { format!("{MS_SCOPES} {MS_MEETINGS}") } else { MS_SCOPES.to_string() };
            post_form(
                &format!("{MS_AUTH}/token"),
                &[("client_id", oauth_ids::MICROSOFT_CLIENT_ID), ("grant_type", "refresh_token"), ("refresh_token", &refresh), ("scope", &scopes)],
            )?
        }
        Provider::Google => post_form(
            GOOGLE_TOKEN,
            &[
                ("client_id", oauth_ids::GOOGLE_CLIENT_ID),
                ("client_secret", oauth_ids::GOOGLE_CLIENT_SECRET),
                ("grant_type", "refresh_token"),
                ("refresh_token", &refresh),
            ],
        )?,
    };
    let t = tokens_of(&v)?;
    remember(account, meetings, &t)?;
    Ok(t.access)
}

fn forget_token(account: &str, meetings: bool) {
    if let Ok(mut c) = token_cache().lock() {
        c.remove(&format!("{account}|{meetings}"));
    }
}

// ----- calling the APIs -----

enum Method {
    Get,
    Post,
    Patch,
    Delete,
}

fn call(account: &str, meetings: bool, method: Method, url: &str, body: Option<&Value>, prefer: Option<&str>) -> Result<Value, String> {
    let agent = web::web_agent(40, "ProjectLife/0.1");
    for attempt in 0..2 {
        let token = access_token(account, meetings)?;
        let auth = format!("Bearer {token}");
        let result = match method {
            Method::Get => {
                let mut r = agent.get(url).header("Authorization", &auth).header("Accept", "application/json");
                if let Some(p) = prefer {
                    r = r.header("Prefer", p);
                }
                r.call()
            }
            Method::Delete => agent.delete(url).header("Authorization", &auth).call(),
            Method::Post | Method::Patch => {
                let text = body.map(|b| b.to_string()).unwrap_or_else(|| "{}".into());
                let mut r = if matches!(method, Method::Post) { agent.post(url) } else { agent.patch(url) };
                r = r.header("Authorization", &auth).header("Accept", "application/json").header("Content-Type", "application/json");
                if let Some(p) = prefer {
                    r = r.header("Prefer", p);
                }
                r.send(text)
            }
        };
        let mut res = result.map_err(|e| format!("Couldn't reach the calendar: {e}."))?;
        let status = res.status().as_u16();
        let text = res.body_mut().read_to_string().unwrap_or_default();
        if status == 401 && attempt == 0 {
            forget_token(account, meetings);
            continue;
        }
        if (200..300).contains(&status) {
            return Ok(serde_json::from_str(&text).unwrap_or(Value::Null));
        }
        if matches!(method, Method::Delete) && (status == 404 || status == 410) {
            return Ok(Value::Null);
        }
        let v: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
        let why = v["error"]["message"].as_str().or(v["error_description"].as_str()).unwrap_or("").to_string();
        if status == 401 {
            return Err(format!("{RECONNECT}{why}"));
        }
        if meetings && status == 403 {
            return Err(format!("{CONSENT}{why}"));
        }
        return Err(if why.is_empty() { format!("The calendar answered {status}.") } else { why });
    }
    Err(format!("{RECONNECT}Sign in again."))
}

fn enc(s: &str) -> String {
    percent_encoding::utf8_percent_encode(s, percent_encoding::NON_ALPHANUMERIC).to_string()
}

// Windows' own name for its time zone ("Eastern Standard Time"), which
// Outlook uses to answer in local time.
fn windows_zone() -> String {
    use windows::Win32::System::Time::{GetDynamicTimeZoneInformation, DYNAMIC_TIME_ZONE_INFORMATION};
    let mut info = DYNAMIC_TIME_ZONE_INFORMATION::default();
    unsafe { GetDynamicTimeZoneInformation(&mut info) };
    let name = String::from_utf16_lossy(&info.TimeZoneKeyName);
    let name = name.trim_end_matches('\0').trim();
    if name.is_empty() { "UTC".into() } else { name.to_string() }
}

// "2026-09-25" → that local midnight, as UTC for the APIs.
fn utc_of_day(day: &str) -> Result<String, String> {
    use chrono::{Local, NaiveDate, TimeZone};
    let d = NaiveDate::parse_from_str(day, "%Y-%m-%d").map_err(err)?;
    let local = Local.from_local_datetime(&d.and_hms_opt(0, 0, 0).ok_or("Bad date")?).earliest().ok_or("Bad date")?;
    Ok(local.with_timezone(&chrono::Utc).format("%Y-%m-%dT%H:%M:%SZ").to_string())
}

fn utc_of_stamp(stamp: &str) -> Result<String, String> {
    use chrono::{Local, NaiveDateTime, TimeZone};
    let n = NaiveDateTime::parse_from_str(stamp, "%Y-%m-%dT%H:%M").map_err(err)?;
    let local = Local.from_local_datetime(&n).earliest().ok_or("Bad time")?;
    Ok(local.with_timezone(&chrono::Utc).format("%Y-%m-%dT%H:%M:%SZ").to_string())
}

// An all-day event seen from another time zone can come back a few hours
// off midnight; it belongs to the nearest day.
fn day_stamp(wall: &str) -> String {
    use chrono::{Duration as Days, NaiveDateTime};
    match NaiveDateTime::parse_from_str(&wall[..16.min(wall.len())], "%Y-%m-%dT%H:%M") {
        Ok(n) => {
            let day = if n.format("%H").to_string().parse::<u32>().unwrap_or(0) >= 12 { n.date() + Days::days(1) } else { n.date() };
            format!("{}T00:00", day.format("%Y-%m-%d"))
        }
        Err(_) => format!("{}T00:00", &wall[..10.min(wall.len())]),
    }
}

fn plain_text(html: &str) -> String {
    if !html.contains('<') {
        return html.trim().to_string();
    }
    let breaks = regex::Regex::new(r"(?i)<br\s*/?>|</p>|</div>|</li>").unwrap();
    let tags = regex::Regex::new(r"<[^>]+>").unwrap();
    let text = tags.replace_all(&breaks.replace_all(html, "\n"), "").to_string();
    text.replace("&nbsp;", " ").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#39;", "'").replace("&amp;", "&").trim().to_string()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteCalendar {
    id: String,
    name: String,
    color: Option<String>,
    can_edit: bool,
    primary: bool,
    // Minutes before, for events that use the calendar's own reminders (Google).
    reminders: Vec<u64>,
}

#[tauri::command(async)]
pub fn account_calendars(account: String) -> Result<Vec<RemoteCalendar>, String> {
    match provider_of(&account)? {
        Provider::Microsoft => {
            let v = call(&account, false, Method::Get, &format!("{GRAPH}/me/calendars?$top=100&$select=id,name,hexColor,canEdit,isDefaultCalendar"), None, None)?;
            Ok(v["value"]
                .as_array()
                .into_iter()
                .flatten()
                .map(|c| RemoteCalendar {
                    id: c["id"].as_str().unwrap_or("").into(),
                    name: c["name"].as_str().unwrap_or("Calendar").into(),
                    color: c["hexColor"].as_str().filter(|s| !s.is_empty()).map(String::from),
                    can_edit: c["canEdit"].as_bool().unwrap_or(false),
                    primary: c["isDefaultCalendar"].as_bool().unwrap_or(false),
                    reminders: vec![],
                })
                .filter(|c| !c.id.is_empty())
                .collect())
        }
        Provider::Google => {
            let v = call(&account, false, Method::Get, &format!("{GCAL}/users/me/calendarList?maxResults=250"), None, None)?;
            Ok(v["items"]
                .as_array()
                .into_iter()
                .flatten()
                .filter(|c| c["accessRole"].as_str() != Some("freeBusyReader"))
                .map(|c| RemoteCalendar {
                    id: c["id"].as_str().unwrap_or("").into(),
                    name: c["summaryOverride"].as_str().or(c["summary"].as_str()).unwrap_or("Calendar").into(),
                    color: c["backgroundColor"].as_str().map(String::from),
                    can_edit: matches!(c["accessRole"].as_str(), Some("owner" | "writer")),
                    primary: c["primary"].as_bool().unwrap_or(false),
                    reminders: c["defaultReminders"]
                        .as_array()
                        .into_iter()
                        .flatten()
                        .filter(|r| r["method"].as_str() == Some("popup"))
                        .filter_map(|r| r["minutes"].as_u64())
                        .collect(),
                })
                .filter(|c| !c.id.is_empty())
                .collect())
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteEvent {
    id: String,
    title: String,
    start: String,
    end: String,
    all_day: bool,
    place: String,
    description: String,
    join_url: Option<String>,
    reminders: Vec<u64>,
    // The repeating event this is one day of.
    series: Option<String>,
    // The event in Outlook or Google Calendar, on the web.
    link: Option<String>,
    // Yours to change (you organized it, on a calendar you can write to).
    editable: bool,
    declined: bool,
}

fn from_graph(e: &Value, writable: bool) -> Option<RemoteEvent> {
    if e["isCancelled"].as_bool() == Some(true) {
        return None;
    }
    let all_day = e["isAllDay"].as_bool().unwrap_or(false);
    let start = e["start"]["dateTime"].as_str()?;
    let end = e["end"]["dateTime"].as_str()?;
    let (start, end) = if all_day { (day_stamp(start), day_stamp(end)) } else { (start.get(..16)?.to_string(), end.get(..16)?.to_string()) };
    let reminders = if e["isReminderOn"].as_bool().unwrap_or(false) { e["reminderMinutesBeforeStart"].as_u64().into_iter().collect() } else { vec![] };
    Some(RemoteEvent {
        id: e["id"].as_str()?.into(),
        title: e["subject"].as_str().filter(|s| !s.is_empty()).unwrap_or("(No title)").into(),
        start,
        end,
        all_day,
        place: e["location"]["displayName"].as_str().unwrap_or("").into(),
        description: plain_text(e["body"]["content"].as_str().unwrap_or("")),
        join_url: e["onlineMeeting"]["joinUrl"].as_str().map(String::from),
        reminders,
        series: e["seriesMasterId"].as_str().map(String::from),
        link: e["webLink"].as_str().map(String::from),
        editable: writable && e["isOrganizer"].as_bool().unwrap_or(true),
        declined: e["responseStatus"]["response"].as_str() == Some("declined"),
    })
}

fn from_google(e: &Value, writable: bool, defaults: &[u64]) -> Option<RemoteEvent> {
    if e["status"].as_str() == Some("cancelled") {
        return None;
    }
    let (start, end, all_day) = match (e["start"]["dateTime"].as_str(), e["end"]["dateTime"].as_str()) {
        (Some(s), Some(t)) => (s.get(..16)?.to_string(), t.get(..16)?.to_string(), false),
        _ => (format!("{}T00:00", e["start"]["date"].as_str()?), format!("{}T00:00", e["end"]["date"].as_str()?), true),
    };
    let reminders = if e["reminders"]["useDefault"].as_bool().unwrap_or(true) {
        defaults.to_vec()
    } else {
        e["reminders"]["overrides"].as_array().into_iter().flatten().filter_map(|r| r["minutes"].as_u64()).collect()
    };
    let join = e["hangoutLink"].as_str().map(String::from).or_else(|| {
        e["conferenceData"]["entryPoints"].as_array()?.iter().find(|p| p["entryPointType"].as_str() == Some("video")).and_then(|p| p["uri"].as_str()).map(String::from)
    });
    let me = e["attendees"].as_array().and_then(|a| a.iter().find(|x| x["self"].as_bool() == Some(true)).cloned());
    let organizer = e["organizer"]["self"].as_bool().unwrap_or(e["organizer"].is_null());
    Some(RemoteEvent {
        id: e["id"].as_str()?.into(),
        title: e["summary"].as_str().filter(|s| !s.is_empty()).unwrap_or("(No title)").into(),
        start,
        end,
        all_day,
        place: e["location"].as_str().unwrap_or("").into(),
        description: plain_text(e["description"].as_str().unwrap_or("")),
        join_url: join,
        reminders,
        series: e["recurringEventId"].as_str().map(String::from),
        link: e["htmlLink"].as_str().map(String::from),
        editable: writable && (organizer || e["guestsCanModify"].as_bool().unwrap_or(false)),
        declined: me.map(|m| m["responseStatus"].as_str() == Some("declined")).unwrap_or(false),
    })
}

const GRAPH_FIELDS: &str = "id,subject,start,end,isAllDay,location,body,onlineMeeting,isReminderOn,reminderMinutesBeforeStart,seriesMasterId,webLink,isOrganizer,isCancelled,responseStatus";

fn graph_prefer() -> String {
    format!("outlook.timezone=\"{}\", outlook.body-content-type=\"text\"", windows_zone())
}

// Every event from `from` up to (not including) `to`, repeating ones as
// their separate days.
#[tauri::command(async)]
pub fn account_events(account: String, calendar: String, from: String, to: String, zone: String, writable: bool, defaults: Vec<u64>) -> Result<Vec<RemoteEvent>, String> {
    let (start, end) = (utc_of_day(&from)?, utc_of_day(&to)?);
    let mut out = Vec::new();
    match provider_of(&account)? {
        Provider::Microsoft => {
            let prefer = graph_prefer();
            let mut next = Some(format!(
                "{GRAPH}/me/calendars/{}/calendarView?startDateTime={}&endDateTime={}&$top=250&$select={GRAPH_FIELDS}",
                enc(&calendar),
                enc(&start),
                enc(&end)
            ));
            let mut pages = 0;
            while let Some(url) = next.take() {
                let v = call(&account, false, Method::Get, &url, None, Some(&prefer))?;
                out.extend(v["value"].as_array().into_iter().flatten().filter_map(|e| from_graph(e, writable)));
                next = v["@odata.nextLink"].as_str().map(String::from);
                pages += 1;
                if pages > 40 {
                    break;
                }
            }
        }
        Provider::Google => {
            let mut page: Option<String> = None;
            for _ in 0..40 {
                let mut url = format!(
                    "{GCAL}/calendars/{}/events?singleEvents=true&maxResults=250&timeMin={}&timeMax={}&timeZone={}",
                    enc(&calendar),
                    enc(&start),
                    enc(&end),
                    enc(&zone)
                );
                if let Some(p) = &page {
                    url.push_str(&format!("&pageToken={}", enc(p)));
                }
                let v = call(&account, false, Method::Get, &url, None, None)?;
                out.extend(v["items"].as_array().into_iter().flatten().filter_map(|e| from_google(e, writable, &defaults)));
                page = v["nextPageToken"].as_str().map(String::from);
                if page.is_none() {
                    break;
                }
            }
        }
    }
    Ok(out)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventInput {
    title: String,
    start: String,
    end: String,
    all_day: bool,
    place: String,
    description: String,
    reminders: Vec<u64>,
    // Add a Teams (Microsoft) or Meet (Google) link.
    meeting: bool,
}

// Creates the event (no id) or changes it; hands back how it is now.
#[tauri::command(async)]
pub fn account_save_event(account: String, calendar: String, id: Option<String>, event: EventInput, zone: String) -> Result<RemoteEvent, String> {
    let e = &event;
    match provider_of(&account)? {
        Provider::Microsoft => {
            let tz = windows_zone();
            let mut body = json!({
                "subject": e.title,
                "body": { "contentType": "text", "content": e.description },
                "start": { "dateTime": format!("{}:00", e.start), "timeZone": tz },
                "end": { "dateTime": format!("{}:00", e.end), "timeZone": tz },
                "isAllDay": e.all_day,
                "location": { "displayName": e.place },
                "isReminderOn": !e.reminders.is_empty(),
                "reminderMinutesBeforeStart": e.reminders.first().copied().unwrap_or(15),
            });
            if e.meeting {
                body["isOnlineMeeting"] = json!(true);
                body["onlineMeetingProvider"] = json!("teamsForBusiness");
            }
            let prefer = graph_prefer();
            let v = match &id {
                Some(id) => call(&account, false, Method::Patch, &format!("{GRAPH}/me/events/{}", enc(id)), Some(&body), Some(&prefer))?,
                None => call(&account, false, Method::Post, &format!("{GRAPH}/me/calendars/{}/events", enc(&calendar)), Some(&body), Some(&prefer))?,
            };
            from_graph(&v, true).ok_or_else(|| "Outlook didn't send the event back.".into())
        }
        Provider::Google => {
            let when = |stamp: &str| if e.all_day { json!({ "date": &stamp[..10] }) } else { json!({ "dateTime": format!("{stamp}:00"), "timeZone": zone }) };
            let mut body = json!({
                "summary": e.title,
                "description": e.description,
                "location": e.place,
                "start": when(&e.start),
                "end": when(&e.end),
                "reminders": { "useDefault": false, "overrides": e.reminders.iter().map(|m| json!({ "method": "popup", "minutes": m })).collect::<Vec<_>>() },
            });
            if e.meeting {
                body["conferenceData"] = json!({ "createRequest": { "requestId": random_text(12)?, "conferenceSolutionKey": { "type": "hangoutsMeet" } } });
            }
            let v = match &id {
                Some(id) => call(&account, false, Method::Patch, &format!("{GCAL}/calendars/{}/events/{}?conferenceDataVersion=1", enc(&calendar), enc(id)), Some(&body), None)?,
                None => call(&account, false, Method::Post, &format!("{GCAL}/calendars/{}/events?conferenceDataVersion=1", enc(&calendar)), Some(&body), None)?,
            };
            from_google(&v, true, &[]).ok_or_else(|| "Google Calendar didn't send the event back.".into())
        }
    }
}

#[tauri::command(async)]
pub fn account_delete_event(account: String, calendar: String, id: String) -> Result<(), String> {
    let url = match provider_of(&account)? {
        Provider::Microsoft => format!("{GRAPH}/me/events/{}", enc(&id)),
        Provider::Google => format!("{GCAL}/calendars/{}/events/{}", enc(&calendar), enc(&id)),
    };
    call(&account, false, Method::Delete, &url, None, None).map(|_| ())
}

// A Teams or Meet link on its own, for an event on one of Project Life's own
// calendars.
#[tauri::command(async)]
pub fn account_meeting(account: String, title: String, start: String, end: String) -> Result<String, String> {
    match provider_of(&account)? {
        Provider::Microsoft => {
            let body = json!({ "subject": title, "startDateTime": utc_of_stamp(&start)?, "endDateTime": utc_of_stamp(&end)? });
            let v = call(&account, true, Method::Post, &format!("{GRAPH}/me/onlineMeetings"), Some(&body), None)?;
            v["joinWebUrl"].as_str().or(v["joinUrl"].as_str()).map(String::from).ok_or_else(|| "Teams didn't send a link.".into())
        }
        Provider::Google => {
            let v = call(&account, false, Method::Post, "https://meet.googleapis.com/v2/spaces", Some(&json!({})), None)?;
            v["meetingUri"].as_str().map(String::from).ok_or_else(|| "Meet didn't send a link.".into())
        }
    }
}
