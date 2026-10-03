#!/usr/bin/env node
// Bumps the version to YY.MM.PATCH (PATCH resets each month) on a
// release/vX branch off origin/main, pushes it and opens a PR. Merging that PR
// runs the Release workflow, which tags the merge and publishes the release.
//
//   pnpm release

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
const read = (p) => readFileSync(p, "utf8");

if (execSync("git status --porcelain").toString().trim()) {
    console.error("Commit or stash your changes first.");
    process.exit(1);
}

run("git fetch origin main");
run("git switch --detach origin/main");

const pkg = JSON.parse(read("package.json"));
const now = new Date();
const yy = now.getUTCFullYear() % 100;
const mm = now.getUTCMonth() + 1;
const [curYY, curMM, curPatch] = pkg.version.split(".").map(Number);
const patch = curYY === yy && curMM === mm ? curPatch + 1 : 0;
const version = `${yy}.${mm}.${patch}`;

pkg.version = version;
writeFileSync("package.json", JSON.stringify(pkg, null, 4) + "\n");

const conf = JSON.parse(read("src-tauri/tauri.conf.json"));
conf.version = version;
writeFileSync("src-tauri/tauri.conf.json", JSON.stringify(conf, null, 4) + "\n");

writeFileSync(
    "src-tauri/Cargo.toml",
    read("src-tauri/Cargo.toml").replace(/^version = ".*"$/m, `version = "${version}"`),
);
writeFileSync(
    "src-tauri/Cargo.lock",
    read("src-tauri/Cargo.lock").replace(/(name = "vanitty"\nversion = )".*"/, `$1"${version}"`),
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
