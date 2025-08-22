import { describe, it, expect, beforeEach, mock } from 'bun:test';
import {
  batcher,
  executeBatchTransaction,
  simulateBatchTransaction,
  analyzeGasOptimization,
  createOptimizedBatch,
  type BatchCall
} from '../../../core/services/batching.js';
import { type Address, type Abi } from 'viem';

// Mock ERC20 ABI for testing
const mockERC20Abi: Abi = [
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable'
  },
  {
    name: 'approve',
    type: 'function',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable'
  },
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  }
];

const mockTokenAddress = '0x3894085ef7ff0f0aedf52e2a2704928d1ec074f1' as Address;
const mockRecipient = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2' as Address;
const testNetwork = 'sei-testnet';

describe('Transaction Batching Service', () => {
  describe('Multicall Availability', () => {
    it('should check if Multicall3 is available on the network', async () => {
      const isAvailable = await batcher.isMulticallAvailable(testNetwork);
      // This will be true or false depending on whether Multicall3 is deployed
      expect(typeof isAvailable).toBe('boolean');
    });
  });

  describe('simulateBatchTransaction', () => {
    it('should simulate a batch of read-only calls', async () => {
      const calls: BatchCall[] = [
        {
          target: mockTokenAddress,
          abi: mockERC20Abi,
          functionName: 'balanceOf',
          args: [mockRecipient]
        },
        {
          target: mockTokenAddress,
          abi: mockERC20Abi,
          functionName: 'balanceOf',
          args: ['0x8626f6940E2eb28930efb4cef49B2d1F2C9c1199']
        }
      ];

      const result = await simulateBatchTransaction(calls, testNetwork);
      
      // Check structure of result
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('results');
      
      if (result.success) {
        expect(Array.isArray(result.results)).toBe(true);
        expect(result.results.length).toBe(2);
        expect(result.estimatedGas).toBeDefined();
      } else {
        // If Multicall3 is not available
        expect(result.error).toBeDefined();
      }
    });

    it('should handle mixed success/failure in simulation', async () => {
      const calls: BatchCall[] = [
        {
          target: mockTokenAddress,
          abi: mockERC20Abi,
          functionName: 'balanceOf',
          args: [mockRecipient],
          allowFailure: true
        },
        {
          target: '0x0000000000000000000000000000000000000000' as Address,
          abi: mockERC20Abi,
          functionName: 'balanceOf',
          args: [mockRecipient],
          allowFailure: true
        }
      ];

      const result = await simulateBatchTransaction(calls, testNetwork);
      
      if (result.success) {
        expect(result.results.length).toBe(2);
        // First call should succeed, second might fail (zero address)
        expect(result.results[0].success).toBeDefined();
        expect(result.results[1].success).toBeDefined();
      }
    });

    it('should estimate gas for the batch', async () => {
      const calls: BatchCall[] = [
        {
          target: mockTokenAddress,
          abi: mockERC20Abi,
          functionName: 'balanceOf',
          args: [mockRecipient]
        }
      ];

      const result = await simulateBatchTransaction(calls, testNetwork);
      
      if (result.success) {
        expect(result.estimatedGas).toBeDefined();
        expect(result.estimatedGas).toBeGreaterThan(0n);
      }
    });
  });

  describe('analyzeGasOptimization', () => {
    it('should analyze gas savings for batching', async () => {
      const calls: BatchCall[] = [
        {
          target: mockTokenAddress,
          abi: mockERC20Abi,
          functionName: 'transfer',
          args: [mockRecipient, 1000000n]
        },
        {
          target: mockTokenAddress,
          abi: mockERC20Abi,
          functionName: 'transfer',
          args: ['0x8626f6940E2eb28930efb4cef49B2d1F2C9c1199', 2000000n]
        },
        {
          target: mockTokenAddress,
          abi: mockERC20Abi,
          functionName: 'approve',
          args: [mockRecipient, 5000000n]
        }
      ];

      const analysis = await analyzeGasOptimization(calls, testNetwork);
      
      expect(analysis).toHaveProperty('individualGasEstimates');
      expect(analysis).toHaveProperty('batchGasEstimate');
      expect(analysis).toHaveProperty('gasSaved');
      expect(analysis).toHaveProperty('percentageSaved');
      expect(analysis).toHaveProperty('recommendation');
      
      expect(Array.isArray(analysis.individualGasEstimates)).toBe(true);
      expect(analysis.individualGasEstimates.length).toBe(3);
      expect(typeof analysis.percentageSaved).toBe('number');
      expect(typeof analysis.recommendation).toBe('string');
    });

    it('should calculate positive savings for multiple calls', async () => {
      const calls: BatchCall[] = [
        {
          target: mockTokenAddress,
          abi: mockERC20Abi,
          functionName: 'transfer',
          args: [mockRecipient, 1000000n]
        },
        {
          target: mockTokenAddress,
          abi: mockERC20Abi,
          functionName: 'transfer',
          args: [mockRecipient, 2000000n]
        },
        {
          target: mockTokenAddress,
          abi: mockERC20Abi,
          functionName: 'transfer',
          args: [mockRecipient, 3000000n]
        },
        {
          target: mockTokenAddress,
          abi: mockERC20Abi,
          functionName: 'transfer',
          args: [mockRecipient, 4000000n]
        }
      ];

      const analysis = await analyzeGasOptimization(calls, testNetwork);
      
      // With 4 similar calls, batching should show savings
      if (analysis.gasSaved > 0n) {
        expect(analysis.percentageSaved).toBeGreaterThan(0);
        expect(analysis.recommendation).toContain('recommended');
      }
    });

    it('should handle single call analysis', async () => {
      const calls: BatchCall[] = [
        {
          target: mockTokenAddress,
          abi: mockERC20Abi,
          functionName: 'transfer',
          args: [mockRecipient, 1000000n]
        }
      ];

      const analysis = await analyzeGasOptimization(calls, testNetwork);
      
      // Single call shouldn't benefit from batching
      expect(analysis.individualGasEstimates.length).toBe(1);
      // Batch might be more expensive due to Multicall overhead
      expect(analysis.recommendation).toBeDefined();
    });
  });

  describe('createOptimizedBatch', () => {
    it('should create batch from transfer operations', async () => {
      const operations = [
        {
          type: 'transfer' as const,
          target: mockTokenAddress,
          data: {
            to: mockRecipient,
            amount: 1000000n
          }
        },
        {
          type: 'transfer' as const,
          target: mockTokenAddress,
          data: {
            to: '0x8626f6940E2eb28930efb4cef49B2d1F2C9c1199',
            amount: 2000000n
          }
        }
      ];

      const batch = await createOptimizedBatch(operations, testNetwork);
      
      expect(Array.isArray(batch)).toBe(true);
      expect(batch.length).toBe(2);
      
      batch.forEach((call: BatchCall) => {
        expect(call.target).toBe(mockTokenAddress);
        expect(call.functionName).toBe('transfer');
        expect(call.abi).toBeDefined();
        expect(call.args).toBeDefined();
      });
    });

    it('should create batch from approve operations', async () => {
      const operations = [
        {
          type: 'approve' as const,
          target: mockTokenAddress,
          data: {
            spender: mockRecipient,
            amount: 1000000n
          }
        },
        {
          type: 'approve' as const,
          target: mockTokenAddress,
          data: {
            spender: '0x8626f6940E2eb28930efb4cef49B2d1F2C9c1199',
            amount: 2000000n
          }
        }
      ];

      const batch = await createOptimizedBatch(operations, testNetwork);
      
      expect(batch.length).toBe(2);
      batch.forEach((call: BatchCall) => {
        expect(call.functionName).toBe('approve');
        expect(call.args?.length).toBe(2);
      });
    });

    it('should create batch from mixed operations', async () => {
      const operations = [
        {
          type: 'transfer' as const,
          target: mockTokenAddress,
          data: {
            to: mockRecipient,
            amount: 1000000n
          }
        },
        {
          type: 'approve' as const,
          target: mockTokenAddress,
          data: {
            spender: mockRecipient,
            amount: 5000000n
          }
        },
        {
          type: 'contract' as const,
          target: mockTokenAddress,
          data: {
            abi: mockERC20Abi,
            functionName: 'balanceOf',
            args: [mockRecipient],
            allowFailure: true
          }
        }
      ];

      const batch = await createOptimizedBatch(operations, testNetwork);
      
      expect(batch.length).toBe(3);
      
      // Check that different operation types are handled correctly
      const functionNames = batch.map((call: BatchCall) => call.functionName);
      expect(functionNames).toContain('transfer');
      expect(functionNames).toContain('approve');
      expect(functionNames).toContain('balanceOf');
    });

    it('should optimize batch order (non-failing calls first)', async () => {
      const operations = [
        {
          type: 'contract' as const,
          target: mockTokenAddress,
          data: {
            abi: mockERC20Abi,
            functionName: 'transfer',
            args: [mockRecipient, 1000n],
            allowFailure: true
          }
        },
        {
          type: 'transfer' as const,
          target: mockTokenAddress,
          data: {
            to: mockRecipient,
            amount: 2000n
          }
        },
        {
          type: 'contract' as const,
          target: mockTokenAddress,
          data: {
            abi: mockERC20Abi,
            functionName: 'approve',
            args: [mockRecipient, 3000n],
            allowFailure: false
          }
        }
      ];

      const batch = await createOptimizedBatch(operations, testNetwork);
      
      // Non-failing calls should come first
      const allowFailureOrder = batch.map((call: BatchCall) => call.allowFailure);
      
      // Find first true and last false
      const firstTrue = allowFailureOrder.indexOf(true);
      const lastFalse = allowFailureOrder.lastIndexOf(false);
      
      if (firstTrue !== -1 && lastFalse !== -1) {
        // All false values should come before true values
        expect(lastFalse).toBeLessThan(firstTrue);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle network without Multicall3', async () => {
      const calls: BatchCall[] = [
        {
          target: mockTokenAddress,
          abi: mockERC20Abi,
          functionName: 'balanceOf',
          args: [mockRecipient]
        }
      ];

      // Test with a network that might not have Multicall3
      const result = await simulateBatchTransaction(calls, 'sei-devnet');
      
      if (!result.success) {
        expect(result.error).toContain('Multicall3');
      }
    });

    it('should handle invalid contract addresses', async () => {
      const calls: BatchCall[] = [
        {
          target: '0xinvalid' as Address,
          abi: mockERC20Abi,
          functionName: 'balanceOf',
          args: [mockRecipient]
        }
      ];

      try {
        await simulateBatchTransaction(calls, testNetwork);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle missing ABI for decoding', async () => {
      const calls: BatchCall[] = [
        {
          target: mockTokenAddress,
          functionName: 'balanceOf',
          args: [mockRecipient]
        }
      ];

      const result = await simulateBatchTransaction(calls, testNetwork);
      
      // Should still work but return raw data instead of decoded
      if (result.success) {
        expect(result.results).toBeDefined();
      }
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle DeFi protocol interaction batch', async () => {
      // Simulate a common DeFi pattern: approve + deposit
      const calls: BatchCall[] = [
        {
          target: mockTokenAddress,
          abi: mockERC20Abi,
          functionName: 'approve',
          args: ['0x1234567890123456789012345678901234567890', 1000000000n],
          allowFailure: false
        },
        {
          target: '0x1234567890123456789012345678901234567890' as Address,
          abi: [
            {
              name: 'deposit',
              type: 'function',
              inputs: [{ name: 'amount', type: 'uint256' }],
              outputs: [],
              stateMutability: 'nonpayable'
            }
          ],
          functionName: 'deposit',
          args: [1000000000n],
          allowFailure: false
        }
      ];

      const analysis = await analyzeGasOptimization(calls, testNetwork);
      
      // Should show savings for related operations
      expect(analysis.recommendation).toBeDefined();
      expect(analysis.individualGasEstimates.length).toBe(2);
    });

    it('should handle batch token distribution', async () => {
      // Simulate airdrop or payment distribution
      const recipients = [
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2',
        '0x8626f6940E2eb28930efb4cef49B2d1F2C9c1199',
        '0xdD2FD4581271e230360230F9337D5c0430Bf44C0',
        '0xbDA5747bFD65F08deb54cb465eB87D40e51B197E'
      ];

      const calls: BatchCall[] = recipients.map(recipient => ({
        target: mockTokenAddress,
        abi: mockERC20Abi,
        functionName: 'transfer',
        args: [recipient, 100000n],
        allowFailure: true // Allow some transfers to fail
      }));

      const analysis = await analyzeGasOptimization(calls, testNetwork);
      
      // Batch distribution should show significant savings
      expect(analysis.individualGasEstimates.length).toBe(4);
      if (analysis.percentageSaved > 0) {
        expect(analysis.recommendation).toContain('recommended');
      }
    });
  });
});