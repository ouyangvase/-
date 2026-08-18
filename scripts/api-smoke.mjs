const base = process.env.API_URL ?? "http://127.0.0.1:8787";
const get = async (path, options) => {
  const response = await fetch(`${base}${path}`, options);
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
};

const health = await get("/health");
const auth = await get("/api/auth/telegram", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
const token = auth.data.token;
const headers = { "content-type": "application/json", "x-session-token": token, "idempotency-key": "smoke-bet-1" };
const bid = await get("/api/rounds/R-0247/bid", { method: "POST", headers: { ...headers, "idempotency-key": "smoke-bid-1" }, body: JSON.stringify({ amount: 100 }) });
const bet = await get("/api/rounds/R-0247/bet", { method: "POST", headers, body: "{}" });
const replay = await get("/api/rounds/R-0247/bet", { method: "POST", headers, body: "{}" });
const claim = await get("/api/rounds/R-0247/demo-claim", { method: "POST", headers: { ...headers, "idempotency-key": "smoke-claim-1" }, body: "{}" });
const settle = await get("/api/rounds/R-0247/settle", { method: "POST", headers: { ...headers, "idempotency-key": "smoke-settle-1" }, body: "{}" });
const money = await get("/api/wallet/top-up", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "smoke-money-1" }, body: "{}" });
const device = await get("/api/onboarding/device-bind", { method: "POST", headers: { ...headers, "idempotency-key": "smoke-device-1" }, body: JSON.stringify({ publicKey: "-----BEGIN PUBLIC KEY-----\nsmoke-device-public-key-1234567890\n-----END PUBLIC KEY-----" }) });
const referrer = await get("/api/onboarding/referrer", { method: "POST", headers: { ...headers, "idempotency-key": "smoke-referrer-1" }, body: JSON.stringify({ code: "DEMO-INVITE" }) });
const pin = await get("/api/onboarding/pin", { method: "POST", headers: { ...headers, "idempotency-key": "smoke-pin-1" }, body: JSON.stringify({ pin: "258036" }) });
const onboarding = await get("/api/onboarding/status", { headers: { "x-session-token": token } });
if (health.status !== 200 || auth.status !== 200 || bid.status !== 200 || bid.data.result?.state !== "BETTING" || bet.status !== 200 || replay.status !== 200 || replay.data.replayed !== true || claim.status !== 200 || settle.status !== 200 || money.status !== 403 || money.data.code !== "REAL_MONEY_DISABLED" || device.status !== 200 || referrer.status !== 200 || pin.status !== 200 || onboarding.data.pinSet !== true) {
  console.error("API smoke failed", { health, auth, bid, bet, replay, claim, settle, money, device, referrer, pin, onboarding });
  process.exit(1);
}
console.log(JSON.stringify({ health, bidStatus: bid.status, betStatus: bet.status, replayed: replay.data.replayed, claimStatus: claim.status, settleStatus: settle.status, moneyStatus: money.status, moneyCode: money.data.code }, null, 2));
