import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiHandler } from "../apps/api/src/server";

let server: Server;
let baseUrl = "";

function request(path: string, init: RequestInit = {}): Promise<Response> { return fetch(`${baseUrl}${path}`, init); }

describe("internal chat game commands", () => {
  beforeAll(async () => {
    server = createServer(apiHandler);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("API test server did not bind");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("moves banker and bettor through confirmation and private packet stages", async () => {
    const authenticate = async (demoUser: string, locale?: string) => {
      const auth = await request("/api/auth/telegram", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ demoUser, locale }) });
      const authBody = await auth.json() as { token: string };
      return { "x-session-token": authBody.token };
    };
    const approve = async (demoUser: string, session: Record<string, string>, key: string) => {
      await request("/api/verification/submit", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": `${key}-verify`, ...session }, body: JSON.stringify({ legalName: `${demoUser} Legal`, tngAccountNo: "1234567890" }) });
      await request(`/api/admin/verification/${demoUser}/review`, { method: "POST", headers: { "content-type": "application/json", "x-demo-admin-token": "admin-demo-only", "idempotency-key": `${key}-review` }, body: JSON.stringify({ status: "APPROVED" }) });
    };
    const bankerSession = await authenticate("chat-command-banker", "en");
    await approve("chat-command-banker", bankerSession, "chat-command-banker");
    const bettorSession = await authenticate("chat-command-bettor", "ms");
    expect((await (await request("/api/preferences/locale", { headers: bettorSession })).json()).locale).toBe("ms");
    const preference = await request("/api/preferences/locale", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "chat-command-locale", ...bettorSession }, body: JSON.stringify({ locale: "vi" }) });
    expect((await preference.json()).result.locale).toBe("vi");
    await approve("chat-command-bettor", bettorSession, "chat-command-bettor");
    const spectatorSession = await authenticate("chat-command-spectator", "en");
    await approve("chat-command-spectator", spectatorSession, "chat-command-spectator");
    const command = (session: Record<string, string>, text: string, key: string) => request("/api/chat/rooms/room-12/messages", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": key, ...session }, body: JSON.stringify({ text }) });

    const chatMessage = await command(spectatorSession, "大家好，等这一局开始。", "chat-command-message");
    expect(chatMessage.status).toBe(200);
    expect((await chatMessage.json()).result.command).toBe("MESSAGE");

    const shoveDuringBidding = await command(bankerSession, "sh10", "chat-command-shove-during-bidding");
    expect(shoveDuringBidding.status).toBe(400);

    const bid = await command(bankerSession, "抢庄 600", "chat-command-bid");
    expect(bid.status).toBe(200);
    expect((await bid.json()).result.result.state).toBe("BANKER_BIDDING");
    const higherBid = await command(bettorSession, "抢庄 700", "chat-command-higher-bid");
    expect(higherBid.status).toBe(200);
    expect((await higherBid.json()).result.result.banker).toBe("chat-command-bettor");
    const blockedCloseBidding = await command(bankerSession, "结束抢庄", "chat-command-non-highest-close");
    expect(blockedCloseBidding.status).toBe(400);
    expect((await blockedCloseBidding.json()).error).toContain("当前最高庄金");
    const closeBidding = await command(bettorSession, "抢庄结束", "chat-command-close-bidding");
    expect(closeBidding.status).toBe(200);
    expect((await closeBidding.json()).result.result.state).toBe("BETTING");
    const bet = await command(bankerSession, "下注 5", "chat-command-bet");
    expect(bet.status).toBe(200);
    expect((await bet.json()).result.result.state).toBe("BETTING");
    const invalidBet = await command(bettorSession, "18", "chat-command-invalid-bet");
    expect(invalidBet.status).toBe(400);
    expect((await invalidBet.json()).error).toContain("2–17");
    const close = await command(bettorSession, "封盘", "chat-command-close");
    expect(close.status).toBe(200);
    expect((await close.json()).result.result.state).toBe("WAITING_BANKER_CONFIRM");
    const blockedConfirm = await command(bankerSession, "确认发红包", "chat-command-bettor-confirm");
    expect(blockedConfirm.status).toBe(400);
    expect((await blockedConfirm.json()).error).toContain("庄家");
    const confirm = await command(bettorSession, "确认发包", "chat-command-confirm");
    expect(confirm.status).toBe(200);
    expect((await confirm.json()).result.result.state).toBe("CLAIMING");
    const room = await request("/api/chat/room", { headers: bankerSession });
    const roomBody = await room.json() as { messages: Array<{ body: string }> };
    expect(roomBody.messages.some((message) => message.body === "下注 5")).toBe(true);
    expect(roomBody.messages.some((message) => message.body === "大家好，等这一局开始。" && message.type === "USER")).toBe(true);
    expect(roomBody.messages.some((message) => message.body === "18")).toBe(false);
    expect(roomBody.messages.some((message) => message.body.includes("平台内部红包已发放给本局参与者"))).toBe(true);
    const bankerRoom = await request("/api/chat/room", { headers: bettorSession });
    const bankerRoomBody = await bankerRoom.json() as { messages: Array<{ body: string }> };
    expect(bankerRoomBody.messages.some((message) => message.body.includes("平台内部红包已发放给本局参与者"))).toBe(false);
    const spectatorRoom = await request("/api/chat/room", { headers: spectatorSession });
    const spectatorRoomBody = await spectatorRoom.json() as { messages: Array<{ body: string }> };
    expect(spectatorRoomBody.messages.some((message) => message.body.includes("平台内部红包已发放给本局参与者"))).toBe(false);
    const claim = await command(bankerSession, "抢红包", "chat-command-claim");
    expect(claim.status).toBe(200);
    expect((await claim.json()).result.command).toBe("CLAIM_PACKET");
  });
});
