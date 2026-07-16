import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRootEnvPath = path.join(__dirname, "..", ".env.local");
const cwdEnvPath = path.join(process.cwd(), ".env.local");

console.log("--- DIAGNOSTICS ---");
console.log("process.cwd():", process.cwd());
console.log("__dirname:", __dirname);
console.log("projectRootEnvPath:", projectRootEnvPath, "exists:", fs.existsSync(projectRootEnvPath));
console.log("cwdEnvPath:", cwdEnvPath, "exists:", fs.existsSync(cwdEnvPath));

let envPath = "";
if (fs.existsSync(projectRootEnvPath)) {
  envPath = projectRootEnvPath;
} else if (fs.existsSync(cwdEnvPath)) {
  envPath = cwdEnvPath;
}

console.log("Selected envPath:", envPath);
console.log("GEMINI_API_KEY before dotenv:", JSON.stringify(process.env.GEMINI_API_KEY));

if (envPath) {
  const result = dotenv.config({ path: envPath, override: true });
  console.log("dotenv.config parsed keys:", Object.keys(result.parsed || {}));
  console.log("dotenv.config error:", result.error);
} else {
  console.log("No env.local file located!");
}

console.log("GEMINI_API_KEY after dotenv:", JSON.stringify(process.env.GEMINI_API_KEY));
console.log("-------------------");
