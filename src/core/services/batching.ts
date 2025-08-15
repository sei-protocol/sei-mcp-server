import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
  type Hash,
  type Abi,
  type PublicClient,
  type WalletClient,
  type Account,
  type Chain,
  encodeFunctionData,
  decodeFunctionResult,
  formatUnits,
  parseUnits,
  type TransactionRequest,
  type EstimateGasParameters,
  type SimulateContractParameters
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getChain, getRpcUrl } from '../chains.js';
import { getPrivateKeyAsHex } from '../config.js';

// Multicall3 contract address (deployed on most EVM chains at the same address)
const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11' as Address;

// Multicall3 ABI (subset for our use)
const MULTICALL3_ABI = [
  {
    inputs: [
      {
        components: [
          {
            name: 'target',
            type: 'address'
          },
          {
            name: 'allowFailure',
            type: 'bool'
          },
          {
            name: 'callData',
            type: 'bytes'
          }
        ],
        name: 'calls',
        type: 'tuple[]'
      }
    ],
    name: 'aggregate3',
    outputs: [
      {
        components: [
          {
            name: 'success',
            type: 'bool'
          },
          {
            name: 'returnData',
            type: 'bytes'
          }
        ],
        name: 'returnData',
        type: 'tuple[]'
      }
    ],
    stateMutability: 'payable',
    type: 'function'
  },
  {
    inputs: [
      {
        components: [
          {
            name: 'target',
            type: 'address'
          },
          {
            name: 'callData',
            type: 'bytes'
          }
        ],
        name: 'calls',
        type: 'tuple[]'
      }
    ],
    name: 'aggregate',
    outputs: [
      {
        name: 'blockNumber',
        type: 'uint256'
      },
      {
        name: 'returnData',
        type: 'bytes[]'
      }
    ],
    stateMutability: 'payable',
    type: 'function'
  },
  {
    inputs: [
      {
        components: [
          {
            name: 'target',
            type: 'address'
          },
          {
            name: 'callData',
            type: 'bytes'
          }
        ],
        name: 'calls',
        type: 'tuple[]'
      }
    ],
    name: 'tryAggregate',
    outputs: [
      {
        components: [
          {
            name: 'success',
            type: 'bool'
          },
          {
            name: 'returnData',
            type: 'bytes'
          }
        ],
        name: 'returnData',
        type: 'tuple[]'
      }
    ],
    stateMutability: 'payable',
    type: 'function'
  }
] as const;

interface BatchCall {
  target: Address;
  abi?: Abi;
  functionName: string;
  args?: any[];
  value?: bigint;
  allowFailure?: boolean;
}

interface BatchResult {
  success: boolean;
  returnData?: any;
  error?: string;
}

interface GasOptimizationResult {
  individualGasEstimates: bigint[];
  batchGasEstimate: bigint;
  gasSaved: bigint;
  percentageSaved: number;
  recommendation: string;
}

interface SimulationResult {
  success: boolean;
  results: BatchResult[];
  estimatedGas?: bigint;
  error?: string;
}

class TransactionBatcher {
  private publicClients: Map<string, PublicClient> = new Map();
  private walletClients: Map<string, WalletClient> = new Map();

  /**
   * Get or create public client for reading blockchain data
   */
  private getPublicClient(network: string): PublicClient {
    if (!this.publicClients.has(network)) {
      const chain = getChain(network);
      const rpcUrl = getRpcUrl(network);
      const client = createPublicClient({
        chain,
        transport: http(rpcUrl)
      });
      this.publicClients.set(network, client);
    }
    return this.publicClients.get(network)!;
  }

  /**
   * Get or create wallet client for sending transactions
   */
  private getWalletClient(network: string): WalletClient {
    const privateKey = getPrivateKeyAsHex();
    if (!privateKey) {
      throw new Error('Private key not configured. Please set PRIVATE_KEY environment variable.');
    }

    const key = `${network}_${privateKey.substring(0, 10)}`;
    if (!this.walletClients.has(key)) {
      const chain = getChain(network);
      const rpcUrl = getRpcUrl(network);
      const account = privateKeyToAccount(privateKey as Hex);
      
      const client = createWalletClient({
        account,
        chain,
        transport: http(rpcUrl)
      });
      this.walletClients.set(key, client);
    }
    return this.walletClients.get(key)!;
  }

  /**
   * Check if multicall contract is available on the network
   */
  async isMulticallAvailable(network: string): Promise<boolean> {
    try {
      const client = this.getPublicClient(network);
      const bytecode = await client.getBytecode({
        address: MULTICALL3_ADDRESS
      });
      return bytecode !== undefined && bytecode !== '0x';
    } catch {
      return false;
    }
  }

