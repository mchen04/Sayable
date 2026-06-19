import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const forbiddenPackages = [
  "openai",
  "@anthropic-ai/sdk",
  "@google/generative-ai",
  "ai",
  "langchain",
  "@ai-sdk/openai",
  "@ai-sdk/anthropic",
  "@ai-sdk/google"
];

const forbiddenSourcePatterns = [
  /api\.openai\.com/i,
  /anthropic\.com\/v1/i,
  /generativelanguage\.googleapis\.com/i,
  /from\s+["']openai["']/i,
  /from\s+["']@anthropic-ai\/sdk["']/i,
  /from\s+["']@google\/generative-ai["']/i,
  /from\s+["']langchain/i,
  /from\s+["']@ai-sdk\//i
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

for (const packageName of forbiddenPackages) {
  try {
    const output = execFileSync("npm", ["ls", packageName, "--all", "--parseable"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    })
      .split("\n")
      .filter((line) => line.includes(`/node_modules/${packageName}`));
    if (output.length > 0) {
      fail(`Forbidden LLM dependency detected: ${packageName}`);
    }
  } catch (error) {
    if (error.status !== 1) {
      throw error;
    }
  }
}

const sourceFiles = execFileSync(
  "git",
  ["ls-files", "--others", "--cached", "--exclude-standard", "apps", "packages", "scripts", "supabase"],
  { encoding: "utf8" }
)
  .split("\n")
  .filter(Boolean)
  .filter((file) => /\.(ts|tsx|js|mjs|sql|json)$/.test(file));

for (const file of sourceFiles) {
  const content = readFileSync(file, "utf8");
  for (const pattern of forbiddenSourcePatterns) {
    if (pattern.test(content)) {
      fail(`Forbidden LLM source pattern ${pattern} detected in ${file}`);
    }
  }
}

console.log("No LLM dependencies or API source paths detected.");
