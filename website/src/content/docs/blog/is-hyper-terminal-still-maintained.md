---
title: Is Hyper terminal still maintained?
description: "Hyper's last stable release was 3.4.1 in January 2023. Here's where the project stands, and what to use instead if you want a maintained Hyper."
head:
    - tag: title
      content: "Is Hyper terminal still maintained? Status and alternatives"
---

Short answer: not actively. [Hyper](https://github.com/vercel/hyper) is still on GitHub and still installs, but it hasn't had a release in a long time.

## The release history

- **3.4.1**, the last stable release, came out on January 7, 2023.
- **4.0.0-canary.5**, the last test build, came out in July 2023. Hyper 4 never got a stable release.

Since then, issues have kept coming in while releases stopped. Two of its most-upvoted open issues are users asking the same thing: [Is Hyper still developed?](https://github.com/vercel/hyper/issues/8043) and [Is Hyper dead?](https://github.com/vercel/hyper/issues/8070)

## What that means for you

If you use Hyper today, you're on a version from 2023, with the Electron and Chromium it shipped with then.

- New bugs stay unfixed. For example, [slow tab changes and focus on macOS 26](https://github.com/vercel/hyper/issues/8103), reported in October 2025, is still open.
- Long-standing requests won't land, like [dragging tabs to reorder them](https://github.com/vercel/hyper/issues/39), its most-upvoted issue.
- Electron security fixes don't reach you, since Hyper bundles its own copy of Chromium.

## What to use instead

If you want to keep Hyper's look, config and themes, try [Vanitty](/). It's a free, open-source rewrite of Hyper with Rust and Tauri instead of Electron. It imports your `.hyper.js` or `hyper.json` on first run and still runs Hyper themes from npm.

Read more in [A Hyper terminal alternative that's still maintained](/blog/hyper-terminal-alternative/), or go straight to [How to move from Hyper to Vanitty](/blog/migrate-from-hyper/).
