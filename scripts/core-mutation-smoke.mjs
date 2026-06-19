import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vitestBin = path.join(repoRoot, "node_modules", ".bin", "vitest");

const coreMutations = [
  {
    name: "privacy threshold lowered to 3",
    file: "src/results.ts",
    from: "const PRIVACY_THRESHOLD = 4;",
    to: "const PRIVACY_THRESHOLD = 3;"
  },
  {
    name: "constraint privacy threshold lowered to 1",
    file: "src/results.ts",
    from: "const CONSTRAINT_PRIVACY_THRESHOLD = 4;",
    to: "const CONSTRAINT_PRIVACY_THRESHOLD = 1;"
  },
  {
    name: "maybe responses allowed into easy yes",
    file: "src/results.ts",
    from: "if (avgScore >= 2.45 && counts.maybe === 0 && counts.out === 0) {",
    to: "if (avgScore >= 2.45 && counts.out === 0) {"
  },
  {
    name: "deleted responses included in result summaries",
    file: "src/results.ts",
    from: "return responses.filter((response) => !response.deletedAt && response.status in STATUS_SCORE);",
    to: "return responses.filter((response) => response.status in STATUS_SCORE);"
  },
  {
    name: "free response cap raised",
    file: "src/limits.ts",
    from: "maxResponsesPerCheck: 30,",
    to: "maxResponsesPerCheck: 31,"
  },
  {
    name: "premium response cap lowered",
    file: "src/limits.ts",
    from: "maxResponsesPerCheck: 100,",
    to: "maxResponsesPerCheck: 99,"
  },
  {
    name: "free custom constraint cap raised",
    file: "src/limits.ts",
    from: "maxCustomConstraints: 2,",
    to: "maxCustomConstraints: 3,"
  },
  {
    name: "premium custom constraint cap lowered",
    file: "src/limits.ts",
    from: "maxCustomConstraints: 10,",
    to: "maxCustomConstraints: 9,"
  },
  {
    name: "k price multiplier ignored",
    file: "src/draft.ts",
    from: 'const multiplier = matches[0]?.[2] === "k" ? 1000 : 1;',
    to: 'const multiplier = matches[0]?.[2] === "k" ? 1 : 1;'
  },
  {
    name: "title angle bracket sanitization weakened",
    file: "src/draft.ts",
    from: ".replace(/[<>]/g, \"\")",
    to: ".replace(/[<>]/, \"\")"
  }
];

const webMutations = [
  {
    name: "response delete does not mark response deleted",
    file: "apps/web/src/lib/store.ts",
    from: "    const deletedAt = now();\n    response.deletedAt = deletedAt;\n    response.updatedAt = deletedAt;",
    to: "    const deletedAt = response.deletedAt;\n    response.deletedAt = deletedAt;\n    response.updatedAt = deletedAt;"
  },
  {
    name: "response delete does not revoke public snapshots",
    file: "apps/web/src/lib/store.ts",
    from: "    invalidateResultSnapshots(store, response.checkId, deletedAt);\n",
    to: ""
  },
  {
    name: "public snapshot includes private notes",
    file: "apps/web/src/lib/store.ts",
    from: "    snapshot: result.publicSnapshot,",
    to: "    snapshot: { ...result.publicSnapshot, detail: responses.map((response) => response.privateNote || \"\").join(\" \") },"
  },
  {
    name: "final share allowed while privacy suppressed",
    file: "apps/web/src/lib/store.ts",
    from:
      "  if (result.isPrivacySuppressed) {\n" +
      "    throw new StoreError(409, `Final share is available after ${result.privacyThreshold} private responses.`);\n" +
      "  }\n",
    to: ""
  },
  {
    name: "deleted check terminal guard removed",
    file: "apps/web/src/lib/store.ts",
    from:
      "  if (check.status === \"deleted\") {\n" +
      "    const isIdempotentDelete =\n" +
      "      patch.status === \"deleted\" &&\n" +
      "      !patch.constraints &&\n" +
      "      !patch.questions &&\n" +
      "      !patch.tiers &&\n" +
      "      !patch.resetDraft &&\n" +
      "      !patch.themeId &&\n" +
      "      !patch.customTheme &&\n" +
      "      !patch.resetCustomTheme;\n" +
      "    if (isIdempotentDelete) {\n" +
      "      return check;\n" +
      "    }\n" +
      "    throw new StoreError(410, \"This Comfort Check has been deleted.\");\n" +
      "  }\n",
    to: ""
  }
];

function run(command, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("close", (code) => resolve({ code, output }));
  });
}

async function replaceInFile(target, mutation) {
  const source = await readFile(target, "utf8");
  if (!source.includes(mutation.from)) {
    throw new Error(`Mutation target not found for "${mutation.name}" in ${target}`);
  }
  await writeFile(target, source.replace(mutation.from, mutation.to));
  return source;
}

async function applyMutation(coreDir, mutation) {
  await replaceInFile(path.join(coreDir, mutation.file), mutation);
}

async function runCoreMutation(mutation) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "sayable-core-mutation-"));
  const tempRepo = path.join(tempRoot, "repo");
  const tempCore = path.join(tempRepo, "packages", "core");
  try {
    await cp(path.join(repoRoot, "tsconfig.base.json"), path.join(tempRepo, "tsconfig.base.json"));
    await cp(path.join(repoRoot, "packages", "core"), tempCore, { recursive: true });
    await applyMutation(tempCore, mutation);
    const result = await run(vitestBin, ["run", "--root", tempCore, "--config", path.join(tempCore, "vitest.config.ts")], repoRoot);
    if (result.code === 0) {
      throw new Error(`Mutation survived: ${mutation.name}\n${result.output}`);
    }
    return mutation.name;
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function runWebMutation(mutation) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "sayable-web-mutation-"));
  const tempRepo = path.join(tempRoot, "repo");
  try {
    await cp(repoRoot, tempRepo, {
      recursive: true,
      filter: (source) => {
        const relative = path.relative(repoRoot, source);
        if (!relative) {
          return true;
        }
        return !(
          relative === ".git" ||
          relative === "node_modules" ||
          relative.endsWith("node_modules") ||
          relative.includes(`${path.sep}node_modules${path.sep}`) ||
          relative === "apps/web/.next" ||
          relative.startsWith(`apps/web/.next${path.sep}`) ||
          relative === "packages/core/dist" ||
          relative.startsWith(`packages/core/dist${path.sep}`) ||
          relative.endsWith(".tsbuildinfo")
        );
      }
    });
    await symlink(path.join(repoRoot, "node_modules"), path.join(tempRepo, "node_modules"), "dir");
    await replaceInFile(path.join(tempRepo, mutation.file), mutation);
    const result = await run("node", ["scripts/smoke-web.mjs"], tempRepo);
    if (result.code === 0) {
      throw new Error(`Mutation survived: ${mutation.name}\n${result.output}`);
    }
    return mutation.name;
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

const caught = [];
for (const mutation of coreMutations) {
  caught.push(await runCoreMutation(mutation));
}
for (const mutation of webMutations) {
  caught.push(await runWebMutation(mutation));
}

console.log(
  JSON.stringify(
    {
      ok: true,
      caughtMutations: caught
    },
    null,
    2
  )
);
