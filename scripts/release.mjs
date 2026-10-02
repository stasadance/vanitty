#!/usr/bin/env node
// Bumps the version to YY.MM.PATCH (PATCH resets each month), commits, and
// tags it. Pushing the tag starts the release build in CI.
//
//   pnpm release          bump, commit, tag
//   pnpm release --push   ...and push the commit and tag

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
const read = (p) => readFileSync(p, "utf8");

if (execSync("git status --porcelain").toString().trim()) {
  console.error("Commit or stash your changes first.");
  process.exit(1);
}

const pkg = JSON.parse(read("package.json"));
const now = new Date();
const yy = now.getUTCFullYear() % 100;
const mm = now.getUTCMonth() + 1;
const [curYY, curMM, curPatch] = pkg.version.split(".").map(Number);
const patch = curYY === yy && curMM === mm ? curPatch + 1 : 0;
const version = `${yy}.${mm}.${patch}`;

pkg.version = version;
writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");

const conf = JSON.parse(read("src-tauri/tauri.conf.json"));
conf.version = version;
writeFileSync("src-tauri/tauri.conf.json", JSON.stringify(conf, null, 2) + "\n");

writeFileSync("src-tauri/Cargo.toml", read("src-tauri/Cargo.toml").replace(/^version = ".*"$/m, `version = "${version}"`));
writeFileSync(
  "src-tauri/Cargo.lock",
  read("src-tauri/Cargo.lock").replace(/(name = "vanitty"\nversion = )".*"/, `$1"${version}"`),
);

run("git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock");
run(`git commit -m "Release v${version}"`);
run(`git tag v${version}`);
if (process.argv.includes("--push")) {
  run("git push");
  run(`git push origin v${version}`);
} else {
  console.log(`\nTagged v${version}. Push it to build the release:\n  git push && git push origin v${version}`);
}
