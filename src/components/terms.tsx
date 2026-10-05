import { useEffect, useRef } from "react";

import { SearchBox } from "./search-box";
import { SplitPane } from "./split-pane";

import { profileConfig, resizeGroup, setActiveSession, setSearch } from "../actions";
import { isMac, uiScale } from "../config/keymaps";
import { popupContextMenu } from "../menu";
import { useStore } from "../store";
import { terms } from "../terms/registry";

export const Terms = () => {
    const tabs = useStore((s) => s.tabs);
    const activeRoot = useStore((s) => s.activeRoot);
    // Linux and Windows draw a title bar row above the tab row.
    const top = (isMac ? 34 : 68) * uiScale;
    return (
        <div className="terms_terms" style={{ marginTop: top }}>
            {/* Stable order, not tab order: dragging tabs must not move a
                terminal in the DOM, which can leave its WebGL canvas blank. */}
            {[...tabs]
                .sort((a, b) => a.localeCompare(b))
                .map((root) => (
                    <div
                        key={root}
                        className={`terms_termGroup ${root === activeRoot ? "terms_termGroupActive" : ""}`}
                    >
                        <GroupView uid={root} />
                    </div>
                ))}
        </div>
    );
};

const GroupView = ({ uid }: { uid: string }) => {
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
};

const TermView = ({ sessionUid }: { sessionUid: string }) => {
    const wrapper = useRef<HTMLDivElement>(null);
    const session = useStore((s) => s.sessions[sessionUid]);
    const isActive = useStore(
        (s) => !!s.activeRoot && s.activeSessions[s.activeRoot] === sessionUid,
    );
    const config = useStore((s) => s.config);

    useEffect(() => {
        const element = wrapper.current;
        const term = terms.get(sessionUid);
        if (!element || !term) return;
        term.attach(element);
        const observer = new ResizeObserver(() => term.scheduleFit());
        observer.observe(element);
        return () => observer.disconnect();
    }, [sessionUid]);

    if (!session) return null;
    const c = profileConfig(config, session.profile);
    const term = terms.get(sessionUid);

    return (
        <div
            className={`term_fit ${isActive ? "term_active" : ""}`}
            onMouseDown={() => setActiveSession(sessionUid)}
            onContextMenu={(event) => {
                event.preventDefault();
                if (!c.quickEdit) void popupContextMenu(event.clientX, event.clientY);
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
};
