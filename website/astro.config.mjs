// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// Served from GitHub Pages at https://vanitty.dev
export default defineConfig({
    site: "https://vanitty.dev",
    integrations: [
        starlight({
            title: "Vanitty",
            description:
                "Free, open-source terminal emulator for Windows, macOS and Linux. A fast Rust + Tauri rewrite of Hyper without Electron.",
            logo: {
                dark: "./src/assets/logo-dark.svg",
                light: "./src/assets/logo-light.svg",
                replacesTitle: true,
            },
            favicon: "/favicon.svg",
            head: [
                {
                    tag: "meta",
                    attrs: { property: "og:image", content: "https://vanitty.dev/og.png" },
                },
                { tag: "meta", attrs: { property: "og:image:width", content: "1200" } },
                { tag: "meta", attrs: { property: "og:image:height", content: "630" } },
            ],
            social: [
                { icon: "github", label: "GitHub", href: "https://github.com/stasadance/vanitty" },
                { icon: "heart", label: "Sponsor", href: "https://github.com/sponsors/stasadance" },
            ],
            customCss: ["./src/styles/theme.css"],
            sidebar: [
                { label: "Getting started", items: ["docs", "docs/install"] },
                {
                    label: "Configuration",
                    items: ["docs/settings", "docs/keybindings", "docs/themes"],
                },
                { label: "Extending", items: ["docs/plugins"] },
                { label: "Contributing", items: ["docs/develop"] },
            ],
        }),
    ],
});
