// Copies ../thermal-profile.json (repo root, shared with rgb-bridge) into
// this directory so Next/Turbopack never has to resolve a module outside
// its own project root -- that's restricted by default, and working around
// it (turbopack.root) shifts where output tracing nests the standalone
// build, breaking the Dockerfile's runner stage. A plain file copy sidesteps
// both problems and behaves identically locally and in the Docker build.
const { copyFileSync } = require("node:fs");
const { join } = require("node:path");

copyFileSync(
  join(__dirname, "..", "..", "thermal-profile.json"),
  join(__dirname, "..", "thermal-profile.json")
);
