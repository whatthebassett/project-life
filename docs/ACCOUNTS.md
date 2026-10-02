# Setting up Connected accounts

Project Life signs in to Microsoft and Google with its own app registrations. Each takes about ten minutes to make, once, and both are free. When you have the IDs, they go in `src-tauri/src/oauth_ids.rs` (or send them over and they'll be built in). Until then, Settings → Connected accounts shows **Needs setup**.

None of this is secret the way a password is. Every desktop app ships its client ID, and Google says a desktop app's "client secret" can't be kept secret and isn't treated as one. Your sign-ins themselves live in Windows Credential Manager on your PC, or in the Keychain on a Mac.

## Microsoft (Outlook calendar and Teams)

1. Go to <https://entra.microsoft.com> and sign in with any Microsoft account.
2. **Applications → App registrations → New registration.**
   - **Name:** Project Life
   - **Supported account types:** *Accounts in any organizational directory and personal Microsoft accounts*. Pick this one so both work/school and Outlook.com accounts can connect.
   - **Redirect URI:** platform **Public client/native (mobile & desktop)**, address `http://localhost`. Leave the port off: Microsoft allows any port on localhost, and Project Life picks a free one each time.
3. Click **Register**. On the app's **Overview** page, copy the **Application (client) ID**. That's `MICROSOFT_CLIENT_ID`.
4. **API permissions → Add a permission → Microsoft Graph → Delegated permissions.** Add:
   - `Calendars.ReadWrite`
   - `OnlineMeetings.ReadWrite` (Teams links for events on Project Life's own calendars; work and school accounts only)
   - `offline_access`, `openid`, `profile`, `email`, `User.Read` (usually there already)
5. **Authentication:** under *Advanced settings*, set **Allow public client flows** to **Yes**, then **Save**.

You don't need a client secret or a certificate.

**Work and school accounts:** some organizations only let people approve apps from verified publishers. If signing in says an admin has to approve Project Life, ask your IT admin to allow it, or make the registration inside that organization's own directory.

**Personal accounts (Outlook.com, Hotmail):** calendars sync both ways. Microsoft doesn't let personal accounts make Teams meetings through its API, so paste the Teams link into the event and its Join button works.

## Google (Google Calendar and Meet)

1. Go to <https://console.cloud.google.com> and create a project called **Project Life**.
2. **APIs & Services → Library.** Turn on:
   - **Google Calendar API**
   - **Google Meet REST API** (Meet links for events on Project Life's own calendars)
3. **Google Auth Platform** (it was called *OAuth consent screen*):
   - **Branding:** app name *Project Life*, and your email as the support and developer contact.
   - **Audience:** *External*.
   - **Data access → Add or remove scopes:** add `.../auth/calendar`, `.../auth/meetings.space.created`, `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile`.
4. **Audience → Publish app**, so it's *In production*. This matters: while an app is in *Testing*, Google ends its sign-ins after 7 days and you'd have to reconnect every week. The app doesn't need Google's verification for your own use (up to 100 people). Signing in shows a *"Google hasn't verified this app"* screen; choose **Advanced → Go to Project Life**.
5. **Clients → Create client → Application type: Desktop app**, name *Project Life*. Copy the **Client ID** and **Client secret**. Those are `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

There's no redirect address to enter: desktop clients may use any port on `127.0.0.1`.

## Zoom

Zoom stays *links only*. Paste a `zoom.us/j/…` link into an event's place, description or call link, and the Join button opens it. Zoom's API needs a client secret that an app on your PC couldn't keep private.

## What Project Life does with the access

- **Calendars:** reads your calendars from a month back to six months ahead, every 5 or 15 minutes, or only when it opens (Settings → Connected accounts → Sync calendars). You pick which calendars sync. Shared and holiday calendars start off.
- **Changes both ways:** editing, moving or deleting a synced event changes it in Outlook or Google Calendar. For a repeating event, a change here applies to that one day; change the whole series in Outlook or Google Calendar. Events someone else organized can't be changed here, but you can link a note or task to them.
- **Meeting links:** choosing Teams or Meet on an event makes the link when you save. On an Outlook or Google calendar, it's part of the event there. On Project Life's own calendars, it's a meeting on its own.
- **Disconnect** removes the sign-in from Credential Manager or the Keychain (and tells Google to forget it). It also removes that account's events from Project Life. Nothing changes in Outlook or Google Calendar.
