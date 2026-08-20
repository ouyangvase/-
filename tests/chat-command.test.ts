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

  it("moves a verified player through banker, bet and private packet stages", async () => {
    const auth = await request("/api/auth/telegram", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ demoUser: "chat-command-player", locale: "ms" }) });
    const authBody = await auth.json() as { token: string };
    const session = { "x-session-token": authBody.token };
    expect((await (await request("/api/preferences/locale", { headers: session })).json()).locale).toBe("ms");
    const preference = await request("/api/preferences/locale", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "chat-command-locale", ...session }, body: JSON.stringify({ locale: "vi" }) });
    expect((await preference.json()).result.locale).toBe("vi");
    await request("/api/verification/submit", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "chat-command-verify", ...session }, body: JSON.stringify({ legalName: "Chat Player", tngAccountNo: "1234567890" }) });
    await request("/api/admin/verification/chat-command-player/review", { method: "POST", headers: { "content-type": "application/json", "x-demo-admin-token": "admin-demo-only" }, body: JSON.stringify({ status: "APPROVED" }) });
    const command = (text: string, key: string) => request("/api/chat/room/command", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": key, ...session }, body: JSON.stringify({ text }) });

    const bid = await command("400", "chat-command-bid");
    expect(bid.status).toBe(200);
    expect((await bid.json()).result.result.state).toBe("BETTING");
    const bet = await command("sh 10", "chat-command-bet");
    expect(bet.status).toBe(200);
    expect((await bet.json()).result.result.state).toBe("BETTING");
    const close = await command("停止下注", "chat-command-close");
    expect(close.status).toBe(200);
    expect((await close.json()).result.result.state).toBe("CLAIMING");
    const room = await request("/api/chat/room", { headers: session });
    const roomBody = await room.json() as { messages: Array<{ body: string }> };
    expect(roomBody.messages.some((message) => message.body.includes("下单 10 PT"))).toBe(true);
    expect(roomBody.messages.some((message) => message.body.includes("平台红包已向本局"))).toBe(true);
  });
});
