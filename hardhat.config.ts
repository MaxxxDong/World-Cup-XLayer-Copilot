import "@nomicfoundation/hardhat-toolbox";
import dotenv from "dotenv";
import type { HardhatUserConfig } from "hardhat/config";

dotenv.config();

const xlayerRpcUrl = process.env.XLAYER_RPC_URL || "https://rpc.xlayer.tech";
const deployerPrivateKey = process.env.XLAYER_DEPLOYER_PRIVATE_KEY;
const oklinkApiKey = process.env.OKLINK_API_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {
      chainId: 31337
    },
    xlayer: {
      url: xlayerRpcUrl,
      chainId: 196,
      accounts: deployerPrivateKey ? [deployerPrivateKey] : []
    }
  },
  etherscan: {
    apiKey: {
      xlayer: oklinkApiKey
    },
    customChains: [
      {
        network: "xlayer",
        chainId: 196,
        urls: {
          apiURL: "https://www.oklink.com/api/v5/explorer/contract/verify-source-code-plugin/XLAYER",
          browserURL: "https://www.oklink.com/xlayer"
        }
      }
    ]
  },
  paths: {
    sources: "contracts",
    tests: "test",
    cache: "cache",
    artifacts: "artifacts"
  }
};

export default config;
