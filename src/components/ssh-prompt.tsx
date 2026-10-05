import { focusActive, newTab } from "../actions";
import { setState, useStore } from "../store";

function close() {
    setState({ sshPrompt: null });
    focusActive();
}

/** Asks before an `ssh://` link from terminal output connects anywhere. */
export const SshPrompt = () => {
    const prompt = useStore((s) => s.sshPrompt);
    const config = useStore((s) => s.config);
    if (!prompt) return null;
    const { link, profile } = prompt;

    const connect = () => {
        setState({ sshPrompt: null });
        void newTab(profile, { shell: link.program, shellArgs: link.args });
    };

    return (
        <div className="ssh_prompt_backdrop" onMouseDown={close}>
            <div
                role="alertdialog"
                aria-labelledby="ssh_prompt_title"
                className="ssh_prompt"
                style={{
                    backgroundColor: config.backgroundColor,
                    color: config.foregroundColor,
                    borderColor: config.borderColor,
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                    if (event.key !== "Escape") return;
                    event.preventDefault();
                    event.stopPropagation();
                    close();
                }}
            >
                <div id="ssh_prompt_title" className="ssh_prompt_title">
                    Connect to {link.destination}
                    {link.port !== null && ` on port ${link.port}`}?
                </div>
                <div className="ssh_prompt_note">
                    This link came from terminal output. Only connect to servers you trust.
                </div>
                <code className="ssh_prompt_command" style={{ borderColor: config.borderColor }}>
                    ssh {link.args.join(" ")}
                </code>
                <div className="ssh_prompt_buttons">
                    <button
                        autoFocus
                        className="ssh_prompt_button"
                        style={{ borderColor: config.borderColor }}
                        onClick={close}
                    >
                        Cancel
                    </button>
                    <button
                        className="ssh_prompt_button"
                        style={{ borderColor: config.borderColor }}
                        onClick={connect}
                    >
                        Connect
                    </button>
                </div>
            </div>
        </div>
    );
};
