/**
 * Hyper themes reviewed for the theme picker. Each is pinned to the version
 * that was checked: it only sets colors, CSS and fonts, loads nothing from the
 * network and has no dependencies, so a later npm release can't change what
 * gets installed. Bump a version only after checking the new release.
 */
export const CURATED_THEMES: { spec: string; description: string }[] = [
    { spec: "hyper-snazzy@1.3.0", description: "Elegant theme with bright colors" },
    { spec: "hyper-dracula@0.2.2", description: "Dracula, the dark purple classic" },
    { spec: "verminal@1.5.1", description: "Translucent, with its own font settings" },
    { spec: "hyper-tokyo-night@1.0.6", description: "Tokyo Night from VS Code" },
    { spec: "hyper-rose-pine@3.0.2", description: "Rosé Pine" },
    { spec: "hyper-night-owl@1.1.0", description: "Night Owl from VS Code" },
    { spec: "nord-hyper@0.5.0", description: "Nord, arctic and bluish" },
    { spec: "hyper-one-dark@1.0.0", description: "Atom One Dark" },
    { spec: "hyper-one-light@1.1.5", description: "Atom One Light" },
    { spec: "hyper-solarized-dark@0.1.6", description: "Solarized Dark" },
    { spec: "hyper-solarized-light@0.1.2", description: "Solarized Light" },
    { spec: "hyper-gruvbox@1.0.0", description: "Gruvbox" },
    { spec: "hyper-gruvbox-material@1.1.36", description: "Gruvbox Material" },
    { spec: "hyper-everforest@1.0.3", description: "Everforest, soft greens" },
    { spec: "hyper-ayu-mirage@1.1.0", description: "Ayu Mirage" },
    { spec: "hyper-ayu-light@1.1.0", description: "Ayu Light" },
    { spec: "hyper-oceanic-next@0.0.2", description: "Oceanic Next" },
    { spec: "hyper-tomorrow-night@1.2.0", description: "Tomorrow Night" },
    { spec: "hyper-papercolor@1.1.1", description: "PaperColor, light" },
    { spec: "shades-of-purple-hyper@1.2.0", description: "Shades of Purple" },
    { spec: "hyper-vitesse@1.0.4", description: "Vitesse, with its own font settings" },
    { spec: "hyper-aura-theme@2.0.0", description: "Aura, dark purple" },
    { spec: "hyper-electron-highlighter@4.4.0", description: "Electron Highlighter" },
    { spec: "hyper-firefox-devtools@1.1.1", description: "Firefox DevTools colors" },
    { spec: "@sageveil/hyper@0.2.3", description: "Sageveil, muted greens" },
];
