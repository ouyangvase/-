import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { DemoState } from "@project12/contracts";
import { createTranslator, type Locale } from "@project12/i18n";
import { hapticImpact, hapticSelection } from "@project12/telegram/bridge";
import { connectSupabaseRoomRealtime, hasSupabaseRealtimeConfig } from "./supabase-realtime";

export type ChatMessage = {
  id: string;
  messageSeq?: number;
  type: string;
  body: string;
  actor?: string;
  createdAt: string;
  payload?: Record<string, unknown>;
  templateKey?: string;
  visibility?: "PUBLIC_ROOM" | "PARTICIPANTS_ONLY" | "TARGET_USER" | "ADMIN_ONLY";
  targetUserId?: string;
};

type ChatIconName = "search" | "more" | "pin" | "mute" | "smile" | "plus" | "send" | "chevron" | "down" | "image" | "camera" | "close" | "verified" | "activity" | "link";

function ChatIcon({ name }: { name: ChatIconName }) {
  const paths: Record<ChatIconName, string> = {
    search: "M10.8 4a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6z M16 16l4.5 4.5",
    more: "M5 12h.01 M12 12h.01 M19 12h.01",
    pin: "m8 4 8 8 M9 7 5 11l5 1 3 5 1-1-2-5 4-4 M8 16l-3 3",
    mute: "M5 9v6h4l5 4V5l-5 4H5z M17 9l4 6 M21 9l-4 6",
    smile: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M8 10h.01 M16 10h.01 M8.5 14a5 5 0 0 0 7 0",
    plus: "M12 5v14 M5 12h14",
    send: "M4 4l16 8-16 8 3-8-3-8z M7 12h7",
    chevron: "m9 18 6-6-6-6",
    down: "m6 9 6 6 6-6",
    image: "M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z M7 16l3.5-3.5 2.5 2.5 2-2 2 3 M8 8.5h.01",
    camera: "M5 8h3l1.5-2h5L16 8h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z M12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z",
    close: "m6 6 12 12 M18 6 6 18",
    verified: "M12 3l2 1.3 2.4-.1 1.1 2.1 2.1 1.1-.1 2.4 1.3 2-1.3 2 .1 2.4-2.1 1.1-1.1 2.1-2.4-.1-2 1.3-2-1.3-2.4.1-1.1-2.1-2.1-1.1.1-2.4-1.3-2 1.3-2-.1-2.4 2.1-1.1 1.1-2.1 2.4.1z M8.5 12l2.2 2.2 4.8-4.8",
    activity: "M4 18h16 M5 15l3-4 3 2 4-6 4 4",
    link: "M10 13a5 5 0 0 0 7.1.1l1.4-1.4a5 5 0 0 0-7.1-7.1L10 6 M14 11a5 5 0 0 0-7.1-.1l-1.4 1.4a5 5 0 0 0 7.1 7.1L14 18"
  };
  return <svg className="chat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

function timeLabel(createdAt: string, locale: Locale): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString(locale === "zh-CN" ? "zh-CN" : locale, { hour: "2-digit", minute: "2-digit" });
}

function previewText(message: ChatMessage | undefined): string {
  if (!message) return "欢迎进入十二牛牛游戏群";
  if (message.type === "PACKET_CARD") return "🎁 平台红包已发放，参与者可领取";
  if (message.type === "RESULTS") return "📊 本局成绩已公布";
  return message.body.replace(/\s+/g, " ").slice(0, 42);
}

function messageText(message: ChatMessage, formatMessage: (message: ChatMessage) => string): string {
  const translated = formatMessage(message);
  return translated || message.body;
}

function isSystemMessage(message: ChatMessage): boolean {
  return !message.actor || ["SYSTEM", "ROUND", "SETTLEMENT", "RESULTS", "PACKET"].includes(message.type);
}

function isOwnMessage(message: ChatMessage, displayName: string): boolean {
  return message.actor === "你" || message.actor === displayName;
}

function chatMessageKey(message: ChatMessage): string { return message.messageSeq != null ? `seq:${message.messageSeq}` : `id:${message.id}`; }
function mergeChatMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const merged = new Map(current.map((message) => [chatMessageKey(message), message]));
  for (const message of incoming) merged.set(chatMessageKey(message), message);
  return [...merged.values()].sort((left, right) => (left.messageSeq ?? Number.MAX_SAFE_INTEGER) - (right.messageSeq ?? Number.MAX_SAFE_INTEGER) || new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
}

