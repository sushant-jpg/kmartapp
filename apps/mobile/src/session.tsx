import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { AuthResult } from "@kmart/shared";
import { api, clearSession, restoreSession, saveSession } from "./api";
type Session = {
  user?: AuthResult["user"];
  ready: boolean;
  signIn: (session: AuthResult) => Promise<void>;
  signOut: () => Promise<void>;
};
const Context = createContext<Session | undefined>(undefined);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthResult["user"]>();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    restoreSession()
      .then((s) => setUser(s.user))
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  async function signIn(session: AuthResult) {
    await saveSession(session);
    setUser(session.user);
  }
  async function signOut() {
    await api("/auth/logout", "POST");
    await clearSession();
    setUser(undefined);
  }
  return (
    <Context.Provider value={{ user, ready, signIn, signOut }}>
      {children}
    </Context.Provider>
  );
}
export function useSession() {
  const session = useContext(Context);
  if (!session) throw new Error("Missing session provider");
  return session;
}