  /**
   * Execute multiple contract calls in a single transaction
   */
  async executeBatch(
    calls: BatchCall[],
    network: string,
    options?: {
      allowPartialSuccess?: boolean;
      simulateFirst?: boolean;
    }
  ): Promise<{
    transactionHash?: Hash;
    results: BatchResult[];
    gasUsed?: bigint;
  }> {
    const publicClient = this.getPublicClient(network);
    const walletClient = this.getWalletClient(network);

    // Check if multicall is available
    const multicallAvailable = await this.isMulticallAvailable(network);
    if (!multicallAvailable) {
      throw new Error(`Multicall3 contract not available on ${network}. Deploy it first or use individual transactions.`);
    }

    // Simulate first if requested
    if (options?.simulateFirst) {
      const simulation = await this.simulateBatch(calls, network);
      if (!simulation.success) {
        throw new Error(`Batch simulation failed: ${simulation.error}`);
      }
    }

    // Encode all calls
    const encodedCalls = calls.map(call => {
      const callData = encodeFunctionData({
        abi: call.abi || [],
        functionName: call.functionName,
        args: call.args || []
      });

      return {
        target: call.target,
        allowFailure: call.allowFailure ?? options?.allowPartialSuccess ?? false,
        callData
      };
    });

    // Calculate total value to send
    const totalValue = calls.reduce((sum, call) => sum + (call.value || 0n), 0n);

    try {
      // Execute the multicall
      const hash = await walletClient.writeContract({
        address: MULTICALL3_ADDRESS,
        abi: MULTICALL3_ABI,
        functionName: 'aggregate3',
        args: [encodedCalls],
        value: totalValue,
        account: walletClient.account!,
        chain: walletClient.chain
      });

      // Wait for transaction confirmation
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // Decode results
      const results: BatchResult[] = [];
      if (receipt.status === 'success') {
        // Get the return data from the transaction
        const returnData = await publicClient.readContract({
          address: MULTICALL3_ADDRESS,
          abi: MULTICALL3_ABI,
          functionName: 'aggregate3',
          args: [encodedCalls]
        }) as Array<{success: boolean; returnData: `0x${string}`}>;

        for (let i = 0; i < returnData.length; i++) {
          const call = calls[i];
          const result = returnData[i];
          
          if (result.success && call.abi) {
            try {
              const decodedData = decodeFunctionResult({
                abi: call.abi,
                functionName: call.functionName,
                data: result.returnData
              });
              results.push({
                success: true,
                returnData: decodedData
              });
            } catch (error) {
              results.push({
                success: true,
                returnData: result.returnData
              });
            }
          } else {
            results.push({
              success: result.success,
              returnData: result.returnData,
              error: result.success ? undefined : 'Call failed'
            });
          }
        }
      }

      return {
        transactionHash: hash,
        results,
        gasUsed: receipt.gasUsed
      };
    } catch (error) {
      throw new Error(`Batch execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Simulate batch execution without sending transaction
   */
  async simulateBatch(
    calls: BatchCall[],
    network: string
  ): Promise<SimulationResult> {
    const client = this.getPublicClient(network);

    // Check if multicall is available
    const multicallAvailable = await this.isMulticallAvailable(network);
    if (!multicallAvailable) {
      return {
        success: false,
        results: [],
        error: 'Multicall3 contract not available on this network'
      };
    }

    try {
      // Encode all calls
      const encodedCalls = calls.map(call => {
        const callData = encodeFunctionData({
          abi: call.abi || [],
          functionName: call.functionName,
          args: call.args || []
        });

        return {
          target: call.target,
          allowFailure: true, // Always allow failure in simulation
          callData
        };
      });

      // Simulate the multicall
      const result = await client.simulateContract({
        address: MULTICALL3_ADDRESS,
        abi: MULTICALL3_ABI,
        functionName: 'aggregate3',
        args: [encodedCalls],
        value: calls.reduce((sum, call) => sum + (call.value || 0n), 0n)
      });

      // Process results
      const results: BatchResult[] = [];
      for (let i = 0; i < result.result.length; i++) {
        const call = calls[i];
        const callResult = result.result[i];
        
        if (callResult.success && call.abi) {
          try {
            const decodedData = decodeFunctionResult({
              abi: call.abi,
              functionName: call.functionName,
              data: callResult.returnData
            });
            results.push({
              success: true,
              returnData: decodedData
            });
          } catch {
            results.push({
              success: true,
              returnData: callResult.returnData
            });
          }
        } else {
          results.push({
            success: callResult.success,
            returnData: callResult.returnData,
            error: callResult.success ? undefined : 'Call would fail'
          });
        }
      }

      // Estimate gas
      const gasEstimate = await client.estimateContractGas({
        address: MULTICALL3_ADDRESS,
        abi: MULTICALL3_ABI,
        functionName: 'aggregate3',
        args: [encodedCalls],
        value: calls.reduce((sum, call) => sum + (call.value || 0n), 0n)
      });

      return {
        success: true,
        results,
        estimatedGas: gasEstimate
      };
    } catch (error) {
      return {
        success: false,
        results: [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Analyze gas optimization potential for batching
   */
  async analyzeGasOptimization(
    calls: BatchCall[],
    network: string
  ): Promise<GasOptimizationResult> {
    const client = this.getPublicClient(network);
    const account = privateKeyToAccount(getPrivateKeyAsHex() as Hex);

    // Estimate gas for individual calls
    const individualEstimates: bigint[] = [];
    for (const call of calls) {
      try {
        const gasEstimate = await client.estimateGas({
          account: account.address,
          to: call.target,
          data: encodeFunctionData({
            abi: call.abi || [],
            functionName: call.functionName,
            args: call.args || []
          }),
          value: call.value || 0n
        });
        individualEstimates.push(gasEstimate);
      } catch (error) {
        // If estimation fails, use a default high value
        individualEstimates.push(100000n);
      }
    }

    // Calculate total gas for individual calls
    const totalIndividualGas = individualEstimates.reduce((sum, gas) => sum + gas, 0n);

    // Estimate gas for batch call
    let batchGasEstimate: bigint;
    try {
      const simulation = await this.simulateBatch(calls, network);
      batchGasEstimate = simulation.estimatedGas || totalIndividualGas;
    } catch {
      // If multicall is not available, estimate based on formula
      // Batch typically saves ~21000 gas per call after the first
      const baseCost = individualEstimates[0] || 50000n;
      const perCallSavings = 21000n;
      batchGasEstimate = baseCost + BigInt(calls.length - 1) * (50000n - perCallSavings);
    }

    // Calculate savings
    const gasSaved = totalIndividualGas > batchGasEstimate 
      ? totalIndividualGas - batchGasEstimate 
      : 0n;
    
    const percentageSaved = totalIndividualGas > 0n
      ? Number((gasSaved * 100n) / totalIndividualGas)
      : 0;

    // Generate recommendation
    let recommendation: string;
    if (percentageSaved > 30) {
      recommendation = 'Highly recommended: Significant gas savings with batching';
    } else if (percentageSaved > 10) {
      recommendation = 'Recommended: Moderate gas savings with batching';
    } else if (percentageSaved > 0) {
      recommendation = 'Optional: Minor gas savings with batching';
    } else {
      recommendation = 'Not recommended: No gas savings or potentially more expensive';
    }

    return {
      individualGasEstimates: individualEstimates,
      batchGasEstimate,
      gasSaved,
      percentageSaved,
      recommendation
    };
  }

  /**
   * Create optimized batch from multiple operations
   */
  async createOptimizedBatch(
    operations: Array<{
      type: 'transfer' | 'approve' | 'contract';
      target: Address;
      data?: any;
      value?: bigint;
    }>,
    network: string
  ): Promise<BatchCall[]> {
    const calls: BatchCall[] = [];

    for (const op of operations) {
      switch (op.type) {
        case 'transfer':
          // ERC20 transfer
          calls.push({
            target: op.target,
            abi: [
              {
                name: 'transfer',
                type: 'function',
                inputs: [
                  { name: 'to', type: 'address' },
                  { name: 'amount', type: 'uint256' }
                ],
                outputs: [{ name: '', type: 'bool' }],
                stateMutability: 'nonpayable'
              }
            ],
            functionName: 'transfer',
            args: [op.data.to, op.data.amount],
            allowFailure: false
          });
          break;

        case 'approve':
          // ERC20 approve
          calls.push({
            target: op.target,
            abi: [
              {
                name: 'approve',
                type: 'function',
                inputs: [
                  { name: 'spender', type: 'address' },
                  { name: 'amount', type: 'uint256' }
                ],
                outputs: [{ name: '', type: 'bool' }],
                stateMutability: 'nonpayable'
              }
            ],
            functionName: 'approve',
            args: [op.data.spender, op.data.amount],
            allowFailure: false
          });
          break;

        case 'contract':
          // Generic contract call
          calls.push({
            target: op.target,
            abi: op.data.abi,
            functionName: op.data.functionName,
            args: op.data.args,
            value: op.value,
            allowFailure: op.data.allowFailure ?? false
          });
          break;
      }
    }

    // Analyze and reorder for optimal gas usage
    // Put non-failing calls first, expensive calls last
    calls.sort((a, b) => {
      if (a.allowFailure !== b.allowFailure) {
        return a.allowFailure ? 1 : -1;
      }
      return 0;
    });

    return calls;
  }
}

// Export singleton instance
export const batcher = new TransactionBatcher();

// Export convenience functions
export async function executeBatchTransaction(
  calls: BatchCall[],
  network: string,
  options?: {
    allowPartialSuccess?: boolean;
    simulateFirst?: boolean;
  }
) {
  return batcher.executeBatch(calls, network, options);
}

export async function simulateBatchTransaction(
  calls: BatchCall[],
  network: string
) {
  return batcher.simulateBatch(calls, network);
}

export async function analyzeGasOptimization(
  calls: BatchCall[],
  network: string
) {
  return batcher.analyzeGasOptimization(calls, network);
}

export async function createOptimizedBatch(
  operations: Array<{
    type: 'transfer' | 'approve' | 'contract';
    target: Address;
    data?: any;
    value?: bigint;
  }>,
  network: string
) {
  return batcher.createOptimizedBatch(operations, network);
}

export type { BatchCall, BatchResult, GasOptimizationResult, SimulationResult };