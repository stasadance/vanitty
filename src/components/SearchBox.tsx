import { useEffect, useRef, useState } from "react";
import type { SearchFlags } from "../terms/session";
import { ArrowDown, ArrowUp, Close } from "./icons";

interface Props {
    results?: { resultIndex: number; resultCount: number };
    find: (term: string, flags: SearchFlags, backwards: boolean) => void;
    close: () => void;
    colors: { foreground: string; background: string; border: string; selection: string };
    font: string;
}

export function SearchBox({ results, find, close, colors, font }: Props) {
    const input = useRef<HTMLInputElement>(null);
    const [term, setTerm] = useState("");
    const [flags, setFlags] = useState<SearchFlags>({
        caseSensitive: false,
        wholeWord: false,
        regex: false,
    });

    useEffect(() => input.current?.focus(), []);

    const toggle = (key: keyof SearchFlags) => {
        const next = { ...flags, [key]: !flags[key] };
        setFlags(next);
        if (term) find(term, next, false);
    };

    const button = (key: keyof SearchFlags, label: string, title: string) => (
        <div
            className={`search-button ${flags[key] ? "search-button-active" : ""}`}
            title={title}
            style={{ backgroundColor: flags[key] ? colors.selection : undefined }}
            onClick={() => toggle(key)}
        >
            {label}
        </div>
    );

    return (
        <div
            className="search-container"
            style={{
                backgroundColor: colors.background,
                color: colors.foreground,
                borderColor: colors.border,
                fontFamily: font,
            }}
            onMouseDown={(e) => e.stopPropagation()}
        >
            <div className="search-box" style={{ borderColor: colors.border }}>
                <input
                    ref={input}
                    className="search-input"
                    type="text"
                    placeholder="Search"
                    value={term}
                    onChange={(e) => {
                        setTerm(e.target.value);
                        find(e.target.value, flags, false);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            find(term, flags, e.shiftKey);
                        } else if (e.key === "Escape") {
                            e.preventDefault();
                            close();
                        }
                    }}
                />
                {button("caseSensitive", "Aa", "Match Case")}
                {button("wholeWord", "ab", "Match Whole Word")}
                {button("regex", ".*", "Use Regular Expression")}
            </div>
            <span className="search-results">
                {results === undefined || !term
                    ? ""
                    : results.resultCount === 0
                      ? "No results"
                      : `${results.resultIndex + 1} of ${results.resultCount}`}
            </span>
            <div
                className="search-button"
                title="Previous Match"
                onClick={() => find(term, flags, true)}
            >
                <ArrowUp />
            </div>
            <div
                className="search-button"
                title="Next Match"
                onClick={() => find(term, flags, false)}
            >
                <ArrowDown />
            </div>
            <div className="search-button" title="Close" onClick={close}>
                <Close />
            </div>
        </div>
    );
}
