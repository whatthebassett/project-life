// Fetching from the web, for Home's news feeds and weather. Ported from
// Checkpoint: public addresses only, Windows' certificates and proxy, and a
// size cap on what comes back.
fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

// A DWORD from the current user's registry, via reg.exe.
#[cfg(windows)]
fn reg_dword(key: &str, value: &str) -> Option<u32> {
    use std::os::windows::process::CommandExt;
    let output = std::process::Command::new("reg")
        .args(["query", key, "/v", value])
        .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let hex = text.split_whitespace().find(|w| w.starts_with("0x"))?;
    u32::from_str_radix(&hex[2..], 16).ok()
}

#[cfg(windows)]
fn reg_string(key: &str, value: &str) -> Option<String> {
    use std::os::windows::process::CommandExt;
    let output = std::process::Command::new("reg")
        .args(["query", key, "/v", value])
        .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let line = text.lines().find(|l| l.trim_start().starts_with(value))?;
    let (_, rest) = line.split_once("REG_SZ")?;
    Some(rest.trim().to_string()).filter(|s| !s.is_empty())
}

// An address that isn't on the public internet: this computer, the local
// network, carrier-grade NAT, link-local, multicast and reserved ranges, and
// the same addresses written as IPv6 (IPv4-mapped, or NAT64's 64:ff9b::/96).
fn ip_is_private(ip: std::net::IpAddr) -> bool {
    use std::net::{IpAddr, Ipv4Addr};
    fn v4(ip: Ipv4Addr) -> bool {
        let [a, b, ..] = ip.octets();
        ip.is_private() || ip.is_loopback() || ip.is_link_local() || ip.is_unspecified() || ip.is_broadcast() || ip.is_documentation() || ip.is_multicast()
            || a == 0
            || (a == 100 && (64..=127).contains(&b))
            || a >= 240
    }
    match ip {
        IpAddr::V4(ip) => v4(ip),
        IpAddr::V6(ip) => {
            let s = ip.segments();
            if let Some(mapped) = ip.to_ipv4_mapped() {
                return v4(mapped);
            }
            if s[0] == 0x64 && s[1] == 0xff9b && s[2..6] == [0, 0, 0, 0] {
                return v4(Ipv4Addr::new((s[6] >> 8) as u8, s[6] as u8, (s[7] >> 8) as u8, s[7] as u8));
            }
            ip.is_loopback() || ip.is_unspecified() || ip.is_multicast() || (s[0] & 0xfe00) == 0xfc00 || (s[0] & 0xffc0) == 0xfe80
        }
    }
}

// Looks up addresses for ureq and refuses private ones. The check happens on
// the very addresses it then connects to, so a site can't answer a separate
// check with a public address and the connection with a local one (DNS
// rebinding). It runs for every redirect too.
//
// 198.18.0.0/15 is allowed: VPNs and proxy tools (Clash and the like) answer
// every lookup with an address from it and carry the traffic themselves.
//
// Through a proxy, ureq looks up only the proxy itself, which is often on the
// local network; that one lookup is let through.
#[derive(Debug, Default)]
struct PublicOnly {
    inner: ureq::unversioned::resolver::DefaultResolver,
    proxy_host: Option<String>,
}

impl ureq::unversioned::resolver::Resolver for PublicOnly {
    fn resolve(
        &self,
        uri: &ureq::http::Uri,
        config: &ureq::config::Config,
        timeout: ureq::unversioned::transport::NextTimeout,
    ) -> Result<ureq::unversioned::resolver::ResolvedSocketAddrs, ureq::Error> {
        let addrs = self.inner.resolve(uri, config, timeout)?;
        let to_proxy = self.proxy_host.as_deref().is_some_and(|p| uri.host().is_some_and(|h| h.eq_ignore_ascii_case(p)));
        if !to_proxy && addrs.iter().any(|a| ip_is_private(a.ip())) {
            return Err(ureq::Error::Io(std::io::Error::new(
                std::io::ErrorKind::PermissionDenied,
                "that address isn't on the public internet",
            )));
        }
        Ok(addrs)
    }
}

// The proxy this PC uses, like the browser does: HTTPS_PROXY / HTTP_PROXY if
// set, or the one in Windows' settings (Network & internet → Proxy → Use a
// proxy server) or the Mac's (Network → Proxies → Secure web proxy). Read
// once, when first needed. Setup scripts (PAC files) aren't followed; the
// connection is then made directly.
#[cfg(windows)]
fn os_proxy() -> Option<String> {
    let key = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings";
    if reg_dword(key, "ProxyEnable") != Some(1) {
        return None;
    }
    let server = reg_string(key, "ProxyServer")?;
    // "host:port" for everything, or per protocol: "http=host:port;https=host:port".
    Some(if server.contains('=') {
        let part = |kind: &str| server.split(';').find_map(|p| p.trim().strip_prefix(kind).map(str::to_string));
        part("https=").or_else(|| part("http="))?
    } else {
        server
    })
}

