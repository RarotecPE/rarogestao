import { existsSync, readFileSync } from "fs";
import { spawn } from "child_process";

const envFiles = [".env.local", ".env"];
const defaultBaseUrl = "http://localhost:3000";

for (const file of envFiles) {
  if (!existsSync(file)) continue;

  const content = readFileSync(file, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

const baseUrl = process.env.RAROGESTAO_BASE_URL || defaultBaseUrl;
let parsedUrl;

try {
  parsedUrl = new URL(baseUrl);
} catch {
  console.error(
    `RAROGESTAO_BASE_URL invalida: "${baseUrl}". Use algo como ${defaultBaseUrl}.`,
  );
  process.exit(1);
}

const hostname = parsedUrl.hostname || "localhost";
const port = parsedUrl.port || "3000";
const host = hostname === "localhost" ? "localhost" : hostname;
const nextBin = "node_modules/next/dist/bin/next";

if (!existsSync(nextBin)) {
  console.error("Next.js nao encontrado em node_modules. Rode npm install antes.");
  process.exit(1);
}

const child = spawn(
  process.execPath,
  [nextBin, "dev", "--webpack", "-H", host, "-p", port],
  {
    stdio: "inherit",
    env: process.env,
  },
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
