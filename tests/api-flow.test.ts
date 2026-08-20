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
    expect((await bet.json()).result.state).toBe("CLAIMING");
    const wallet = await request("/api/wallet", { headers: session });
    expect((await wallet.json()).locked).toBe(250);
    const claim = await write("/api/rounds/R-0247/packet-claim", "api-flow-claim");
    expect(claim.status).toBe(200);
    expect((await claim.json()).result.hand.type).toBe("反顺");
    const settle = await write("/api/rounds/R-0247/settle", "api-flow-settle");
    expect(settle.status).toBe(200);
    expect((await settle.json()).result.state).toBe("ROUND_COMPLETE");
  });
});
