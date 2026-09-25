// "Stay quiet while I'm live" (Settings → Notifications): is a streaming app
// broadcasting right now?
// - OBS Studio 28+: asked over its WebSocket (Tools → WebSocket Server
//   Settings), with the password kept in Windows' Credential Manager.
// - Meld Studio: asked over its WebChannel API on port 13376 (no setup).
// - If neither can be asked but OBS, Streamlabs or Meld is running, that
//   counts as live, to be safe.
import { system } from "./api";
import { currentSettings } from "./settings";

export type SourceState = "live" | "idle" | "running" | "password" | "off";

export interface LiveStatus {
  live: boolean;
  obs: SourceState;
  meld: SourceState;
  others: string[];
}

export const OBS_SECRET = "obs-websocket";
const STREAMING_APPS = ["obs64.exe", "obs32.exe", "obs.exe", "streamlabs obs.exe", "streamlabs desktop.exe", "meld studio.exe", "meldstudio.exe", "meld.exe"];

async function sha256base64(text: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

// OBS WebSocket v5: Hello → Identify (with the password when it asks) →
// GetStreamStatus.
function askObs(port: number, password: string | null): Promise<SourceState> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (s: SourceState) => {
      if (done) return;
      done = true;
      try {
        ws.close();
      } catch {
        // Already closed.
      }
      resolve(s);
    };
    let ws: WebSocket;
    try {
      ws = new WebSocket(`ws://127.0.0.1:${port}`, "obswebsocket.json");
    } catch {
      return resolve("off");
    }
    const timer = window.setTimeout(() => finish("off"), 2500);
    ws.onerror = () => finish("off");
    ws.onclose = (e) => {
      window.clearTimeout(timer);
      // 4009: authentication failed.
      finish(e.code === 4009 ? "password" : "off");
    };
    ws.onmessage = async (msg) => {
      const m = JSON.parse(String(msg.data)) as { op: number; d: Record<string, unknown> };
      if (m.op === 0) {
        const auth = m.d.authentication as { challenge: string; salt: string } | undefined;
        if (auth && !password) return finish("password");
        const d: Record<string, unknown> = { rpcVersion: 1, eventSubscriptions: 0 };
        if (auth && password) d.authentication = await sha256base64((await sha256base64(password + auth.salt)) + auth.challenge);
        ws.send(JSON.stringify({ op: 1, d }));
      } else if (m.op === 2) {
        ws.send(JSON.stringify({ op: 6, d: { requestType: "GetStreamStatus", requestId: "pl" } }));
      } else if (m.op === 7) {
        window.clearTimeout(timer);
        const data = (m.d.responseData ?? {}) as { outputActive?: boolean };
        finish(data.outputActive ? "live" : "idle");
      }
    };
  });
}

// Meld Studio's WebChannel (Qt): an Init message lists its objects, and the
// "meld" object's isStreaming property is in there.
function askMeld(): Promise<SourceState> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (s: SourceState) => {
      if (done) return;
      done = true;
      try {
        ws.close();
      } catch {
        // Already closed.
      }
      resolve(s);
    };
    let ws: WebSocket;
    try {
      ws = new WebSocket("ws://127.0.0.1:13376");
    } catch {
      return resolve("off");
    }
    const timer = window.setTimeout(() => finish("off"), 2500);
    ws.onerror = () => finish("off");
    ws.onclose = () => finish("off");
    ws.onopen = () => ws.send(JSON.stringify({ type: 3, id: 0 }));
    ws.onmessage = (msg) => {
      const m = JSON.parse(String(msg.data)) as { type: number; id?: number; data?: Record<string, { properties?: unknown[][] }> };
      if (m.type !== 10 || m.id !== 0) return;
      window.clearTimeout(timer);
      const props = m.data?.meld?.properties ?? [];
      const streaming = props.find((p) => p[1] === "isStreaming");
      finish(streaming ? (streaming[3] ? "live" : "idle") : "off");
    };
  });
}

let cached: { at: number; status: LiveStatus } | null = null;

export async function liveStatus(fresh = false): Promise<LiveStatus> {
  if (!fresh && cached && Date.now() - cached.at < 20_000) return cached.status;
  const port = currentSettings().ObsPort ?? 4455;
  const password = await system.secretGet(OBS_SECRET).catch(() => null);
  const [obsApi, meldApi, running] = await Promise.all([askObs(port, password), askMeld(), system.runningApps(STREAMING_APPS).catch(() => [] as string[])]);
  const obsRunning = running.some((r) => r.startsWith("obs"));
  const meldRunning = running.some((r) => r.includes("meld"));
  const obs: SourceState = obsApi === "live" || obsApi === "idle" ? obsApi : obsApi === "password" ? "password" : obsRunning ? "running" : "off";
  const meld: SourceState = meldApi === "live" || meldApi === "idle" ? meldApi : meldRunning ? "running" : "off";
  const others = running.filter((r) => r.startsWith("streamlabs"));
  // Can't ask it, but it's open: treat it as live rather than risk a ping on stream.
  const live = obs === "live" || meld === "live" || obs === "running" || obs === "password" || meld === "running" || others.length > 0;
  const status = { live, obs, meld, others };
  cached = { at: Date.now(), status };
  return status;
}

export const stateText: Record<SourceState, string> = {
  live: "live now",
  idle: "connected, not live",
  running: "open, but it can't be asked, so it counts as live",
  password: "asks for a password",
  off: "not running",
};
