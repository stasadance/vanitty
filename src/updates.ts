import { invoke } from "@tauri-apps/api/core";
import { getState, notify } from "./store";

const FIRST_CHECK = 10_000;
const CHECK_EVERY = 6 * 60 * 60 * 1000;

let shown = false;

async function check() {
  if (shown || getState().config.disableAutoUpdates) return;
  // Offline or rate limited: try again on the next round, without a notice.
  const version = await invoke<string | null>("update_check").catch(() => null);
  if (!version || shown) return;
  shown = true;
  notify(`Vanitty ${version} is ready.`, false, {
    label: "Restart to update",
    run: () => void invoke("update_install").catch((e) => notify(`Update failed: ${e}`, true)),
  });
}

/** Checks for updates in the background and offers a restart when one is downloaded. */
export function startUpdateChecks() {
  setTimeout(() => void check(), FIRST_CHECK);
  setInterval(() => void check(), CHECK_EVERY);
}
