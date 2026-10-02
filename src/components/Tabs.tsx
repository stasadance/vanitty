import { useEffect, useRef, useState } from "react";
import { closeTab, selectTab } from "../actions";
import { isMac } from "../config/keymaps";
import { getState, useStore } from "../store";
import { ChevronDown, CloseTab } from "./icons";

interface Props {
  titles: string[];
  activeIndex: number;
  onNewTab: (profile?: string) => void;
}

export function Tabs({ titles, activeIndex, onNewTab }: Props) {
  const tabs = useStore((s) => s.tabs);
  const sessions = useStore((s) => s.sessions);
  const groups = useStore((s) => s.groups);
  const borderColor = useStore((s) => s.config.borderColor);
  const fullScreen = useStore((s) => s.fullScreen);
  const hide = !isMac && tabs.length === 1;

  const hasActivity = (root: string) => {
    const walk = (uid: string): boolean => {
      const g = groups[uid];
      if (!g) return false;
      if (g.sessionUid) return !!sessions[g.sessionUid]?.hasActivity;
      return g.children.some(walk);
    };
    return walk(root);
  };

  return (
    <nav
      className={`tabs_nav ${hide ? "tabs_hiddenNav" : ""} ${isMac ? "" : "tabs_navShifted"}`}
      data-tauri-drag-region={isMac ? true : undefined}
    >
      {tabs.length === 1 && isMac && (
        <div className="tabs_title" data-tauri-drag-region>
          {titles[0]}
        </div>
      )}
      {tabs.length > 1 && (
        <>
          <ul className={`tabs_list ${isMac ? "tabs_listMac" : ""} ${fullScreen && isMac ? "tabs_fullScreen" : ""}`}>
            {tabs.map((root, i) => {
              const isActive = i === activeIndex;
              const isFirst = i === 0;
              const activity = !isActive && hasActivity(root);
              return (
                <li
                  key={root}
                  style={{ borderColor }}
                  className={`tab_tab ${isFirst ? "tab_first" : ""} ${isActive ? "tab_active" : ""} ${
                    isFirst && isActive ? "tab_firstActive" : ""
                  } ${activity ? "tab_hasActivity" : ""}`}
                >
                  <span
                    className={`tab_text ${i === tabs.length - 1 ? "tab_textLast" : ""} ${isActive ? "tab_textActive" : ""}`}
                    onClick={(e) => {
                      if (e.button === 0 && !isActive) selectTab(root);
                    }}
                    onMouseUp={(e) => {
                      if (e.button === 1) closeTab(root);
                    }}
                  >
                    <span title={titles[i]} className="tab_textInner">
                      {titles[i]}
                    </span>
                  </span>
                  <i className="tab_icon" onClick={() => closeTab(root)}>
                    <CloseTab />
                  </i>
                </li>
              );
            })}
          </ul>
          {isMac && <div style={{ borderColor }} className={`tabs_borderShim ${fullScreen ? "tabs_borderShimUndo" : ""}`} />}
        </>
      )}
      <NewTabButton tabsVisible={tabs.length > 1} onNewTab={onNewTab} />
    </nav>
  );
}

function NewTabButton({ tabsVisible, onNewTab }: { tabsVisible: boolean; onNewTab: (p?: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const profiles = useStore((s) => s.config.profiles);
  const defaultProfile = useStore((s) => s.config.defaultProfile);
  const borderColor = useStore((s) => s.config.borderColor);
  const backgroundColor = useStore((s) => s.config.backgroundColor);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", away);
    return () => window.removeEventListener("mousedown", away);
  }, [open]);

  return (
    <div
      ref={ref}
      title="New Tab"
      className={`new_tab ${tabsVisible ? "tabs_visible" : "tabs_hidden"}`}
      style={{ borderColor: tabsVisible ? borderColor : undefined }}
      onClick={() => {
        if (getState().config.profiles.length > 1) setOpen(!open);
        else onNewTab();
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <ChevronDown />
      {open && (
        <ul className="profile_dropdown" style={{ borderColor, backgroundColor }}>
          {profiles.map((p) => (
            <li
              key={p.name}
              style={{ borderBottomColor: borderColor }}
              className={`profile_dropdown_item ${p.name === defaultProfile && profiles.length > 1 ? "profile_dropdown_item_default" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onNewTab(p.name);
              }}
            >
              {p.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
