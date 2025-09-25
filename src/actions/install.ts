import * as p from "@clack/prompts";
import chalk from "chalk";
import { spawn } from "child_process";
import fs from "fs";
import { clearLastLines } from "../utils";

export async function installServerJar(worldPath: string) {
  const serverType = (
    await p.select({
      message: "Select the server type to install",
      options: [
        { value: "vanilla", label: "Vanilla" },
        { value: "forge", label: "Forge" },
        { value: "fabric", label: "Fabric" },
        { value: "neoforge", label: "NeoForge" },
        { value: "quilt", label: "Quilt" },
        { value: "purpur", label: "Purpur" },
        { value: "paper", label: "Paper" },
      ],
    })
  ).toString();

  if (!serverType) {
    p.cancel("Installation cancelled.");
    return;
  }

  if (!["forge"].includes(serverType)) {
    p.cancel(`Installation for ${serverType} is not supported yet.`);
    return;
  }

  if (serverType === "forge") {
    // Search for Forge installer inside the world directory using wildcard

    let forgeInstaller = fs
      .readdirSync(worldPath)
      .find(
        (file) =>
          file.toLowerCase().includes("forge") && file.endsWith("installer.jar")
      );

    forgeInstaller = await p
      .text({
        message: "Enter the Forge installer JAR file name: ",
        defaultValue: forgeInstaller || "",
        placeholder: forgeInstaller || "forge-installer.jar",
        validate: (value) => {
          if (!value) return "Forge installer JAR file name cannot be empty.";
          if (!fs.existsSync(`${worldPath}/${value}`)) {
            return `File ${value} does not exist in the world directory.`;
          }
          return undefined;
        },
      })
      .then((value) => value.toString().trim());

    if (!forgeInstaller) {
      p.cancel("Installation cancelled.");
      return;
    }

    // Check if the file exists
    if (!fs.existsSync(`${worldPath}/${forgeInstaller}`)) {
      p.cancel(
        `File ${chalk.greenBright(
          forgeInstaller
        )} does not exist in the world directory.`
      );
      return;
    }

    // Run the Forge installer
    const s = p.spinner();
    s.start(`Installing Forge from ${chalk.greenBright(forgeInstaller)}...`);

    try {
      const controller = new AbortController();

      const proc = spawn(
        "java",
        ["-jar", `${worldPath}/${forgeInstaller}`, "--installServer"],
        {
          signal: controller.signal,
          stdio: ["pipe", "pipe", "inherit"],
          cwd: worldPath,
        }
      );

      process.on("SIGINT", () => {
        controller.abort();
        process.exit(0);
      });

      let output = "";

      for await (const chunk of proc.stdout) {
        output += new TextDecoder().decode(chunk);

        const width = (process.stdout.columns || 80) - 5;
        const text = (
          new TextDecoder().decode(chunk).split("\n")[0] || ""
        ).slice(0, width - 1);

        s.message(text);
      }

      // await proc.exited;
      await proc.stdin.end();

      s.stop(chalk.greenBright("✓") + ` Forge installed successfully.`);
      p.log.success(`Forge installed successfully from ${forgeInstaller}.`);
    } catch (error) {
      s.stop(
        `Failed to install Forge from ${chalk.redBright(forgeInstaller)}.`
      );
      p.log.error(
        `Error installing Forge: ${
          error instanceof Error ? error.message : error
        }`
      );
      return;
    }

    s.stop(
      `Forge installation from ${chalk.greenBright(
        forgeInstaller
      )} completed successfully.`
    );
    p.log.success(
      `Forge installed successfully from ${chalk.greenBright(forgeInstaller)}.`
    );

    const memory = await p
      .text({
        message:
          "Enter the maximum memory allocation for the server (e.g., 2G):",
        defaultValue: "2G",
        placeholder: "2G",
        validate: (value) => {
          if (!value) return "Memory allocation cannot be empty.";
          if (!/^\d+[MG]$/.test(value)) {
            return "Memory allocation must be in the format <number>[M|G].";
          }
          return undefined;
        },
      })
      .then((value) => value.toString().trim());

    if (!memory) {
      p.cancel("Installation cancelled.");
      return;
    }

    fs.writeFileSync(
      `${worldPath}/user_jvm_args.txt`,
      `-Xmx${memory}\n-Xms${memory}\n`
    );

    p.log.success(
      `Memory allocation set to ${chalk.greenBright(memory)} for the server.`
    );

    // Edit the run.sh file to use screen
    const currentRunScript =
      fs
        .readFileSync(`${worldPath}/run.sh`, "utf-8")
        .split("\n")
        .filter((line) => line.startsWith("java"))[0] || "";

    const runScript = `#!/usr/bin/env sh\nscreen -dmS mineworker_forge ${currentRunScript}`;

    fs.writeFileSync(`${worldPath}/run.sh`, runScript);

    // Save the server type to config.
    const config = {
      serverType: "forge",
      worldPath: worldPath,
      memory: memory,
    };

    fs.writeFileSync(
      `${worldPath}/mineworker_config.json`,
      JSON.stringify(config, null, 2)
    );

    p.log.success(
      `Forge server installed successfully in ${chalk.greenBright(worldPath)}.`
    );

    return;
  }
}
