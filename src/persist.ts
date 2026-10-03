import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { focusActive, newSession } from "./actions";
import { terms } from "./terms/registry";
import { getState, setState, useStore, type State, type TermGroup } from "./store";

/** What one window saves so the next launch can reopen it. */
interface WindowSnapshot {
  version: 1;
  tabs: string[];
  activeRoot: string | null;
  activeSessions: Record<string, string>;
  groups: Record<string, TermGroup>;
  panes: Record<string, { profile: string; title: string; cwd?: string; screen: string }>;
}

const SAVE_DELAY = 3000;

let timer: ReturnType<typeof setTimeout> | undefined;
let saving: Promise<void> = Promise.resolve();

const enabled = () => getState().config.restoreSession;

async function snapshot(s: State): Promise<WindowSnapshot | null> {
  if (!s.tabs.length) return null;
  const panes: WindowSnapshot["panes"] = {};
  for (const [uid, session] of Object.entries(s.sessions)) {
    const term = terms.get(uid);
    if (!term) continue;
    panes[uid] = { profile: session.profile, title: session.title, cwd: await term.cwd(), screen: term.snapshot() };
  }
  return {
    version: 1,
    tabs: s.tabs,
    activeRoot: s.activeRoot,
    activeSessions: s.activeSessions,
    groups: s.groups,
    panes,
  };
}

/** Saves this window now. Saves run one at a time so an older one can't land last. */
export function saveNow(): Promise<void> {
  clearTimeout(timer);
  timer = undefined;
  saving = saving.then(async () => {
    if (!enabled()) return;
    const snap = await snapshot(getState());
    await invoke("session_save", { snapshot: snap }).catch(() => {});
  });
  return saving;
}

/** Something on screen changed; save soon. */
export function markDirty() {
  if (timer || !enabled()) return;
  timer = setTimeout(() => void saveNow(), SAVE_DELAY);
}

function valid(snap: WindowSnapshot | null): snap is WindowSnapshot {
  if (snap?.version !== 1 || !snap.tabs.length) return false;
  const { groups, panes } = snap;
  return (
    snap.tabs.every((t) => groups[t]) &&
    Object.values(groups).every((g) => (g.sessionUid ? panes[g.sessionUid] : g.children.every((c) => groups[c])))
  );
}

/**
 * Reopens this window's tabs from the last run. Returns false when there's
 * nothing to restore, so the caller opens a fresh tab instead.
 */
export async function restoreSession(): Promise<boolean> {
  if (!enabled()) {
    await invoke("session_clear").catch(() => {});
    return false;
  }
  const snap = await invoke<WindowSnapshot | null>("session_take").catch(() => null);
  if (!valid(snap)) return false;

  for (const g of Object.values(snap.groups)) {
    if (!g.sessionUid) continue;
    const pane = snap.panes[g.sessionUid];
    await newSession(pane.profile, { uid: g.sessionUid, cwd: pane.cwd, screen: pane.screen });
  }
  setState((st) => {
    const sessions = { ...st.sessions };
    for (const [uid, pane] of Object.entries(snap.panes)) {
      if (sessions[uid]) sessions[uid] = { ...sessions[uid], title: pane.title };
    }
    return {
      sessions,
      groups: snap.groups,
      tabs: snap.tabs,
      activeRoot: snap.activeRoot && snap.groups[snap.activeRoot] ? snap.activeRoot : snap.tabs[0],
      activeSessions: snap.activeSessions,
    };
  });
  focusActive();
  return true;
}

/** Saves after layout changes, while output flows, and when the window closes. */
export async function trackSession() {
  useStore.subscribe((s, prev) => {
    if (
      s.tabs !== prev.tabs ||
      s.groups !== prev.groups ||
      s.activeRoot !== prev.activeRoot ||
      s.activeSessions !== prev.activeSessions ||
      s.sessions !== prev.sessions
    ) {
      markDirty();
    }
  });
  await getCurrentWindow().onCloseRequested(() => saveNow());
}
