// Fetching from the web, for Home's news feeds and weather. Ported from
// Checkpoint: public addresses only, Windows' certificates and proxy, and a
// size cap on what comes back.
fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

// A DWORD from the current user's registry, via reg.exe.
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
// proxy server). Read once, when first needed. Setup scripts (PAC files)
// aren't followed; the connection is then made directly.
fn system_proxy() -> Option<ureq::Proxy> {
    static PROXY: std::sync::OnceLock<Option<ureq::Proxy>> = std::sync::OnceLock::new();
    PROXY
        .get_or_init(|| {
            if let Some(proxy) = ureq::Proxy::try_from_env() {
                return Some(proxy);
            }
            let key = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings";
            if reg_dword(key, "ProxyEnable") != Some(1) {
                return None;
            }
            let server = reg_string(key, "ProxyServer")?;
            // "host:port" for everything, or per protocol: "http=host:port;https=host:port".
            let chosen = if server.contains('=') {
                let part = |kind: &str| server.split(';').find_map(|p| p.trim().strip_prefix(kind).map(str::to_string));
                part("https=").or_else(|| part("http="))?
            } else {
                server
            };
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
fn web_agent(timeout_secs: u64, user_agent: &str) -> ureq::Agent {
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
fn fetch_public(url: &str, accept: &str, limit: u64, timeout_secs: u64) -> Result<(url::Url, String, Vec<u8>), String> {
    let agent = web_agent(timeout_secs, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ProjectLife/0.1");
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

// Text from a public web address: RSS/Atom news feeds and weather JSON for
// the Home screen. Up to 3 MB; see fetch_public for what's allowed.
#[tauri::command(async)]
pub fn fetch_text(url: String) -> Result<String, String> {
    let accept = "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, application/json;q=0.9, text/html;q=0.5, */*;q=0.3";
    let (_, kind, bytes) = fetch_public(&url, accept, 3 * 1024 * 1024, 12)?;
    Ok(decode_text(&kind, &bytes))
}

// Most feeds are UTF-8, but some older ones are Latin-1 or Windows-1252,
// named in the Content-Type or the XML declaration. Those are decoded here so
// accented letters and curly quotes come through.
fn decode_text(content_type: &str, bytes: &[u8]) -> String {
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
