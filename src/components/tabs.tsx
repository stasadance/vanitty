import { useEffect, useRef, useState } from "react";

import { ChevronDown, CloseTab, Plus } from "./icons";

import { closeTab, reorderTab, selectTab } from "../actions";
import { isMac } from "../config/keymaps";
import { profileIcon } from "../config/profile-icon";
import { useStore } from "../store";

interface Properties {
    titles: string[];
    activeIndex: number;
    onNewTab: (profile?: string) => void;
}

/** How far the pointer moves before a press on a tab becomes a drag. */
const DRAG_THRESHOLD = 4;

export const Tabs = ({ titles, activeIndex, onNewTab }: Properties) => {
    const tabs = useStore((s) => s.tabs);
    const listReference = useRef<HTMLUListElement>(null);
    const [dragging, setDragging] = useState<string | null>(null);
    const sessions = useStore((s) => s.sessions);
    const groups = useStore((s) => s.groups);
    const borderColor = useStore((s) => s.config.borderColor);
    const isFullScreen = useStore((s) => s.fullScreen);
    const isHidden = !isMac && tabs.length === 1;

    const hasActivity = (root: string) => {
        const hasActivityIn = (uid: string): boolean => {
            const g = groups[uid];
            if (!g) return false;
            return g.sessionUid
                ? !!sessions[g.sessionUid]?.hasActivity
                : g.children.some((child) => hasActivityIn(child));
        };
        return hasActivityIn(root);
    };

    /** Drags a tab along the bar; it takes the place of the tab under the pointer. */
    const startDrag = (event: React.MouseEvent, root: string) => {
        if (event.button !== 0) return;
        const startX = event.clientX;
        let isMoved = false;
        const move = (moveEvent: MouseEvent) => {
            if (!isMoved && Math.abs(moveEvent.clientX - startX) < DRAG_THRESHOLD) return;
            if (!isMoved) {
                // The tab you drag becomes the active one, as in browsers.
                isMoved = true;
                setDragging(root);
                selectTab(root);
            }
            const items = [...(listReference.current?.children ?? [])];
            const over = items.findIndex(
                (element) => moveEvent.clientX < element.getBoundingClientRect().right,
            );
            reorderTab(root, over === -1 ? items.length - 1 : over);
        };
        const up = () => {
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mouseup", up);
            setDragging(null);
        };
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
    };

    return (
        <nav
            className={`tabs_nav ${isHidden ? "tabs_hiddenNav" : ""} ${isMac ? "" : "tabs_navShifted"}`}
            data-tauri-drag-region={isMac ? true : undefined}
        >
            {tabs.length === 1 && isMac && (
                <div className="tabs_title" data-tauri-drag-region>
                    {titles[0]}
                </div>
            )}
            {tabs.length > 1 && (
                <>
                    <ul
                        ref={listReference}
                        className={`tabs_list ${isMac ? "tabs_listMac" : ""} ${isFullScreen && isMac ? "tabs_fullScreen" : ""}`}
                    >
                        {tabs.map((root, index) => {
                            const isActive = index === activeIndex;
                            const isFirst = index === 0;
                            const isActivity = !isActive && hasActivity(root);
                            return (
                                <li
                                    key={root}
                                    style={{ borderColor }}
                                    className={`tab_tab ${isFirst ? "tab_first" : ""} ${isActive ? "tab_active" : ""} ${
                                        isFirst && isActive ? "tab_firstActive" : ""
                                    } ${isActivity ? "tab_hasActivity" : ""} ${dragging === root ? "tab_dragging" : ""}`}
                                >
                                    <span
                                        className={`tab_text ${index === tabs.length - 1 ? "tab_textLast" : ""} ${isActive ? "tab_textActive" : ""}`}
                                        onMouseDown={(event) => startDrag(event, root)}
                                        onClick={(event) => {
                                            if (!isActive && event.button === 0) selectTab(root);
                                        }}
                                        onMouseUp={(event) => {
                                            if (event.button === 1) closeTab(root);
                                        }}
                                    >
                                        <span title={titles[index]} className="tab_textInner">
                                            {titles[index]}
                                        </span>
                                    </span>
                                    <i className="tab_icon" onClick={() => closeTab(root)}>
                                        <CloseTab />
                                    </i>
                                </li>
                            );
                        })}
                    </ul>
                    {isMac && (
                        <div
                            style={{ borderColor }}
                            className={`tabs_borderShim ${isFullScreen ? "tabs_borderShimUndo" : ""}`}
                        />
                    )}
                </>
            )}
            <NewTabButton tabsVisible={tabs.length > 1} onNewTab={onNewTab} />
            {tabs.length > 1 && (
                <div
                    className="tabs_filler"
                    style={{ borderColor }}
                    data-tauri-drag-region={isMac ? true : undefined}
                />
            )}
        </nav>
    );
};

const NewTabButton = ({
    tabsVisible,
    onNewTab,
}: {
    tabsVisible: boolean;
    onNewTab: (p?: string) => void;
}) => {
    const [open, setOpen] = useState(false);
    const reference = useRef<HTMLDivElement>(null);
    const profiles = useStore((s) => s.config.profiles);
    const defaultProfile = useStore((s) => s.config.defaultProfile);
    const borderColor = useStore((s) => s.config.borderColor);
    const backgroundColor = useStore((s) => s.config.backgroundColor);

    useEffect(() => {
        if (!open) return;
        const away = (event: MouseEvent) => {
            if (!reference.current?.contains(event.target as Node)) setOpen(false);
        };
        window.addEventListener("mousedown", away);
        return () => window.removeEventListener("mousedown", away);
    }, [open]);

    return (
        <div
            ref={reference}
            className={`new_tab ${tabsVisible ? "tabs_visible" : "tabs_hidden"}`}
            style={{ borderColor: tabsVisible ? borderColor : undefined }}
            onDoubleClick={(event) => event.stopPropagation()}
        >
            <div title="New Tab" className="new_tab_button" onClick={() => onNewTab()}>
                <Plus />
            </div>
            {profiles.length > 1 && (
                <div
                    title="New Tab with Profile"
                    className={`new_tab_button ${open ? "new_tab_buttonOpen" : ""}`}
                    onClick={() => setOpen(!open)}
                >
                    <ChevronDown />
                </div>
            )}
            {open && (
                <ul className="profile_dropdown" style={{ borderColor, backgroundColor }}>
                    {profiles.map((p) => (
                        <li
                            key={p.name}
                            style={{ borderBottomColor: borderColor }}
                            className={`profile_dropdown_item ${p.name === defaultProfile ? "profile_dropdown_item_default" : ""}`}
                            onClick={() => {
                                setOpen(false);
                                onNewTab(p.name);
                            }}
                        >
                            <span className="profile_dropdown_icon">{profileIcon(p)}</span>
                            {p.name}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
