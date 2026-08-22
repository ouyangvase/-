type PresenceMember = { userId: string; displayName: string };

type SupabaseRealtimeOptions = {
  roomId: string;
  userId: string;
  displayName: string;
  onMessage: (message: Record<string, unknown>) => void;
  onPresence?: (members: PresenceMember[]) => void;
};

type RealtimeFrame = {
  topic?: string;
  event?: string;
  payload?: Record<string, unknown>;
  ref?: string;
};

function configuredRealtime(): { websocketUrl: string; anonKey: string } | undefined {
  const supabaseUrl = typeof import.meta.env.VITE_SUPABASE_URL === "string" ? import.meta.env.VITE_SUPABASE_URL.trim().replace(/\/$/, "") : "";
  const anonKey = typeof import.meta.env.VITE_SUPABASE_ANON_KEY === "string" ? import.meta.env.VITE_SUPABASE_ANON_KEY.trim() : "";
  if (!supabaseUrl || !anonKey) return undefined;
  const websocketUrl = `${supabaseUrl.replace(/^http/, "ws")}/realtime/v1/websocket?apikey=${encodeURIComponent(anonKey)}&vsn=1.0.0`;
  return { websocketUrl, anonKey };
}

function memberList(payload: Record<string, unknown> | undefined): PresenceMember[] {
  const state = payload?.["presence-state"];
  if (!state || typeof state !== "object") return [];
  return Object.entries(state as Record<string, unknown>).flatMap(([userId, value]) => {
    const metas = value && typeof value === "object" && Array.isArray((value as Record<string, unknown>).metas) ? (value as Record<string, unknown>).metas as Array<Record<string, unknown>> : [];
    const latest = metas.at(-1);
    return [{ userId, displayName: typeof latest?.display_name === "string" ? latest.display_name : userId }];
  });
}

export function connectSupabaseRoomRealtime(options: SupabaseRealtimeOptions): { close: () => void } | undefined {
  const config = configuredRealtime();
  if (!config || typeof WebSocket === "undefined") return undefined;
  const topic = `realtime:room-${options.roomId}`;
  const socket = new WebSocket(config.websocketUrl);
  let ref = 0;
  let joined = false;
  let heartbeat: number | undefined;
  const send = (event: string, payload: Record<string, unknown>, targetTopic = topic) => {
    if (socket.readyState !== WebSocket.OPEN) return;
    ref += 1;
    socket.send(JSON.stringify({ topic: targetTopic, event, payload, ref: String(ref), join_ref: "1" }));
  };
  socket.addEventListener("open", () => {
    send("phx_join", { config: { broadcast: { ack: false, self: false }, presence: { enabled: true }, private: false } });
    heartbeat = window.setInterval(() => send("heartbeat", {}, "phoenix"), 25_000);
  });
  socket.addEventListener("message", (event) => {
    try {
      const frame = JSON.parse(String(event.data)) as RealtimeFrame;
      if (frame.event === "phx_reply" && frame.payload?.status === "ok" && !joined) {
        joined = true;
        send("presence", { event: "track", key: options.userId, meta: [{ user_id: options.userId, display_name: options.displayName }] });
        return;
      }
      if (frame.event === "presence_state") {
        options.onPresence?.(memberList(frame.payload));
        return;
      }
      if (frame.event !== "broadcast" || frame.payload?.event !== "message") return;
      const payload = frame.payload.payload;
      const message = payload && typeof payload === "object" && "message" in payload ? (payload as Record<string, unknown>).message : payload;
      if (message && typeof message === "object" && typeof (message as Record<string, unknown>).id === "string") options.onMessage(message as Record<string, unknown>);
    } catch {
      // SSE remains the authoritative fallback when the optional Realtime channel is unavailable.
    }
  });
  const close = () => { if (heartbeat !== undefined) window.clearInterval(heartbeat); socket.close(); };
  return { close };
}
