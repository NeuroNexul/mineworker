import Bun, { readableStreamToText, sleep } from "bun";
import boxen from "boxen";
import chalk from "chalk";
import * as p from "@clack/prompts";
import { setup } from "./actions/setup";
import {
  getPublicIp,
  getServerConfig,
  waitForEnter,
  waitForScreenExit,
} from "./utils";
import { networkInterfaces } from "os";
import { uploadWorldToDrive } from "./actions/upload";
import path from "path";
import { loadWorld } from "./actions/load";
import { installServerJar } from "./actions/install";
import { start } from "./actions/start";
import { execSync, spawn } from "child_process";

const $ = Bun.$;
const startTime = new Date();
const ipv4s = new Set<string>();
const ipv6s = new Set<string>();
const worldPath = path.resolve(process.cwd(), "../world");

const pub_ip = await getPublicIp();
if (pub_ip) {
  ipv4s.add(pub_ip);
}

Object.entries(networkInterfaces()).forEach(([, iface]) => {
  if (!iface) return;
  iface.forEach((net) => {
    const familyV4Value = typeof net.family === "string" ? "IPv4" : 4;
    const familyV6Value = typeof net.family === "string" ? "IPv6" : 6;

    if (net.family === familyV4Value && !net.internal) {
      ipv4s.add(net.address);
    }

    if (net.family === familyV6Value && !net.internal) {
      ipv6s.add(net.address);
    }
  });
});

// const server = Bun.serve({
//   hostname: "localhost",
//   development: Bun.env.NODE_ENV !== "production",
//   port: 3000,
//   fetch(req, server) {
//     return new Response("404 Not Found", {
//       status: 404,
//       headers: { "Content-Type": "text/plain" },
//     });
//   },
//   routes: {
//     "/": () => new Response("Hello, world!"),
//     "/hello": () => new Response("Hello from /hello!"),
//     "/json": () =>
//       new Response(JSON.stringify({ message: "Hello, JSON!" }), {
//         headers: { "Content-Type": "application/json" },
//       }),
//   },
//   websocket: {
//     message(ws, message) {},
//     open(ws) {},
//     close(ws, code, message) {},
//     drain(ws) {},
//   },
// });

