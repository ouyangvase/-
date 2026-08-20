import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiHandler } from "../apps/api/src/server";

let server: Server;
let baseUrl = "";

function request(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, init);
}

describe("API round flow", () => {
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

  it("persists the user-visible round sequence through the API boundary", async () => {
    const auth = await request("/api/auth/telegram", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ demoUser: "api-flow-user" })
    });
    expect(auth.status).toBe(200);
    const authBody = await auth.json() as { token?: string };
    expect(authBody.token).toBeTruthy();
    const session = { "x-session-token": authBody.token! };
    const verification = await request("/api/verification/status", { headers: session });
    expect((await verification.json()).status).toBe("UNVERIFIED");
    const submit = await request("/api/verification/submit", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "api-flow-verification", ...session },
      body: JSON.stringify({ legalName: "Demo Player", tngAccountNo: "1234567890" })
    });
    expect(submit.status).toBe(200);
    const submitBody = await submit.json() as { result?: { status?: string; tngAccountLast4?: string } };
    expect(submitBody.result?.status).toBe("PENDING");
    expect(submitBody.result?.tngAccountLast4).toBe("••••7890");
    expect(JSON.stringify(submitBody)).not.toContain("Demo Player");
    expect(JSON.stringify(submitBody)).not.toContain("1234567890");
    const lockedWallet = await request("/api/wallet", { headers: session });
    expect(lockedWallet.status).toBe(403);
    const lockedChat = await request("/api/chat/room", { headers: session });
    expect(lockedChat.status).toBe(403);
    const approve = await request("/api/admin/verification/api-flow-user/review", {
      method: "POST",
      headers: { "content-type": "application/json", "x-demo-admin-token": "admin-demo-only" },
      body: JSON.stringify({ status: "APPROVED" })
    });
    expect(approve.status).toBe(200);
    expect((await request("/api/verification/status", { headers: session })).status).toBe(200);
    const approvalOutbox = await request("/api/admin/outbox", { headers: { "x-demo-admin-token": "admin-demo-only" } });
    expect((await approvalOutbox.json()).some((event: { type: string; payload: { telegramUserId?: string } }) => event.type === "IDENTITY_VERIFICATION_APPROVED" && event.payload.telegramUserId === "api-flow-user")).toBe(true);
    const rooms = await request("/api/rooms", { headers: session });
    expect(rooms.status).toBe(200);
    expect((await rooms.json())[0].roundId).toBe("R-0247");
    const write = (path: string, key: string, body: Record<string, unknown> = {}) => request(path, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": key, ...session },
      body: JSON.stringify(body)
    });

    const bid = await write("/api/rounds/R-0247/bid", "api-flow-bid", { amount: 400 });
    expect(bid.status).toBe(200);
    expect((await bid.json()).result.state).toBe("BETTING");
    const replay = await write("/api/rounds/R-0247/bid", "api-flow-bid", { amount: 400 });
    expect((await replay.json()).replayed).toBe(true);

    const bet = await write("/api/rounds/R-0247/bet", "api-flow-bet", { amount: 250 });
    expect(bet.status).toBe(200);
    expect((await bet.json()).result.state).toBe("BETTING");
    const wallet = await request("/api/wallet", { headers: session });
    expect((await wallet.json()).locked).toBe(250);
    const chat = await request("/api/chat/room", { headers: session });
    expect(chat.status).toBe(200);
    expect((await chat.json()).messages.some((message: { body: string }) => message.body.includes("下单 250 PT"))).toBe(true);
    const close = await write("/api/rounds/R-0247/close-betting", "api-flow-close-betting");
    expect(close.status).toBe(200);
    expect((await close.json()).result.state).toBe("CLAIMING");
    const claim = await write("/api/rounds/R-0247/packet-claim", "api-flow-claim");
    expect(claim.status).toBe(200);
    expect((await claim.json()).result.hand.type).toBe("反顺");
    const spectatorAuth = await request("/api/auth/telegram", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ demoUser: "api-flow-spectator" }) });
    const spectatorBody = await spectatorAuth.json() as { token?: string };
    const spectatorClaim = await request("/api/rounds/R-0247/packet-claim", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "api-flow-spectator-claim", "x-session-token": spectatorBody.token! }, body: "{}" });
    expect(spectatorClaim.status).not.toBe(200);
    expect((await spectatorClaim.json()).error).toContain("只有本局已下注玩家");
    const settle = await write("/api/rounds/R-0247/settle", "api-flow-settle");
    expect(settle.status).toBe(200);
    expect((await settle.json()).result.state).toBe("ROUND_COMPLETE");
  });
});