// "host:port" from `scutil --proxy`, which prints the Mac's proxy settings as
// "HTTPSEnable : 1", "HTTPSProxy : host" and "HTTPSPort : 8080" lines.
#[cfg(not(windows))]
fn os_proxy() -> Option<String> {
    let output = std::process::Command::new("scutil").arg("--proxy").output().ok()?;
    let text = String::from_utf8_lossy(&output.stdout).into_owned();
    let value = |name: &str| text.lines().find_map(|l| l.trim().strip_prefix(name)?.trim().strip_prefix(':').map(|v| v.trim().to_string()));
    ["HTTPS", "HTTP"].iter().find_map(|kind| {
        if value(&format!("{kind}Enable")).as_deref() != Some("1") {
            return None;
        }
        let host = value(&format!("{kind}Proxy")).filter(|h| !h.is_empty())?;
        Some(match value(&format!("{kind}Port")) {
            Some(port) => format!("{host}:{port}"),
            None => host,
        })
    })
}

fn system_proxy() -> Option<ureq::Proxy> {
    static PROXY: std::sync::OnceLock<Option<ureq::Proxy>> = std::sync::OnceLock::new();
    PROXY
        .get_or_init(|| {
            if let Some(proxy) = ureq::Proxy::try_from_env() {
                return Some(proxy);
            }
            let chosen = os_proxy()?;
            let uri = if chosen.contains("://") { chosen } else { format!("http://{chosen}") };
            ureq::Proxy::new(&uri).ok()
        })
        .clone()
}

// Every download Project Life makes goes through one of these, so it reaches
// the internet the way the rest of this PC does:
// - It trusts the certificates Windows trusts, like the browser. Antivirus
//   HTTPS scanning and company networks swap in certificates of their own
//   that only Windows knows about; with ureq's built-in list every site fails.
// - It goes through the proxy Windows is set to use (system_proxy).
// - It refuses private and local addresses (PublicOnly).
// Redirects are left to the caller.
pub(crate) fn web_agent(timeout_secs: u64, user_agent: &str) -> ureq::Agent {
    let proxy = system_proxy();
    let config = ureq::Agent::config_builder()
        .timeout_global(Some(std::time::Duration::from_secs(timeout_secs)))
        .max_redirects(0)
        .http_status_as_error(false)
        .tls_config(ureq::tls::TlsConfig::builder().root_certs(ureq::tls::RootCerts::PlatformVerifier).build())
        .proxy(proxy.clone())
        .user_agent(user_agent);
    let resolver = PublicOnly { inner: Default::default(), proxy_host: proxy.as_ref().map(|p| p.host().to_string()) };
    ureq::Agent::with_parts(config.build(), ureq::unversioned::transport::DefaultConnector::new(), resolver)
}

// GET a page from the public internet: http(s) only, every hop (redirects
// included) checked against private and loopback addresses, and the body
// capped at `limit` bytes. Returns where it ended up, its content type, and
// the bytes.
pub(crate) fn fetch_public(url: &str, accept: &str, limit: u64, timeout_secs: u64) -> Result<(url::Url, String, Vec<u8>), String> {
    fetch_from(url, accept, limit, timeout_secs, false, BROWSER_AGENT)
}

// News sites and link previews expect a browser; data services get Project
// Life's own name (see fetch_data).
const BROWSER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ProjectLife/0.1";
const APP_AGENT: &str = concat!("ProjectLife/", env!("CARGO_PKG_VERSION"), " (+https://github.com/whatthebassett/project-life)");

// The same, for a web page's <head> only: reading stops once it has come by,
// or at `limit` bytes without it. Titles and previews are all in the head,
// and some pages (YouTube's) are over a megabyte with the head half way down.
pub(crate) fn fetch_public_head(url: &str, limit: u64, timeout_secs: u64) -> Result<(url::Url, String, Vec<u8>), String> {
    fetch_from(url, "text/html,*/*;q=0.5", limit, timeout_secs, true, BROWSER_AGENT)
}

