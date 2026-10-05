import { getCurrentWindow } from "@tauri-apps/api/window";

import { markDirty } from "./persist";
import { emit, wants } from "./plugins/host";
import {
    activeSessionUid,
    type Direction,
    getState,
    groupOfSession,
    rootOf,
    sessionsIn,
    setState,
    type State,
    type TermGroup,
    uid,
} from "./store";
import { ptyCwd } from "./terms/pty";
import { terms } from "./terms/registry";
import { TermSession } from "./terms/session";

import type { Config, TermConfig } from "./config/defaults";

const MIN_SIZE = 0.05;

/** Global config with the profile's overrides on top. */
export function profileConfig(config: Config, profile: string): TermConfig {
    const p = config.profiles.find((x) => x.name === profile);
    if (!p) return config;
    const merged = { ...config, ...p.config };
    if (p.config.colors) merged.colors = { ...config.colors, ...p.config.colors };
    return merged;
}

export function fontSize(s: State = getState()) {
    return s.fontSizeOverride ?? s.config.fontSize;
}

let lastResize = 0;
export const markResized = () => {
    lastResize = Date.now();
};

/** A pane from the last run to bring back. */
export interface RestoredPane {
    uid: string;
    cwd?: string;
    screen?: string;
}

export async function newSession(
    profileName: string | undefined,
    restored?: RestoredPane,
): Promise<string> {
    const s = getState();
    const profile =
        profileName && s.config.profiles.some((p) => p.name === profileName)
            ? profileName
            : s.config.defaultProfile;
    const config = profileConfig(s.config, profile);

    let cwd = config.workingDirectory;
    const active = activeSessionUid(s);
    const activePty = active ? terms.get(active)?.ptyId : undefined;
    if (restored) {
        cwd = restored.cwd || cwd;
    } else if (activePty !== undefined && s.config.preserveCWD) {
        cwd = (await ptyCwd(activePty).catch(() => null)) || cwd;
    }

    const sessionUid = restored?.uid ?? uid("s");
    const decoder = new TextDecoder();
    const session = new TermSession(
        sessionUid,
        config,
        fontSize(s),
        {
            shell: config.shell || undefined,
            shellArgs: config.shell ? config.shellArgs : undefined,
            cwd,
            env: config.env,
        },
        {
            onTitle: (title) => {
                updateSession(sessionUid, { title });
                emit("terminal.title", { id: sessionUid, title });
            },
            onInput: (data) => {
                if (wants("terminal.input")) emit("terminal.input", { id: sessionUid, data });
            },
            onData: (bytes) => {
                markDirty();
                if (wants("terminal.data"))
                    emit("terminal.data", {
                        id: sessionUid,
                        data: decoder.decode(bytes, { stream: true }),
                    });
                const st = getState();
                const g = groupOfSession(st.groups, sessionUid);
                if (!g || Date.now() - lastResize < 1000) return;
                const root = rootOf(st.groups, g.uid).uid;
                if (root !== st.activeRoot && !st.sessions[sessionUid]?.hasActivity) {
                    updateSession(sessionUid, { hasActivity: true });
                }
            },
            onExit: () => removeSession(sessionUid),
            onFocus: () => setActiveSession(sessionUid),
            onSearchResults: (searchResults) => updateSession(sessionUid, { searchResults }),
        },
        (shell, ptyId) => updateSession(sessionUid, { shell, ptyId }),
        restored?.screen,
    );
    terms.set(sessionUid, session);
    setState((st) => ({
        sessions: {
            ...st.sessions,
            [sessionUid]: {
                uid: sessionUid,
                profile,
                shell: config.shell,
                title: "",
                search: false,
                hasActivity: false,
            },
        },
    }));
    emit("terminal.open", { id: sessionUid, title: "", profile, active: false });
    return sessionUid;
}

function updateSession(sessionUid: string, patch: Partial<State["sessions"][string]>) {
    setState((st) => {
        const current = st.sessions[sessionUid];
        return current
            ? { sessions: { ...st.sessions, [sessionUid]: { ...current, ...patch } } }
            : {};
    });
}

