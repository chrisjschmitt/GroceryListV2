import { list } from "@vercel/blob";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// 1. Load Environment Variables from .env.local
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
if (!BLOB_TOKEN) {
  console.error("Error: BLOB_READ_WRITE_TOKEN is not defined in .env.local");
  process.exit(1);
}

async function sync() {
  console.log("Fetching list of blobs from production Vercel Blob storage...");
  try {
    const { blobs } = await list({ token: BLOB_TOKEN });
    const targetFiles = [
      "grocerylist/combined-catalog.json",
      "grocerylist/prices.json",
      "grocerylist/scrape-config.json",
    ];

    const dbDir = path.join(process.cwd(), "db-storage");
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    for (const pathname of targetFiles) {
      const blob = blobs.find(b => b.pathname === pathname);
      if (!blob) {
        console.warn(`Warning: Blob not found for path "${pathname}"`);
        continue;
      }

      console.log(`Downloading ${pathname}...`);
      let response = await fetch(blob.url);
      if (!response.ok) {
        response = await fetch(blob.url, {
          headers: {
            Authorization: `Bearer ${BLOB_TOKEN}`,
          },
        });
      }

      if (!response.ok) {
        throw new Error(`Failed to download ${pathname}: ${response.statusText}`);
      }

      const text = await response.text();
      // Validate JSON format
      JSON.parse(text);

      const localFileName = pathname.replace(/\//g, "-");
      const localFilePath = path.join(dbDir, localFileName);
      fs.writeFileSync(localFilePath, text, "utf8");
      console.log(`Saved locally to: db-storage/${localFileName}`);
    }

    console.log("\nSuccess! Production combined-catalog, prices, and scrape-config are now synchronized locally.");
  } catch (err: any) {
    console.error("Sync Error:", err.message || String(err));
    process.exit(1);
  }
}

sync();
