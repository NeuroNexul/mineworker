import fs from "fs";
import * as p from "@clack/prompts";
import { execSync } from "child_process";
import axios from "axios";

/**
 * Clears the last n lines from the terminal.
 * @param n The number of lines to clear.
 */
export function clearLastLines(n: number) {
  // \x1B[<n>A moves the cursor up n lines.
  // \x1B[J clears from the cursor to the end of the screen.
  process.stdout.write(`\x1B[${n}A\x1B[J`);
}

export async function waitForEnter() {
  process.stdout.write("Press Enter to continue...");
  const stdin = process.stdin;

  // Set stdin to raw mode to read individual key presses
  stdin.setRawMode(true);
  stdin.resume(); // Resume stdin to start listening for input
  stdin.setEncoding("utf8");

  return new Promise<void>((resolve) => {
    function func(key: string) {
      // Check if the pressed key is Enter (key code 13 or '\r')
      if (key === "\r") {
        stdin.pause(); // Pause stdin to stop listening
        stdin.setRawMode(false); // Restore raw mode
        resolve();

        stdin.off("data", func); // Remove the listener after resolving
      }
    }

    stdin.on("data", func);
  });
}

export function getServerConfig(worldPath: string, silent = false) {
  const exist = fs.existsSync(worldPath);

  if (!exist) return {};

  const config_raw = fs.readFileSync(
    `${worldPath}/mineworker_config.json`,
    "utf-8"
  );
  let config: Record<string, any>;

  try {
    config = JSON.parse(config_raw);
  } catch (error) {
    !silent &&
      p.cancel(
        `Failed to parse configuration file "mineworker_config.json": ${error}`
      );
    return;
  }

  if (!config.serverType) {
    !silent &&
      p.cancel(
        `Server Type is not specified in the configuration file. Please run the install command first.`
      );
    return;
  }

  return config;
}

/**
 * Wait until a screen session with given name is gone.
 */
export function waitForScreenExit(sessionName: string, interval = 2000) {
  return new Promise<void>((resolve) => {
    const check = setInterval(() => {
      try {
        const output = execSync("screen -list").toString();
        if (!output.includes(sessionName)) {
          clearInterval(check);
          resolve();
        }
      } catch {
        clearInterval(check);
        resolve();
      }
    }, interval);
  });
}

export async function getPublicIp() {
  try {
    const response = await axios.get("https://api.ipify.org?format=json");
    return response.data.ip;
  } catch (error) {
    console.error("Error getting public IP:", error);
    return null;
  }
}
