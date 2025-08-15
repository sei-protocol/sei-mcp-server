import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {getSupportedNetworks, getRpcUrl, DEFAULT_NETWORK} from "./chains.js";
import * as services from "./services/index.js";
import {type Address, type Hex, type Hash, WriteContractParameters, Abi} from 'viem';
import { getPrivateKeyAsHex } from "./config.js";

/**
 * Register all EVM-related tools with the MCP server
 *
 * @param server The MCP server instance
 */
export function registerEVMTools(server: McpServer) {
  // NETWORK INFORMATION TOOLS

  // Get chain information
  server.tool(
    "get_chain_info",
    "Get information about Sei network",
    {
      network: z.string().optional().describe("Network name (e.g., 'sei', 'sei-testnet', 'sei-devnet', etc.) or chain ID. Supports all Sei networks. Defaults to Sei mainnet.")
    },
    async ({ network = DEFAULT_NETWORK }) => {
      try {
        const chainId = await services.getChainId(network);
        const blockNumber = await services.getBlockNumber(network);
        const rpcUrl = getRpcUrl(network);

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              network,
              chainId,
              blockNumber: blockNumber.toString(),
              rpcUrl
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error fetching chain info: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Get supported networks
  server.tool(
    "get_supported_networks",
    "Get a list of supported EVM networks",
    {},
    async () => {
      try {
        const networks = getSupportedNetworks();

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              supportedNetworks: networks
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error fetching supported networks: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // BLOCK TOOLS

  // Get block by number
  server.tool(
    "get_block_by_number",
    "Get a block by its block number",
    {
      blockNumber: z.number().describe("The block number to fetch"),
      network: z.string().optional().describe("Network name or chain ID. Defaults to Sei mainnet.")
    },
    async ({ blockNumber, network = DEFAULT_NETWORK }) => {
      try {
        const block = await services.getBlockByNumber(blockNumber, network);

        return {
          content: [{
            type: "text",
            text: services.helpers.formatJson(block)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error fetching block ${blockNumber}: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Get latest block
  server.tool(
    "get_latest_block",
    "Get the latest block from the EVM",
    {
      network: z.string().optional().describe("Network name or chain ID. Defaults to Sei mainnet.")
    },
    async ({ network = DEFAULT_NETWORK }) => {
      try {
        const block = await services.getLatestBlock(network);

        return {
          content: [{
            type: "text",
            text: services.helpers.formatJson(block)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error fetching latest block: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // BALANCE TOOLS

  // Get Sei balance
  server.tool(
    "get_balance",
    "Get the native token balance (Sei) for an address",
    {
      address: z.string().describe("The wallet address name (e.g., '0x1234...') to check the balance for"),
      network: z.string().optional().describe("Network name (e.g., 'sei', 'sei-testnet', 'sei-devnet', etc.) or chain ID. Supports all Sei networks. Defaults to Sei mainnet.")
    },
    async ({ address, network = DEFAULT_NETWORK }) => {
      try {
        const balance = await services.getBalance(address, network);

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              address,
              network,
              wei: balance.wei.toString(),
              ether: balance.sei
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error fetching balance: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Get ERC20 balance
  server.tool(
    "get_erc20_balance",
    "Get the ERC20 token balance of an EVM address",
    {
      address: z.string().describe("The EVM address to check"),
      tokenAddress: z.string().describe("The ERC20 token contract address"),
      network: z.string().optional().describe("Network name or chain ID. Defaults to Sei mainnet.")
    },
    async ({ address, tokenAddress, network = DEFAULT_NETWORK }) => {
      try {
        const balance = await services.getERC20Balance(
          tokenAddress as Address,
          address as Address,
          network
        );

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              address,
              tokenAddress,
              network,
              balance: {
                raw: balance.raw.toString(),
                formatted: balance.formatted,
                decimals: balance.token.decimals
              }
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error fetching ERC20 balance for ${address}: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Get ERC20 token balance
  server.tool(
    "get_token_balance",
    "Get the balance of an ERC20 token for an address",
    {
      tokenAddress: z.string().describe("The contract address name of the ERC20 token (e.g., '0x3894085Ef7Ff0f0aeDf52E2A2704928d1Ec074F1')"),
      ownerAddress: z.string().describe("The wallet address name to check the balance for (e.g., '0x1234...')"),
      network: z.string().optional().describe("Network name (e.g., 'sei', 'sei-testnet', 'sei-devnet', etc.) or chain ID. Supports all Sei networks. Defaults to Sei mainnet.")
    },
    async ({ tokenAddress, ownerAddress, network = DEFAULT_NETWORK }) => {
      try {
        const balance = await services.getERC20Balance(tokenAddress, ownerAddress, network);

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              tokenAddress,
              owner: ownerAddress,
              network,
              raw: balance.raw.toString(),
              formatted: balance.formatted,
              symbol: balance.token.symbol,
              decimals: balance.token.decimals
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error fetching token balance: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // TRANSACTION TOOLS

  // Get transaction by hash
  server.tool(
    "get_transaction",
    "Get detailed information about a specific transaction by its hash. Includes sender, recipient, value, data, and more.",
    {
      txHash: z.string().describe("The transaction hash to look up (e.g., '0x1234...')"),
      network: z.string().optional().describe("Network name (e.g., 'sei', 'sei-testnet', 'sei-devnet', etc.) or chain ID. Defaults to Sei mainnet.")
    },
    async ({ txHash, network = DEFAULT_NETWORK }) => {
      try {
        const tx = await services.getTransaction(txHash as Hash, network);

        return {
          content: [{
            type: "text",
            text: services.helpers.formatJson(tx)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error fetching transaction ${txHash}: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Get transaction receipt
  server.tool(
    "get_transaction_receipt",
    "Get a transaction receipt by its hash",
    {
      txHash: z.string().describe("The transaction hash to look up"),
      network: z.string().optional().describe("Network name or chain ID. Defaults to Sei mainnet.")
    },
    async ({ txHash, network = DEFAULT_NETWORK }) => {
      try {
        const receipt = await services.getTransactionReceipt(txHash as Hash, network);

        return {
          content: [{
            type: "text",
            text: services.helpers.formatJson(receipt)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error fetching transaction receipt ${txHash}: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Estimate gas
  server.tool(
    "estimate_gas",
    "Estimate the gas cost for a transaction",
    {
      to: z.string().describe("The recipient address"),
      value: z.string().optional().describe("The amount of Sei to send (e.g., '0.1')"),
      data: z.string().optional().describe("The transaction data as a hex string"),
      network: z.string().optional().describe("Network name or chain ID. Defaults to Sei mainnet.")
    },
    async ({ to, value, data, network = DEFAULT_NETWORK }) => {
      try {
        const params: any = { to: to as Address };

        if (value) {
          params.value = services.helpers.parseEther(value);
        }

        if (data) {
          params.data = data as `0x${string}`;
        }

        const gas = await services.estimateGas(params, network);

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              network,
              estimatedGas: gas.toString()
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error estimating gas: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // TRANSFER TOOLS

  // Transfer Sei
  server.tool(
    "transfer_sei",
    "Transfer native tokens (Sei) to an address",
    {
      to: z.string().describe("The recipient address (e.g., '0x1234...'"),
      amount: z.string().describe("Amount to send in SEI (or the native token of the network), as a string (e.g., '0.1')"),
      network: z.string().optional().describe("Network name (e.g., 'sei', 'sei-testnet', 'sei-devnet') or chain ID. Defaults to Sei mainnet.")
    },
    async ({ to, amount, network = DEFAULT_NETWORK }) => {
      try {
        const txHash = await services.transferSei(to, amount, network);

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              txHash,
              to,
              amount,
              network
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error transferring Sei: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Transfer ERC20
  server.tool(
    "transfer_erc20",
    "Transfer ERC20 tokens to another address",
    {
      tokenAddress: z.string().describe("The address of the ERC20 token contract"),
      toAddress: z.string().describe("The recipient address"),
      amount: z.string().describe("The amount of tokens to send (in token units, e.g., '10' for 10 tokens)"),
      network: z.string().optional().describe("Network name (e.g., 'sei', 'sei-testnet', 'sei-devnet') or chain ID. Defaults to Sei mainnet.")
    },
    async ({ tokenAddress, toAddress, amount, network = DEFAULT_NETWORK }) => {
      try {
        const result = await services.transferERC20(
          tokenAddress,
          toAddress,
          amount,
          network
        );

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              txHash: result.txHash,
              network,
              tokenAddress,
              recipient: toAddress,
              amount: result.amount.formatted,
              symbol: result.token.symbol
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error transferring ERC20 tokens: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Approve ERC20 token spending
  server.tool(
    "approve_token_spending",
    "Approve another address (like a DeFi protocol or exchange) to spend your ERC20 tokens. This is often required before interacting with DeFi protocols.",
    {
      tokenAddress: z.string().describe("The contract address of the ERC20 token to approve for spending (e.g., '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')"),
      spenderAddress: z.string().describe("The contract address being approved to spend your tokens (e.g., a DEX or lending protocol)"),
      amount: z.string().describe("The amount of tokens to approve in token units, not wei (e.g., '1000' to approve spending 1000 tokens). Use a very large number for unlimited approval."),
      network: z.string().optional().describe("Network name (e.g., 'sei', 'sei-testnet', 'sei-devnet') or chain ID. Defaults to Sei mainnet.")
    },
    async ({ tokenAddress, spenderAddress, amount, network = DEFAULT_NETWORK }) => {
      try {
        const result = await services.approveERC20(
          tokenAddress,
          spenderAddress,
          amount,
          network
        );

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              txHash: result.txHash,
              network,
              tokenAddress,
              spender: spenderAddress,
              amount: result.amount.formatted,
              symbol: result.token.symbol
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error approving token spending: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Transfer NFT (ERC721)
  server.tool(
    "transfer_nft",
    "Transfer an NFT (ERC721 token) from one address to another. Requires the private key of the current owner for signing the transaction.",
    {
      tokenAddress: z.string().describe("The contract address of the NFT collection (e.g., '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D')"),
      tokenId: z.string().describe("The ID of the specific NFT to transfer (e.g., '1234')"),
      toAddress: z.string().describe("The recipient wallet address that will receive the NFT"),
      network: z.string().optional().describe("Network name (e.g., 'sei', 'sei-testnet', 'sei-devnet') or chain ID. Most NFTs are on Sei mainnet, which is the default.")
    },
    async ({ tokenAddress, tokenId, toAddress, network = DEFAULT_NETWORK }) => {
      try {
        const result = await services.transferERC721(
          tokenAddress,
          toAddress,
          BigInt(tokenId),
          network
        );

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              txHash: result.txHash,
              network,
              collection: tokenAddress,
              tokenId: result.tokenId,
              recipient: toAddress,
              name: result.token.name,
              symbol: result.token.symbol
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error transferring NFT: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Transfer ERC1155 token
  server.tool(
    "transfer_erc1155",
    "Transfer ERC1155 tokens to another address. ERC1155 is a multi-token standard that can represent both fungible and non-fungible tokens in a single contract.",
    {
      tokenAddress: z.string().describe("The contract address of the ERC1155 token collection (e.g., '0x76BE3b62873462d2142405439777e971754E8E77')"),
      tokenId: z.string().describe("The ID of the specific token to transfer (e.g., '1234')"),
      amount: z.string().describe("The quantity of tokens to send (e.g., '1' for a single NFT or '10' for 10 fungible tokens)"),
      toAddress: z.string().describe("The recipient wallet address that will receive the tokens"),
      network: z.string().optional().describe("Network name (e.g., 'sei', 'sei-testnet', 'sei-devnet') or chain ID. ERC1155 tokens exist across many networks. Defaults to Sei mainnet.")
    },
    async ({ tokenAddress, tokenId, amount, toAddress, network = DEFAULT_NETWORK }) => {
      try {
        const result = await services.transferERC1155(
          tokenAddress,
          toAddress,
          BigInt(tokenId),
          amount,
          network
        );

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              txHash: result.txHash,
              network,
              contract: tokenAddress,
              tokenId: result.tokenId,
              amount: result.amount,
              recipient: toAddress
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error transferring ERC1155 tokens: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Transfer ERC20 tokens
  server.tool(
    "transfer_token",
    "Transfer ERC20 tokens to an address",
    {
      tokenAddress: z.string().describe("The contract address of the ERC20 token to transfer (e.g., '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')"),
      toAddress: z.string().describe("The recipient address that will receive the tokens (e.g., '0x1234...')"),
      amount: z.string().describe("Amount of tokens to send as a string (e.g., '100' for 100 tokens). This will be adjusted for the token's decimals."),
      network: z.string().optional().describe("Network name (e.g., 'sei', 'sei-testnet', 'sei-devnet') or chain ID. Supports all Sei networks. Defaults to Sei mainnet.")
    },
    async ({ tokenAddress, toAddress, amount, network = DEFAULT_NETWORK }) => {
      try {
        const result = await services.transferERC20(
          tokenAddress,
          toAddress,
          amount,
          network
        );

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              txHash: result.txHash,
              tokenAddress,
              toAddress,
              amount: result.amount.formatted,
              symbol: result.token.symbol,
              network
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error transferring tokens: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // CONTRACT TOOLS

  // Read contract
  server.tool(
    "read_contract",
    "Read data from a smart contract by calling a view/pure function. This doesn't modify blockchain state and doesn't require gas or signing.",
    {
      contractAddress: z.string().describe("The address of the smart contract to interact with"),
      abi: z.array(z.any()).describe("The ABI (Application Binary Interface) of the smart contract function, as a JSON array"),
      functionName: z.string().describe("The name of the function to call on the contract (e.g., 'balanceOf')"),
      args: z.array(z.any()).optional().describe("The arguments to pass to the function, as an array (e.g., ['0x1234...'])"),
      network: z.string().optional().describe("Network name (e.g., 'sei', 'sei-testnet', 'sei-devnet') or chain ID. Defaults to Sei mainnet.")
    },
    async ({ contractAddress, abi, functionName, args = [], network = DEFAULT_NETWORK }) => {
      try {
        // Parse ABI if it's a string
        const parsedAbi = typeof abi === 'string' ? JSON.parse(abi) : abi;

        const params = {
          address: contractAddress as Address,
          abi: parsedAbi,
          functionName,
          args
        };

        const result = await services.readContract(params, network);

        return {
          content: [{
            type: "text",
            text: services.helpers.formatJson(result)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error reading contract: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Write to contract
  server.tool(
    "write_contract",
    "Write data to a smart contract by calling a state-changing function. This modifies blockchain state and requires gas payment and transaction signing.",
    {
      contractAddress: z.string().describe("The address of the smart contract to interact with"),
      abi: z.array(z.any()).describe("The ABI (Application Binary Interface) of the smart contract function, as a JSON array"),
      functionName: z.string().describe("The name of the function to call on the contract (e.g., 'transfer')"),
      args: z.array(z.any()).describe("The arguments to pass to the function, as an array (e.g., ['0x1234...', '1000000000000000000'])"),
      network: z.string().optional().describe("Network name (e.g., 'sei', 'sei-testnet', 'sei-devnet') or chain ID. Defaults to Sei mainnet.")
    },
    async ({ contractAddress, abi, functionName, args, network = DEFAULT_NETWORK }) => {
      try {
        // Parse ABI if it's a string
        const parsedAbi = typeof abi === 'string' ? JSON.parse(abi) : abi;

        const contractParams: Record<string, any> = {
          address: contractAddress as Address,
          abi: parsedAbi,
          functionName,
          args
        };

        const txHash = await services.writeContract(
          contractParams,
          network
        );

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              network,
              transactionHash: txHash,
              message: "Contract write transaction sent successfully"
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error writing to contract: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Check if address is a contract
  server.tool(
    "is_contract",
    "Check if an address is a smart contract or an externally owned account (EOA)",
    {
      address: z.string().describe("The wallet or contract address to check (e.g., '0x1234...')"),
      network: z.string().optional().describe("Network name (e.g., 'sei', 'sei-testnet', 'sei-devnet', etc.) or chain ID. Supports all Sei networks. Defaults to Sei mainnet.")
    },
    async ({ address, network = DEFAULT_NETWORK }) => {
      try {
        const isContract = await services.isContract(address, network);

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              address,
              network,
              isContract,
              type: isContract ? "Contract" : "Externally Owned Account (EOA)"
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error checking if address is a contract: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Get ERC20 token information
  server.tool(
    "get_token_info",
    "Get comprehensive information about an ERC20 token including name, symbol, decimals, total supply, and other metadata. Use this to analyze any token on EVM chains.",
    {
      tokenAddress: z.string().describe("The contract address of the ERC20 token (e.g., '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')"),
      network: z.string().optional().describe("Network name (e.g., 'sei', 'sei-testnet', 'sei-devnet') or chain ID. Defaults to Sei mainnet.")
    },
    async ({ tokenAddress, network = DEFAULT_NETWORK }) => {
      try {
        const tokenInfo = await services.getERC20TokenInfo(tokenAddress as Address, network);

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              address: tokenAddress,
              network,
              ...tokenInfo
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error fetching token info: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Get ERC20 token balance
  server.tool(
    "get_token_balance_erc20",
    "Get ERC20 token balance for an address",
    {
      address: z.string().describe("The address to check balance for"),
      tokenAddress: z.string().describe("The ERC20 token contract address"),
      network: z.string().optional().describe("Network name or chain ID. Defaults to Sei mainnet.")
    },
    async ({ address, tokenAddress, network = DEFAULT_NETWORK }) => {
      try {
        const balance = await services.getERC20Balance(
          tokenAddress as Address,
          address as Address,
          network
        );

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              address,
              tokenAddress,
              network,
              balance: {
                raw: balance.raw.toString(),
                formatted: balance.formatted,
                decimals: balance.token.decimals
              }
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error fetching ERC20 balance for ${address}: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Get NFT (ERC721) information
  server.tool(
    "get_nft_info",
    "Get detailed information about a specific NFT (ERC721 token), including collection name, symbol, token URI, and current owner if available.",
    {
      tokenAddress: z.string().describe("The contract address of the NFT collection (e.g., '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D')"),
      tokenId: z.string().describe("The ID of the specific NFT token to query (e.g., '1234')"),
      network: z.string().optional().describe("Network name (e.g., 'sei', ) or chain ID. Most NFTs are on Sei mainnet, which is the default.")
    },
    async ({ tokenAddress, tokenId, network = DEFAULT_NETWORK }) => {
      try {
        const nftInfo = await services.getERC721TokenMetadata(
          tokenAddress as Address,
          BigInt(tokenId),
          network
        );

        // Check ownership separately
        let owner = null;
        try {
          // This may fail if tokenId doesn't exist
          owner = await services.getPublicClient(network).readContract({
            address: tokenAddress as Address,
            abi: [{
              inputs: [{ type: 'uint256' }],
              name: 'ownerOf',
              outputs: [{ type: 'address' }],
              stateMutability: 'view',
              type: 'function'
            }],
            functionName: 'ownerOf',
            args: [BigInt(tokenId)]
          });
        } catch (e) {
          // Ownership info not available
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              contract: tokenAddress,
              tokenId,
              network,
              ...nftInfo,
              owner: owner || 'Unknown'
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error fetching NFT info: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Check NFT ownership
  server.tool(
    "check_nft_ownership",
    "Check if an address owns a specific NFT",
    {
      tokenAddress: z.string().describe("The contract address of the NFT collection (e.g., '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D')"),
      tokenId: z.string().describe("The ID of the NFT to check (e.g., '1234')"),
      ownerAddress: z.string().describe("The wallet address to check ownership against (e.g., '0x1234...')"),
      network: z.string().optional().describe("Network name (e.g., 'sei', 'sei-testnet', 'sei-devnet' etc.) or chain ID. Supports all Sei networks. Defaults to Sei mainnet.")
    },
    async ({ tokenAddress, tokenId, ownerAddress, network = DEFAULT_NETWORK }) => {
      try {
        const isOwner = await services.isNFTOwner(
          tokenAddress,
          ownerAddress,
          BigInt(tokenId),
          network
        );

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              tokenAddress,
              tokenId,
              ownerAddress,
              network,
              isOwner,
              result: isOwner ? "Address owns this NFT" : "Address does not own this NFT"
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error checking NFT ownership: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Add tool for getting ERC1155 token URI
  server.tool(
    "get_erc1155_token_uri",
    "Get the metadata URI for an ERC1155 token (multi-token standard used for both fungible and non-fungible tokens). The URI typically points to JSON metadata about the token.",
    {
      tokenAddress: z.string().describe("The contract address of the ERC1155 token collection (e.g., '0x5B6D32f2B55b62da7a8cd553857EB6Dc26bFDC63')"),
      tokenId: z.string().describe("The ID of the specific token to query metadata for (e.g., '1234')"),
      network: z.string().optional().describe("Network name (e.g., 'sei', 'sei-testnet', 'sei-devnet') or chain ID. ERC1155 tokens exist across many networks. Defaults to Sei mainnet.")
    },
    async ({ tokenAddress, tokenId, network = DEFAULT_NETWORK }) => {
      try {
        const uri = await services.getERC1155TokenURI(
          tokenAddress as Address,
          BigInt(tokenId),
          network
        );

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              contract: tokenAddress,
              tokenId,
              network,
              uri
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error fetching ERC1155 token URI: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Add tool for getting ERC721 NFT balance
  server.tool(
    "get_nft_balance",
    "Get the total number of NFTs owned by an address from a specific collection. This returns the count of NFTs, not individual token IDs.",
    {
      tokenAddress: z.string().describe("The contract address of the NFT collection (e.g., '0x5B6D32f2B55b62da7a8cd553857EB6Dc26bFDC63')"),
      ownerAddress: z.string().describe("The wallet address to check the NFT balance for (e.g., '0x1234...')"),
      network: z.string().optional().describe("Network name (e.g., 'sei', 'sei-testnet', 'sei-devnet') or chain ID. Most NFTs are on Sei mainnet, which is the default.")
    },
    async ({ tokenAddress, ownerAddress, network = DEFAULT_NETWORK }) => {
      try {
        const balance = await services.getERC721Balance(
          tokenAddress as Address,
          ownerAddress as Address,
          network
        );

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              collection: tokenAddress,
              owner: ownerAddress,
              network,
              balance: balance.toString()
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error fetching NFT balance: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Add tool for getting ERC1155 token balance
  server.tool(
    "get_erc1155_balance",
    "Get the balance of a specific ERC1155 token ID owned by an address. ERC1155 allows multiple tokens of the same ID, so the balance can be greater than 1.",
    {
      tokenAddress: z.string().describe("The contract address of the ERC1155 token collection (e.g., '0x5B6D32f2B55b62da7a8cd553857EB6Dc26bFDC63')"),
      tokenId: z.string().describe("The ID of the specific token to check the balance for (e.g., '1234')"),
      ownerAddress: z.string().describe("The wallet address to check the token balance for (e.g., '0x1234...')"),
      network: z.string().optional().describe("Network name (e.g., 'sei', 'sei-testnet', 'sei-devnet') or chain ID. ERC1155 tokens exist across many networks. Defaults to Sei mainnet.")
    },
    async ({ tokenAddress, tokenId, ownerAddress, network = DEFAULT_NETWORK }) => {
      try {
        const balance = await services.getERC1155Balance(
          tokenAddress as Address,
          ownerAddress as Address,
          BigInt(tokenId),
          network
        );

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              contract: tokenAddress,
              tokenId,
              owner: ownerAddress,
              network,
              balance: balance.toString()
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error fetching ERC1155 token balance: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // WALLET TOOLS

  // Get address from private key
  server.tool(
    "get_address_from_private_key",
    "Get the EVM address derived from a private key",
    {}, // Schema is empty as privateKey parameter was removed
    async () => { // Handler function starts here
      try {
        const privateKeyValue = getPrivateKeyAsHex();
        if (!privateKeyValue) {
          return {
            content: [{ type: "text", text: "Error: The PRIVATE_KEY environment variable is not set. Please set this variable with your private key and restart the MCP server for this tool to function." }],
            isError: true
          };
        }

        const address = services.getAddressFromPrivateKey(privateKeyValue);

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              address,
              // Do not return the private key in the response.
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error deriving address from private key: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // EVENT MONITORING TOOLS

  // Subscribe to contract events
  server.tool(
    "subscribe_to_events",
    "Subscribe to real-time contract events with optional webhook notifications",
    {
      contractAddress: z.string().describe("The contract address to monitor"),
      abi: z.array(z.any()).describe("The contract ABI for decoding events"),
      network: z.string().optional().describe("Network name or chain ID. Defaults to Sei mainnet."),
      eventName: z.string().optional().describe("Specific event name to filter (optional)"),
      webhookUrl: z.string().optional().describe("Webhook URL for notifications (optional)"),
      filters: z.record(z.any()).optional().describe("Indexed parameter filters (optional)")
    },
    async ({ contractAddress, abi, network = DEFAULT_NETWORK, eventName, webhookUrl, filters }) => {
      try {
        const { subscribeToEvents } = await import('./services/events.js');
        
        const subscriptionId = await subscribeToEvents(
          contractAddress as Address,
          abi as Abi,
          network,
          {
            eventName,
            webhookUrl,
            filters
          }
        );

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              subscriptionId,
              message: `Successfully subscribed to events for contract ${contractAddress}`,
              details: {
                network,
                eventName: eventName || 'all events',
                webhookUrl: webhookUrl || 'none',
                hasFilters: !!filters
              }
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error subscribing to events: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Unsubscribe from events
  server.tool(
    "unsubscribe_from_events",
    "Unsubscribe from a previously created event subscription",
    {
      subscriptionId: z.string().describe("The subscription ID to cancel")
    },
    async ({ subscriptionId }) => {
      try {
        const { unsubscribeFromEvents } = await import('./services/events.js');
        
        const success = await unsubscribeFromEvents(subscriptionId);

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success,
              message: success 
                ? `Successfully unsubscribed from ${subscriptionId}` 
                : `Subscription ${subscriptionId} not found`
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error unsubscribing: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Query historical events
  server.tool(
    "query_historical_events",
    "Query historical events from a smart contract",
    {
      contractAddress: z.string().describe("The contract address to query"),
      abi: z.array(z.any()).describe("The contract ABI for decoding events"),
      network: z.string().optional().describe("Network name or chain ID. Defaults to Sei mainnet."),
      eventName: z.string().optional().describe("Specific event name to filter (optional)"),
      fromBlock: z.number().optional().describe("Starting block number (optional)"),
      toBlock: z.number().optional().describe("Ending block number (optional)"),
      filters: z.record(z.any()).optional().describe("Indexed parameter filters (optional)")
    },
    async ({ contractAddress, abi, network = DEFAULT_NETWORK, eventName, fromBlock, toBlock, filters }) => {
      try {
        const { queryHistoricalEvents } = await import('./services/events.js');
        
        const events = await queryHistoricalEvents(
          contractAddress as Address,
          abi as Abi,
          network,
          {
            eventName,
            fromBlock: fromBlock ? BigInt(fromBlock) : undefined,
            toBlock: toBlock ? BigInt(toBlock) : undefined,
            filters
          }
        );

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              eventsFound: events.length,
              events: events.map(e => ({
                eventName: e.eventName,
                args: e.args,
                blockNumber: e.blockNumber.toString(),
                transactionHash: e.transactionHash,
                logIndex: e.logIndex
              }))
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error querying events: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Get active event subscriptions
  server.tool(
    "get_active_event_subscriptions",
    "Get list of all active event subscriptions",
    {},
    async () => {
      try {
        const { getActiveEventSubscriptions } = await import('./services/events.js');
        
        const subscriptions = getActiveEventSubscriptions();

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              activeSubscriptions: subscriptions.length,
              subscriptions
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error getting subscriptions: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // TRANSACTION BATCHING TOOLS

  // Execute batch transaction
  server.tool(
    "execute_batch_transaction",
    "Execute multiple contract calls in a single transaction using Multicall3",
    {
      calls: z.array(z.object({
        target: z.string().describe("Target contract address"),
        abi: z.array(z.any()).optional().describe("Contract ABI for encoding/decoding"),
        functionName: z.string().describe("Function name to call"),
        args: z.array(z.any()).optional().describe("Function arguments"),
        value: z.string().optional().describe("ETH value to send (in wei)"),
        allowFailure: z.boolean().optional().describe("Allow this call to fail without reverting the batch")
      })).describe("Array of contract calls to execute"),
      network: z.string().optional().describe("Network name or chain ID. Defaults to Sei mainnet."),
      allowPartialSuccess: z.boolean().optional().describe("Allow some calls to fail without reverting entire batch"),
      simulateFirst: z.boolean().optional().describe("Simulate the batch before executing")
    },
    async ({ calls, network = DEFAULT_NETWORK, allowPartialSuccess, simulateFirst }) => {
      try {
        const { executeBatchTransaction } = await import('./services/batching.js');
        
        // Convert string values to bigint
        const formattedCalls = calls.map(call => ({
          ...call,
          target: call.target as Address,
          value: call.value ? BigInt(call.value) : undefined
        }));

        const result = await executeBatchTransaction(
          formattedCalls,
          network,
          {
            allowPartialSuccess,
            simulateFirst
          }
        );

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              transactionHash: result.transactionHash,
              gasUsed: result.gasUsed?.toString(),
              results: result.results,
              message: `Successfully executed batch of ${calls.length} calls`
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error executing batch: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Simulate batch transaction
  server.tool(
    "simulate_batch_transaction",
    "Simulate a batch of contract calls without executing them",
    {
      calls: z.array(z.object({
        target: z.string().describe("Target contract address"),
        abi: z.array(z.any()).optional().describe("Contract ABI for encoding/decoding"),
        functionName: z.string().describe("Function name to call"),
        args: z.array(z.any()).optional().describe("Function arguments"),
        value: z.string().optional().describe("ETH value to send (in wei)")
      })).describe("Array of contract calls to simulate"),
      network: z.string().optional().describe("Network name or chain ID. Defaults to Sei mainnet.")
    },
    async ({ calls, network = DEFAULT_NETWORK }) => {
      try {
        const { simulateBatchTransaction } = await import('./services/batching.js');
        
        // Convert string values to bigint
        const formattedCalls = calls.map(call => ({
          ...call,
          target: call.target as Address,
          value: call.value ? BigInt(call.value) : undefined
        }));

        const result = await simulateBatchTransaction(formattedCalls, network);

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: result.success,
              estimatedGas: result.estimatedGas?.toString(),
              results: result.results,
              error: result.error,
              message: result.success 
                ? `Simulation successful. All ${calls.length} calls would execute.`
                : `Simulation failed: ${result.error}`
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error simulating batch: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Analyze gas optimization
  server.tool(
    "analyze_batch_gas_optimization",
    "Analyze potential gas savings from batching multiple transactions",
    {
      calls: z.array(z.object({
        target: z.string().describe("Target contract address"),
        abi: z.array(z.any()).optional().describe("Contract ABI for encoding/decoding"),
        functionName: z.string().describe("Function name to call"),
        args: z.array(z.any()).optional().describe("Function arguments"),
        value: z.string().optional().describe("ETH value to send (in wei)")
      })).describe("Array of contract calls to analyze"),
      network: z.string().optional().describe("Network name or chain ID. Defaults to Sei mainnet.")
    },
    async ({ calls, network = DEFAULT_NETWORK }) => {
      try {
        const { analyzeGasOptimization } = await import('./services/batching.js');
        
        // Convert string values to bigint
        const formattedCalls = calls.map(call => ({
          ...call,
          target: call.target as Address,
          value: call.value ? BigInt(call.value) : undefined
        }));

        const analysis = await analyzeGasOptimization(formattedCalls, network);

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              individualGasEstimates: analysis.individualGasEstimates.map(g => g.toString()),
              totalIndividualGas: analysis.individualGasEstimates.reduce((a, b) => a + b, 0n).toString(),
              batchGasEstimate: analysis.batchGasEstimate.toString(),
              gasSaved: analysis.gasSaved.toString(),
              percentageSaved: analysis.percentageSaved,
              recommendation: analysis.recommendation
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error analyzing gas optimization: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Create optimized batch
  server.tool(
    "create_optimized_batch",
    "Create an optimized batch of operations for maximum gas efficiency",
    {
      operations: z.array(z.object({
        type: z.enum(['transfer', 'approve', 'contract']).describe("Type of operation"),
        target: z.string().describe("Target contract address"),
        data: z.any().optional().describe("Operation-specific data"),
        value: z.string().optional().describe("ETH value to send (in wei)")
      })).describe("Array of operations to optimize and batch"),
      network: z.string().optional().describe("Network name or chain ID. Defaults to Sei mainnet.")
    },
    async ({ operations, network = DEFAULT_NETWORK }) => {
      try {
        const { createOptimizedBatch } = await import('./services/batching.js');
        
        // Convert string values to proper types
        const formattedOps = operations.map(op => ({
          ...op,
          target: op.target as Address,
          value: op.value ? BigInt(op.value) : undefined
        }));

        const optimizedCalls = await createOptimizedBatch(formattedOps, network);

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              optimizedBatch: optimizedCalls.map(call => ({
                target: call.target,
                functionName: call.functionName,
                hasArgs: !!call.args,
                hasValue: !!call.value,
                allowFailure: call.allowFailure
              })),
              callCount: optimizedCalls.length,
              message: `Created optimized batch with ${optimizedCalls.length} calls`
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error creating optimized batch: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );
}