function avatarLabel(actor?: string): string {
  if (!actor || actor === "12牛牛小助手") return "12";
  const compact = actor.replace(/^玩家-/, "").trim();
  return compact.slice(-2).toUpperCase() || "你";
}

function stageCopy(state: DemoState): { title: string; detail: string } {
  switch (state.round.state) {
    case "BANKER_BIDDING": return { title: "抢庄阶段", detail: "聊天室发送庄金，最高者成为本局庄家" };
    case "BETTING": return { title: "下注阶段", detail: "发送数字下注；庄家发送“停止下注”封盘" };
    case "WAITING_BANKER_CONFIRM": return { title: "等待庄家确认", detail: "庄家在聊天室发送任意文字后发放红包" };
    case "CLAIMING": return { title: "红包领取中", detail: "只有本局已下注玩家可以领取内部红包" };
    case "ROUND_COMPLETE": return { title: "本局已完成", detail: "成绩和账本记录已经公布" };
    default: return { title: "房间进行中", detail: "游戏通知和玩家消息都会显示在这里" };
  }
}

export function ChatInboxScreen({ state, move, locale }: { state: DemoState; move: (screen: "chat-room") => void; locale: Locale }) {
  const t = createTranslator(locale);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const latestPreview = "12牛牛小助手：[牛牛红包]";
  const matches = !query.trim() || "十二牛牛游戏群 平台通知 12牛牛".toLowerCase().includes(query.trim().toLowerCase());
  return <section className="screen chat-inbox-screen" data-chat-inbox>
    <header className="chat-inbox-header">
      <h1>{locale === "zh-CN" ? "我的聊天" : t("chat.title")}</h1>
      <button className="chat-icon-button" type="button" aria-label={t("chat.search")} aria-pressed={searchOpen} onClick={() => setSearchOpen((current) => !current)}><ChatIcon name="search" /></button>
    </header>
    {searchOpen && <label className="chat-search-field"><ChatIcon name="search" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={locale === "zh-CN" ? "搜索聊天" : t("chat.search")} aria-label={locale === "zh-CN" ? "搜索聊天" : t("chat.search")} /></label>}
    <section className="chat-inbox-list" aria-label={locale === "zh-CN" ? "聊天列表" : t("chat.title")}>
      {matches && <button className="chat-room-row" type="button" onClick={() => { hapticSelection(); move("chat-room"); }} aria-label="进入游戏聊天室：12牛牛">
        <span className="chat-avatar chat-avatar-room">12</span>
        <span className="chat-room-row-copy"><strong>十二牛牛游戏群 <span className="chat-verified" aria-label="已验证"><ChatIcon name="verified" /></span></strong><small>{latestPreview}</small></span>
        <span className="chat-room-row-meta"><time>05:18</time><span className="chat-unread-badge">4</span></span>
        <ChatIcon name="mute" />
      </button>}
      {!matches && <p className="chat-empty-state">{locale === "zh-CN" ? "没有找到聊天" : "No chats found"}</p>}
    </section>
  </section>;
}

function ConnectionStatus({ status }: { status: "connecting" | "connected" | "offline" }) {
  const label = status === "connected" ? "实时连接" : status === "connecting" ? "正在连接" : "连接中断，自动重试";
  return <span className={`chat-connection-status is-${status}`}><i />{label}</span>;
}

function StageBanner({ state }: { state: DemoState }) {
  const copy = stageCopy(state);
  return <div className="chat-message-row chat-message-system chat-stage-row"><span className="chat-avatar chat-avatar-bot">12</span><div className="chat-message-column"><span className="chat-message-author">12牛牛小助手 <small>系统</small></span><div className="chat-stage-banner"><strong>{copy.title}</strong><span>第 {state.round.id} 局 · {copy.detail}</span></div><time>{state.round.endsAt}</time></div></div>;
}

function SystemBubble({ message, text, locale }: { message: ChatMessage; text: string; locale: Locale }) {
  return <div className="chat-message-row chat-message-system"><span className="chat-avatar chat-avatar-bot">12</span><div className="chat-message-column"><span className="chat-message-author">12牛牛小助手 <small>系统</small></span><div className="chat-bubble chat-bubble-system"><p>{text}</p><time>{timeLabel(message.createdAt, locale)}</time></div></div></div>;
}

