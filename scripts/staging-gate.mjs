const base = process.env.API_URL ?? "http://127.0.0.1:8787";

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}

const health = await request("/health");
const auth = await request("/api/auth/telegram", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
const admin = await request("/api/admin/rounds", { headers: { "x-demo-admin-token": "admin-demo-only" } });
const webhook = await request("/api/telegram/webhook", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });

const passed = health.status === 503
  && health.data?.mode === "staging"
  && auth.status === 503
  && auth.data?.code === "TELEGRAM_SIGNED_INIT_DATA_REQUIRED"
  && admin.status === 403
  && webhook.status === 503
  && webhook.data?.code === "WEBHOOK_SECRET_REQUIRED";

if (!passed) {
  console.error(JSON.stringify({ health, auth, admin, webhook }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  healthStatus: health.status,
  unsignedAuth: auth.data.code,
  defaultAdminToken: admin.status,
  webhookWithoutSecret: webhook.data.code
}, null, 2));
