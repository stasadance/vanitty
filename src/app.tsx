import { useEffect } from "react";

import { getCurrentWindow } from "@tauri-apps/api/window";

import { boot } from "./boot";
import { Header, useTabTitles } from "./components/header";
import { Notifications } from "./components/notifications";
import { Terms } from "./components/terms";
import { ThemePicker } from "./components/theme-picker";
import { isMac, uiScale } from "./config/keymaps";
import { useStore } from "./store";

export const App = () => {
    const config = useStore((s) => s.config);
    const isMaximized = useStore((s) => s.maximized);
    const isFullScreen = useStore((s) => s.fullScreen);
    const systemRadius = useStore((s) => s.systemRadius);
    const activeRoot = useStore((s) => s.activeRoot);
    const tabs = useStore((s) => s.tabs);
    const isThemePicker = useStore((s) => s.themePicker);
    const titles = useTabTitles();
    const title = activeRoot ? titles[tabs.indexOf(activeRoot)] : undefined;

    useEffect(() => {
        void boot();
    }, []);

    useEffect(() => {
        if (title) void getCurrentWindow().setTitle(title);
    }, [title]);

    // macOS clips the window to its own radius, so the border follows that.
    const radius = systemRadius ?? config.borderRadius * uiScale;
    // A zoomed macOS window keeps its rounded frame; elsewhere maximized is edge to edge.
    const isEdgeless = isFullScreen || (isMaximized && !isMac);
    const isRounded = !isEdgeless && radius > 0;

    return (
        <div id="hyper">
            <div
                className={`hyper_main ${isRounded ? "hyper_mainRounded" : ""} ${isFullScreen ? "fullScreen" : ""}`}
                style={
                    {
                        fontFamily: config.uiFontFamily,
                        borderColor: config.borderColor,
                        backgroundColor: config.backgroundColor,
                        borderWidth: isEdgeless ? 0 : 1,
                        "--vanitty-radius": `${radius}px`,
                        "--ui-scale": uiScale,
                    } as React.CSSProperties
                }
            >
                <Header />
                <Terms />
                <Notifications />
                {isThemePicker && <ThemePicker />}
            </div>
            <style>{`#hyper {\n${config.css ?? ""}\n}\n#hyper .term_term {\n${config.termCSS ?? ""}\n}`}</style>
        </div>
    );
};
