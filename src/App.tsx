import { Term } from "./components/Term";
import { useSessions } from "./store/sessions";

export default function App() {
  const activeKey = useSessions((s) => s.activeKey);
  if (!activeKey) return null;
  return <Term key={activeKey} sessionKey={activeKey} />;
}
