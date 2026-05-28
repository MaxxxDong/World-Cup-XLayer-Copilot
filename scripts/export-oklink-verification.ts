import fs from "node:fs";
import path from "node:path";
import { AbiCoder } from "ethers";
import { readDeployment } from "./deployment-files";

interface BuildInfo {
  id: string;
  input: unknown;
  output: {
    contracts?: Record<string, Record<string, { evm?: { bytecode?: { object?: string }; deployedBytecode?: { object?: string } } }>>;
  };
  solcVersion: string;
}

interface XLayerDeployment {
  contractAddress?: string;
  stakeToken?: string;
  feeRecipient?: string;
  feeBps?: number;
}

const root = process.cwd();
const buildInfoDir = path.join(root, "artifacts", "build-info");
const artifactPath = path.join(root, "artifacts", "contracts", "WorldCupTriMarket.sol", "WorldCupTriMarket.json");
const outputDir = path.join(root, "verification");
const contractSource = "contracts/WorldCupTriMarket.sol";
const contractName = "WorldCupTriMarket";

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function findBuildInfo() {
  const artifact = readJson<{ bytecode: string; deployedBytecode: string }>(artifactPath);
  const files = fs.readdirSync(buildInfoDir).filter((file) => file.endsWith(".json"));

  for (const file of files) {
    const buildInfo = readJson<BuildInfo>(path.join(buildInfoDir, file));
    const contract = buildInfo.output.contracts?.[contractSource]?.[contractName];
    const bytecode = `0x${contract?.evm?.bytecode?.object ?? ""}`;
    const deployedBytecode = `0x${contract?.evm?.deployedBytecode?.object ?? ""}`;
    if (bytecode === artifact.bytecode && deployedBytecode === artifact.deployedBytecode) {
      return { file, buildInfo };
    }
  }

  throw new Error("Could not find matching build-info for WorldCupTriMarket artifact.");
}

function main() {
  const deployment = readDeployment("xlayer-mainnet") as XLayerDeployment;
  if (!deployment.contractAddress || !deployment.stakeToken || !deployment.feeRecipient || deployment.feeBps === undefined) {
    throw new Error("deployments/xlayer-mainnet.json is missing contractAddress, stakeToken, feeRecipient, or feeBps.");
  }

  const { file, buildInfo } = findBuildInfo();
  const constructorArgs = AbiCoder.defaultAbiCoder().encode(
    ["address", "address", "uint16"],
    [deployment.stakeToken, deployment.feeRecipient, deployment.feeBps]
  );

  fs.mkdirSync(outputDir, { recursive: true });
  const standardJsonPath = path.join(outputDir, "WorldCupTriMarket.standard-json-input.json");
  const constructorArgsPath = path.join(outputDir, "WorldCupTriMarket.constructor-args.txt");
  const fieldsPath = path.join(outputDir, "oklink-fields.md");

  fs.writeFileSync(standardJsonPath, `${JSON.stringify(buildInfo.input, null, 2)}\n`);
  fs.writeFileSync(constructorArgsPath, `${constructorArgs.slice(2)}\n`);
  fs.writeFileSync(
    fieldsPath,
    [
      "# OKLink Verification Fields",
      "",
      `- Contract address: \`${deployment.contractAddress}\``,
      "- Compiler type: `Solidity Standard JSON Input`",
      `- Compiler version: \`v${buildInfo.solcVersion}\``,
      "- Optimization: enabled",
      "- Optimization runs: `200`",
      "- viaIR: `true`",
      `- Standard JSON input: \`${path.relative(root, standardJsonPath)}\``,
      `- Constructor arguments ABI-encoded: \`${path.relative(root, constructorArgsPath)}\``,
      `- Build info: \`${path.relative(root, path.join(buildInfoDir, file))}\``,
      ""
    ].join("\n")
  );

  console.log(`Wrote ${standardJsonPath}`);
  console.log(`Wrote ${constructorArgsPath}`);
  console.log(`Wrote ${fieldsPath}`);
}

main();
