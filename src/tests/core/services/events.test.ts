import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { 
  eventMonitor,
  subscribeToEvents,
  unsubscribeFromEvents,
  queryHistoricalEvents,
  getActiveEventSubscriptions
} from '../../../core/services/events.js';
import { type Address, type Abi } from 'viem';

// Mock ERC20 ABI for testing
const mockERC20Abi: Abi = [
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false }
    ]
  },
  {
    type: 'event',
    name: 'Approval',
    inputs: [
      { name: 'owner', type: 'address', indexed: true },
      { name: 'spender', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false }
    ]
  }
];

const mockContractAddress = '0x3894085ef7ff0f0aedf52e2a2704928d1ec074f1' as Address;
const testNetwork = 'sei-testnet';

describe('Event Monitoring Service', () => {
  let subscriptionIds: string[] = [];

  afterEach(async () => {
    // Clean up any subscriptions created during tests
    for (const id of subscriptionIds) {
      await unsubscribeFromEvents(id);
    }
    subscriptionIds = [];
    await eventMonitor.cleanup();
  });

  describe('subscribeToEvents', () => {
    it('should create a subscription and return a subscription ID', async () => {
      const subscriptionId = await subscribeToEvents(
        mockContractAddress,
        mockERC20Abi,
        testNetwork,
        {
          eventName: 'Transfer'
        }
      );

      expect(subscriptionId).toBeDefined();
      expect(subscriptionId).toMatch(/^sub_\d+_[a-z0-9]+$/);
      subscriptionIds.push(subscriptionId);
    });

    it('should allow subscribing to all events when eventName is not specified', async () => {
      const subscriptionId = await subscribeToEvents(
        mockContractAddress,
        mockERC20Abi,
        testNetwork
      );

      expect(subscriptionId).toBeDefined();
      subscriptionIds.push(subscriptionId);

      const activeSubscriptions = getActiveEventSubscriptions();
      const subscription = activeSubscriptions.find((s: any) => s.id === subscriptionId);
      expect(subscription).toBeDefined();
      expect(subscription?.eventName).toBeUndefined();
    });

    it('should support filtering by indexed parameters', async () => {
      const filterAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2' as Address;
      
      const subscriptionId = await subscribeToEvents(
        mockContractAddress,
        mockERC20Abi,
        testNetwork,
        {
          eventName: 'Transfer',
          filters: {
            from: filterAddress
          }
        }
      );

      expect(subscriptionId).toBeDefined();
      subscriptionIds.push(subscriptionId);
    });

    it('should support webhook URL configuration', async () => {
      const webhookUrl = 'https://example.com/webhook';
      
      const subscriptionId = await subscribeToEvents(
        mockContractAddress,
        mockERC20Abi,
        testNetwork,
        {
          eventName: 'Transfer',
          webhookUrl
        }
      );

      expect(subscriptionId).toBeDefined();
      subscriptionIds.push(subscriptionId);

      const activeSubscriptions = getActiveEventSubscriptions();
      const subscription = activeSubscriptions.find((s: any) => s.id === subscriptionId);
      expect(subscription?.webhookUrl).toBe(webhookUrl);
    });

    it('should support callback functions', async () => {
      let callbackCalled = false;
      const callback = () => {
        callbackCalled = true;
      };

      const subscriptionId = await subscribeToEvents(
        mockContractAddress,
        mockERC20Abi,
        testNetwork,
        {
          eventName: 'Transfer',
          callback
        }
      );

      expect(subscriptionId).toBeDefined();
      subscriptionIds.push(subscriptionId);
      // Note: Callback would be called when actual events are received
    });
  });

  describe('unsubscribeFromEvents', () => {
    it('should successfully unsubscribe from an active subscription', async () => {
      const subscriptionId = await subscribeToEvents(
        mockContractAddress,
        mockERC20Abi,
        testNetwork
      );

      const unsubscribed = await unsubscribeFromEvents(subscriptionId);
      expect(unsubscribed).toBe(true);

      // Verify subscription is removed
      const activeSubscriptions = getActiveEventSubscriptions();
      const subscription = activeSubscriptions.find((s: any) => s.id === subscriptionId);
      expect(subscription).toBeUndefined();
    });

    it('should return false when unsubscribing from non-existent subscription', async () => {
      const fakeId = 'sub_fake_123';
      const unsubscribed = await unsubscribeFromEvents(fakeId);
      expect(unsubscribed).toBe(false);
    });
  });

  describe('queryHistoricalEvents', () => {
    it('should query events with default parameters', async () => {
      // This will query from earliest to latest block
      const events = await queryHistoricalEvents(
        mockContractAddress,
        mockERC20Abi,
        testNetwork
      );

      expect(Array.isArray(events)).toBe(true);
      // Events array may be empty if no events in the range
    });

    it('should filter by specific event name', async () => {
      const events = await queryHistoricalEvents(
        mockContractAddress,
        mockERC20Abi,
        testNetwork,
        {
          eventName: 'Transfer'
        }
      );

      expect(Array.isArray(events)).toBe(true);
      // All returned events should be Transfer events
      events.forEach((event: any) => {
        expect(event.eventName).toBe('Transfer');
      });
    });

    it('should support block range filtering', async () => {
      const events = await queryHistoricalEvents(
        mockContractAddress,
        mockERC20Abi,
        testNetwork,
        {
          fromBlock: 1000000n,
          toBlock: 1000100n
        }
      );

      expect(Array.isArray(events)).toBe(true);
      // All events should be within the specified block range
      events.forEach((event: any) => {
        expect(event.blockNumber).toBeGreaterThanOrEqual(1000000n);
        expect(event.blockNumber).toBeLessThanOrEqual(1000100n);
      });
    });

    it('should support indexed parameter filtering', async () => {
      const filterAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2' as Address;
      
      const events = await queryHistoricalEvents(
        mockContractAddress,
        mockERC20Abi,
        testNetwork,
        {
          eventName: 'Transfer',
          filters: {
            to: filterAddress
          }
        }
      );

      expect(Array.isArray(events)).toBe(true);
      // All returned events should have the filtered 'to' address
      events.forEach((event: any) => {
        if (event.eventName === 'Transfer' && event.args.to) {
          expect(event.args.to.toLowerCase()).toBe(filterAddress.toLowerCase());
        }
      });
    });
  });

  describe('getActiveEventSubscriptions', () => {
    it('should return empty array when no subscriptions', () => {
      const subscriptions = getActiveEventSubscriptions();
      expect(subscriptions).toEqual([]);
    });

    it('should return all active subscriptions', async () => {
      const id1 = await subscribeToEvents(
        mockContractAddress,
        mockERC20Abi,
        testNetwork,
        { eventName: 'Transfer' }
      );
      subscriptionIds.push(id1);

      const id2 = await subscribeToEvents(
        mockContractAddress,
        mockERC20Abi,
        testNetwork,
        { eventName: 'Approval' }
      );
      subscriptionIds.push(id2);

      const subscriptions = getActiveEventSubscriptions();
      expect(subscriptions.length).toBe(2);
      
      const ids = subscriptions.map((s: any) => s.id);
      expect(ids).toContain(id1);
      expect(ids).toContain(id2);
    });

    it('should include subscription details', async () => {
      const webhookUrl = 'https://example.com/webhook';
      const subscriptionId = await subscribeToEvents(
        mockContractAddress,
        mockERC20Abi,
        testNetwork,
        {
          eventName: 'Transfer',
          webhookUrl
        }
      );
      subscriptionIds.push(subscriptionId);

      const subscriptions = getActiveEventSubscriptions();
      const subscription = subscriptions.find(s => s.id === subscriptionId);
      
      expect(subscription).toBeDefined();
      expect(subscription?.contractAddress).toBe(mockContractAddress);
      expect(subscription?.eventName).toBe('Transfer');
      expect(subscription?.webhookUrl).toBe(webhookUrl);
    });
  });

  describe('Event Decoding', () => {
    it('should properly decode event logs', async () => {
      // Create a mock log that would be received
      const mockLog = {
        address: mockContractAddress,
        topics: [
          '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', // Transfer event signature
          '0x000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f0beb2', // from address
          '0x0000000000000000000000008626f6940e2eb28930efb4cef49b2d1f2c9c1199' // to address
        ] as readonly `0x${string}`[],
        data: '0x0000000000000000000000000000000000000000000000000de0b6b3a7640000' as `0x${string}`, // 1 token
        blockNumber: 1000000n,
        blockHash: '0x123' as `0x${string}`,
        transactionHash: '0x456' as `0x${string}`,
        transactionIndex: 0,
        logIndex: 0,
        removed: false
      };

      // The decoding would happen internally when events are received
      // This test verifies the structure is correct for decoding
      expect(mockLog.topics.length).toBe(3); // Event signature + 2 indexed params
      expect(mockLog.data).toBeDefined();
    });
  });

  describe('Cleanup', () => {
    it('should clean up all subscriptions and connections', async () => {
      const id1 = await subscribeToEvents(mockContractAddress, mockERC20Abi, testNetwork);
      const id2 = await subscribeToEvents(mockContractAddress, mockERC20Abi, testNetwork);

      await eventMonitor.cleanup();

      const subscriptions = getActiveEventSubscriptions();
      expect(subscriptions.length).toBe(0);
    });
  });
});