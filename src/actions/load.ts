import * as p from "@clack/prompts";
import chalk from "chalk";
import fs from "fs";
import { getGoogleAuth } from "../gAuth";
import { google } from "googleapis";
import type { drive_v3 } from "googleapis";
import path from "path";

export async function loadWorld(worldPath: string): Promise<void> {
  const s = p.spinner();

  /**
   * Authenticate with Google Drive
   * using the getGoogleAuth function.
   */
  const auth = await getGoogleAuth().catch((error) => {
    p.log.error(
      chalk.yellowBright("[AUTH]: ") +
        `Error authenticating with Google Drive: ${error}`
    );
    return;
  });

  if (!auth) {
    p.log.error(
      chalk.yellowBright("[AUTH]: ") +
        "No authentication object returned. Exiting..."
    );
    return;
  }

  const drive = google.drive({ version: "v3", auth });

  // =========================================================== //

  s.start("Loading available worlds from Google Drive...");

  const worlds = await drive.files
    .list({
      q: `'1bRzcInRBJ58cEoiwK4MqceKeQ1BlX9kZ' in parents and trashed = false and mimeType = 'application/zip'`,
      fields: "files(id, name, mimeType, modifiedTime, webViewLink, size)",
      orderBy: "modifiedTime desc",
    })
    .then((res) => res.data.files)
    .catch((error) => {
      s.stop("Failed to load worlds from Google Drive.");
      p.log.error(`Error loading worlds: ${error.message || error}`);
      return [];
    });

  if (!worlds || worlds.length === 0) {
    p.log.error("No worlds found in the specified Google Drive folder.");
    return;
  }

  s.stop(
    chalk.greenBright("✓ ") +
      "Worlds loaded successfully. " +
      chalk.dim(`(${worlds.length} worlds found)`)
  );

  // =========================================================== //

  const world_id = await p.select({
    message: "Select a world to load",
    options: worlds.map((world) => ({
      value: world.id || "",
      label: world.name || "Unknown World",
      hint: `Modified: ${new Date(
        world.modifiedTime ? world.modifiedTime : Date.now()
      ).toLocaleString()} | Size: ${
        world.size
          ? (parseInt(world.size) / 1024 / 1024).toFixed(2) + " MB"
          : "Unknown"
      }`,
    })),
  });

  const zipFile = worlds.find((w) => w.id === world_id);

  if (!zipFile) {
    p.log.error("No world selected.");
    return;
  }

  p.log.info(
    `Loading world from Google Drive: ${zipFile.name} (${zipFile.size} bytes)`
  );

  s.start("Downloading world from Google Drive...");

  const dest = fs.createWriteStream(path.resolve(worldPath, "..", "world.zip"));

  const filename = zipFile.name;
  const fileId = zipFile.id;
  const filesize = parseInt(zipFile.size || "0");

  if (!filename || !fileId) {
    p.log.error("Invalid file metadata. Cannot load world.");
    return;
  }

  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" }
  );

  let downloaded = 0;

  res.data
    .on("data", (chunk) => {
      downloaded += chunk.length;
      const percent = ((downloaded / filesize) * 100).toFixed(2);
      s.message(
        `Downloading: ${chalk.greenBright(`${percent}%`)} ` +
          `(${chalk.yellowBright(
            `${downloaded} bytes`
          )} of ${chalk.yellowBright(`${filesize} bytes`)})`
      );
    })
    .on("end", () => {
      s.stop(
        chalk.greenBright("✓ ") +
          `World downloaded successfully: ${filename} (${filesize} bytes)`
      );
      p.log.info(
        `World saved to: ${path.resolve(worldPath, "..", "world.zip")}`
      );
    })
    .on("error", (err) => {
      s.stop("Failed to download world from Google Drive.");
      p.log.error(`Error downloading world: ${err.message || err}`);
      dest.close();
      fs.unlinkSync(path.resolve(worldPath, "..", "world.zip"));
    })
    .pipe(dest);

  // Wait for the stream to finish
  await new Promise<void>((resolve, reject) => {
    dest.on("finish", resolve);
    dest.on("error", reject);
  });

  // Unzip the downloaded world
  s.start("Unzipping downloaded world...");

  try {
    // Ensure the worldPath exists
    if (!fs.existsSync(worldPath)) {
      fs.mkdirSync(worldPath, { recursive: true });
    }

    const unzip = Bun.spawn(
      ["unzip", "-o", path.resolve(worldPath, "..", "world.zip")],
      {
        cwd: worldPath,
      }
    );

    await unzip.exited;

    s.stop(chalk.greenBright("✓ ") + "World unzipped successfully.");
  } catch (error) {
    s.stop("Failed to unzip world.");
    p.log.error(`Error unzipping world: ${error}`);
    return;
  }

  // Clean up the zip file
  fs.unlinkSync(path.resolve(worldPath, "..", "world.zip"));
  p.log.info("Temporary zip file deleted.");

  p.log.success("World loaded successfully!");
  p.log.info(`World is now available at: ${worldPath}`);

  return;
}
