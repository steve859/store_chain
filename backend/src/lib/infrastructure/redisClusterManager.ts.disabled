/**
 * Phase 3: Redis Cluster Manager
 * 
 * Manages Redis cluster setup:
 * - Node health monitoring
 * - Cluster rebalancing
 * - Failover detection
 * - Backup coordination
 */

import { createCluster, ClusterNode } from 'redis';
import { logger } from '../monitoring/logger';
import { recordMetric } from '../monitoring/metrics';

interface ClusterNodeStatus {
  id: string;
  host: string;
  port: number;
  role: 'master' | 'slave';
  isHealthy: boolean;
  slots: number[];
  connectedSlaves: number;
  memory: {
    used: number;
    peak: number;
    allocated: number;
  };
  lastHealthCheck: Date;
}

interface ClusterStatus {
  isHealthy: boolean;
  nodes: ClusterNodeStatus[];
  clusterState: 'ok' | 'fail';
  clusterSlots: number; // 16384 total
  averageLatency: number;
  memoryUsage: number;
  lastCheck: Date;
}

class RedisClusterManager {
  private cluster: any;
  private status: ClusterStatus = {
    isHealthy: true,
    nodes: [],
    clusterState: 'ok',
    clusterSlots: 16384,
    averageLatency: 0,
    memoryUsage: 0,
    lastCheck: new Date(),
  };

  private nodeUrls: string[] = [
    process.env.REDIS_CLUSTER_NODE_1 || 'redis-node-1:6379',
    process.env.REDIS_CLUSTER_NODE_2 || 'redis-node-2:6379',
    process.env.REDIS_CLUSTER_NODE_3 || 'redis-node-3:6379',
    process.env.REDIS_CLUSTER_NODE_4 || 'redis-node-4:6379',
    process.env.REDIS_CLUSTER_NODE_5 || 'redis-node-5:6379',
    process.env.REDIS_CLUSTER_NODE_6 || 'redis-node-6:6379',
  ];