export async function newTab(profile?: string) {
    const sessionUid = await newSession(profile);
    const groupUid = uid("g");
    setState((st) => ({
        groups: {
            ...st.groups,
            [groupUid]: {
                uid: groupUid,
                sessionUid,
                parentUid: null,
                direction: null,
                sizes: null,
                children: [],
            },
        },
        tabs: [...st.tabs, groupUid],
        activeRoot: groupUid,
        activeSessions: { ...st.activeSessions, [groupUid]: sessionUid },
    }));
    focusActive();
}

/** Splits the active pane. "vertical" puts the new pane on the right. */
export async function split(direction: Direction, profile?: string) {
    const active = activeSessionUid();
    if (!active) return newTab(profile);
    const sessionUid = await newSession(profile);
    setState((st) => {
        const groups = { ...st.groups };
        const activeGroup = groupOfSession(groups, active);
        if (!activeGroup) return {};
        // Same direction as the parent: add a sibling. Otherwise the active pane
        // becomes a new split of its own.
        let parent = activeGroup.parentUid ? groups[activeGroup.parentUid] : activeGroup;
        if (parent.direction && parent.direction !== direction) parent = activeGroup;

        const fresh: TermGroup = {
            uid: uid("g"),
            sessionUid,
            parentUid: parent.uid,
            direction: null,
            sizes: null,
            children: [],
        };
        groups[fresh.uid] = fresh;

        if (parent.sessionUid) {
            const moved: TermGroup = {
                uid: uid("g"),
                sessionUid: parent.sessionUid,
                parentUid: parent.uid,
                direction: null,
                sizes: null,
                children: [],
            };
            groups[moved.uid] = moved;
            groups[parent.uid] = {
                ...parent,
                sessionUid: null,
                direction,
                children: [moved.uid, fresh.uid],
                sizes: null,
            };
        } else {
            const index = parent.children.indexOf(activeGroup.uid) + 1;
            const children = [
                ...parent.children.slice(0, index),
                fresh.uid,
                ...parent.children.slice(index),
            ];
            let sizes = parent.sizes;
            if (sizes) {
                const size = 1 / (sizes.length + 1);
                const scaled = sizes.map((x) => x - size * x);
                sizes = [...scaled.slice(0, index), size, ...scaled.slice(index)];
            }
            groups[parent.uid] = { ...parent, direction, children, sizes };
        }
        const root = rootOf(groups, fresh.uid).uid;
        return {
            groups,
            activeRoot: root,
            activeSessions: { ...st.activeSessions, [root]: sessionUid },
        };
    });
    focusActive();
}

function removeSession(sessionUid: string) {
    emit("terminal.close", sessionUid);
    const term = terms.get(sessionUid);
    terms.delete(sessionUid);
    term?.dispose();
    setState((st) => {
        const groups = { ...st.groups };
        const sessions = { ...st.sessions };
        delete sessions[sessionUid];
        const group = groupOfSession(groups, sessionUid);
        if (!group) return { sessions };
        let tabs = st.tabs;
        let activeRoot = st.activeRoot;
        const activeSessions = { ...st.activeSessions };
        delete groups[group.uid];

        if (group.parentUid) {
            const parent = groups[group.parentUid];
            const index = parent.children.indexOf(group.uid);
            const children = parent.children.filter((c) => c !== group.uid);
            if (children.length === 1) {
                // Collapse the parent into its only child.
                const child = groups[children[0]];
                delete groups[parent.uid];
                groups[child.uid] = { ...child, parentUid: parent.parentUid };
                if (parent.parentUid) {
                    const pp = groups[parent.parentUid];
                    groups[pp.uid] = {
                        ...pp,
                        children: pp.children.map((c) => (c === parent.uid ? child.uid : c)),
                    };
                } else {
                    tabs = tabs.map((t) => (t === parent.uid ? child.uid : t));
                    if (activeRoot === parent.uid) activeRoot = child.uid;
                    activeSessions[child.uid] = activeSessions[parent.uid];
                    delete activeSessions[parent.uid];
                }
            } else {
                let sizes = parent.sizes;
                if (sizes) {
                    const extra = sizes[index] / (sizes.length - 1);
                    sizes = sizes.filter((_, position) => position !== index).map((x) => x + extra);
                }
                groups[parent.uid] = { ...parent, children, sizes };
            }
            const newRoot = rootOf(groups, groups[parent.uid] ? parent.uid : children[0]).uid;
            if (activeSessions[newRoot] === sessionUid || !activeSessions[newRoot]) {
                const remaining = sessionsIn(groups, newRoot);
                activeSessions[newRoot] = remaining[Math.min(index, remaining.length - 1)];
            }
        } else {
            // The whole tab is gone.
            const index = tabs.indexOf(group.uid);
            tabs = tabs.filter((t) => t !== group.uid);
            delete activeSessions[group.uid];
            if (activeRoot === group.uid)
                activeRoot = tabs[Math.min(index, tabs.length - 1)] ?? null;
        }
        return { groups, sessions, tabs, activeRoot, activeSessions };
    });
    if (getState().tabs.length === 0) {
        void getCurrentWindow().close();
        return;
    }
    focusActive();
}

