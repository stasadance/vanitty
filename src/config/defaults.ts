export type CursorShape = "BLOCK" | "BEAM" | "UNDERLINE";

export interface Colors {
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  lightBlack: string;
  lightRed: string;
  lightGreen: string;
  lightYellow: string;
  lightBlue: string;
  lightMagenta: string;
  lightCyan: string;
  lightWhite: string;
  [extra: string]: string;
}

export interface Profile {
  name: string;
  config: Partial<TermConfig>;
}

/** Options that a profile may override per session. */
export interface TermConfig {
  fontSize: number;
  fontFamily: string;
  uiFontFamily: string;
  fontWeight: string | number;
  fontWeightBold: string | number;
  lineHeight: number;
  letterSpacing: number;
  scrollback: number;
  cursorColor: string;
  cursorAccentColor: string;
  cursorShape: CursorShape;
  cursorBlink: boolean;
  foregroundColor: string;
  backgroundColor: string;
  selectionColor: string;
  borderColor: string;
  padding: string;
  colors: Colors;
  shell: string;
  shellArgs: string[];
  env: Record<string, string>;
  workingDirectory: string;
  bell: "SOUND" | false;
  bellSound: string | null;
  bellSoundURL: string | null;
  copyOnSelect: boolean;
  quickEdit: boolean;
  macOptionSelectionMode: "vertical" | "force";
  webGLRenderer: boolean;
  disableLigatures: boolean;
  webLinksActivationKey: "" | "ctrl" | "alt" | "meta" | "shift";
  screenReaderMode: boolean;
  imageSupport: boolean;
  modifierKeys: { altIsMeta: boolean; cmdIsMeta: boolean };
}

export interface Config extends TermConfig {
  css: string;
  termCSS: string;
  showHamburgerMenu: boolean | "";
  showWindowControls: boolean | "left" | "";
  borderRadius: number;
  preserveCWD: boolean;
  restoreSession: boolean;
  defaultProfile: string;
  profiles: Profile[];
  /** Hyper theme packages from npm, applied in order. */
  themes: string[];
  /** Vanitty plugins from npm. */
  plugins: string[];
  /** Plugin folders in `plugins/local`. */
  localPlugins: string[];
}

export const DEFAULT_COLORS: Colors = {
  black: "#000000",
  red: "#C51E14",
  green: "#1DC121",
  yellow: "#C7C329",
  blue: "#0A2FC4",
  magenta: "#C839C5",
  cyan: "#20C5C6",
  white: "#C7C7C7",
  lightBlack: "#686868",
  lightRed: "#FD6F6B",
  lightGreen: "#67F86F",
  lightYellow: "#FFFA72",
  lightBlue: "#6A76FB",
  lightMagenta: "#FD7CFC",
  lightCyan: "#68FDFE",
  lightWhite: "#FFFFFF",
  limeGreen: "#32CD32",
  lightCoral: "#F08080",
};

/**
 * Hyper's stock theme and defaults, so an imported Hyper config looks the
 * same here. Vanitty differs in font (bundled FiraCode Nerd Font Mono with
 * ligatures, 13px), blinking cursor, no bell, quick edit and WebGL.
 */
export const DEFAULT_CONFIG: Config = {
  fontSize: 13,
  fontFamily: '"FiraCode Nerd Font Mono", Menlo, "DejaVu Sans Mono", Consolas, "Lucida Console", monospace',
  uiFontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
  fontWeight: "normal",
  fontWeightBold: "bold",
  lineHeight: 1,
  letterSpacing: 0,
  scrollback: 1000,
  cursorColor: "rgba(248,28,229,0.8)",
  cursorAccentColor: "#000",
  cursorShape: "BLOCK",
  cursorBlink: true,
  foregroundColor: "#fff",
  backgroundColor: "#000",
  selectionColor: "rgba(248,28,229,0.3)",
  borderColor: "#333",
  css: "",
  termCSS: "",
  workingDirectory: "",
  showHamburgerMenu: "",
  showWindowControls: "",
  borderRadius: 10,
  padding: "12px 14px",
  colors: DEFAULT_COLORS,
  shell: "",
  shellArgs: ["--login"],
  env: {},
  bell: false,
  bellSound: null,
  bellSoundURL: null,
  copyOnSelect: false,
  quickEdit: true,
  macOptionSelectionMode: "vertical",
  webGLRenderer: true,
  webLinksActivationKey: "",
  screenReaderMode: false,
  imageSupport: true,
  disableLigatures: false,
  modifierKeys: { altIsMeta: false, cmdIsMeta: false },
  preserveCWD: true,
  restoreSession: true,
  defaultProfile: "default",
  profiles: [{ name: "default", config: {} }],
  themes: [],
  plugins: [],
  localPlugins: [],
};

/** What a fresh settings.json looks like. */
export const SETTINGS_TEMPLATE = `{
  "$schema": "./settings.schema.json",
  // Every option is listed with its description in settings.schema.json, so
  // editors like VS Code autocomplete and validate this file.
  // Changes apply as soon as you save.

  "fontSize": 13,
  "fontFamily": "\\"FiraCode Nerd Font Mono\\", Menlo, \\"DejaVu Sans Mono\\", Consolas, monospace",
  "cursorShape": "BLOCK",
  "padding": "12px 14px",

  // Hyper themes from npm, for example "hyper-snazzy".
  "themes": []
}
`;

export const KEYBINDINGS_TEMPLATE = `// Keybindings, VS Code style. Each entry binds "key" to "command".
// Prefix a command with "-" to remove its default binding, e.g.
//   { "key": "ctrl+shift+t", "command": "-tab:new" }
// Run "Show Default Keybindings" from the menu to see every command.
[
]
`;
