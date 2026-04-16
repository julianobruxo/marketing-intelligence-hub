import { execSync, spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Emulate __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, "..", ".env");

console.log("Starting Prisma Dev server...");

let output;
try {
  output = execSync("npx prisma dev --name marketing-hub --detach", { encoding: "utf-8" });
} catch (error) {
  output = error.stdout || "";
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

// The core TCP port mapped by the local DB proxy
const tcpPortMatch = baseTcpUrl.match(/:(\d+)\//);
if (!tcpPortMatch) {
  console.error("Could not parse port from URL:", baseTcpUrl);
  process.exit(1);
}

const tcpPort = parseInt(tcpPortMatch[1], 10);
const proxyPort = tcpPort - 1;
const shadowPort = tcpPort + 1;

const shadowUrl = baseTcpUrl.replace(`:${tcpPort}/`, `:${shadowPort}/`);

const apiKeyPayload = {
  databaseUrl: baseTcpUrl,
  name: "marketing-hub",
  shadowDatabaseUrl: shadowUrl,
};

const apiKeyBase64 = Buffer.from(JSON.stringify(apiKeyPayload)).toString("base64");
const proxyUrl = `prisma+postgres://localhost:${proxyPort}/?api_key=${apiKeyBase64}`;

console.log(`Discovered TCP Port: ${tcpPort}`);
console.log(`Discovered Proxy Port: ${proxyPort}`);

// Patch .env file
if (fs.existsSync(envPath)) {
  let envContent = fs.readFileSync(envPath, "utf-8");
  
  envContent = envContent.replace(
    /^DATABASE_URL=.*$/m,
    `DATABASE_URL="${proxyUrl}"`
  );
  
  envContent = envContent.replace(
    /^DIRECT_DATABASE_URL=.*$/m,
    `DIRECT_DATABASE_URL="${baseTcpUrl}"`
  );
  
  fs.writeFileSync(envPath, envContent);
  console.log("Successfully patched .env file with current Prisma dev ports.");
} else {
  console.warn("No .env file found to patch. Proceeding strictly with NextJS dev boot.");
}

console.log("\nStarting Next.js Dev Server...");

const nextDev = spawn("npm.cmd", ["run", "dev"], {
  stdio: "inherit",
  shell: true,
});

nextDev.on("error", (err) => {
  console.error("Failed to start the application:", err);
  process.exit(1);
});
