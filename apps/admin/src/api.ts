import type { ApiResult, AuthResult } from "@kmart/shared";
let token = "";
let refreshing: Promise<AuthResult> | undefined;
export function clearSession() {
  token = "";
}
export async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
  retry = true,
): Promise<T> {
  const response = await fetch(
    `${import.meta.env.VITE_API_URL ?? "/api/v1"}${path}`,
    {
      method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Client": "admin",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
  if (response.status === 401 && retry && !path.startsWith("/auth/")) {
    await restoreSession();
    return request<T>(path, method, body, false);
  }
  const result = (await response.json()) as ApiResult<T>;
  if (!result.success) throw new Error(result.error.message);
  if (!response.ok) throw new Error("Request failed");
  return result.data;
}
async function accept(session: AuthResult) {
  token = session.accessToken;
  if (session.user.role !== "admin") {
    try {
      await request("/auth/logout", "POST");
    } finally {
      clearSession();
    }
    throw new Error("An administrator account is required.");
  }
  return session;
}
export function login(identifier: string, password: string) {
  return request<AuthResult>("/auth/login", "POST", {
    identifier,
    password,
  }).then(accept);
}
export function restoreSession() {
  refreshing ??= request<AuthResult>("/auth/refresh", "POST", {})
    .then(accept)
    .finally(() => {
      refreshing = undefined;
    });
  return refreshing;
}
