import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };
if (process.platform === "win32") {
  // Short 8.3 TEMP names make the SDK mistake the user's ~/.agents/skills
  // for project resources. Fixtures need an isolated, canonical parent.
  // Also keep fixtures outside the checkout: an empty test directory must
  // not inherit its .git or node_modules during SDK/isolation tests.
  const fixtureRoot = mkdtempSync(join(dirname(root), "pi-web-tests-"));
  env.TEMP = env.TMP = realpathSync.native(fixtureRoot);
  // A non-default Git installation may otherwise lose to System32's WSL
  // bash shim. Prefer that installation's real Bash for integration tests.
  try {
    const gitExec = execFileSync("git", ["--exec-path"], { encoding: "utf8" }).trim();
    const gitBin = resolve(gitExec, "../../..", "bin");
    if (existsSync(join(gitBin, "bash.exe"))) {
      const pathKey = Object.keys(env).find((key) => key.toUpperCase() === "PATH") ?? "PATH";
      env[pathKey] = `${gitBin}${delimiter}${env[pathKey] ?? ""}`;
    }
  } catch { /* Tests report missing prerequisites themselves. */ }
}
const files = process.argv.slice(2);
const defaults = ["app/**/*.test.mjs", "components/**/*.test.mjs", "hooks/**/*.test.mjs", "lib/**/*.test.mjs", "public/**/*.test.mjs"];
const hasFiles = files.some((argument) => !argument.startsWith("--"));
const platformOptions = process.platform === "win32" ? ["--test-concurrency=4"] : [];
const child = spawn(process.execPath, ["--experimental-strip-types", "--test", ...platformOptions, ...files, ...(hasFiles ? [] : defaults)], { cwd: root, env, stdio: "inherit" });
child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
