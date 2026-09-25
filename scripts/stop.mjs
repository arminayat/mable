import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const projectRoot = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
const processes = execFileSync("ps", ["-A", "-o", "pid=,comm="], { encoding: "utf8" });
let stopped = 0;

for (const line of processes.split("\n")) {
  const match = line.trim().match(/^(\d+)\s+next-server(?:\s|$)/);
  if (!match) continue;
  const pid = Number(match[1]);
  let cwd;
  try {
    const files = execFileSync("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    });
    cwd = files.split("\n").find((entry) => entry.startsWith("n"))?.slice(1);
  } catch {
    continue; // The process may have exited while being inspected.
  }
  if (!cwd || realpathSync(cwd) !== projectRoot) continue;
  try {
    process.kill(pid, "SIGTERM");
    stopped++;
    console.log(`Sent shutdown signal to Mable server (PID ${pid}).`);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

if (!stopped) console.log("No running Mable server found.");
