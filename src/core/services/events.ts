import { 
  createPublicClient, 
  webSocket, 
  http,
  type Log,
  type Abi,
  type Address,
  type Hash,
  decodeEventLog,
  type WatchEventParameters,
  type PublicClient,
  type GetLogsParameters
} from 'viem';
import { getChain, getRpcUrl } from '../chains.js';

interface EventSubscription {
  id: string;
  contractAddress: Address;
  eventName?: string;
  abi: Abi;
  fromBlock?: bigint;
  callback?: (log: Log) => void;
  webhookUrl?: string;
  filters?: Record<string, any>;
  unsubscribe?: () => void;
}

interface DecodedEvent {
  eventName: string;
  args: Record<string, any>;
  address: Address;
  blockNumber: bigint;
  blockHash: Hash;
  transactionHash: Hash;
  transactionIndex: number;
  logIndex: number;
  removed: boolean;
  topics: readonly `0x${string}`[];
  data: `0x${string}`;
}

class EventMonitor {
  private subscriptions: Map<string, EventSubscription> = new Map();
  private wsClients: Map<string, PublicClient> = new Map();
  private httpClients: Map<string, PublicClient> = new Map();

  /**
   * Create a WebSocket client for real-time event monitoring
   */
  private getWsClient(network: string): PublicClient {
    const key = network;
    if (!this.wsClients.has(key)) {
      const chain = getChain(network);
      const rpcUrl = getRpcUrl(network);
      
      // Try WebSocket connection, fall back to HTTP polling
      try {
        const wsUrl = rpcUrl.replace('https://', 'wss://').replace('http://', 'ws://');
        const client = createPublicClient({
          chain,
          transport: webSocket(wsUrl, {
            reconnect: true,
            retryCount: 5,
            retryDelay: 1000,
          })
        });
        this.wsClients.set(key, client);
      } catch (error) {
        // Fallback to HTTP with polling
        console.log(`WebSocket not available for ${network}, using HTTP polling`);
        const client = createPublicClient({
          chain,
          transport: http(rpcUrl, {
            retryCount: 3,
            retryDelay: 1000,
          })
        });
        this.wsClients.set(key, client);
      }
    }
    return this.wsClients.get(key)!;
  }

  /**
   * Get HTTP client for querying historical events
   */
  private getHttpClient(network: string): PublicClient {
    const key = network;
    if (!this.httpClients.has(key)) {
      const chain = getChain(network);
      const rpcUrl = getRpcUrl(network);
      const client = createPublicClient({
        chain,
        transport: http(rpcUrl)
      });
      this.httpClients.set(key, client);
    }
    return this.httpClients.get(key)!;
  }

  /**
   * Subscribe to contract events in real-time
   */
  async subscribe(
    contractAddress: Address,
    abi: Abi,
    network: string,
    options?: {
      eventName?: string;
      fromBlock?: bigint;
      filters?: Record<string, any>;
      webhookUrl?: string;
      callback?: (event: DecodedEvent) => void;
    }
  ): Promise<string> {
    const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const client = this.getWsClient(network);

    const subscription: EventSubscription = {
      id: subscriptionId,
      contractAddress,
      abi,
      eventName: options?.eventName,
      fromBlock: options?.fromBlock,
      webhookUrl: options?.webhookUrl,
      callback: options?.callback ? (log: Log) => {
        const decoded = this.decodeEvent(log, abi);
        if (decoded) {
          options.callback!(decoded);
        }
      } : undefined,
      filters: options?.filters
    };

    // Setup watch parameters
    const watchParams: any = {
      address: contractAddress,
      onLogs: async (logs: Log[]) => {
        for (const log of logs) {
          await this.handleLog(log, subscription);
        }
      }
    };

    // Add event filter if specific event name is provided
    if (options?.eventName) {
      const event = abi.find((item) => 
        item.type === 'event' && item.name === options.eventName
      );
      if (event && event.type === 'event') {
        (watchParams as any).event = event;
      }
    }

    // Add indexed parameters as filters if provided
    if (options?.filters) {
      (watchParams as any).args = options.filters;
    }

    // Start watching for events
    const unsubscribe = client.watchEvent(watchParams);
    subscription.unsubscribe = unsubscribe;

    this.subscriptions.set(subscriptionId, subscription);
    return subscriptionId;
  }