function ImageMessage({ message, own, locale }: { message: ChatMessage; own: boolean; locale: Locale }) {
  const attachment = message.payload?.attachment;
  const source = attachment && typeof attachment === "object" ? (attachment as Record<string, unknown>).dataUrl ?? (attachment as Record<string, unknown>).url : undefined;
  const alt = attachment && typeof attachment === "object" && typeof (attachment as Record<string, unknown>).name === "string" ? (attachment as Record<string, unknown>).name as string : "聊天图片";
  return <div className={`chat-message-row ${own ? "is-own" : ""}`}><span className="chat-avatar">{avatarLabel(message.actor)}</span><div className="chat-message-column"><span className="chat-message-author">{message.actor ?? "玩家"}</span><div className="chat-bubble chat-image-bubble">{typeof source === "string" ? <img src={source} alt={alt} /> : <span className="chat-image-fallback"><ChatIcon name="image" />{alt}</span>}<time>{timeLabel(message.createdAt, locale)}</time></div></div></div>;
}

function PacketMessage({ message, locale, claimable }: { message: ChatMessage; locale: Locale; claimable: boolean }) {
  const amount = typeof message.payload?.amount === "number" ? message.payload.amount : undefined;
  const content = <><span className="chat-packet-red"><strong>恭喜发财，大吉大利</strong><small>平台内部红包{amount ? ` · ${amount} PT` : ""}</small></span><span className="chat-packet-beige">牛牛红包 <small>{claimable ? "请在聊天框输入“抢红包”" : "本局参与者可领取"}</small></span></>;
  return <div className="chat-message-row chat-message-system"><span className="chat-avatar chat-avatar-bot">12</span><div className="chat-message-column"><span className="chat-message-author">12牛牛小助手 <small>系统</small></span><div className={`chat-packet-message${claimable ? " is-claimable" : " is-disabled"}`} aria-label="平台红包通知">{content}</div><time>{timeLabel(message.createdAt, locale)}</time></div></div>;
}

function Scoreboard({ message, text, locale }: { message: ChatMessage; text: string; locale: Locale }) {
  const rows = Array.isArray(message.payload?.results) ? message.payload?.results as Array<Record<string, unknown>> : [];
  const [showAll, setShowAll] = useState(false);
  const visibleRows = showAll ? rows : rows.slice(0, 6);
  return <div className="chat-message-row chat-message-system"><span className="chat-avatar chat-avatar-bot">12</span><div className="chat-message-column"><span className="chat-message-author">12牛牛小助手 <small>成绩</small></span><div className="chat-structured-bubble"><strong>本局成绩</strong>{visibleRows.length > 0 ? <div className="chat-scoreboard-rows">{visibleRows.map((row, index) => <div key={`${String(row.userId ?? "player")}-${index}`}><span>{index + 1}</span><strong>{String(row.userId ?? "玩家")}</strong><small>{typeof row.outcome === "string" ? row.outcome : "已结算"}</small></div>)}</div> : <p>{text}</p>}{rows.length > 6 && <button type="button" className="chat-inline-link" onClick={() => setShowAll((current) => !current)}>{showAll ? "收起成绩" : "查看全部"}</button>}<time>{timeLabel(message.createdAt, locale)}</time></div></div></div>;
}

function BankerSummary({ message, text, locale }: { message: ChatMessage; text: string; locale: Locale }) {
  const banker = typeof message.payload?.banker === "string" ? message.payload.banker : message.actor ?? "庄家";
  const amount = typeof message.payload?.amount === "number" ? message.payload.amount : undefined;
  return <div className="chat-message-row chat-message-system"><span className="chat-avatar chat-avatar-bot">12</span><div className="chat-message-column"><span className="chat-message-author">12牛牛小助手 <small>庄家通知</small></span><div className="chat-structured-bubble chat-banker-summary"><strong>庄家确认</strong><p>{banker}{amount ? ` · 庄金 ${amount} PT` : ""}</p><small>{text}</small><time>{timeLabel(message.createdAt, locale)}</time></div></div></div>;
}

