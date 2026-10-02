import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import type { Direction } from "../store";

interface Props {
  direction: Direction;
  sizes: number[] | null;
  borderColor: string;
  onResize: (sizes: number[]) => void;
  children: ReactNode[];
}

export function SplitPane({ direction, sizes: given, borderColor, onResize, children }: Props) {
  const [dragging, setDragging] = useState(false);
  const cleanup = useRef<() => void>(undefined);
  const horizontal = direction === "horizontal";
  const sizes = given ?? new Array<number>(children.length).fill(1 / children.length);

  useEffect(() => () => cleanup.current?.(), []);

  const startDrag = (e: React.MouseEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    const divider = e.currentTarget;
    const total = divider.parentElement!.getBoundingClientRect()[horizontal ? "height" : "width"];
    let last = horizontal ? e.clientY : e.clientX;
    let current = [...sizes];
    setDragging(true);
    const move = (ev: MouseEvent) => {
      const pos = horizontal ? ev.clientY : ev.clientX;
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
  const even = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    const next = [...sizes];
    const pair = next[index] + next[index + 1];
    next[index] = pair / 2;
    next[index + 1] = pair / 2;
    onResize(next);
  };

  const prop = horizontal ? "height" : "width";
  return (
    <div className={`splitpane_panes splitpane_panes_${direction}`}>
      {children.map((child, i) => (
        <Fragment key={i}>
          <div className="splitpane_pane" style={{ [prop]: `${sizes[i] * 100}%`, flexBasis: `${sizes[i] * 100}%`, flexGrow: 0 }}>
            {child}
          </div>
          {i < children.length - 1 && (
            <div
              onMouseDown={(e) => startDrag(e, i)}
              onDoubleClick={(e) => even(e, i)}
              style={{ backgroundColor: borderColor }}
              className={`splitpane_divider splitpane_divider_${direction}`}
            />
          )}
        </Fragment>
      ))}
      <div style={{ display: dragging ? "block" : "none", cursor: horizontal ? "row-resize" : "col-resize" }} className="splitpane_shim" />
    </div>
  );
}
