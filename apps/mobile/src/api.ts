import { Platform } from "react-native";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import type { ApiResult, AuthResult } from "@kmart/shared";
function defaultApiUrl() {
  // In Expo Go, localhost is the phone itself. Use the Metro computer's host
  // for native development; explicit URLs still support tunnels/custom ports.
  const hostUri = Constants.expoConfig?.hostUri;
  if (__DEV__ && Platform.OS !== "web" && hostUri) {
    const url = new URL(`http://${hostUri}`);
    url.port = "4000";
    url.pathname = "/api/v1";
    return url.toString();
  }
  return "http://localhost:4000/api/v1";
}
const base = (
  process.env.EXPO_PUBLIC_API_URL?.trim() || defaultApiUrl()
).replace(/\/+$/, "");
let token = "";
let webRefresh: string | undefined;
let refreshing: Promise<AuthResult> | undefined;
export async function saveSession(session: AuthResult) {
  token = session.accessToken;
  if (session.refreshToken) {
    if (Platform.OS === "web") webRefresh = session.refreshToken;
    else await SecureStore.setItemAsync("kmart-refresh", session.refreshToken);
  }
  return session;
}
export async function clearSession() {
  token = "";
  webRefresh = undefined;
  if (Platform.OS !== "web") await SecureStore.deleteItemAsync("kmart-refresh");
}
export async function restoreSession() {
  refreshing ??= (async () => {
    const refreshToken =
      Platform.OS === "web"
        ? webRefresh
        : await SecureStore.getItemAsync("kmart-refresh");
    if (!refreshToken) throw new Error("Please sign in.");
    return saveSession(
      await api<AuthResult>(
        "/auth/refresh",
        "POST",
        { refreshToken },
        {},
        false,
      ),
    );
  })().finally(() => {
    refreshing = undefined;
  });
  return refreshing;
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
  retry = true,
): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 401 && retry && !path.startsWith("/auth/")) {
    await restoreSession();
    return api<T>(path, method, body, headers, false);
  }
  const result = (await response.json()) as ApiResult<T>;
  if (!result.success) throw new Error(result.error.message);
  if (!response.ok) throw new Error("Request failed");
  return result.data;
}