  /**
   * Initialize cluster connection
   */
  async initialize(): Promise<void> {
    try {
      const nodes: ClusterNode[] = this.nodeUrls.map(url => {
        const [host, port] = url.split(':');
        return { host, port: parseInt(port, 10) };
      });

      this.cluster = createCluster({
        nodes,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              logger.error('Max Redis cluster reconnection attempts exceeded');
              return new Error('Max retries exceeded');
            }
            return Math.min(retries * 50, 500);
          },
        },
      });

      this.cluster.on('error', (err: Error) => {
        logger.error({ message: 'Redis cluster error', error: err });
      });

      this.cluster.on('connect', () => {
        logger.info('Redis cluster connected');
      });

      this.cluster.on('reconnecting', () => {
        logger.warn('Redis cluster reconnecting');
      });

      await this.cluster.connect();
      logger.info('Redis cluster initialized successfully');

      // Start monitoring
      this.startMonitoring();
    } catch (error) {
      logger.error({ message: 'Failed to initialize Redis cluster', error });
      throw error;
    }
  }

  /**
   * Start continuous health monitoring
   */
  startMonitoring(): void {
    setInterval(() => this.checkClusterHealth(), 15000); // Every 15 seconds
    logger.info('Redis cluster monitoring started');
  }

  /**
   * Check cluster health
   */
  async checkClusterHealth(): Promise<ClusterStatus> {
    try {
      const startTime = Date.now();
      
      // Get cluster info
      const clusterInfo = await this.cluster.sendCommand(['CLUSTER', 'INFO']);
      const clusterNodes = await this.cluster.sendCommand(['CLUSTER', 'NODES']);
      
      // Parse cluster state
      const stateMatch = clusterInfo.match(/cluster_state:(\w+)/);
      const clusterState = stateMatch?.[1] === 'ok' ? 'ok' : 'fail';

      // Parse nodes information
      const nodes: ClusterNodeStatus[] = [];
      const nodeLines = clusterNodes.split('\n').filter((line: string) => line.trim());
      
      for (const line of nodeLines) {
        const parts = line.split(' ');
        if (parts.length >= 3) {
          nodes.push({
            id: parts[0],
            host: parts[1].split(':')[0],
            port: parseInt(parts[1].split(':')[1], 10),
            role: parts[2].includes('master') ? 'master' : 'slave',
            isHealthy: !parts[2].includes('fail'),
            slots: this.parseSlots(parts[8]),
            connectedSlaves: parseInt(parts[10] || '0', 10),
            memory: {
              used: 0,
              peak: 0,
              allocated: 0,
            },
            lastHealthCheck: new Date(),
          });
        }
      }

      // Get memory usage
      const memoryInfo = await this.cluster.sendCommand(['INFO', 'memory']);
      const memoryMatch = memoryInfo.match(/used_memory:(\d+)/);
      const memoryUsage = memoryMatch ? parseInt(memoryMatch[1], 10) : 0;

      this.status = {
        isHealthy: clusterState === 'ok' && nodes.every(n => n.isHealthy),
        nodes,
        clusterState,
        clusterSlots: 16384,
        averageLatency: Date.now() - startTime,
        memoryUsage,
        lastCheck: new Date(),
      };

      // Record metrics
      recordMetric('redis_cluster_nodes_healthy', nodes.filter(n => n.isHealthy).length);
      recordMetric('redis_cluster_memory_usage', memoryUsage);
      recordMetric('redis_cluster_health', this.status.isHealthy ? 1 : 0);

      return this.status;
    } catch (error) {
      logger.error({ message: 'Failed to check cluster health', error });
      this.status.isHealthy = false;
      recordMetric('redis_cluster_health', 0);
      return this.status;
    }
  }

  /**
   * Parse slots from node info
   */
  private parseSlots(slotsStr: string): number[] {
    if (!slotsStr || slotsStr === '-') return [];
    
    const slots: number[] = [];
    const ranges = slotsStr.split(',');
    
    for (const range of ranges) {
      if (range.includes('-')) {
        const [start, end] = range.split('-').map(Number);
        for (let i = start; i <= end; i++) {
          slots.push(i);
        }
      } else {
        slots.push(parseInt(range, 10));
      }
    }
    
    return slots;
  }

  /**
   * Rebalance cluster slots
   * Distributes slots evenly across nodes
   */
  async rebalanceSlots(): Promise<boolean> {
    try {
      logger.info('Starting Redis cluster rebalancing');
      
      // Use redis-cli CLUSTER REBALANCE command via management API
      // Or use library like node-redis-tools
      const result = await this.cluster.sendCommand(['CLUSTER', 'REBALANCE']);
      
      logger.info({ message: 'Cluster rebalancing completed', result });
      recordMetric('redis_cluster_rebalance', 1);
      
      // Re-check health after rebalance
      await this.checkClusterHealth();
      return true;
    } catch (error) {
      logger.error({ message: 'Cluster rebalancing failed', error });
      recordMetric('redis_cluster_rebalance_error', 1);
      return false;
    }
  }

  /**
   * Detect and handle node failure
   */
  async handleNodeFailure(nodeId: string): Promise<boolean> {
    try {
      logger.warn({ message: 'Handling Redis node failure', nodeId });
      
      // Wait for cluster to automatically failover (promotion of replica)
      let attempts = 0;
      while (attempts < 30) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        const status = await this.checkClusterHealth();
        
        if (status.isHealthy) {
          logger.info({ message: 'Cluster recovered after node failure', nodeId });
          recordMetric('redis_cluster_failover_success', 1);
          return true;
        }
        attempts++;
      }
      
      logger.error({ message: 'Cluster failed to recover', nodeId });
      recordMetric('redis_cluster_failover_failed', 1);
      return false;
    } catch (error) {
      logger.error({ message: 'Node failure handler error', error });
      return false;
    }
  }

  /**
   * Get cluster status
   */
  getStatus(): ClusterStatus {
    return this.status;
  }

  /**
   * Force cluster state check without cache
   */
  async checkClusterState(): Promise<'ok' | 'fail'> {
    const status = await this.checkClusterHealth();
    return status.clusterState;
  }

  /**
   * Disconnect from cluster
   */
  async disconnect(): Promise<void> {
    if (this.cluster) {
      await this.cluster.disconnect();
      logger.info('Redis cluster disconnected');
    }
  }

  /**
   * Get cluster client for operations
   */
  getClient(): any {
    return this.cluster;
  }
}

// Export singleton instance
export const redisClusterManager = new RedisClusterManager();

export default RedisClusterManager;
