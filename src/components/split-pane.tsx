import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";

import type { Direction } from "../store";

interface Properties {
    direction: Direction;
    sizes: number[] | null;
    borderColor: string;
    onResize: (sizes: number[]) => void;
    children: ReactNode[];
}

export const SplitPane = ({
    direction,
    sizes: given,
    borderColor,
    onResize,
    children,
}: Properties) => {
    const [dragging, setDragging] = useState(false);
    const cleanup = useRef<() => void>(undefined);
    const isHorizontal = direction === "horizontal";
    const sizes = given ?? Array.from({ length: children.length }, () => 1 / children.length);

    useEffect(() => () => cleanup.current?.(), []);

    const startDrag = (event: React.MouseEvent<HTMLDivElement>, index: number) => {
        event.preventDefault();
        const divider = event.currentTarget;
        const total =
            divider.parentElement!.getBoundingClientRect()[isHorizontal ? "height" : "width"];
        let last = isHorizontal ? event.clientY : event.clientX;
        let current = [...sizes];
        setDragging(true);
        const move = (moveEvent: MouseEvent) => {
            const pos = isHorizontal ? moveEvent.clientY : moveEvent.clientX;
            const d = (pos - last) / total;
            const next = [...current];
            next[index] += d;
            next[index + 1] -= d;
            if (next[index] < 0.05 || next[index + 1] < 0.05) return;
            last = pos;
            current = next;
            onResize(next);
        };
        const up = () => {
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mouseup", up);
            setDragging(false);
            cleanup.current = undefined;
        };
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
        cleanup.current = up;
    };

    /** Double-click a divider to split its two panes evenly. */
    const even = (event: React.MouseEvent, index: number) => {
        event.preventDefault();
        const next = [...sizes];
        const pair = next[index] + next[index + 1];
        next[index] = pair / 2;
        next[index + 1] = pair / 2;
        onResize(next);
    };

    const property = isHorizontal ? "height" : "width";
    return (
        <div className={`splitpane_panes splitpane_panes_${direction}`}>
            {children.map((child, index) => (
                <Fragment key={index}>
                    <div
                        className="splitpane_pane"
                        style={{
                            [property]: `${sizes[index] * 100}%`,
                            flexBasis: `${sizes[index] * 100}%`,
                            flexGrow: 0,
                        }}
                    >
                        {child}
                    </div>
                    {index < children.length - 1 && (
                        <div
                            onMouseDown={(event) => startDrag(event, index)}
                            onDoubleClick={(event) => even(event, index)}
                            style={{ backgroundColor: borderColor }}
                            className={`splitpane_divider splitpane_divider_${direction}`}
                        />
                    )}
                </Fragment>
            ))}
            <div
                style={{
                    display: dragging ? "block" : "none",
                    cursor: isHorizontal ? "row-resize" : "col-resize",
                }}
                className="splitpane_shim"
            />
        </div>
    );
};
