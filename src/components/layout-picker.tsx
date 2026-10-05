import { useEffect, useRef, useState } from "react";

import { Pencil, Trash } from "./icons";

import { focusActive } from "../actions";
import {
    countText,
    currentLayout,
    describe,
    homeFolder,
    type Layout,
    loadLayouts,
    openLayout,
    suggestedName,
    updateLayouts,
} from "../layouts";
import { isFresh } from "../persist";
import { dismiss, notify, sessionsIn, setState, useStore } from "../store";

function close() {
    setState({ layoutPicker: null });
    focusActive();
}

const failed = (error: unknown) => notify(String(error), true);

/** Names this window's tabs and splits and saves them. */
const SaveBox = ({ layouts }: { layouts: Layout[] }) => {
    const config = useStore((s) => s.config);
    const counts = useStore((s) =>
        countText(s.tabs.length, s.tabs.flatMap((t) => sessionsIn(s.groups, t)).length),
    );
    const [typed, setTyped] = useState<string>();
    const [suggested, setSuggested] = useState("");
    const name = typed ?? suggested;
    const input = useRef<HTMLInputElement>(null);

    useEffect(() => {
        void suggestedName().then(setSuggested);
    }, []);

    // Selected, so typing replaces the suggestion.
    useEffect(() => {
        if (suggested && input.current?.value === suggested) input.current.select();
    }, [suggested]);

    const trimmed = name.trim();
    const isTaken = layouts.some((l) => l.name === trimmed);

    const save = async () => {
        const layout = await currentLayout(trimmed);
        await updateLayouts((all) => {
            const index = all.findIndex((l) => l.name === trimmed);
            return index === -1
                ? [...all, layout]
                : all.map((l, at) => (at === index ? layout : l));
        });
        notify(`Saved layout “${trimmed}”.`);
    };

    return (
        <>
            <input
                ref={input}
                autoFocus
                className="theme_picker_input"
                style={{ borderColor: config.borderColor }}
                placeholder="Layout name"
                value={name}
                onChange={(event) => setTyped(event.target.value)}
                onKeyDown={(event) => {
                    if (trimmed && event.key === "Enter") {
                        event.preventDefault();
                        close();
                        void save().catch(failed);
                    } else if (event.key === "Escape") {
                        event.preventDefault();
                        event.stopPropagation();
                        close();
                    }
                }}
            />
            <div className="layout_picker_hint">
                {isTaken ? (
                    <span className="layout_picker_warning">
                        Enter replaces the saved layout “{trimmed}”.
                    </span>
                ) : (
                    `Saves ${counts}, with each pane's folder. Opening it starts fresh shells.`
                )}
            </div>
        </>
    );
};