function PlayerBubble({ message, own, text, locale }: { message: ChatMessage; own: boolean; text: string; locale: Locale }) {
  return <div className={`chat-message-row ${own ? "is-own" : ""}`}><span className="chat-avatar">{avatarLabel(message.actor)}</span><div className="chat-message-column"><span className="chat-message-author">{message.actor ?? "玩家"}</span><div className="chat-bubble"><p>{text}</p><time>{timeLabel(message.createdAt, locale)}</time></div></div></div>;
}

function MessageGroup({ message, state, locale, formatMessage }: { message: ChatMessage; state: DemoState; locale: Locale; formatMessage: (message: ChatMessage) => string }) {
  const text = messageText(message, formatMessage);
  if (message.type === "PACKET_CARD") {
    const claimable = message.visibility === "TARGET_USER" || message.visibility === "PARTICIPANTS_ONLY" || message.payload?.claimEligible === true;
    return <PacketMessage message={message} locale={locale} claimable={claimable} />;
  }
  if (message.type === "RESULTS") return <Scoreboard message={message} text={text} locale={locale} />;
  if (message.type === "BANKER" && message.payload?.summary === true) return <BankerSummary message={message} text={text} locale={locale} />;
  if (message.payload?.messageType === "IMAGE") return <ImageMessage message={message} own={isOwnMessage(message, state.user.displayName)} locale={locale} />;
  if (isSystemMessage(message)) return <SystemBubble message={message} text={text} locale={locale} />;
  return <PlayerBubble message={message} own={isOwnMessage(message, state.user.displayName)} text={text} locale={locale} />;
}

function Sheet({ title, children, onClose, className = "" }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
  return <div className="chat-sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`chat-sheet ${className}`} role="dialog" aria-modal="true" aria-labelledby="chat-sheet-title"><div className="chat-sheet-handle" /><header><h2 id="chat-sheet-title">{title}</h2><button type="button" aria-label="关闭" onClick={onClose}><ChatIcon name="close" /></button></header>{children}</section></div>;
}

function FloatingRoomShortcuts({ onOpen }: { onOpen: (screen?: "leaderboard" | "rewards") => void }) {
  return <div className="chat-floating-shortcuts"><button type="button" aria-label="排行榜" title="排行榜" onClick={() => onOpen("leaderboard")}><ChatIcon name="activity" /></button><button type="button" aria-label="每日奖励" title="每日奖励" onClick={() => onOpen("rewards")}><span>奖</span></button></div>;
}

function ChatComposer({ draft, setDraft, sending, connection, onSubmit, onEmoji, onPlus, error, hint }: { draft: string; setDraft: (value: string) => void; sending: boolean; connection: "connecting" | "connected" | "offline"; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onEmoji: () => void; onPlus: () => void; error: string; hint: string }) {
  return <form className="chat-composer-v2" data-game-input="chat-text-only" onSubmit={onSubmit}><div className="chat-stage-status"><ConnectionStatus status={connection} /><span>{hint}</span></div><div className="chat-composer-row"><button type="button" className="chat-composer-icon" aria-label="表情" onClick={onEmoji}><ChatIcon name="smile" /></button><div className="chat-composer-field"><input data-chat-command-input="true" name="chatMessage" type="text" inputMode="text" enterKeyHint="send" autoComplete="off" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="发送消息…" aria-label="我的聊天" /><button type="submit" aria-label="发送" disabled={sending || !draft.trim()}><ChatIcon name="send" /></button></div><button type="button" className="chat-composer-icon" aria-label="添加附件" onClick={onPlus}><ChatIcon name="plus" /></button></div>{error && <p className="chat-composer-error" role="alert">{error}</p>}</form>;
}

