#!/usr/bin/env node

import * as readline from "node:readline";
import { BridgeGateway } from "./gateway";
import { BridgeEventType } from "./protocol";

const HOST = process.env.FLAX_WS_HOST || "localhost";
const PORT = parseInt(process.env.FLAX_WS_PORT || "7777", 10);
const NAME = "flax-mcp-bridge";

function log(level: string, message: string, ...args: unknown[]): void {
  const ts = new Date().toISOString();
  console.error(`[${ts}] [${level}] [${NAME}] ${message}`, ...args);
}

async function main() {
  log("INFO", `Starting ${NAME} v1.0.0`);
  log("INFO", `Target: ws://${HOST}:${PORT}`);

  const gateway = new BridgeGateway({
    host: HOST,
    port: PORT,
    reconnectIntervalMs: parseInt(process.env.FLAX_WS_RECONNECT_MS || "3000", 10),
    maxReconnectAttempts: parseInt(process.env.FLAX_WS_MAX_RETRIES || "10", 10),
    requestTimeoutMs: parseInt(process.env.FLAX_WS_TIMEOUT_MS || "30000", 10),
  });

  gateway.on(BridgeEventType.CONNECTED, () => {
    log("INFO", "Connected to Flax Engine");
    printStatus(gateway);
  });

  gateway.on(BridgeEventType.DISCONNECTED, () => {
    log("WARN", "Disconnected from Flax Engine");
  });

  gateway.on(BridgeEventType.ERROR, (event) => {
    log("ERROR", "Bridge error:", event.payload);
  });

  gateway.on(BridgeEventType.STATE_UPDATE, (event) => {
    log("DEBUG", "Engine state updated:", JSON.stringify(event.payload));
  });

  gateway.connect().catch((err) => {
    log("WARN", `Initial connection failed: ${err.message}`);
    log("INFO", "Bridge will retry in the background");
  });

  // --- Detect mode: pipe (non-interactive) vs TTY (REPL) ---
  const isInteractive = process.stdin.isTTY;

  if (isInteractive) {
    startRepl(gateway);
  } else {
    await executePiped(gateway);
  }
}

function startRepl(gateway: BridgeGateway): void {
  log("INFO", "Bridge started in REPL mode. Type a JSON command or 'help'.");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "> " });
  rl.prompt();

  rl.on("line", (line: string) => {
    const input = line.trim();

    if (input === "" || input === "exit") {
      gateway.disconnect();
      rl.close();
      process.exit(0);
      return;
    }

    if (input === "help") {
      console.log(`
Commands:
  help                       - Show this help
  status                     - Show bridge and engine status
  queue                      - Show pending queue length
  <json>                     - Send a JSON BridgeRequest to the engine
  exit                       - Shut down

Example:
  {"tool":"get_editor_state","params":{}}
  {"tool":"create_actor","params":{"name":"MyCube","type":"StaticMesh","staticMeshPath":"Content/Models/Cube.flax"}}
`);
      rl.prompt();
      return;
    }

    if (input === "status") {
      printStatus(gateway);
      rl.prompt();
      return;
    }

    if (input === "queue") {
      log("INFO", `Queue length: ${gateway.queueLength()}`);
      rl.prompt();
      return;
    }

    try {
      const req = JSON.parse(input);
      if (typeof req !== "object" || !req.tool) {
        log("WARN", "Invalid request: must have a 'tool' field");
        rl.prompt();
        return;
      }

      gateway.send(req).then((result) => {
        console.log(JSON.stringify(result, null, 2));
        rl.prompt();
      }).catch((err) => {
        log("ERROR", `Failed to send request: ${err instanceof Error ? err.message : String(err)}`);
        rl.prompt();
      });
    } catch (err) {
      log("ERROR", `Failed to parse request: ${err instanceof Error ? err.message : String(err)}`);
      rl.prompt();
    }
  });
}

async function executePiped(gateway: BridgeGateway): Promise<void> {
  const chunks: string[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const input = chunks.join("").trim();
  if (!input) {
    process.exit(0);
    return;
  }

  // Try parsing as JSON
  try {
    const req = JSON.parse(input);
    if (typeof req !== "object" || !req.tool) {
      log("ERROR", "Invalid piped JSON: must have a 'tool' field");
      process.exit(1);
      return;
    }

    // Wait for connection then send
    const timeout = setTimeout(() => {
      log("WARN", "Connection timeout, exiting");
      process.exit(1);
    }, 5000);

    if (!gateway.connected) {
      await new Promise<void>((resolve) => {
        gateway.on(BridgeEventType.CONNECTED, () => resolve());
      });
    }
    clearTimeout(timeout);

    const result = await gateway.send(req);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    log("ERROR", `Failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
    return;
  }

  gateway.disconnect();
  process.exit(0);
}

function printStatus(gateway: BridgeGateway): void {
  const state = gateway.engineState;
  console.log(`
Bridge Status:
  Connected:     ${gateway.connected}
  Play Mode:     ${state.playMode}
  Active Scene:  ${state.activeScene || "(none)"}
  FPS:           ${state.fps}
  Queue Length:  ${gateway.queueLength()}
`);
}

main().catch((err) => {
  log("FATAL", String(err));
  process.exit(1);
});