  /**
   * Unsubscribe from event monitoring
   */
  async unsubscribe(subscriptionId: string): Promise<boolean> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return false;
    }

    if (subscription.unsubscribe) {
      subscription.unsubscribe();
    }

    this.subscriptions.delete(subscriptionId);
    return true;
  }

  /**
   * Query historical events
   */
  async queryEvents(
    contractAddress: Address,
    abi: Abi,
    network: string,
    options?: {
      eventName?: string;
      fromBlock?: bigint;
      toBlock?: bigint;
      filters?: Record<string, any>;
    }
  ): Promise<DecodedEvent[]> {
    const client = this.getHttpClient(network);

    const params: any = {
      address: contractAddress,
      fromBlock: options?.fromBlock || 'earliest',
      toBlock: options?.toBlock || 'latest'
    };

    // Add event signature if specific event is requested
    if (options?.eventName) {
      const event = abi.find((item) => 
        item.type === 'event' && item.name === options.eventName
      );
      if (event && event.type === 'event') {
        (params as any).event = event;
        if (options?.filters) {
          (params as any).args = options.filters;
        }
      }
    }

    const logs = await client.getLogs(params);
    
    return logs
      .map(log => this.decodeEvent(log, abi))
      .filter((event): event is DecodedEvent => event !== null);
  }

  /**
   * Decode an event log using the ABI
   */
  private decodeEvent(log: Log, abi: Abi): DecodedEvent | null {
    try {
      const decoded = decodeEventLog({
        abi,
        data: log.data,
        topics: log.topics
      });

      return {
        eventName: (decoded.eventName || '') as string,
        args: decoded.args as Record<string, any>,
        address: log.address,
        blockNumber: log.blockNumber || 0n,
        blockHash: (log.blockHash || '0x') as Hash,
        transactionHash: (log.transactionHash || '0x') as Hash,
        transactionIndex: log.transactionIndex || 0,
        logIndex: log.logIndex || 0,
        removed: log.removed || false,
        topics: log.topics,
        data: log.data
      };
    } catch (error) {
      console.error('Failed to decode event:', error);
      return null;
    }
  }

  /**
   * Handle incoming log and trigger callbacks/webhooks
   */
  private async handleLog(log: Log, subscription: EventSubscription) {
    const decodedEvent = this.decodeEvent(log, subscription.abi);
    
    if (!decodedEvent) {
      return;
    }

    // Filter by event name if specified
    if (subscription.eventName && decodedEvent.eventName !== subscription.eventName) {
      return;
    }

    // Trigger callback if provided
    if (subscription.callback) {
      subscription.callback(log);
    }

    // Send webhook notification if URL is provided
    if (subscription.webhookUrl) {
      await this.sendWebhook(subscription.webhookUrl, decodedEvent);
    }
  }

  /**
   * Send webhook notification
   */
  private async sendWebhook(url: string, event: DecodedEvent) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          event
        })
      });

      if (!response.ok) {
        console.error(`Webhook failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to send webhook:', error);
    }
  }

  /**
   * Get all active subscriptions
   */
  getActiveSubscriptions(): Array<{
    id: string;
    contractAddress: Address;
    eventName?: string;
    webhookUrl?: string;
  }> {
    return Array.from(this.subscriptions.values()).map(sub => ({
      id: sub.id,
      contractAddress: sub.contractAddress,
      eventName: sub.eventName,
      webhookUrl: sub.webhookUrl
    }));
  }

  /**
   * Clean up all subscriptions and connections
   */
  async cleanup() {
    // Unsubscribe all active subscriptions
    for (const [id, subscription] of this.subscriptions) {
      if (subscription.unsubscribe) {
        subscription.unsubscribe();
      }
    }
    this.subscriptions.clear();

    // Close WebSocket connections
    for (const client of this.wsClients.values()) {
      if (client.transport.type === 'webSocket') {
        // WebSocket clients will be cleaned up automatically
      }
    }
    this.wsClients.clear();
    this.httpClients.clear();
  }
}

// Export singleton instance
export const eventMonitor = new EventMonitor();

// Export functions for easier usage
export async function subscribeToEvents(
  contractAddress: Address,
  abi: Abi,
  network: string,
  options?: {
    eventName?: string;
    fromBlock?: bigint;
    filters?: Record<string, any>;
    webhookUrl?: string;
    callback?: (event: DecodedEvent) => void;
  }
): Promise<string> {
  return eventMonitor.subscribe(contractAddress, abi, network, options);
}

export async function unsubscribeFromEvents(subscriptionId: string): Promise<boolean> {
  return eventMonitor.unsubscribe(subscriptionId);
}

export async function queryHistoricalEvents(
  contractAddress: Address,
  abi: Abi,
  network: string,
  options?: {
    eventName?: string;
    fromBlock?: bigint;
    toBlock?: bigint;
    filters?: Record<string, any>;
  }
): Promise<DecodedEvent[]> {
  return eventMonitor.queryEvents(contractAddress, abi, network, options);
}

export function getActiveEventSubscriptions() {
  return eventMonitor.getActiveSubscriptions();
}

export type { DecodedEvent, EventSubscription };