export function ChatRoomScreen({ state, apiUrl, sessionToken, locale, onBack, onCommand, formatMessage, onNavigate }: { state: DemoState; apiUrl: string; sessionToken: string; locale: Locale; onBack: () => void; onCommand: (command: string, result: unknown) => void; formatMessage: (message: ChatMessage) => string; onNavigate?: (screen: "leaderboard" | "rewards") => void }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const firstLoadRef = useRef(true);
  const followRef = useRef(true);
  const loadingOlderRef = useRef(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const latestMessageSeqRef = useRef<number | undefined>(undefined);
  const [nextCursor, setNextCursor] = useState<string>();
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState<"connecting" | "connected" | "offline">("connecting");
  const [atBottom, setAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [preview, setPreview] = useState<{ name: string; mime: string; size: number; dataUrl: string }>();
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const headers: Record<string, string> = sessionToken ? { "x-session-token": sessionToken } : {};
  const hint = state.round.state === "BANKER_BIDDING" ? "抢庄阶段 · 发送数字或“抢庄 600”" : state.round.state === "BETTING" ? "下注阶段 · 发送数字或 sh 金额" : state.round.state === "WAITING_BANKER_CONFIRM" ? "等待庄家 · 当前庄家发送任意文字确认" : state.round.state === "CLAIMING" ? "红包阶段 · 参与者发送“抢红包”" : "普通聊天和游戏消息都在这里发送";
  const pinnedMessages = messages.filter((message) => message.payload?.pinned === true).slice(-4).reverse();
  const virtualOffset = hasOlderMessages ? 2 : 1;
  const rowVirtualizer = useVirtualizer({
    count: messages.length + virtualOffset,
    getScrollElement: () => viewportRef.current,
    estimateSize: (index) => index === 0 && hasOlderMessages ? 52 : index < virtualOffset ? 100 : 92,
    getItemKey: (index) => index === 0 && hasOlderMessages ? "older-messages" : index === (hasOlderMessages ? 1 : 0) ? "stage-banner" : messages[index - virtualOffset]?.id ?? index,
    overscan: 8
  });

  const scrollToLatest = (behavior: ScrollBehavior = "auto") => { const viewport = viewportRef.current; if (!viewport) return; viewport.scrollTo({ top: viewport.scrollHeight, behavior }); followRef.current = true; setAtBottom(true); setUnreadCount(0); };
  const markRead = () => { const latest = messages[messages.length - 1]; if (!latest) return; void fetch(`${apiUrl}/api/chat/rooms/room-12/read`, { method: "POST", credentials: "include", headers: { "content-type": "application/json", "idempotency-key": `chat-read-${latest.messageSeq ?? latest.id}`, ...headers }, body: JSON.stringify({ lastMessageId: latest.id, lastMessageSeq: latest.messageSeq }) }).catch(() => undefined); };

  useEffect(() => {
    let disposed = false;
    setConnection("connecting");
    void fetch(`${apiUrl}/api/chat/rooms/room-12/messages`, { credentials: "include", headers, cache: "no-store" }).then((response) => response.ok ? response.json() as Promise<{ messages?: ChatMessage[]; hasMore?: boolean; nextCursor?: string; latestCursor?: string }> : undefined).then((payload) => { if (disposed || !payload) return; const loaded = payload.messages ?? []; setMessages((current) => mergeChatMessages(current, loaded)); setNextCursor(payload.nextCursor); latestMessageSeqRef.current = loaded[loaded.length - 1]?.messageSeq; setHasOlderMessages(Boolean(payload.hasMore)); window.requestAnimationFrame(() => scrollToLatest()); }).catch(() => undefined);
    return () => { disposed = true; };
  }, [apiUrl, sessionToken]);

  useEffect(() => {
    let disposed = false;
    let realtime: { close: () => void } | undefined;
    const controller = new AbortController();
    const connect = async () => {
      if (!hasSupabaseRealtimeConfig()) return;
      const response = await fetch(`${apiUrl}/api/realtime/token`, { credentials: "include", headers, signal: controller.signal });
      if (!response.ok) return;
      const payload = await response.json() as { token?: string };
      if (disposed || !payload.token) return;
      realtime = connectSupabaseRoomRealtime({
        roomId: "room-12",
        userId: state.user.id,
        displayName: state.user.displayName,
        accessToken: payload.token,
        refreshAccessToken: async () => {
          const refreshResponse = await fetch(`${apiUrl}/api/realtime/token`, { credentials: "include", headers, signal: controller.signal });
          if (!refreshResponse.ok) return undefined;
          const refreshPayload = await refreshResponse.json() as { token?: string };
          return refreshPayload.token;
        },
        onMessage: (message) => {
          const next = message as unknown as ChatMessage;
          setMessages((current) => mergeChatMessages(current, [next]));
          if (next.messageSeq != null) latestMessageSeqRef.current = Math.max(latestMessageSeqRef.current ?? 0, next.messageSeq);
        }
      });
    };
    void connect().catch(() => undefined);
    return () => { disposed = true; controller.abort(); realtime?.close(); };
  }, [apiUrl, sessionToken, state.user.id, state.user.displayName]);

  useEffect(() => {
    let stopped = false;
    let retryTimer: number | undefined;
    let controller: AbortController | undefined;
    const handleEvent = (rawEvent: string) => {
      const lines = rawEvent.split("\n");
      const eventName = lines.find((line) => line.startsWith("event:"))?.slice(6).trim() ?? "message";
      const data = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
      if (!data) return;
      try {
        const payload = JSON.parse(data) as ChatMessage;
        if (eventName === "snapshot") { onCommand("SNAPSHOT", payload); return; }
        if (eventName !== "message") return;
        setMessages((current) => mergeChatMessages(current, [payload]));
        if (payload.messageSeq != null) latestMessageSeqRef.current = Math.max(latestMessageSeqRef.current ?? 0, payload.messageSeq);
        if (followRef.current) window.requestAnimationFrame(() => scrollToLatest()); else setUnreadCount((current) => current + 1);
      } catch { /* keep the existing message stream */ }
    };
    const connect = async () => {
      if (stopped) return;
      setConnection("connecting");
      controller = new AbortController();
      try {
        const response = await fetch(`${apiUrl}/api/chat/rooms/room-12/realtime`, { credentials: "include", headers, signal: controller.signal });
        if (!response.ok || !response.body) throw new Error("聊天室实时连接失败");
        setConnection("connected");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!stopped) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          let boundary = buffer.indexOf("\n\n");
          while (boundary >= 0) {
            handleEvent(buffer.slice(0, boundary));
            buffer = buffer.slice(boundary + 2);
            boundary = buffer.indexOf("\n\n");
          }
        }
        if (!stopped) throw new Error("聊天室实时连接已关闭");
      } catch {
        if (stopped) return;
        setConnection("offline");
        if (retryTimer === undefined) retryTimer = window.setTimeout(() => { retryTimer = undefined; void connect(); }, 1500);
      }
    };
    void connect();
    return () => { stopped = true; if (retryTimer !== undefined) window.clearTimeout(retryTimer); controller?.abort(); };
  }, [apiUrl, sessionToken]);

  useEffect(() => {
    if (connection === "connected") return;
    let disposed = false;
    const poll = async () => {
      const cursor = latestMessageSeqRef.current;
      const query = cursor ? `?after=${encodeURIComponent(String(cursor))}` : "";
      try {
        const response = await fetch(`${apiUrl}/api/chat/rooms/room-12/messages${query}`, { credentials: "include", headers, cache: "no-store" });
        if (!response.ok || disposed) return;
        const payload = await response.json() as { messages?: ChatMessage[]; hasMore?: boolean; latestCursor?: string };
        const incoming = payload.messages ?? [];
        if (incoming.length > 0) {
          setMessages((current) => mergeChatMessages(current, incoming));
          latestMessageSeqRef.current = incoming[incoming.length - 1]?.messageSeq ?? latestMessageSeqRef.current;
          if (followRef.current) window.requestAnimationFrame(() => scrollToLatest()); else setUnreadCount((current) => current + incoming.length);
        }
      } catch { /* retry on the next poll */ }
    };
    void poll();
    const timer = window.setInterval(() => { void poll(); }, 3000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [apiUrl, sessionToken, connection]);

  useEffect(() => { if (!firstLoadRef.current || messages.length === 0) return; firstLoadRef.current = false; window.requestAnimationFrame(() => { scrollToLatest(); markRead(); }); }, [messages.length]);

  const handleScroll = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    const atBottom = distance < 200;
    followRef.current = atBottom;
    setAtBottom(atBottom);
    if (atBottom) { setUnreadCount(0); markRead(); }
    if (viewport.scrollTop < 80 && hasOlderMessages && !loadingOlderRef.current) void loadOlderMessages();
  };

  const loadOlderMessages = async () => {
    const viewport = viewportRef.current;
    const oldest = messages[0];
    if (!viewport || !oldest || loadingOlderRef.current || !hasOlderMessages) return;
    loadingOlderRef.current = true; setLoadingOlderMessages(true);
    const oldHeight = viewport.scrollHeight; const oldTop = viewport.scrollTop;
    try {
      const cursor = nextCursor ?? (oldest.messageSeq != null ? String(oldest.messageSeq) : oldest.createdAt);
      const response = await fetch(`${apiUrl}/api/chat/rooms/room-12/messages?before=${encodeURIComponent(cursor)}`, { credentials: "include", headers });
      if (!response.ok) throw new Error("历史消息加载失败");
      const payload = await response.json() as { messages?: ChatMessage[]; hasMore?: boolean; nextCursor?: string };
      const older = payload.messages ?? [];
      setMessages((current) => mergeChatMessages(current, older));
      setNextCursor(payload.nextCursor);
      setHasOlderMessages(Boolean(payload.hasMore));
      window.requestAnimationFrame(() => { const currentViewport = viewportRef.current; if (currentViewport) currentViewport.scrollTop = oldTop + currentViewport.scrollHeight - oldHeight; });
    } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "历史消息加载失败"); } finally { loadingOlderRef.current = false; setLoadingOlderMessages(false); }
  };

  const sendMessage = async (text: string, attachment?: { name: string; mime: string; size: number; dataUrl: string }) => {
    const value = text.trim();
    if ((!value && !attachment) || sending) return;
    setSending(true); setError("");
    try {
      const response = await fetch(`${apiUrl}/api/chat/rooms/room-12/messages`, { method: "POST", credentials: "include", headers: { "content-type": "application/json", "idempotency-key": `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`, ...headers }, body: JSON.stringify({ text: value || `📷 ${attachment?.name ?? "图片"}`, ...(attachment ? { attachment } : {}) }) });
      const payload = await response.json() as { result?: { command?: string; result?: unknown }; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "消息发送失败");
      const historyResponse = await fetch(`${apiUrl}/api/chat/rooms/room-12/messages`, { credentials: "include", headers, cache: "no-store" });
      if (historyResponse.ok) {
        const history = await historyResponse.json() as { messages?: ChatMessage[]; hasMore?: boolean; nextCursor?: string; latestCursor?: string };
        setMessages((current) => mergeChatMessages(current, history.messages ?? []));
        latestMessageSeqRef.current = history.latestCursor ? Number(history.latestCursor) : latestMessageSeqRef.current;
        setNextCursor(history.nextCursor);
        setHasOlderMessages(Boolean(history.hasMore));
      }
      setDraft(""); setPreview(undefined); onCommand(payload.result?.command ?? "MESSAGE", payload.result?.result); hapticImpact(); followRef.current = true; setAtBottom(true); window.requestAnimationFrame(() => scrollToLatest("smooth"));
    } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "消息发送失败"); } finally { setSending(false); }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void sendMessage(draft); };
  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (!/^(image\/jpeg|image\/png|image\/webp)$/.test(file.type)) { setError("只支持 JPG、PNG 或 WebP 图片"); return; }
    if (file.size > 10 * 1024 * 1024) { setError("图片不能超过 10MB"); return; }
    const reader = new FileReader(); reader.onload = () => { if (typeof reader.result === "string") { setPreview({ name: file.name, mime: file.type, size: file.size, dataUrl: reader.result }); setAttachmentOpen(false); } }; reader.readAsDataURL(file);
  };

  return <section className="chat-room-screen" data-chat-mode="text-only">
    <header className="chat-room-header-v2"><button type="button" className="chat-room-back chat-room-header-side" aria-label="返回聊天列表" onClick={onBack}><ChatIcon name="chevron" /></button><div><h1>十二牛牛游戏群 <span className="chat-room-count">2</span> <span className="chat-verified" aria-label="已验证"><ChatIcon name="verified" /></span></h1></div><button type="button" className="chat-room-more" aria-label="更多" onClick={() => setActivityOpen(true)}><ChatIcon name="more" /></button></header>
    <button className="chat-pinned-bar" type="button" onClick={() => setPinnedOpen(true)}><ChatIcon name="pin" /><span><strong>置顶消息（4）</strong><small>{previewText(pinnedMessages[0])}</small></span><ChatIcon name="chevron" /></button>
    <div className="chat-message-viewport" ref={viewportRef} onScroll={handleScroll}>
      <div className="chat-message-list-v2" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const isOlderButton = hasOlderMessages && virtualRow.index === 0;
          const isStage = virtualRow.index === (hasOlderMessages ? 1 : 0);
          const message = !isOlderButton && !isStage ? messages[virtualRow.index - virtualOffset] : undefined;
          return <div key={virtualRow.key} ref={rowVirtualizer.measureElement} data-index={virtualRow.index} className="chat-virtual-row" style={{ transform: `translateY(${virtualRow.start}px)` }}>
            {isOlderButton && <button className="chat-load-older" type="button" disabled={loadingOlderMessages} onClick={() => void loadOlderMessages()}>{loadingOlderMessages ? "正在加载…" : "查看更早消息"}</button>}
            {isStage && <StageBanner state={state} />}
            {message && <MessageGroup message={message} state={state} locale={locale} formatMessage={formatMessage} />}
          </div>;
        })}
      </div>
    </div>
    {!atBottom && <button className="chat-scroll-latest" type="button" aria-label="回到最新消息" onClick={() => { scrollToLatest("smooth"); markRead(); }}><ChatIcon name="down" />{unreadCount > 0 && <span>{unreadCount > 99 ? "99+" : unreadCount}</span>}</button>}
    <FloatingRoomShortcuts onOpen={(screen) => { if (screen && onNavigate) onNavigate(screen); else setActivityOpen(true); }} />
    <ChatComposer draft={draft} setDraft={setDraft} sending={sending} connection={connection} onSubmit={onSubmit} onEmoji={() => setEmojiOpen(true)} onPlus={() => setAttachmentOpen(true)} error={error} hint={hint} />
    <input ref={fileRef} className="chat-hidden-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { onFile(event.target.files?.[0]); event.target.value = ""; }} />
    {emojiOpen && <Sheet title="选择表情" onClose={() => setEmojiOpen(false)} className="chat-emoji-sheet"><div className="chat-emoji-grid">{["😀", "😂", "😍", "😎", "👍", "👏", "🎉", "🔥", "💰", "🐮", "🤝", "🙏", "❤️", "✨", "😅", "🙌"].map((emoji) => <button type="button" key={emoji} onClick={() => { setDraft(`${draft}${emoji}`); setEmojiOpen(false); }}>{emoji}</button>)}</div></Sheet>}
    {attachmentOpen && <Sheet title="添加到聊天" onClose={() => setAttachmentOpen(false)} className="chat-attachment-sheet"><button type="button" onClick={() => fileRef.current?.click()}><ChatIcon name="image" /><span>照片</span><small>从相册选择</small></button><button type="button" onClick={() => fileRef.current?.click()}><ChatIcon name="camera" /><span>相机</span><small>拍摄照片</small></button><button type="button" className="chat-sheet-cancel" onClick={() => setAttachmentOpen(false)}>取消</button></Sheet>}
    {preview && <Sheet title="发送图片" onClose={() => setPreview(undefined)} className="chat-image-preview-sheet"><img src={preview.dataUrl} alt={preview.name} /><p>{preview.name} · {(preview.size / 1024).toFixed(0)} KB</p><div><button type="button" className="chat-secondary-action" onClick={() => setPreview(undefined)}>取消</button><button type="button" className="chat-primary-action" disabled={sending} onClick={() => void sendMessage("", preview)}>{sending ? "发送中…" : "发送"}</button></div></Sheet>}
    {pinnedOpen && <Sheet title="置顶消息（4）" onClose={() => setPinnedOpen(false)} className="chat-pinned-sheet"><div className="chat-pinned-list">{pinnedMessages.length > 0 ? pinnedMessages.map((message) => <button type="button" key={message.id} onClick={() => setPinnedOpen(false)}><span>{messageText(message, formatMessage)}</span><time>{timeLabel(message.createdAt, locale)}</time></button>) : <p>暂无置顶消息</p>}</div></Sheet>}
    {activityOpen && <Sheet title="房间功能" onClose={() => setActivityOpen(false)} className="chat-activity-sheet"><button type="button" onClick={() => { setActivityOpen(false); onNavigate?.("leaderboard"); }}><ChatIcon name="activity" /><span>排行榜</span><small>查看本局及累计排名</small></button><button type="button" onClick={() => { setActivityOpen(false); onNavigate?.("rewards"); }}><span className="chat-reward-mark">奖</span><span>每日奖励</span><small>查看完成进度</small></button></Sheet>}
  </section>;
}
