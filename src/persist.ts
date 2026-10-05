import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { closeTab, focusActive, newSession } from "./actions";
import { delayed, orElse, serial } from "./helpers";
import {
    getState,
    notify,
    sessionsIn,
    setState,
    type State,
    type TermGroup,
    useStore,
} from "./store";
import { terms } from "./terms/registry";

import type { Divider } from "./terms/session";

/** What one window saves so the next launch can reopen it. */
interface WindowSnapshot {
    version: 1;
    tabs: string[];
    activeRoot: string | null;
    activeSessions: Record<string, string>;
    groups: Record<string, TermGroup>;
    panes: Record<
        string,
        { profile: string; title: string; cwd?: string; screen: string; dividers?: Divider[] }
    >;
}

const SAVE_DELAY = 3000;

const saves = serial();
const saveSoon = delayed(() => void saveNow(), SAVE_DELAY);

/** One tab, one pane, never typed in: like a blank browser tab, not worth reopening. */
function isFresh(s: State) {
    if (s.tabs.length !== 1) return s.tabs.length === 0;
    const panes = sessionsIn(s.groups, s.tabs[0]);
    return panes.length === 1 && !s.sessions[panes[0]]?.used;
}

async function snapshot(s: State): Promise<WindowSnapshot | null> {
    if (isFresh(s)) return null;
    const panes: WindowSnapshot["panes"] = {};
    for (const [uid, session] of Object.entries(s.sessions)) {
        const term = terms.get(uid);
        if (!term) continue;
        panes[uid] = {
            profile: session.profile,
            title: session.title,
            cwd: await term.cwd(),
            ...term.snapshot(),
        };
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
    saveSoon.cancel();
    return saves(async () => {
        const snap = await snapshot(getState());
        await orElse(invoke("session_save", { snapshot: snap }), undefined);
    });
}

/** Something on screen changed; save soon. */
export function markDirty() {
    saveSoon.schedule();
}

function valid(snap: WindowSnapshot | null): snap is WindowSnapshot {
    if (snap?.version !== 1 || snap.tabs.length === 0) return false;
    const { groups, panes } = snap;
    return (
        snap.tabs.every((t) => groups[t]) &&
        Object.values(groups).every((g) =>
            g.sessionUid ? panes[g.sessionUid] : g.children.every((c) => groups[c]),
        )
    );
}

/** Adds a saved window's tabs to this window. */
async function open(snap: WindowSnapshot) {
    for (const g of Object.values(snap.groups)) {
        if (!g.sessionUid) continue;
        const pane = snap.panes[g.sessionUid];
        await newSession(pane.profile, { ...pane, uid: g.sessionUid });
    }
    setState((st) => {
        const sessions = { ...st.sessions };
        for (const [uid, pane] of Object.entries(snap.panes)) {
            if (Object.hasOwn(sessions, uid))
                sessions[uid] = { ...sessions[uid], title: pane.title };
        }
        return {
            sessions,
            groups: { ...st.groups, ...snap.groups },
            tabs: [...st.tabs, ...snap.tabs],
            activeRoot:
                snap.activeRoot && Object.hasOwn(snap.groups, snap.activeRoot)
                    ? snap.activeRoot
                    : snap.tabs[0],
            activeSessions: { ...st.activeSessions, ...snap.activeSessions },
        };
    });
    focusActive();
}

/** Reopens this window's tabs from the last run when `restoreSession` is on. False when there's nothing to restore. */
export async function restoreSession(): Promise<boolean> {
    const snap = await orElse(
        invoke<WindowSnapshot | null>("session_take", {
            restore: getState().config.restoreSession,
        }),
        null,
    );
    if (!valid(snap)) return false;
    await open(snap);
    return true;
}

/** Brings back the newest past session not reopened yet. A fresh window takes its first window; the rest open as new windows. */
export async function reopenSession() {
    const before = getState();
    const isHere = isFresh(before);
    const reopened = await orElse(
        invoke<{ here: WindowSnapshot | null } | null>("session_reopen", { here: isHere }),
        null,
    );
    if (!reopened) {
        notify("No saved session to reopen.");
        return;
    }
    if (!valid(reopened.here)) return;
    await open(reopened.here);
    for (const tab of before.tabs) closeTab(tab);
}

/** Saves after layout changes, while output flows, and when the window closes. */
export async function trackSession() {
    useStore.subscribe((s, previous) => {
        if (
            s.tabs !== previous.tabs ||
            s.groups !== previous.groups ||
            s.activeRoot !== previous.activeRoot ||
            s.activeSessions !== previous.activeSessions ||
            s.sessions !== previous.sessions
        ) {
            markDirty();
        }
    });
    await getCurrentWindow().onCloseRequested(() => saveNow());
}
