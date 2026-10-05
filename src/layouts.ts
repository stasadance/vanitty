import { invoke } from "@tauri-apps/api/core";
import { homeDir } from "@tauri-apps/api/path";
import { parse } from "jsonc-parser";

import { closeTab } from "./actions";
import { cached, orElse, serial } from "./helpers";
import { isFresh, openSnapshot, valid, type WindowSnapshot } from "./persist";
import { getState, notify, sessionsIn, type TermGroup, uid } from "./store";
import { terms } from "./terms/registry";

const FILE = "layouts.json";

/** One terminal in a saved layout. */
export interface LayoutPane {
    cwd?: string;
    profile?: string;
}

/** Panes side by side ("right") or stacked ("down"), like Split Right and Split Down. */
export interface LayoutSplit {
    split: "right" | "down";
    sizes?: number[];
    panes: LayoutNode[];
}

export type LayoutNode = LayoutPane | LayoutSplit;

/** A window's tabs and splits, saved by name to open again later. */
export interface Layout {
    name: string;
    tabs: LayoutNode[];
}

const isSplit = (node: LayoutNode): node is LayoutSplit => "split" in node;

const writes = serial();

export async function loadLayouts(): Promise<Layout[]> {
    const text = await orElse(invoke<string | null>("config_read", { name: FILE }), null);
    const value = text ? (parse(text, [], { allowTrailingComma: true }) as unknown) : null;
    const layouts = (value as { layouts?: unknown } | null)?.layouts;
    return Array.isArray(layouts)
        ? layouts.filter(
              (l): l is Layout =>
                  typeof l?.name === "string" && Array.isArray(l.tabs) && l.tabs.length > 0,
          )
        : [];
}

/** Rewrites the whole file with `change` applied to what's on disk now. */
export function updateLayouts(change: (layouts: Layout[]) => Layout[]): Promise<Layout[]> {
    return writes(async () => {
        const layouts = change(await loadLayouts());
        await invoke("config_write", {
            name: FILE,
            contents: `${JSON.stringify({ layouts }, null, 4)}\n`,
        });
        return layouts;
    });
}

/** This window's tabs and splits, with each pane's folder and profile. */
export async function currentLayout(name: string): Promise<Layout> {
    const { groups, sessions, tabs } = getState();
    const node = async (g: TermGroup): Promise<LayoutNode> => {
        if (g.sessionUid) {
            const cwd = await terms.get(g.sessionUid)?.cwd();
            const profile = sessions[g.sessionUid]?.profile;
            return {
                ...(cwd && { cwd }),
                ...(profile !== getState().config.defaultProfile && { profile }),
            };
        }
        return {
            split: g.direction === "vertical" ? "right" : "down",
            ...(g.sizes && { sizes: g.sizes.map((x) => Math.round(x * 1000) / 1000) }),
            panes: await Promise.all(g.children.map((c) => node(groups[c]))),
        };
    };
    return { name, tabs: await Promise.all(tabs.map((t) => node(groups[t]))) };
}

function toSnapshot(layout: Layout): WindowSnapshot {
    const groups: WindowSnapshot["groups"] = {};
    const panes: WindowSnapshot["panes"] = {};
    const activeSessions: WindowSnapshot["activeSessions"] = {};
    const add = (node: LayoutNode, parentUid: string | null): string => {
        const g: TermGroup = {
            uid: uid("g"),
            sessionUid: null,
            parentUid,
            direction: null,
            sizes: null,
            children: [],
        };
        groups[g.uid] = g;
        const children = isSplit(node) ? node.panes : [];
        if (children.length === 0) {
            const pane = node as LayoutPane;
            g.sessionUid = uid("s");
            panes[g.sessionUid] = {
                profile: pane.profile ?? getState().config.defaultProfile,
                title: "",
                cwd: pane.cwd,
            };
        } else if (children.length === 1) {
            // A split of one is just that pane.
            delete groups[g.uid];
            return add(children[0], parentUid);
        } else {
            const split = node as LayoutSplit;
            g.direction = split.split === "right" ? "vertical" : "horizontal";
            g.children = children.map((c) => add(c, g.uid));
            const sizes = split.sizes?.length === children.length ? split.sizes : null;
            const total = sizes?.reduce((a, b) => a + b, 0) ?? 0;
            g.sizes = sizes && total > 0 ? sizes.map((x) => x / total) : null;
        }
        return g.uid;
    };
    const tabs = layout.tabs.map((t) => add(t, null));
    for (const t of tabs) activeSessions[t] = sessionsIn(groups, t)[0];
    return { version: 1, tabs, activeRoot: tabs[0], activeSessions, groups, panes };
}

/** Opens a layout here when this window is still a blank tab, otherwise in a new window. */
export async function openLayout(layout: Layout) {
    const snap = toSnapshot(layout);
    if (!valid(snap)) {
        notify(`Layout “${layout.name}” has no tabs to open.`, true);
        return;
    }
    const before = getState();
    if (!isFresh(before)) {
        await invoke("session_open_window", { snapshot: snap });
        return;
    }
    await openSnapshot(snap);
    for (const tab of before.tabs) closeTab(tab);
}

export function paneCount(node: LayoutNode): number {
    return isSplit(node) && node.panes.length > 0
        ? node.panes.reduce((n, p) => n + paneCount(p), 0)
        : 1;
}

function firstFolder(node: LayoutNode): string | undefined {
    return isSplit(node) ? node.panes.map((p) => firstFolder(p)).find(Boolean) : node.cwd;
}

/** "2 tabs, 4 panes", or just "2 tabs" with no splits. */
export function countText(tabs: number, panes: number) {
    return `${tabs} ${tabs === 1 ? "tab" : "tabs"}${panes === tabs ? "" : `, ${panes} panes`}`;
}

export const homeFolder = cached(() => homeDir());

/** "3 tabs, 5 panes · ~/code/vanitty" */
export function describe(layout: Layout, home: string): string {
    const counts = countText(
        layout.tabs.length,
        layout.tabs.reduce((n, t) => n + paneCount(t), 0),
    );
    const folder = layout.tabs.map((t) => firstFolder(t)).find(Boolean);
    if (!folder) return counts;
    const underHome =
        home && folder.startsWith(home) && /^([\\/]|$)/.test(folder.slice(home.length));
    return `${counts} · ${underHome ? `~${folder.slice(home.length)}` : folder}`;
}

/** The active pane's folder name, as a default layout name. */
export async function suggestedName(): Promise<string> {
    const s = getState();
    const active = s.activeRoot ? s.activeSessions[s.activeRoot] : undefined;
    const cwd = active ? await terms.get(active)?.cwd() : undefined;
    return (cwd && /([^\\/]+)[\\/]*$/.exec(cwd)?.[1]) ?? "";
}