export function closePane(sessionUid = activeSessionUid()) {
    if (sessionUid) terms.get(sessionUid)?.kill();
}

export function closeTab(rootUid: string) {
    for (const s of sessionsIn(getState().groups, rootUid)) terms.get(s)?.kill();
}

export function setActiveSession(sessionUid: string) {
    const st = getState();
    const g = groupOfSession(st.groups, sessionUid);
    if (!g) return;
    const root = rootOf(st.groups, g.uid).uid;
    if (st.activeRoot === root && st.activeSessions[root] === sessionUid) return;
    setState({ activeRoot: root, activeSessions: { ...st.activeSessions, [root]: sessionUid } });
    clearActivity(root);
}

export function selectTab(rootUid: string) {
    if (!getState().groups[rootUid]) return;
    setState({ activeRoot: rootUid });
    clearActivity(rootUid);
    focusActive();
}

function clearActivity(rootUid: string) {
    const st = getState();
    const marked = sessionsIn(st.groups, rootUid).filter((s) => st.sessions[s]?.hasActivity);
    if (marked.length === 0) return;
    const sessions = { ...st.sessions };
    for (const s of marked) sessions[s] = { ...sessions[s], hasActivity: false };
    setState({ sessions });
}

export function moveTab(delta: number) {
    const { tabs, activeRoot } = getState();
    if (!activeRoot || tabs.length < 2) return;
    const index = tabs.indexOf(activeRoot);
    selectTab(tabs[(index + delta + tabs.length) % tabs.length]);
}

/** Moves a tab to `index` in the tab bar. */
export function reorderTab(rootUid: string, index: number) {
    setState((st) => {
        const from = st.tabs.indexOf(rootUid);
        if (from === -1 || from === index) return {};
        const tabs = st.tabs.filter((t) => t !== rootUid);
        tabs.splice(index, 0, rootUid);
        return { tabs };
    });
}

export function jumpTab(index: number | "last") {
    const { tabs } = getState();
    const target = index === "last" ? tabs.at(-1) : tabs[index];
    if (target) selectTab(target);
}

export function movePane(delta: number) {
    const st = getState();
    if (!st.activeRoot) return;
    const all = sessionsIn(st.groups, st.activeRoot);
    if (all.length < 2) return;
    const index = all.indexOf(st.activeSessions[st.activeRoot]);
    const next = all[(index + delta + all.length) % all.length];
    setActiveSession(next);
    focusActive();
}

export function resizeGroup(groupUid: string, sizes: number[]) {
    if (sizes.some((x) => x < MIN_SIZE)) return;
    markResized();
    setState((st) => ({ groups: { ...st.groups, [groupUid]: { ...st.groups[groupUid], sizes } } }));
}

export function focusActive() {
    requestAnimationFrame(() => {
        const active = activeSessionUid();
        if (active) terms.get(active)?.focus();
    });
}

export function activeTerm(): TermSession | undefined {
    const active = activeSessionUid();
    return active ? terms.get(active) : undefined;
}

export function setSearch(sessionUid: string | undefined, open: boolean) {
    if (!sessionUid) return;
    updateSession(sessionUid, { search: open, searchResults: undefined });
    if (open) return;
    terms.get(sessionUid)?.searchClear();
    focusActive();
}

export function setFontSizeOverride(value: number | null) {
    setState({ fontSizeOverride: value });
    applyConfigToTerms();
}

/** Pushes the current config into every live terminal. */
export function applyConfigToTerms() {
    const st = getState();
    for (const [sessionUid, term] of terms) {
        const profile = st.sessions[sessionUid]?.profile ?? st.config.defaultProfile;
        term.update(profileConfig(st.config, profile), fontSize(st));
    }
}
