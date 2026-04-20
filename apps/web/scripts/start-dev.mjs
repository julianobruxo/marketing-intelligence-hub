import { execSync, spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Emulate __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// .env.local takes precedence over .env in Next.js — patch it so the live proxy ports win.
const envLocalPath = path.join(__dirname, "..", ".env.local");
const envPath = fs.existsSync(envLocalPath) ? envLocalPath : path.join(__dirname, "..", ".env");

console.log("Stopping any zombie Prisma Dev servers...");
try {
  execSync("npx prisma dev stop marketing-hub", { stdio: "ignore" });
} catch (e) {
  // Ignore errors if none was running
}

console.log("Starting Prisma Dev server...");

let output;
let retries = 0;
while (retries < 2) {
  try {
    output = execSync("npx prisma dev --name marketing-hub --detach", { encoding: "utf-8", stdio: "pipe" });
    break;
  } catch (error) {
    output = error.stdout || "";
    if (output.includes("postgres://")) break;
    retries++;
  }
}
const match = output?.match(/(postgres:\/\/\S+)/);

if (!match) {
  console.error("Failed to automatically align Prisma Dev ports. Could not find postgres url in stdout.");
  console.error(output);
  process.exit(1);
}

// Ensure the TCP URL has all safety params expected in a local proxy structure
let baseTcpUrl = match[1];
if (!baseTcpUrl.includes("connection_limit")) {
  baseTcpUrl += "&connection_limit=10&connect_timeout=0&max_idle_connection_lifetime=0&pool_timeout=0&socket_timeout=0";
}

const tcpPortMatch = baseTcpUrl.match(/:(\d+)\//);
if (!tcpPortMatch) {
  console.error("Could not parse port from URL:", baseTcpUrl);
  process.exit(1);
}

const tcpPort = parseInt(tcpPortMatch[1], 10);
console.log(`Discovered local database port: ${tcpPort}`);

// Patch .env file
if (fs.existsSync(envPath)) {
  let envContent = fs.readFileSync(envPath, "utf-8");
  
  // In Prisma 6+, npx prisma dev outputs a direct postgres:// URL.
  // We use this single URL for both connection variables.
  envContent = envContent.replace(
    /^DATABASE_URL=.*$/m,
    `DATABASE_URL="${baseTcpUrl}"`
  );
  
  envContent = envContent.replace(
    /^DIRECT_DATABASE_URL=.*$/m,
    `DIRECT_DATABASE_URL="${baseTcpUrl}"`
  );
  
  fs.writeFileSync(envPath, envContent);
  
  // CRITICAL FIX: Update the parent process env so the spawned child inherits the right variables!
  // If we don't do this, npm's initial load of the stale .env will override the file we just saved.
  process.env.DATABASE_URL = baseTcpUrl;
  process.env.DIRECT_DATABASE_URL = baseTcpUrl;

  console.log("Successfully patched .env file with current Prisma dev ports.");
} else {
  console.warn("No .env file found to patch. Proceeding strictly with NextJS dev boot.");
}

console.log("\nStarting Next.js Dev Server...");

const nextDev = spawn("npm.cmd", ["run", "dev:next"], {
  stdio: "inherit",
  shell: true,
});

nextDev.on("error", (err) => {
  console.error("Failed to start the application:", err);
  process.exit(1);
});
