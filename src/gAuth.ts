import { google } from "googleapis";
import path from "path";
import fs from "fs";
import * as p from "@clack/prompts";
import chalk from "chalk";
import credentials from "../cred.json" assert { type: "json" };

const SCOPES = ["https://www.googleapis.com/auth/drive"];
const TOKEN_PATH = path.resolve(process.cwd(), "./token.json");
const { client_secret, client_id, redirect_uris } = credentials.installed;

export async function getGoogleAuth() {
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  /**
   * Check if token.json exists and load credentials
   */
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
    oAuth2Client.setCredentials(token);
    p.log.success(
      chalk.yellowBright("[AUTH]: ") + "Token loaded from token.json"
    );
    return oAuth2Client;
  }

  /**
   * If token.json does not exist, generate a new one
   * and prompt the user to authorize the application.
   */
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });
  // console.log("Authorize this app by visiting this URL:", authUrl);
  p.log.info(
    chalk.yellowBright("[AUTH]: ") +
      `Authorize this app by visiting this URL: ${authUrl}`
  );

  const code = (
    await p.text({
      message: "After authorizing, enter the code provided by Google here:",
    })
  )
    .toString()
    .trim();

  if (!code) {
    p.log.error(
      chalk.yellowBright("[AUTH]: ") + "No token provided. Exiting..."
    );
    return;
  }

  return new Promise<typeof oAuth2Client>((resolve, reject) => {
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return reject(err);
      if (!token) {
        p.log.error(
          chalk.yellowBright("[AUTH]: ") + "No token received. Exiting..."
        );
        return reject(new Error("No token received"));
      }

      oAuth2Client.setCredentials(token);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
      p.log.success(
        chalk.yellowBright("[AUTH]: ") + "Token stored to token.json"
      );
      resolve(oAuth2Client);
    });
  });
}
