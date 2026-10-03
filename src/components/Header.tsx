import { getCurrentWindow } from "@tauri-apps/api/window";
import { newTab } from "../actions";
import { isMac } from "../config/keymaps";
import { runCommand } from "../commands";
import { popupHamburger, popupTitleMenu } from "../menu";
import { useStore } from "../store";
import { Close, Hamburger, Maximize, Minimize, Restore } from "./icons";
import { Tabs } from "./Tabs";

export function useTabTitles() {
    const tabs = useStore((s) => s.tabs);
    const activeSessions = useStore((s) => s.activeSessions);
    const sessions = useStore((s) => s.sessions);
    return tabs.map((root) => {
        const session = sessions[activeSessions[root]];
        const shell = session?.shell?.split(/[\\/]/).pop() ?? "";
        return session?.title || shell || "Shell";
    });
}

export function Header() {
    const tabs = useStore((s) => s.tabs);
    const activeRoot = useStore((s) => s.activeRoot);
    const borderColor = useStore((s) => s.config.borderColor);
    const showHamburgerMenu = useStore((s) => s.config.showHamburgerMenu);
    const showWindowControls = useStore((s) => s.config.showWindowControls);
    const maximized = useStore((s) => s.maximized);
    const titles = useTabTitles();
    const activeIndex = activeRoot ? tabs.indexOf(activeRoot) : -1;
    const title = tabs.length === 1 ? titles[0] : "Vanitty";

    const hambMenu = isMac ? false : showHamburgerMenu === "" ? true : !!showHamburgerMenu;
    const winCtrls = isMac ? false : showWindowControls === "" ? true : showWindowControls;
    const left = winCtrls === "left";
    const win = getCurrentWindow();

    return (
        <header
            className={`header_header ${isMac ? "header_headerRounded" : ""}`}
            onContextMenu={(e) => {
                e.preventDefault();
                void popupTitleMenu(e.clientX, e.clientY);
            }}
        >
            {!isMac && (
                <div
                    className={`header_windowHeader ${tabs.length > 1 ? "header_windowHeaderWithBorder" : ""}`}
                    style={{ borderColor }}
                    data-tauri-drag-region
                >
                    {hambMenu && (
                        <div
                            className={`header_shape ${left ? "header_hamburgerMenuRight" : "header_hamburgerMenuLeft"}`}
                            onClick={(e) => {
                                const r = e.currentTarget.getBoundingClientRect();
                                void popupHamburger(r.left + 8, r.bottom);
                            }}
                        >
                            <Hamburger />
                        </div>
                    )}
                    <span className="header_appTitle" data-tauri-drag-region>
                        {title}
                    </span>
                    {winCtrls && (
                        <div
                            className={`header_windowControls ${left ? "header_windowControlsLeft" : ""}`}
                        >
                            <div
                                className={`header_shape ${left ? "header_minimizeWindowLeft" : ""}`}
                                onClick={() => void win.minimize()}
                            >
                                <Minimize />
                            </div>
                            <div
                                className={`header_shape ${left ? "header_maximizeWindowLeft" : ""}`}
                                onClick={() => void win.toggleMaximize()}
                            >
                                {maximized ? <Restore /> : <Maximize />}
                            </div>
                            <div
                                className={`header_shape header_closeWindow ${left ? "header_closeWindowLeft" : ""}`}
                                onClick={() => void win.close()}
                            >
                                <Close />
                            </div>
                        </div>
                    )}
                </div>
            )}
            <Tabs titles={titles} activeIndex={activeIndex} onNewTab={(p) => void newTab(p)} />
            <HeaderItems right={isMac ? 12 : winCtrls && !left ? 132 : 12} />
        </header>
    );
}

/** Title bar items that plugins add. */
function HeaderItems({ right }: { right: number }) {
    const items = useStore((s) => s.headerItems);
    const entries = Object.entries(items);
    if (!entries.length) return null;
    return (
        <div className="header_pluginItems" style={{ right }}>
            {entries.map(([id, item]) => (
                <span
                    key={id}
                    className={`header_pluginItem ${item.command ? "header_pluginItemClickable" : ""}`}
                    title={item.tooltip}
                    onClick={() => item.command && runCommand(item.command)}
                >
                    {item.text}
                </span>
            ))}
        </div>
    );
}