fn fetch_from(url: &str, accept: &str, limit: u64, timeout_secs: u64, head_only: bool, user_agent: &str) -> Result<(url::Url, String, Vec<u8>), String> {
    let agent = web_agent(timeout_secs, user_agent);
    let mut current = url::Url::parse(url).map_err(err)?;
    for _ in 0..5 {
        if !matches!(current.scheme(), "http" | "https") {
            return Err("Only web addresses (http or https) can be fetched.".into());
        }
        let host = current.host_str().unwrap_or_default().to_string();
        // An address written as an IP skips the lookup, so check it here too.
        if let Some(ip) = current.host().and_then(|h| match h {
            url::Host::Ipv4(ip) => Some(std::net::IpAddr::V4(ip)),
            url::Host::Ipv6(ip) => Some(std::net::IpAddr::V6(ip)),
            url::Host::Domain(_) => None,
        }) {
            if ip_is_private(ip) {
                return Err("That address isn't on the public internet.".into());
            }
        }
        let mut response = agent.get(current.as_str()).header("Accept", accept).call().map_err(|e| format!("Couldn't reach {host}: {e}."))?;
        let status = response.status().as_u16();
        if (300..400).contains(&status) {
            let location = response
                .headers()
                .get("location")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string())
                .ok_or("The site redirected without saying where.")?;
            current = current.join(&location).map_err(err)?;
            continue;
        }
        if !(200..300).contains(&status) {
            return Err(format!("{host} answered {status}."));
        }
        let kind = response.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").to_lowercase();
        if head_only {
            return Ok((current, kind, read_head(response.body_mut().as_reader(), limit)?));
        }
        // One byte past the limit tells a page that's too big from one that fits.
        let mut reader = std::io::Read::take(response.body_mut().as_reader(), limit + 1);
        let mut bytes = Vec::new();
        std::io::Read::read_to_end(&mut reader, &mut bytes).map_err(err)?;
        if bytes.len() as u64 > limit {
            return Err(format!("{host} sent more than {} MB.", limit / (1024 * 1024)));
        }
        return Ok((current, kind, bytes));
    }
    Err("Too many redirects.".into())
}

// Up to the end of </head>, or `limit` bytes.
fn read_head(mut reader: impl std::io::Read, limit: u64) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    let mut chunk = [0u8; 16 * 1024];
    loop {
        let n = reader.read(&mut chunk).map_err(err)?;
        if n == 0 {
            break;
        }
        // Look again from just before this chunk, in case the tag was split.
        let from = bytes.len().saturating_sub(6);
        bytes.extend_from_slice(&chunk[..n]);
        if bytes[from..].windows(7).any(|w| w.eq_ignore_ascii_case(b"</head>")) || bytes.len() as u64 >= limit {
            break;
        }
    }
    bytes.truncate(limit as usize);
    Ok(bytes)
}

// Text from a public web address: RSS/Atom news feeds and weather JSON for
// the Home screen. Up to 3 MB; see fetch_public for what's allowed.
#[tauri::command(async)]
pub fn fetch_text(url: String) -> Result<String, String> {
    let accept = "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, application/json;q=0.9, text/html;q=0.5, */*;q=0.3";
    let (_, kind, bytes) = fetch_public(&url, accept, 3 * 1024 * 1024, 12)?;
    Ok(decode_text(&kind, &bytes))
}

// A calendar someone shares by link (.ics): Google's "secret address in iCal
// format", Outlook's published calendars, iCloud, holidays, sports fixtures.
// webcal:// is the same address over https. Up to 25 MB: a calendar with
// years of history is big.
#[tauri::command(async)]
pub fn fetch_calendar(url: String) -> Result<String, String> {
    let url = url.trim();
    let url = match url.split_once("://") {
        Some((scheme, rest)) if scheme.eq_ignore_ascii_case("webcal") || scheme.eq_ignore_ascii_case("webcals") => format!("https://{rest}"),
        _ => url.to_string(),
    };
    let (_, kind, bytes) = fetch_public(&url, "text/calendar, application/ics;q=0.9, */*;q=0.5", 25 * 1024 * 1024, 30)?;
    let text = decode_text(&kind, &bytes);
    if !text.contains("BEGIN:VCALENDAR") {
        return Err("That address didn't give back a calendar. Check it's the iCal (.ics) link.".into());
    }
    Ok(text)
}

// Scores and stock prices for Home's Sports and Markets cards: ESPN's
// scoreboards and Yahoo Finance's charts and search. Only those services, and
// under Project Life's own name. Up to 3 MB.
#[tauri::command(async)]
pub fn fetch_data(url: String) -> Result<String, String> {
    let parsed = url::Url::parse(&url).map_err(err)?;
    let host = parsed.host_str().unwrap_or_default();
    let allowed = ["site.web.api.espn.com", "query1.finance.yahoo.com", "query2.finance.yahoo.com"];
    if parsed.scheme() != "https" || !allowed.contains(&host) {
        return Err(format!("{host} isn't one of the services Home's cards use."));
    }
    let (_, kind, bytes) = fetch_from(&url, "application/json", 3 * 1024 * 1024, 15, false, APP_AGENT)?;
    Ok(decode_text(&kind, &bytes))
}

