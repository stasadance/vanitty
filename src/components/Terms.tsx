import { useEffect, useRef } from "react";
import { profileConfig, resizeGroup, setActiveSession, setSearch } from "../actions";
import { isMac, uiScale } from "../config/keymaps";
import { popupContextMenu } from "../menu";
import { terms } from "../terms/registry";
import { useStore } from "../store";
import { SearchBox } from "./SearchBox";
import { SplitPane } from "./SplitPane";

export function Terms() {
    const tabs = useStore((s) => s.tabs);
    const activeRoot = useStore((s) => s.activeRoot);
    // Linux and Windows draw a title bar row, plus a tab row once there are tabs.
    const shifted = !isMac && tabs.length > 1;
    const top = (isMac ? 34 : shifted ? 68 : 34) * uiScale;
    return (
        <div
            className={`terms_terms ${shifted ? "terms_termsShifted" : "terms_termsNotShifted"}`}
            style={{ marginTop: top }}
        >
            {tabs.map((root) => (
                <div
                    key={root}
                    className={`terms_termGroup ${root === activeRoot ? "terms_termGroupActive" : ""}`}
                >
                    <GroupView uid={root} />
                </div>
            ))}
        </div>
    );
}

function GroupView({ uid }: { uid: string }) {
    const group = useStore((s) => s.groups[uid]);
    const borderColor = useStore((s) => s.config.borderColor);
    if (!group) return null;
    if (group.sessionUid) return <TermView sessionUid={group.sessionUid} />;
    return (
        <SplitPane
            direction={group.direction!}
            sizes={group.sizes}
            borderColor={borderColor}
            onResize={(sizes) => resizeGroup(uid, sizes)}
        >
            {group.children.map((c) => (
                <GroupView key={c} uid={c} />
            ))}
        </SplitPane>
    );
}

function TermView({ sessionUid }: { sessionUid: string }) {
    const wrapper = useRef<HTMLDivElement>(null);
    const session = useStore((s) => s.sessions[sessionUid]);
    const isActive = useStore(
        (s) => !!s.activeRoot && s.activeSessions[s.activeRoot] === sessionUid,
    );
    const config = useStore((s) => s.config);

    useEffect(() => {
        const el = wrapper.current;
        const term = terms.get(sessionUid);
        if (!el || !term) return;
        term.attach(el);
        const observer = new ResizeObserver(() => term.scheduleFit());
        observer.observe(el);
        return () => observer.disconnect();
    }, [sessionUid]);

    if (!session) return null;
    const c = profileConfig(config, session.profile);
    const term = terms.get(sessionUid);

    return (
        <div
            className={`term_fit ${isActive ? "term_active" : ""}`}
            onMouseDown={() => setActiveSession(sessionUid)}
            onContextMenu={(e) => {
                e.preventDefault();
                if (!c.quickEdit) void popupContextMenu(e.clientX, e.clientY);
            }}
        >
            <div ref={wrapper} className="term_fit term_wrapper" />
            {session.search && term && (
                <SearchBox
                    results={session.searchResults}
                    find={(t, flags, back) => term.searchFind(t, flags, back)}
                    close={() => setSearch(sessionUid, false)}
                    colors={{
                        foreground: c.foregroundColor,
                        background: c.backgroundColor,
                        border: c.borderColor,
                        selection: c.selectionColor,
                    }}
                    font={c.uiFontFamily}
                />
            )}
        </div>
    );
}
