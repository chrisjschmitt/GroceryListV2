import { put, list } from "@vercel/blob";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// Load Environment Variables from .env.local
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

async function run() {
  const testPath = "grocerylist/concurrency-test-marker.json";
  const testVal = { value: Date.now(), rand: Math.random() };

  console.log("Writing to blob:", testPath, testVal);
  await put(testPath, JSON.stringify(testVal), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    token: BLOB_TOKEN
  });

  console.log("Listing blobs to find URL...");
  const { blobs } = await list({ token: BLOB_TOKEN });
  const target = blobs.find(b => b.pathname === testPath);
  if (!target) {
    console.error("Marker blob not found in list!");
    return;
  }

  console.log("Fetching URL:", target.url);
  const res = await fetch(target.url + `?t=${Date.now()}`);
  const fetched = await res.json();
  console.log("Fetched value:", fetched);

  if (fetched.rand === testVal.rand) {
    console.log("SUCCESS: Immediate write and read matched perfectly!");
  } else {
    console.error("FAIL: Value read did not match value written!");
  }
}

run();
