#!/usr/bin/env node
// `pnpm release`: opens a PR bumping to the next YY.MM.PATCH (PATCH resets
// monthly). Merging it runs the Release workflow, which tags and publishes.

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const run = (command) => execSync(command, { stdio: "inherit" });

if (execSync("git status --porcelain").toString().trim()) {
    console.error("Commit or stash your changes first.");
    process.exit(1);
}

const read = (p) => readFileSync(p, "utf8");

run("git fetch origin main");
run("git switch --detach origin/main");

const manifest = JSON.parse(read("package.json"));
const now = new Date();
const yy = now.getUTCFullYear() % 100;
const mm = now.getUTCMonth() + 1;
const [currentYear, currentMonth, currentPatch] = manifest.version.split(".").map(Number);
const patch = currentYear === yy && currentMonth === mm ? currentPatch + 1 : 0;
const version = `${yy}.${mm}.${patch}`;

manifest.version = version;
writeFileSync("package.json", JSON.stringify(manifest, null, 4) + "\n");

const config = JSON.parse(read("src-tauri/tauri.conf.json"));
config.version = version;
writeFileSync("src-tauri/tauri.conf.json", JSON.stringify(config, null, 4) + "\n");

writeFileSync(
    "src-tauri/Cargo.toml",
    read("src-tauri/Cargo.toml").replace(/^version = ".*"$/m, () => `version = "${version}"`),
);
writeFileSync(
    "src-tauri/Cargo.lock",
    read("src-tauri/Cargo.lock").replace(
        /(name = "vanitty"\nversion = )".*"/,
        (_, prefix) => `${prefix}"${version}"`,
    ),
);

const branch = `release/v${version}`;
run(`git switch -c ${branch}`);
run("git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock");
run(`git commit -m "Release v${version}"`);
run(`git push -u origin ${branch}`);

const body = `Bumps the version to ${version}. Merging this releases v${version}.`;
// The "release" label keeps this PR out of the release notes (.github/release.yml).
try {
    run(`gh label create release --color ededed --description "Version bump PR" --force`);
    run(
        `gh pr create --base main --head ${branch} --title "Release v${version}" --body "${body}" --label release`,
    );
} catch {
    console.log(
        `\nOpen the PR: https://github.com/stasadance/vanitty/compare/main...${branch}?expand=1&labels=release`,
    );
}
