import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { boot } from "./boot";
import { Header, useTabTitles } from "./components/Header";
import { Notifications } from "./components/Notifications";
import { Terms } from "./components/Terms";
import { ThemePicker } from "./components/ThemePicker";
import { isMac, uiScale } from "./config/keymaps";
import { useStore } from "./store";

export default function App() {
    const config = useStore((s) => s.config);
    const maximized = useStore((s) => s.maximized);
    const fullScreen = useStore((s) => s.fullScreen);
    const activeRoot = useStore((s) => s.activeRoot);
    const tabs = useStore((s) => s.tabs);
    const themePicker = useStore((s) => s.themePicker);
    const titles = useTabTitles();
    const title = activeRoot ? titles[tabs.indexOf(activeRoot)] : undefined;

    useEffect(() => {
        void boot();
    }, []);

    useEffect(() => {
        if (title) void getCurrentWindow().setTitle(title);
    }, [title]);

    const rounded = !isMac && !maximized && !fullScreen && config.borderRadius > 0;

    return (
        <div id="hyper">
            <div
                className={`hyper_main ${rounded ? "hyper_mainRounded" : ""} ${fullScreen ? "fullScreen" : ""}`}
                style={
                    {
                        fontFamily: config.uiFontFamily,
                        borderColor: config.borderColor,
                        backgroundColor: config.backgroundColor,
                        borderWidth: maximized || fullScreen ? 0 : 1,
                        "--vanitty-radius": `${config.borderRadius * uiScale}px`,
                        "--ui-scale": uiScale,
                    } as React.CSSProperties
                }
            >
                <Header />
                <Terms />
                <Notifications />
                {themePicker && <ThemePicker />}
            </div>
            <style>{`#hyper {\n${config.css ?? ""}\n}\n#hyper .term_term {\n${config.termCSS ?? ""}\n}`}</style>
        </div>
    );
}
