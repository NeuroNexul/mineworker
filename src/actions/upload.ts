import * as p from "@clack/prompts";
import archiver from "archiver";
import fs from "fs";
import chalk from "chalk";
import path from "path";
import { google } from "googleapis";
import type { drive_v3 } from "googleapis";
import { getGoogleAuth } from "../gAuth";
import axios from "axios";

export async function uploadWorldToDrive(worldPath: string): Promise<void> {
  const s = p.spinner();
  p.log.step("Uploading world to Google Drive...");

  const time = new Date()
    .toLocaleTimeString("en-US", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    })
    .replace(/,/g, "")
    .replace(/\//g, "-")
    .replace(/:/g, "-")
    .replace(/\s/g, "-");

  try {
    s.start(`Zipping ${worldPath} folder...`);

    const output = fs.createWriteStream(
      path.resolve(worldPath, `../${time}.zip`)
    );
    const archive = archiver("zip", {
      zlib: { level: 9 }, // Sets the compression level.
    });

    archive.pipe(output);
    archive.directory(worldPath, false);

    await new Promise<void>((resolve, reject) => {
      output.on("close", resolve);
      archive.on("error", reject);
      archive.finalize();
    });

    s.stop(
      chalk.greenBright("✓ ") +
        "World folder zipped successfully. " +
        chalk.dim(`(${archive.pointer()} bytes)`)
    );
  } catch (error) {
    s.stop("Failed to zip world folder.");
    p.log.error(`Error zipping world folder: ${error}`);
    return;
  }

  let drive: drive_v3.Drive;

  /**
   * Authenticate with Google Drive
   * using the getGoogleAuth function.
   */
  s.start(
    chalk.yellowBright("[AUTH]: ") + "Authenticating with Google Drive..."
  );

  const auth = await getGoogleAuth().catch((error) => {
    s.stop(
      chalk.yellowBright("[AUTH]: ") +
        "Failed to authenticate with Google Drive."
    );
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

  drive = google.drive({ version: "v3", auth });

  s.stop(
    chalk.yellowBright("[AUTH]: ") +
      chalk.greenBright("✓ ") +
      "Authenticated with Google Drive successfully."
  );

  /**
   * Upload the zipped world folder to Google Drive
   * using the Google Drive API.
   */
  let response: drive_v3.Schema$File;
  const filepath = path.resolve(worldPath, `../${time}.zip`);

  if (!fs.existsSync(filepath)) {
    p.log.error(
      chalk.redBright("[ERROR]: ") + `File ${time}.zip does not exist.`
    );
    return;
  }

  try {
    s.start("Uploading world to Google Drive...");

    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
    const stream = fs.createReadStream(filepath, { highWaterMark: CHUNK_SIZE });
    const filesize = fs.statSync(filepath).size;
    let uploadedBytes = 0;

    const res = await axios.post(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
      {
        name: `${time}.zip`,
        parents: ["1bRzcInRBJ58cEoiwK4MqceKeQ1BlX9kZ"],
      },
      {
        headers: {
          Authorization: `Bearer ${(await auth.getAccessToken()).token}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": "application/zip",
          "X-Upload-Content-Length": filesize,
        },
      }
    );

    const uploadUrl = res.headers.location;

    if (!uploadUrl) {
      s.stop("Failed to get upload URL from Google Drive.");
      p.log.error("No upload URL returned from Google Drive.");
      return;
    }

    for await (const chunk of stream) {
      const chunkSize = chunk.length;
      const endByte = uploadedBytes + chunkSize - 1;

      await axios.put(uploadUrl, chunk, {
        headers: {
          "Content-Length": chunkSize,
          "Content-Range": `bytes ${uploadedBytes}-${endByte}/${filesize}`,
        },
        validateStatus: (status) => [200, 201, 308].includes(status),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      uploadedBytes += chunkSize;
      const percentCompleted = (uploadedBytes / filesize) * 100;

      s.message(
        `Uploading: ${chalk.greenBright(`${percentCompleted.toFixed(2)}%`)} ` +
          `(${chalk.yellowBright(
            `${uploadedBytes} bytes`
          )} of ${chalk.yellowBright(`${filesize} bytes`)})`
      );
    }

    response = res.data;

    s.stop(
      chalk.greenBright("✓ ") +
        `World uploaded successfully. File ID: ${response.id}`
    );
  } catch (error) {
    s.stop("Failed to upload world to Google Drive.", 1);
    p.log.error(`Error uploading world to Google Drive: ${error}`);
    return;
  }

  p.note(
    `File Name: ${chalk.yellowBright(`${time}.zip`)}\n` +
      `File ID: ${chalk.yellowBright(response.id)}`,
    "Upload Details: "
  );
  p.outro(`World uploaded successfully!`);
}
