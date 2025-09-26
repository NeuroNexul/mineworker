import Cloudflare from "cloudflare";

export const ZONE_ID = "b5c3cfd440b0c9eecf7770e09bf35b3d";
export const API_TOKEN = "";

export const client = new Cloudflare({
  apiToken: API_TOKEN,
});
