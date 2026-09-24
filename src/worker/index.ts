import { workerTick } from "../lib/worker";

let running = true;
process.on("SIGINT", () => { running = false; });
process.on("SIGTERM", () => { running = false; });

async function main() {
  while (running) {
    try { await workerTick(); }
    catch { console.error("Worker cycle failed"); }
    if (running) await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
}

void main();
