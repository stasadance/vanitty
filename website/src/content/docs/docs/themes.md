---
title: Themes
description: Pick a theme, write your own, or use Hyper themes from npm.
---

Open **Settings > Change Theme…** (or right-click the title bar) to pick one. The list has three parts:

- **Vanitty themes**: built-in themes and your own. They're plain JSON, so nothing runs.
- **Hyper themes**: popular Hyper themes, reviewed and pinned to a checked version.
- **More on npm**: every other package tagged `hyper-theme`. These aren't reviewed.

Picking a theme saves it to `settings.json` and applies it right away.

## Vanitty themes

A Vanitty theme is a JSON file in the `themes/` folder of your config directory. Its file name, without `.json`, is what goes in `colorTheme`:

```jsonc
// themes/midnight.json
{
    "name": "Midnight",
    "backgroundColor": "#0b0e14",
    "foregroundColor": "#c7c7c7",
    "cursorColor": "#f81ce5",
    "selectionColor": "rgba(248, 28, 229, 0.3)",
    "borderColor": "#1c2028",
    "colors": { "red": "#ff5f56", "green": "#27c93f" },
    "css": "",
}
```

```jsonc
"colorTheme": "midnight"
```

A theme can set colors, `css`, `termCSS`, fonts, `padding` and the cursor shape. Anything else in the file is ignored.

## Hyper themes

Add Hyper theme packages from npm to `settings.json`. They're applied in order, and you can pin a version:

```jsonc
"themes": ["hyper-snazzy"]
// or "hyper-dracula@2"
```

Vanitty downloads them into the `themes/` folder of your config directory without running npm or install scripts. Each theme's `decorateConfig` runs in a Web Worker with no DOM, network or IPC access, and only the same look settings are taken from what it returns: a theme can't change your shell, its arguments, environment or plugins. Theme CSS works because Vanitty uses Hyper's class names.

## Tweaks

For one-off tweaks, set colors directly or add CSS:

```jsonc
"backgroundColor": "rgba(9, 8, 11, 0.9)",
"colors": { "magenta": "#f81ce5" },
"css": ".tabs_nav { font-weight: 600; }",
"termCSS": ""
```
