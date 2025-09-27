import Cloudflare from "cloudflare";
import { config } from "../config";

export const ZONE_ID = config.dns.zone_id;
export const API_TOKEN = config.dns.api_token;

export const client = new Cloudflare({
  apiToken: API_TOKEN,
});
