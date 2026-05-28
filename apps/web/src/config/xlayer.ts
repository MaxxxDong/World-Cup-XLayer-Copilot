import { defineChain } from "viem";

export const xLayerMainnet = defineChain({
  id: 196,
  name: "X Layer mainnet",
  nativeCurrency: {
    name: "OKB",
    symbol: "OKB",
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.xlayer.tech", "https://xlayerrpc.okx.com"]
    }
  },
  blockExplorers: {
    default: {
      name: "OKX X Layer Explorer",
      url: "https://www.okx.com/web3/explorer/xlayer"
    }
  }
});

export const xLayerUsdtAddress = "0x779Ded0c9e1022225f8E0630b35a9b54bE713736" as const;