/** Saved layouts to search, open, rename and delete. */
const OpenList = ({
    layouts,
    setLayouts,
}: {
    layouts: Layout[];
    setLayouts: (layouts: Layout[]) => void;
}) => {
    const config = useStore((s) => s.config);
    const isHere = useStore((s) => isFresh(s));
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState(0);
    const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null);
    const [home, setHome] = useState("");
    const search = useRef<HTMLInputElement>(null);
    const cancelRename = useRef(false);
    const list = useRef<HTMLUListElement>(null);

    useEffect(() => {
        void homeFolder()
            .then(setHome)
            .catch(() => {});
    }, []);

    useEffect(() => {
        list.current
            ?.querySelector(`[data-index="${CSS.escape(String(selected))}"]`)
            ?.scrollIntoView({ block: "nearest" });
    }, [selected]);

    const q = query.trim().toLowerCase();
    const items = layouts.filter((l) => !q || l.name.toLowerCase().includes(q));

    const pick = (layout: Layout) => {
        close();
        void openLayout(layout).catch(failed);
    };

    const remove = (layout: Layout) => {
        const index = layouts.indexOf(layout);
        void updateLayouts((all) => all.filter((l) => l.name !== layout.name))
            .then((left) => {
                setLayouts(left);
                setSelected((s) => Math.min(s, Math.max(0, left.length - 1)));
                const id = notify(`Deleted layout “${layout.name}”.`, false, {
                    label: "Undo",
                    run: () => {
                        dismiss(id);
                        void updateLayouts((all) =>
                            all.some((l) => l.name === layout.name)
                                ? all
                                : [...all.slice(0, index), layout, ...all.slice(index)],
                        )
                            .then(setLayouts)
                            .catch(failed);
                    },
                });
            })
            .catch(failed);
        search.current?.focus();
    };

    const rename = () => {
        if (!renaming || cancelRename.current) {
            cancelRename.current = false;
            return;
        }
        const { from, to } = renaming;
        const name = to.trim();
        setRenaming(null);
        search.current?.focus();
        if (!name || name === from) return;
        if (layouts.some((l) => l.name === name)) {
            notify(`There's already a layout named “${name}”.`, true);
            return;
        }
        void updateLayouts((all) => all.map((l) => (l.name === from ? { ...l, name } : l)))
            .then(setLayouts)
            .catch(failed);
    };

    let status = `Enter opens ${isHere ? "here" : "in a new window"} · Delete removes`;
    if (layouts.length === 0)
        status = "No saved layouts yet. Shell > Save Layout… saves this window's tabs and splits.";
    else if (items.length === 0) status = "No layouts match.";

    return (
        <>
            <input
                ref={search}
                autoFocus
                className="theme_picker_input"
                style={{ borderColor: config.borderColor }}
                placeholder="Search layouts"
                value={query}
                onChange={(event) => {
                    setQuery(event.target.value);
                    setSelected(0);
                }}
                onKeyDown={(event) => {
                    const target = event.currentTarget;
                    switch (event.key) {
                        case "ArrowDown":
                        case "ArrowUp": {
                            event.preventDefault();
                            const step = event.key === "ArrowDown" ? 1 : -1;
                            setSelected((index) =>
                                Math.max(0, Math.min(items.length - 1, index + step)),
                            );
                            break;
                        }
                        case "Enter": {
                            event.preventDefault();
                            if (selected < items.length) pick(items[selected]);
                            break;
                        }
                        case "Delete": {
                            // Only once there's nothing after the cursor left to delete.
                            if (target.selectionStart !== target.value.length) break;
                            event.preventDefault();
                            if (selected < items.length) remove(items[selected]);
                            break;
                        }
                        case "Escape": {
                            event.preventDefault();
                            event.stopPropagation();
                            close();
                            break;
                        }
                    }
                }}
            />
            <ul ref={list} className="theme_picker_list">
                {items.map((l, index) => (
                    <li key={l.name} className="theme_picker_row">
                        <div
                            data-index={index}
                            className={`theme_picker_item layout_picker_item ${index === selected ? "layout_picker_selected" : ""}`}
                            style={{
                                backgroundColor:
                                    index === selected ? config.selectionColor : undefined,
                            }}
                            onMouseMove={() => setSelected(index)}
                            onClick={() => renaming?.from !== l.name && pick(l)}
                        >
                            {renaming?.from === l.name ? (
                                <input
                                    autoFocus
                                    className="layout_picker_rename"
                                    style={{ borderColor: config.borderColor }}
                                    value={renaming.to}
                                    onFocus={(event) => event.currentTarget.select()}
                                    onClick={(event) => event.stopPropagation()}
                                    onChange={(event) =>
                                        setRenaming({ from: l.name, to: event.target.value })
                                    }
                                    onBlur={rename}
                                    onKeyDown={(event) => {
                                        event.stopPropagation();
                                        if (event.key === "Enter") {
                                            event.currentTarget.blur();
                                        } else if (event.key === "Escape") {
                                            cancelRename.current = true;
                                            setRenaming(null);
                                            search.current?.focus();
                                        }
                                    }}
                                />
                            ) : (
                                <span className="theme_picker_name">{l.name}</span>
                            )}
                            <span className="layout_picker_actions">
                                <button
                                    type="button"
                                    title="Rename"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        setRenaming({ from: l.name, to: l.name });
                                    }}
                                >
                                    <Pencil />
                                </button>
                                <button
                                    type="button"
                                    title="Delete"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        remove(l);
                                    }}
                                >
                                    <Trash />
                                </button>
                            </span>
                            <span className="theme_picker_description">{describe(l, home)}</span>
                        </div>
                    </li>
                ))}
            </ul>
            <div className="layout_picker_hint">{status}</div>
        </>
    );
};

export const LayoutPicker = ({ mode }: { mode: "save" | "open" }) => {
    const config = useStore((s) => s.config);
    const [layouts, setLayouts] = useState<Layout[] | null>(null);

    useEffect(() => {
        void loadLayouts().then(setLayouts);
    }, []);

    return (
        <div className="theme_picker_backdrop" onMouseDown={close}>
            <div
                className="theme_picker"
                style={{
                    backgroundColor: config.backgroundColor,
                    color: config.foregroundColor,
                    borderColor: config.borderColor,
                }}
                onMouseDown={(event) => event.stopPropagation()}
            >
                {mode === "save" ? (
                    <SaveBox layouts={layouts ?? []} />
                ) : (
                    layouts && <OpenList layouts={layouts} setLayouts={setLayouts} />
                )}
            </div>
        </div>
    );
};
