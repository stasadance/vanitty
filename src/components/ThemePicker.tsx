import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { focusActive } from "../actions";
import { saveThemes } from "../config/load";
import { themeName } from "../themes";
import { notify, setState, useStore } from "../store";

interface Listing {
    name: string;
    description: string;
    downloads: number;
}

/** The first entry: no theme, Vanitty's own look. */
const DEFAULT: Listing = { name: "", description: "Vanitty's built-in look", downloads: 0 };

function close() {
    setState({ themePicker: false });
    focusActive();
}

function shortCount(n: number) {
    return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}

/** Lists Hyper themes from npm, most downloaded first; picking one saves it. */
export function ThemePicker() {
    const config = useStore((s) => s.config);
    const [themes, setThemes] = useState<Listing[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState(0);
    const list = useRef<HTMLUListElement>(null);

    useEffect(() => {
        invoke<Listing[]>("themes_list")
            .then(setThemes)
            .catch((e) => setError(`Couldn't load themes from npm: ${e}`));
    }, []);

    useEffect(() => {
        list.current?.children[selected]?.scrollIntoView({ block: "nearest" });
    }, [selected]);

    const current = new Set(config.themes.map(themeName));
    const q = query.trim().toLowerCase();
    const items = [DEFAULT, ...(themes ?? [])].filter(
        (t) =>
            !q ||
            (t === DEFAULT ? "default" : t.name).toLowerCase().includes(q) ||
            t.description.toLowerCase().includes(q),
    );

    const pick = (t: Listing) => {
        close();
        saveThemes(t.name ? [t.name] : []).catch((e) => notify(String(e), true));
    };

    return (
        <div className="theme_picker_backdrop" onMouseDown={close}>
            <div
                className="theme_picker"
                style={{
                    backgroundColor: config.backgroundColor,
                    color: config.foregroundColor,
                    borderColor: config.borderColor,
                }}
                onMouseDown={(e) => e.stopPropagation()}
            >
                <input
                    autoFocus
                    className="theme_picker_input"
                    style={{ borderColor: config.borderColor }}
                    placeholder="Search Hyper themes on npm"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setSelected(0);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                            e.preventDefault();
                            const step = e.key === "ArrowDown" ? 1 : -1;
                            setSelected((i) => Math.max(0, Math.min(items.length - 1, i + step)));
                        } else if (e.key === "Enter") {
                            e.preventDefault();
                            if (items[selected]) pick(items[selected]);
                        } else if (e.key === "Escape") {
                            e.preventDefault();
                            e.stopPropagation();
                            close();
                        }
                    }}
                />
                <ul ref={list} className="theme_picker_list">
                    {items.map((t, i) => {
                        const active = t === DEFAULT ? current.size === 0 : current.has(t.name);
                        return (
                            <li
                                key={t.name || "default"}
                                className="theme_picker_item"
                                style={{
                                    backgroundColor:
                                        i === selected ? config.selectionColor : undefined,
                                }}
                                onMouseMove={() => setSelected(i)}
                                onClick={() => pick(t)}
                            >
                                <span className="theme_picker_name">
                                    {t === DEFAULT ? "Default" : t.name}
                                    {active && (
                                        <span className="theme_picker_current"> current</span>
                                    )}
                                </span>
                                {t.downloads > 0 && (
                                    <span className="theme_picker_downloads">
                                        {shortCount(t.downloads)}/mo
                                    </span>
                                )}
                                <span className="theme_picker_description">{t.description}</span>
                            </li>
                        );
                    })}
                </ul>
                {(error || !themes) && (
                    <div className="theme_picker_status">{error ?? "Loading themes…"}</div>
                )}
            </div>
        </div>
    );
}