async function init() {
  let screen = await $`screen --version`
    .quiet()
    .then((res) => res.text().trim() || "")
    .catch(() => "");

  let java = await $`java --version`
    .quiet()
    .then((res) => res.text().trim().split("\n")[0] || "")
    .catch(() => "");

  const config = getServerConfig(worldPath, true) || {};

  let running_session =
    await $`screen -ls | grep mineworker_${config.serverType}`
      .quiet()
      .then(
        (res) =>
          (res.text().split("\n")[0] || "").trim().replace(/\t/g, " ") || ""
      )
      .catch(() => "");

  /**
   * Logs the server information to the console.
   * This includes the Bun version, hostname, and server URL.
   */
  console.clear();
  const lines = [
    `${chalk.cyanBright("Bun.JS:")} ${chalk.greenBright(Bun.version)}`,
    `${chalk.cyanBright("Node.JS:")} ${chalk.greenBright(process.version)}`,
    `${chalk.cyanBright("Running On:")} ${chalk.greenBright(Bun.$.name)}`,
    `${chalk.cyanBright("SCREEN:")} ${
      screen ? chalk.greenBright(screen) : chalk.redBright("screen not found")
    }`,
    `${chalk.cyanBright("JAVA:")} ${
      java ? chalk.greenBright(java) : chalk.redBright("Java not found")
    }`,
    `${chalk.cyanBright("WORLD DIR:")} ${chalk.greenBright(worldPath)}`,

    "",
    // `${chalk.yellow("Hostname:")} ${chalk.blueBright(
    //   server.hostname || "Not available"
    // )}`,
    `${chalk.yellow("Platform:")} ${chalk.blueBright(process.platform)}`,
    `${chalk.yellow("Architecture:")} ${chalk.blueBright(process.arch)}`,
    `${chalk.yellow("Uptime:")} ${chalk.blueBright(
      `${Math.floor(process.uptime() / 60)} minutes`
    )}`,
    `${chalk.yellow("Environment:")} ${chalk.blueBright(
      Bun.env.NODE_ENV || "development"
    )}`,
    `${chalk.yellow("Server PID:")} ${chalk.blueBright(process.pid)}`,

    "",
    `${chalk.yellow("Server Type:")} ${chalk.blueBright(
      config.serverType || "Not specified"
    )}`,
    `${chalk.yellow("Session:")} ${chalk.blueBright(
      running_session || "Not running"
    )}`,
    `Server Start Time: ${chalk.blueBright(
      startTime.toLocaleString("en-US", {
        timeZone: "UTC",
      })
    )}`,
    // `Server running at ${chalk.blueBright(
    //   `http://${server.hostname}:${server.port}/`
    // )}`,
    // `WebSocket server running at ${chalk.blueBright(
    //   `ws://${server.hostname}:${server.port}/`
    // )}`,
    `IPV4 Address: ${chalk.blueBright(
      Array.from(ipv4s).join(", ") || "Not available"
    )}`,
    `IPV6 Address: ${chalk.blueBright(
      Array.from(ipv6s).join(", ") || "Not available"
    )}`,
  ];
  console.log(
    boxen(
      lines.map((e) => `${e ? chalk.cyanBright("=>") : ""}  ${e}`).join("\n"),
      {
        padding: 1,
        borderStyle: "round",
        borderColor: "cyan",
        title: "Minecraft Worker Node Doctor",
        titleAlignment: "left",
        textAlignment: "left",
        width: process.stdout.columns || 80,
      }
    )
  );
  console.log();

  p.updateSettings({
    aliases: {
      w: "up",
      s: "down",
      a: "left",
      d: "right",
    },
  });

  p.intro(`${chalk.cyan("Welcome to the Minecraft Worker Node!")}`);
  p.note(
    `Use ${chalk.green("w")} to move up, ${chalk.green(
      "s"
    )} to move down, ${chalk.green("a")} to move left, and ${chalk.green(
      "d"
    )} to move right.\nYou can also use the arrow keys to navigate.`,
    `Instructions ${chalk.cyanBright("▶")}`
  );

  const action = await p.select({
    message: `Select an Action ${chalk.cyanBright("▶")}`,
    initialValue: "setup",
    // maxItems: 5,
    options: [
      {
        value: "setup",
        label: "Quick Setup",
        hint: "Setup the Minecraft Worker Node",
      },
      {
        value: "load",
        label: "Load World",
        hint: "Load a Minecraft world from Google Drive",
      },
      {
        value: "upload",
        label: "Upload World",
        hint: "Upload a Minecraft world to Google Drive",
      },
      {
        value: "install",
        label: "Install Server JAR",
        hint: "Install the Minecraft server JAR file",
      },
      // {
      //   value: "create",
      //   label: "Create Server",
      //   hint: "Create a new Minecraft server",
      // },
      {
        value: "start",
        label: "Start Server",
        hint: "Start the Minecraft server",
      },
      {
        value: "stop",
        label: "Stop Server",
        hint: "Stop the Minecraft server",
      },
      {
        value: "restart",
        label: "Restart Server",
        hint: "Restart the Minecraft server",
      },
      {
        value: "status",
        label: "Check Status",
        hint: "Check the status of the Minecraft server",
      },
      {
        value: "console",
        label: "Open Console",
        hint: "Open the Minecraft server console",
      },
      // {
      //   value: "logs",
      //   label: "View Logs",
      //   hint: "View the Minecraft server logs",
      // },
      { value: "exit", label: "Exit", hint: "Exit the Minecraft Worker Node" },
    ],
  });

  switch (action) {
    case "setup":
      await setup(ipv4s.values().next().value || "");
      await waitForEnter();
      await init();
      break;

    case "load":
      await loadWorld(worldPath);
      await waitForEnter();
      await init();
      break;

    case "upload":
      await uploadWorldToDrive(worldPath);
      await waitForEnter();
      await init();
      break;

    case "install":
      await installServerJar(worldPath);
      await waitForEnter();
      await init();
      break;

    case "create":
      p.cancel("Server Creation is not supported yet :(");
      await waitForEnter();
      await init();
      break;

    case "start":
      await start(worldPath);
      await waitForEnter();
      await init();
      break;

    case "stop": {
      const s = p.spinner();
      s.start("Stopping server...");

      try {
        execSync(`screen -S mineworker_${config.serverType} -X stuff "stop\n"`);
        await waitForScreenExit(`mineworker_${config.serverType}`);

        s.stop("Server stopped successfully");
        p.log.success("Server stopped successfully");
      } catch (error) {
        s.stop("Failed to stop server");
        p.log.error(error instanceof Error ? error.message : "Unknown error");
      }

      await waitForEnter();
      await init();
      break;
    }

    case "restart": {
      // Restarting the server is a two-step process: stop and then start.

      const s = p.spinner();
      s.start("Restarting server...");

      try {
        s.message("Stopping server...");

        execSync(`screen -S mineworker_${config.serverType} -X stuff "stop\n"`);
        await waitForScreenExit(`mineworker_${config.serverType}`);

        s.stop("Server stopped successfully");
      } catch (error) {
        s.stop("Failed to stop server");
        p.log.error(error instanceof Error ? error.message : "Unknown error");
        await waitForEnter();
        await init();
        return;
      }

      await start(worldPath);
      await waitForEnter();
      await init();
      break;
    }

    case "status":
      p.outro("Checking server status...");
      await waitForEnter();
      await init();
      break;

    case "console":
      const proc = spawn("screen", ["-r", "mineworker_forge"], {
        stdio: "inherit",
      });

      proc.on("exit", async (code) => {
        p.log.info(`Screen session exited with code ${code}`);

        await waitForEnter();
        await init();
      });
      break;

    case "logs":
      p.cancel("Checking Logs is not supported yet :(");
      await waitForEnter();
      await init();
      break;

    case "exit":
      p.outro("Exiting the Minecraft Worker Node. Goodbye!");
      process.exit(0);

    default:
      p.log.error("Invalid action selected.");
  }
}

await init();
