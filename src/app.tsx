import { useEffect } from "react";

import { getCurrentWindow } from "@tauri-apps/api/window";

import { boot } from "./boot";
import { Header, useTabTitles } from "./components/header";
import { LayoutPicker } from "./components/layout-picker";
import { Notifications } from "./components/notifications";
import { SshPrompt } from "./components/ssh-prompt";
import { Terms } from "./components/terms";
import { ThemePicker } from "./components/theme-picker";
import { isMac, uiScale } from "./config/keymaps";
import { useStore } from "./store";

export const App = () => {
    const config = useStore((s) => s.config);
    const isMaximized = useStore((s) => s.maximized);
    const isFullScreen = useStore((s) => s.fullScreen);
    const activeRoot = useStore((s) => s.activeRoot);
    const tabs = useStore((s) => s.tabs);
    const isThemePicker = useStore((s) => s.themePicker);
    const layoutPicker = useStore((s) => s.layoutPicker);
    const titles = useTabTitles();
    const title = activeRoot ? titles[tabs.indexOf(activeRoot)] : undefined;

    useEffect(() => {
        void boot();
    }, []);

    useEffect(() => {
        if (title) void getCurrentWindow().setTitle(title);
    }, [title]);

    const isRounded = !isMac && !isMaximized && !isFullScreen && config.borderRadius > 0;

    return (
        <div id="hyper">
            <div
                className={`hyper_main ${isRounded ? "hyper_mainRounded" : ""} ${isFullScreen ? "fullScreen" : ""}`}
                style={
                    {
                        fontFamily: config.uiFontFamily,
                        borderColor: config.borderColor,
                        backgroundColor: config.backgroundColor,
                        // macOS draws its own window outline.
                        borderWidth: isMac || isMaximized || isFullScreen ? 0 : 1,
                        "--vanitty-radius": `${config.borderRadius * uiScale}px`,
                        "--ui-scale": uiScale,
                    } as React.CSSProperties
                }
            >
                <Header />
                <Terms />
                <Notifications />
                {isThemePicker && <ThemePicker />}
                {layoutPicker && <LayoutPicker key={layoutPicker} mode={layoutPicker} />}
                <SshPrompt />
            </div>
            <style>{`#hyper {\n${config.css ?? ""}\n}\n#hyper .term_term {\n${config.termCSS ?? ""}\n}`}</style>
        </div>
    );
};
