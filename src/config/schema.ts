import { DEFAULT_CONFIG } from "./defaults";

const color = { type: "string", format: "color" };
const str = (description: string) => ({ type: "string", description });
const num = (description: string) => ({ type: "number", description });
const bool = (description: string) => ({ type: "boolean", description });

const colorNames = Object.keys(DEFAULT_CONFIG.colors);

const termProperties = {
    fontSize: num("Font size in pixels."),
    fontFamily: str("Font family, with fallbacks."),
    uiFontFamily: str("Font family for tabs and other UI."),
    fontWeight: {
        type: ["string", "number"],
        description: "Font weight: normal, bold, or 100-900.",
    },
    fontWeightBold: { type: ["string", "number"], description: "Font weight for bold text." },
    lineHeight: num("Line height as a multiple of the font size."),
    letterSpacing: num("Extra space between letters, in pixels."),
    scrollback: {
        type: "integer",
        minimum: 0,
        description: "Lines kept in the scrollback buffer.",
    },
    cursorColor: { ...color, description: "Cursor color." },
    cursorAccentColor: { ...color, description: "Color of the text under a block cursor." },
    cursorShape: { enum: ["BLOCK", "BEAM", "UNDERLINE"], description: "Cursor shape." },
    cursorBlink: bool("Blink the cursor."),
    foregroundColor: { ...color, description: "Text color." },
    backgroundColor: {
        ...color,
        description: "Background color. Use an rgba() color for transparency.",
    },
    selectionColor: { ...color, description: "Selection color." },
    borderColor: { ...color, description: "Window border and divider color." },
    padding: str('CSS padding around the terminal, e.g. "12px 14px".'),
    colors: {
        type: "object",
        description: "The 16 ANSI colors.",
        properties: Object.fromEntries(colorNames.map((n) => [n, color])),
        additionalProperties: color,
    },
    shell: str("Shell to run. Empty uses $SHELL (or COMSPEC on Windows)."),
    shellArgs: {
        type: "array",
        items: { type: "string" },
        description: "Arguments passed to the shell.",
    },
    env: {
        type: "object",
        additionalProperties: { type: "string" },
        description: "Extra environment variables.",
    },
    workingDirectory: str("Directory new sessions start in. Empty uses your home directory."),
    bell: {
        enum: ["SOUND", false],
        description: '"SOUND" plays a sound on the terminal bell, false disables it.',
    },
    bellSoundURL: { type: ["string", "null"], description: "URL of a custom bell sound." },
    copyOnSelect: bool("Copy text to the clipboard when you select it."),
    quickEdit: bool("Right-click copies the selection, or pastes when nothing is selected."),
    macOptionSelectionMode: {
        enum: ["vertical", "force"],
        description: '"force" makes Option+click always select on macOS.',
    },
    webGLRenderer: bool("Render with WebGL. Turned off automatically for transparent backgrounds."),
    webLinksActivationKey: {
        enum: ["", "ctrl", "alt", "meta", "shift"],
        description: "Modifier needed to open links. Empty opens on click.",
    },
    disableLigatures: bool("Turn off font ligatures such as => and !=."),
    screenReaderMode: bool("Expose terminal content to screen readers."),
    imageSupport: bool("Show inline images (sixel and iTerm2 protocol)."),
    modifierKeys: {
        type: "object",
        properties: {
            altIsMeta: bool("Use Option as Meta on macOS."),
            cmdIsMeta: bool("Reserved for compatibility with Hyper."),
        },
    },
};

export const SETTINGS_SCHEMA = {
    $schema: "http://json-schema.org/draft-07/schema#",
    title: "Vanitty settings",
    type: "object",
    allowComments: true,
    allowTrailingCommas: true,
    properties: {
        $schema: { type: "string" },
        ...termProperties,
        css: str("Extra CSS for the window. Uses Hyper's class names, so Hyper snippets work."),
        termCSS: str("Extra CSS for the terminals."),
        showHamburgerMenu: {
            enum: ["", true, false],
            description: "Show the menu button (Linux and Windows). Empty uses the default.",
        },
        showWindowControls: {
            enum: ["", true, false, "left"],
            description: "Show window controls (Linux and Windows), optionally on the left.",
        },
        borderRadius: num(
            "Window corner radius in pixels (Linux and Windows; macOS uses the system corners).",
        ),
        preserveCWD: bool("Open new tabs and splits in the current directory."),
        disableAutoUpdates: bool("Stop downloading updates in the background."),
        restoreSession: bool(
            "Reopen your windows, tabs, splits, folders and terminal text on launch.",
        ),
        defaultProfile: str("Profile used for new tabs."),
        profiles: {
            type: "array",
            description:
                "Named profiles. Each overrides any terminal option, such as shell or colors.",
            items: {
                type: "object",
                required: ["name"],
                properties: {
                    name: { type: "string" },
                    config: { type: "object", properties: termProperties },
                },
            },
        },
        plugins: {
            type: "array",
            items: { type: "string" },
            description:
                "Vanitty plugins from npm. They run sandboxed, without network or file access.",
        },
        localPlugins: {
            type: "array",
            items: { type: "string" },
            description: "Plugin folders inside the plugins/local folder of your config directory.",
        },
        themes: {
            type: "array",
            items: { type: "string" },
            description:
                'Hyper themes from npm, e.g. "hyper-snazzy" or "hyper-dracula@2". Applied in order.',
        },
    },
};

export function keybindingsSchema(commands: string[]) {
    return {
        $schema: "http://json-schema.org/draft-07/schema#",
        title: "Vanitty keybindings",
        type: "array",
        allowComments: true,
        allowTrailingCommas: true,
        items: {
            type: "object",
            required: ["key", "command"],
            properties: {
                key: { type: "string", description: 'e.g. "ctrl+shift+t" or "command+t".' },
                command: {
                    anyOf: [
                        { enum: [...commands, ...commands.map((c) => `-${c}`)] },
                        { type: "string" },
                    ],
                },
            },
        },
    };
}
