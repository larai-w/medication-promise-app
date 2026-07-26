import { execFileSync } from "node:child_process";

const blockedPaths = [
  /^ask-resources\.json$/,
  /^alexa\/interaction-model.*\.json$/,
  /^alexa\/skill-package\//,
  /\.(?:onnx|pt|pth|ckpt|safetensors|h5|pkl)$/,
  /^docs\/(?:private|internal|blog-drafts)\//,
  /^docs\/BLOG_DRAFT.*\.md$/,
  /^docs\/(?:AGENT_WORKFLOW|ALEXA_ASK_CLI|FABLE_SKILLS|GROWTH.*|HUMAN_TASKS|NOTE_FOR_HUMAN|PRODUCT_RELEASE_AND_GROWTH_NOTE.*|PROJECT_HANDOFF|SESSION_NOTE.*|STRATEGY_AND_ROADMAP|TASKS|WEB_HOSTING_OPENNEXT)\.md$/,
  // --- Generalized guards: catch renamed / newly-named internal docs, in any directory. ---
  // Business & strategy notes (any markdown). Keywords chosen not to match existing public docs.
  /(?:^|\/)[^/]*(?:STRATEGY|ROADMAP|GROWTH|HANDOFF|PRICING|REVENUE|MONETI[SZ]E|GO[_-]?TO[_-]?MARKET|BUSINESS[_-]?PLAN|COMMERCIAL[_-]?PLAN)[^/]*\.mdx?$/i,
  // Session / working / task notes (any markdown).
  /(?:^|\/)[^/]*(?:SESSION_NOTE|WORKLOG|HUMAN_TASKS|NOTE_FOR_HUMAN|AGENT_WORKFLOW)[^/]*\.mdx?$/i,
  // Unpublished blog drafts (any markdown).
  /(?:^|\/)BLOG_DRAFT[^/]*\.mdx?$/i,
];

const trackedFiles = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

const violations = trackedFiles.filter((file) =>
  blockedPaths.some((pattern) => pattern.test(file)),
);

if (violations.length > 0) {
  console.error("Private files must not be tracked in the public repository:");
  for (const file of violations) console.error(`- ${file}`);
  process.exit(1);
}

console.log("Publication boundary check passed.");
