import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { killPty, resizePty, spawnPty, writePty, type PtyId } from "../pty";
import { useSessions } from "../store/sessions";

export function Term({ sessionKey }: { sessionKey: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const setPty = useSessions((s) => s.setPty);
  const remove = useSessions((s) => s.remove);

  useEffect(() => {
    const el = ref.current!;
    const term = new Terminal({
      fontFamily: "Menlo, 'DejaVu Sans Mono', Consolas, monospace",
      fontSize: 13,
      cursorBlink: true,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } catch {
      // Falls back to the DOM renderer.
    }
    fit.fit();

    let disposed = false;
    let id: PtyId | undefined;
    spawnPty(
      term.cols,
      term.rows,
      (data) => term.write(data),
      () => remove(sessionKey),
    ).then((ptyId) => {
      if (disposed) return void killPty(ptyId);
      id = ptyId;
      setPty(sessionKey, ptyId);
    });

    const onData = term.onData((data) => {
      if (id !== undefined) writePty(id, data);
    });
    const onResize = term.onResize(({ cols, rows }) => {
      if (id !== undefined) resizePty(id, cols, rows);
    });
    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(el);
    term.focus();

    return () => {
      disposed = true;
      observer.disconnect();
      onData.dispose();
      onResize.dispose();
      if (id !== undefined) killPty(id);
      term.dispose();
    };
  }, [sessionKey, setPty, remove]);

  return <div ref={ref} className="term" />;
}
