import runtime from "../serverless-runtime/api-handler.cjs";

const { apiHandler } = runtime;

export default async function handler(request, response) {
  const requestUrl = new URL(request.url ?? "/api", "http://localhost");
  const route = requestUrl.searchParams.get("__route");
  if (route !== null) {
    requestUrl.pathname = route ? `/api/${route.replace(/^\/+/, "")}` : "/api";
    requestUrl.searchParams.delete("__route");
    request.url = `${requestUrl.pathname}${requestUrl.search}`;
  }
  await apiHandler(request, response);
}
