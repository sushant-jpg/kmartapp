import { Stack } from "expo-router";
import { SessionProvider } from "../src/session";
export default function Layout() {
  return (
    <SessionProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SessionProvider>
  );
}
