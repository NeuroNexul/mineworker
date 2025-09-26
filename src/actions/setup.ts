import { $ } from "bun";
import chalk from "chalk";
import * as p from "@clack/prompts";
import { clearLastLines } from "../utils";
import { spawn } from "child_process";
import { client, ZONE_ID } from "../dns";

let pass = "";

export async function setup(ip: string) {
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

  if (ip) {
    // Add DNS records for the server
    s.start("Adding DNS records...");

    try {
      // Check if the record already exists
      const records = await client.dns.records.list({
        zone_id: ZONE_ID,
      });

      const existingRecord = records.result.find((record) => {
        return record.name === "mc.nexul.in" && record.type === "A";
      });

      if (existingRecord) {
        // If the record exists, update it
        s.message("Updating existing DNS record...");

        const res = await client.dns.records.edit(existingRecord.id, {
          zone_id: ZONE_ID,
          name: "mc",
          ttl: 1,
          type: "A",
          content: ip,
          proxied: false,
        });

        s.stop(chalk.greenBright("✓") + " DNS record updated successfully.");
        p.note(
          `DNS record updated successfully. You can access your server at: ${chalk.blueBright(
            `mc.nexul.in`
          )}`,
          "Note: "
        );
      } else {
        // If the record does not exist, create it
        s.message("Creating new DNS record...");

        const res = await client.dns.records.create({
          zone_id: ZONE_ID,
          name: "mc",
          ttl: 1,
          type: "A",
          content: ip,
          proxied: false,
        });

        s.stop(chalk.greenBright("✓") + " DNS record created successfully.");
        p.note(
          `DNS record created successfully. You can access your server at: ${chalk.blueBright(
            `mc.nexul.in`
          )}`,
          "Note: "
        );
      }
    } catch (error) {
      s.stop("Failed to add DNS records. Please try again later.", 1);
      p.log.error(
        error instanceof Error ? error.message : "Unknown error occurred"
      );
    }
  }

  p.outro("Server setup completed successfully!");
}
