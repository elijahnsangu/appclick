const { execSync } = require("node:child_process");

const commitMessage = execSync("git log -1 --pretty=%B").toString().trim();

if (commitMessage.includes("[skip ci]")) {
  console.log("Skipping build due to [skip ci] in commit message.");
  process.exit(0); // this causes Vercel to skip the build
}

// Phase 1 preview contract: authenticated tiers receive no preview database
// or Better Auth credentials, so their Git preview builds run only for the
// shared "preview" branch (docs/runbooks/preview-environments.md).
if (
  process.env.VERCEL_ENV === "preview" &&
  process.env.VERCEL_GIT_COMMIT_REF !== "preview"
) {
  console.log(
    "Skipping build: authenticated tiers deploy previews only from the shared preview branch."
  );
  process.exit(0); // this causes Vercel to skip the build
}

process.exit(1); // continue with build
