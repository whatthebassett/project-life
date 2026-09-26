// The app registrations Connected accounts signs in with (docs/ACCOUNTS.md
// says how to make them). Client IDs aren't secrets: every desktop app ships
// its own. Google calls its desktop "client secret" a secret, but says it
// can't be kept secret in an installed app and isn't treated as one.
// Empty means that provider isn't set up yet, and its Connect button says so.

pub const MICROSOFT_CLIENT_ID: &str = "";

pub const GOOGLE_CLIENT_ID: &str = "";
pub const GOOGLE_CLIENT_SECRET: &str = "";
