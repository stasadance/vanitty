import type { Profile } from "./defaults";

/** Nerd Font glyphs from the bundled FiraCode Nerd Font, by name. */
const ICONS: Record<string, string> = {
    terminal: "\u{EA85}",
    bash: "\u{EBCA}",
    zsh: "\u{E6B9}",
    fish: "\u{EE41}",
    powershell: "\u{F0A0A}",
    cmd: "\u{EBC4}",
    "git-bash": "\u{EC71}",
    linux: "\u{EBC6}",
    ubuntu: "\u{EBC9}",
    debian: "\u{EBC5}",
    arch: "\u{F303}",
    fedora: "\u{F30A}",
    alpine: "\u{F300}",
    opensuse: "\u{F314}",
};

/** Tried in order against the profile name and shell. */
const MATCHES: [RegExp, string][] = [
    [/git bash/, "git-bash"],
    [/ubuntu/, "ubuntu"],
    [/debian/, "debian"],
    [/\barch/, "arch"],
    [/fedora/, "fedora"],
    [/alpine/, "alpine"],
    [/suse/, "opensuse"],
    [/wsl/, "linux"],
    [/pwsh|powershell/, "powershell"],
    [/\bcmd(\.exe)?$|command prompt/, "cmd"],
    [/zsh/, "zsh"],
    [/fish/, "fish"],
    [/bash/, "bash"],
];

/** The profile's `icon` (a name above or any glyph), else one guessed from its name and shell. */
export function profileIcon(profile: Profile): string {
    if (profile.icon) return ICONS[profile.icon] ?? profile.icon;
    const shell = profile.config?.shell?.split(/[\\/]/).pop() ?? "";
    const texts = [profile.name.toLowerCase(), shell.toLowerCase()];
    const match = MATCHES.find(([pattern]) => texts.some((text) => pattern.test(text)));
    return ICONS[match?.[1] ?? "terminal"];
}

export const PROFILE_ICON_NAMES = Object.keys(ICONS);
