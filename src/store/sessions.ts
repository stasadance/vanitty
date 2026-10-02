import { create } from "zustand";
import type { PtyId } from "../pty";

export interface Session {
  key: string;
  ptyId?: PtyId;
  title: string;
}

interface SessionsState {
  sessions: Session[];
  activeKey?: string;
  add: () => void;
  remove: (key: string) => void;
  setPty: (key: string, ptyId: PtyId) => void;
}

let nextKey = 0;
const newSession = (): Session => ({ key: `s${nextKey++}`, title: "shell" });

export const useSessions = create<SessionsState>()((set) => {
  const first = newSession();
  return {
    sessions: [first],
    activeKey: first.key,
    add: () =>
      set((s) => {
        const session = newSession();
        return { sessions: [...s.sessions, session], activeKey: session.key };
      }),
    remove: (key) =>
      set((s) => {
        const sessions = s.sessions.filter((x) => x.key !== key);
        const activeKey =
          s.activeKey === key ? sessions.at(-1)?.key : s.activeKey;
        return { sessions, activeKey };
      }),
    setPty: (key, ptyId) =>
      set((s) => ({
        sessions: s.sessions.map((x) => (x.key === key ? { ...x, ptyId } : x)),
      })),
  };
});