// Most feeds are UTF-8, but some older ones are Latin-1 or Windows-1252,
// named in the Content-Type or the XML declaration. Those are decoded here so
// accented letters and curly quotes come through.
pub(crate) fn decode_text(content_type: &str, bytes: &[u8]) -> String {
    let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF][..]).unwrap_or(bytes);
    let head = String::from_utf8_lossy(&bytes[..bytes.len().min(256)]).to_lowercase();
    let declared = regex::Regex::new(r#"charset\s*=\s*"?([\w-]+)"#)
        .ok()
        .and_then(|re| re.captures(content_type).map(|c| c[1].to_string()))
        .or_else(|| regex::Regex::new(r#"<\?xml[^>]*encoding\s*=\s*["']([\w-]+)["']"#).ok().and_then(|re| re.captures(&head).map(|c| c[1].to_string())))
        .unwrap_or_default()
        .to_lowercase();
    let single_byte = matches!(declared.as_str(), "iso-8859-1" | "latin1" | "latin-1" | "iso-8859-15" | "windows-1252" | "cp1252" | "us-ascii");
    if !single_byte || std::str::from_utf8(bytes).is_ok() {
        return String::from_utf8_lossy(bytes).into_owned();
    }
    // Windows-1252 is Latin-1 with printable characters in 0x80–0x9F.
    const HIGH: [char; 32] = [
        '€', '\u{81}', '‚', 'ƒ', '„', '…', '†', '‡', 'ˆ', '‰', 'Š', '‹', 'Œ', '\u{8D}', 'Ž', '\u{8F}',
        '\u{90}', '‘', '’', '“', '”', '•', '–', '—', '˜', '™', 'š', '›', 'œ', '\u{9D}', 'ž', 'Ÿ',
    ];
    bytes.iter().map(|&b| if (0x80..0xA0).contains(&b) { HIGH[(b - 0x80) as usize] } else { b as char }).collect()
}

// Fixed, known addresses (Google Fonts): a plain user agent, so Google Fonts
// answers with desktop .ttf files rather than the web-only .woff2 it gives
// browsers.
fn plain_get(url: &str, limit: u64, timeout_secs: u64) -> Result<Vec<u8>, String> {
    let agent = web_agent(timeout_secs, "ProjectLife/0.1");
    let mut response = agent.get(url).call().map_err(|e| format!("Couldn't download it: {e}."))?;
    if response.status().as_u16() != 200 {
        return Err(format!("The download answered {}.", response.status().as_u16()));
    }
    let mut reader = std::io::Read::take(response.body_mut().as_reader(), limit + 1);
    let mut bytes = Vec::new();
    std::io::Read::read_to_end(&mut reader, &mut bytes).map_err(err)?;
    if bytes.len() as u64 > limit {
        return Err("That download is too large.".into());
    }
    Ok(bytes)
}

pub(crate) fn fetch_plain(url: &str, timeout_secs: u64) -> Result<String, String> {
    plain_get(url, 2 * 1024 * 1024, timeout_secs).map(|b| String::from_utf8_lossy(&b).into_owned())
}

pub(crate) fn fetch_bytes(url: &str, limit: u64) -> Result<Vec<u8>, String> {
    plain_get(url, limit, 40)
}

#[cfg(test)]
mod tests {
    use super::read_head;

    #[test]
    fn stops_after_the_head() {
        // </head> split across the first two 16 KB reads.
        let mut page = vec![b' '; 16 * 1024 - 3];
        page.extend_from_slice(b"</HEAD><body>");
        page.extend(vec![b'x'; 100 * 1024]);
        let head = read_head(&page[..], 1024 * 1024).unwrap();
        assert!(head.len() < 64 * 1024);
        assert!(String::from_utf8_lossy(&head).contains("</HEAD>"));
    }

    #[test]
    fn keeps_the_start_of_a_page_with_no_head() {
        let page = vec![b'x'; 100 * 1024];
        assert_eq!(read_head(&page[..], 40 * 1024).unwrap().len(), 40 * 1024);
    }

    // Needs the internet: cargo test live_card_data -- --ignored
    #[test]
    #[ignore]
    fn live_card_data() {
        let espn = super::fetch_data("https://site.web.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard".into()).unwrap();
        assert!(espn.contains("\"events\""));
        let yahoo = super::fetch_data("https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=1d&interval=5m".into()).unwrap();
        assert!(yahoo.contains("regularMarketPrice"));
        assert!(super::fetch_data("https://example.com/".into()).is_err());
    }

    // Needs the internet: cargo test live_youtube_title -- --ignored
    #[test]
    #[ignore]
    fn live_youtube_title() {
        let (_, _, bytes) = super::fetch_public_head("https://www.youtube.com/watch?v=ejjBbaq9RmY", 3 * 1024 * 1024, 8).unwrap();
        let html = String::from_utf8_lossy(&bytes);
        assert!(html.contains("og:title"), "got {} bytes", bytes.len());
        println!("read {} bytes", bytes.len());
    }
}
