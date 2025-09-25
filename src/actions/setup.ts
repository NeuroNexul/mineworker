import { $ } from "bun";
import chalk from "chalk";
import * as p from "@clack/prompts";
import { clearLastLines } from "../utils";
import { spawn } from "child_process";

let pass = "";

export async function setup() {
  const s = p.spinner();
  p.log.step("Setting up the server...");

  /**
   * List of packages to check and install.
   * Each entry is a tuple containing:
   * - Name of the package (for display)
   * - Package name to check (e.g., "screen", "java")
   * - Command to install the package if not found
   */
  const packages: [string, string, string][] = [
    ["Screen", "screen", "sudo apt-get install screen -y"],
    ["Java 21", "java", "sudo apt-get install openjdk-21-jdk-headless -y"],
  ];

  /**
   * Array to hold names of packages that are already installed.
   * This will be used to detect which packages need to be installed.
   * Also if need to get sudo password.
   */
  const existingPackages: string[] = [];

  for (const [name, pkg] of packages) {
    const exists = Bun.which(pkg);

    if (exists) {
      existingPackages.push(name);
    }
  }

  if (existingPackages.length < packages.length && !pass) {
    pass = (
      await p.password({
        message: "Enter your password to install missing packages: ",
        mask: "*",
      })
    ).toString();

    clearLastLines(3);
  }

  for (const [name, pkg, installCmd] of packages) {
    const exists = Bun.which(pkg);

    if (exists) {
      const version =
        (await $`${pkg} --version`.quiet().text()).trim().split("\n")[0] || "";
      p.log.message(
        chalk.greenBright("✓") +
          ` ${name} is installed` +
          chalk.dim(` (version: ${version})`)
      );
    } else {
      s.start(`Installing ${name}...`);

      try {
        const controller = new AbortController();

        const proc = spawn("sudo", ["-S", ...installCmd.split(" ")], {
          signal: controller.signal,
          stdio: ["pipe", "pipe", "inherit"],
        });

        proc.stdin.write(pass.toString() + "\n");

        process.on("SIGINT", () => {
          controller.abort();
          process.exit(0);
        });

        let output = "";

        for await (const chunk of proc.stdout) {
          output += new TextDecoder().decode(chunk);
          // s.message(new TextDecoder().decode(chunk).split("\n").join(""));
        }

        // await proc.exited;
        await proc.stdin.end();

        s.stop(chalk.greenBright("✓") + ` ${name} installed successfully.`);
        // p.note(output.trim().split("\n").slice(-5).join("\n"), "Output: ");
      } catch (error) {
        clearLastLines(1);
        s.stop(`Failed to install ${name}. Please install it manually.`, 1);
        p.note(
          `You can install ${name} by running the following command:\n${chalk.yellowBright(
            installCmd
          )}`,
          "Note: "
        );
        process.exit(1);
      }
    }
  }

  p.outro("Server setup completed successfully!");
}
