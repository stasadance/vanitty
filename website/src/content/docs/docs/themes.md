---
title: Themes
description: Use Hyper themes from npm.
---

Add Hyper theme packages from npm to `settings.json`. They're applied in order, and you can pin a version:

```jsonc
"themes": ["hyper-snazzy"]
// or "hyper-dracula@2"
```

Vanitty downloads them into the `themes/` folder of your config directory. Each theme's `decorateConfig` runs in a Web Worker with no DOM, network or IPC access. Theme CSS works because Vanitty uses Hyper's class names.

For one-off tweaks, set colors directly or add CSS:

```jsonc
"backgroundColor": "rgba(9, 8, 11, 0.9)",
"colors": { "magenta": "#f81ce5" },
"css": ".tabs_nav { font-weight: 600; }",
"termCSS": ""
```
