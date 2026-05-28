import fs from "node:fs";
import path from "node:path";

const deploymentsDir = path.join(process.cwd(), "deployments");

export function ensureDeploymentsDir() {
  fs.mkdirSync(deploymentsDir, { recursive: true });
}

export function readDeployment(networkName: string): { contractAddress?: string } {
  const filePath = path.join(deploymentsDir, `${networkName}.json`);
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as { contractAddress?: string };
}

export function writeDeployment(networkName: string, payload: unknown) {
  ensureDeploymentsDir();
  fs.writeFileSync(path.join(deploymentsDir, `${networkName}.json`), `${JSON.stringify(payload, null, 2)}\n`);
}

export function writeMarketDeployment(networkName: string, payload: unknown) {
  ensureDeploymentsDir();
  fs.writeFileSync(path.join(deploymentsDir, `${networkName}.markets.json`), `${JSON.stringify(payload, null, 2)}\n`);
}
