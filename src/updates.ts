import { invoke } from "@tauri-apps/api/core";

import { orElse } from "./helpers";
import { saveNow } from "./persist";
import { getState, notify } from "./store";

const FIRST_CHECK = 10_000;
const CHECK_EVERY = 6 * 60 * 60 * 1000;

/** Checks for updates in the background and offers a restart once one is downloaded. */
export function startUpdateChecks() {
    let isOffered = false;
    const check = async () => {
        if (isOffered || getState().config.disableAutoUpdates) return;
        // Offline or rate limited: try again on the next round, without a notice.
        const version = await orElse(invoke<string | null>("update_check"), null);
        if (!version || isOffered) return;
        isOffered = true;
        notify(`Vanitty ${version} is ready.`, false, {
            label: "Restart to update",
            run: async () => {
                // Save this window first so the restart reopens it as it is now.
                await saveNow();
                try {
                    await invoke("update_install");
                } catch (error) {
                    notify(`Update failed: ${error}`, true);
                }
            },
        });
    };
    setTimeout(() => void check(), FIRST_CHECK);
    setInterval(() => void check(), CHECK_EVERY);
}
