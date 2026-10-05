import { create } from "zustand";

import { type Config, DEFAULT_CONFIG } from "../config/defaults";
import { buildKeymap } from "../config/keymaps";
import { counter } from "../helpers";

import type { SshLink } from "../terms/ssh-links";

export type Direction = "horizontal" | "vertical";

export interface Session {
    uid: string;
    profile: string;
    shell: string;
    title: string;
    ptyId?: number;
    search: boolean;
    searchResults?: { resultIndex: number; resultCount: number };
    hasActivity: boolean;
    /** Typed in, or brought back from the last run: worth reopening. */
    used: boolean;
}

/** A node in a tab's split tree: either a terminal or a split of children. */
export interface TermGroup {
    uid: string;
    sessionUid: string | null;
    parentUid: string | null;
    direction: Direction | null;
    sizes: number[] | null;
    children: string[];
}

export interface Notification {
    id: string;
    text: string;
    error?: boolean;
    action?: { label: string; run: () => void };
}

export interface HeaderItem {
    text: string;
    tooltip?: string;
    command?: string;
}

export interface State {
    config: Config;
    keymap: Map<string, string>;
    notifications: Notification[];
    sessions: Record<string, Session>;
    groups: Record<string, TermGroup>;
    /** Root group uid of each tab, in order. */
    tabs: string[];
    activeRoot: string | null;
    /** Active session per tab, keyed by root group uid. */
    activeSessions: Record<string, string>;
    fontSizeOverride: number | null;
    maximized: boolean;
    fullScreen: boolean;
    /** Title bar items added by plugins. */
    headerItems: Record<string, HeaderItem>;
    themePicker: boolean;
    /** An `ssh://` link waiting for the user to confirm it. */
    sshPrompt: { link: SshLink; profile: string } | null;
    /** Config problems currently shown, so each shows once. */
    configErrors: string[];
    /** When a pane was last resized by hand; its output then isn't activity. */
    resizedAt: number;
}

export const useStore = create<State>()(() => ({
    config: DEFAULT_CONFIG,
    keymap: buildKeymap([]),
    notifications: [],
    sessions: {},
    groups: {},
    tabs: [],
    activeRoot: null,
    activeSessions: {},
    fontSizeOverride: null,
    maximized: false,
    fullScreen: false,
    headerItems: {},
    themePicker: false,
    sshPrompt: null,
    configErrors: [],
    resizedAt: 0,
}));

export const getState = useStore.getState;
export const setState = useStore.setState;

const nextId = counter();
export const uid = (prefix: string) =>
    `${prefix}${Date.now().toString(36)}${nextId().toString(36)}`;

export function activeSessionUid(s: State = getState()): string | undefined {
    return s.activeRoot ? s.activeSessions[s.activeRoot] : undefined;
}

export function notify(text: string, isError = false, action?: Notification["action"]) {
    const id = uid("n");
    setState((s) => ({
        notifications: [...s.notifications, { id, text, error: isError, action }],
    }));
    // Errors and notifications with an action stay until dismissed.
    if (!isError && !action) setTimeout(() => dismiss(id), 6000);
}

export function dismiss(id: string) {
    setState((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) }));
}

export function rootOf(groups: Record<string, TermGroup>, uid: string): TermGroup {
    let g = groups[uid];
    while (g.parentUid) g = groups[g.parentUid];
    return g;
}

export function groupOfSession(groups: Record<string, TermGroup>, sessionUid: string) {
    return Object.values(groups).find((g) => g.sessionUid === sessionUid);
}

/** Sessions under a group, in visual order. */
export function sessionsIn(groups: Record<string, TermGroup>, uid: string): string[] {
    const g = groups[uid];
    if (!g) return [];
    return g.sessionUid ? [g.sessionUid] : g.children.flatMap((c) => sessionsIn(groups, c));
}
