import fs from "fs";
import * as p from "@clack/prompts";
import chalk from "chalk";
import { spawn } from "child_process";
import { $ } from "bun";
import { getServerConfig } from "../utils";

export async function start(worldPath: string) {
  if (!fs.existsSync(worldPath)) {
    p.cancel(`World path "${worldPath}" does not exist.`);
    return;
  }

  if (!fs.existsSync(`${worldPath}/mineworker_config.json`)) {
    p.cancel(
      `Configuration file "mineworker_config.json" does not exist in the world directory.\nPlease run the install command first.`
    );
    return;
  }

  const config = getServerConfig(worldPath);

  if (!config) {
    p.cancel(
      `Failed to load configuration from "mineworker_config.json". Please check the file format.`
    );
    return;
  }

  if (config.serverType !== "forge") {
    p.cancel(
      `Server Type "${config.serverType}" is not supported yet. Please run the install command first.`
    );
    return;
  }

  const s = p.spinner();
  s.start(`Checking if the server is already running...`);

  const output = await $`screen -ls | grep mineworker_${config.serverType}`
    .quiet()
    .then((result) => result.text())
    .catch(() => {
      return "";
    });

  if (output) {
    s.stop(
      chalk.redBright("✗") +
        ` Server is already running. Please stop it first before starting again.`
    );
    return;
  }

  s.message(chalk.greenBright("✓") + ` Server is not running, starting...`);

  if (config.serverType === "forge") {
    p.log.info(`Starting Forge server in world directory "${worldPath}"...`);

    const proc = spawn(`${worldPath}/run.sh`, {
      cwd: worldPath,
    });

    let output = "";

    for await (const chunk of proc.stdout) {
      output += new TextDecoder().decode(chunk);

      const width = (process.stdout.columns || 80) - 5;
      const text = (new TextDecoder().decode(chunk).split("\n")[0] || "").slice(
        0,
        width - 1
      );

      s.message(text);
    }

    await proc.stdin.end();

    s.stop(
      `Forge server started successfully in world directory "${worldPath}".`
    );

    return;
  }
}
