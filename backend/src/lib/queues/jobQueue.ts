import Bull, { Queue, Job } from 'bull';
import Redis from 'ioredis';

/**
 * Job Queue System - Bull.js with Redis
 * Purpose: Handle long-running tasks asynchronously without blocking API responses
 * Example use cases:
 * - Sending emails (receipts, notifications)
 * - Generating reports (daily sales, inventory)
 * - Syncing data (inventory across stores)
 * - Processing refunds
 * - Reconciling payments
 */

// Initialize Redis connection for Bull
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

// Define job types enum
export enum JobType {
  SEND_EMAIL = 'send_email',
  GENERATE_REPORT = 'generate_report',
  EXPORT_DATA = 'export_data',
  SYNC_INVENTORY = 'sync_inventory',
  PROCESS_REFUND = 'process_refund',
  INVALIDATE_CACHE = 'invalidate_cache',
  RECONCILE_PAYMENTS = 'reconcile_payments',
  CALCULATE_PRICING = 'calculate_pricing',
  PRELOAD_VARIANTS = 'preload_variants',
  PROCESS_LOYALTY_ACCRUAL = 'process_loyalty_accrual',
  PROCESS_LOYALTY_TIER_UPGRADE = 'process_loyalty_tier_upgrade',
}

// Create queues for different job types
const queues: Record<JobType, Queue> = {
  [JobType.SEND_EMAIL]: new Bull(JobType.SEND_EMAIL, {
    redis: redisConfig,
  }),
  [JobType.GENERATE_REPORT]: new Bull(JobType.GENERATE_REPORT, {
    redis: redisConfig,
  }),
  [JobType.EXPORT_DATA]: new Bull(JobType.EXPORT_DATA, {
    redis: redisConfig,
  }),
  [JobType.SYNC_INVENTORY]: new Bull(JobType.SYNC_INVENTORY, {
    redis: redisConfig,
  }),
  [JobType.PROCESS_REFUND]: new Bull(JobType.PROCESS_REFUND, {
    redis: redisConfig,
  }),
  [JobType.INVALIDATE_CACHE]: new Bull(JobType.INVALIDATE_CACHE, {
    redis: redisConfig,
  }),
  [JobType.RECONCILE_PAYMENTS]: new Bull(JobType.RECONCILE_PAYMENTS, {
    redis: redisConfig,
  }),
  [JobType.CALCULATE_PRICING]: new Bull(JobType.CALCULATE_PRICING, {
    redis: redisConfig,
  }),
  [JobType.PRELOAD_VARIANTS]: new Bull(JobType.PRELOAD_VARIANTS, {
    redis: redisConfig,
  }),
  [JobType.PROCESS_LOYALTY_ACCRUAL]: new Bull(JobType.PROCESS_LOYALTY_ACCRUAL, {
    redis: redisConfig,
  }),
  [JobType.PROCESS_LOYALTY_TIER_UPGRADE]: new Bull(JobType.PROCESS_LOYALTY_TIER_UPGRADE, {
    redis: redisConfig,
  }),
};

/**
 * Add a job to the queue
 * @param jobType Type of job to execute
 * @param data Job data payload
 * @param options Bull queue options (priority, delay, attempts, etc.)
 * @returns Job instance
 */
export async function enqueueJob<T = any>(
  jobType: JobType,
  data: T,
  options: Partial<Bull.JobOptions> = {}
): Promise<Job<T>> {
  const queue = queues[jobType];

  return queue.add(data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: false,
    ...options,
  });
}

/**
 * Register a job processor function
 * @param jobType Type of job
 * @param processor Function that processes the job
 * @param concurrency Number of concurrent jobs to process
 */
export function registerProcessor<T = any>(
  jobType: JobType,
  processor: (job: Job<T>) => Promise<any>,
  concurrency: number = 5
) {
  const queue = queues[jobType];

  queue.process(concurrency, processor);

  // Add event handlers
  queue.on('completed', (job) => {
    console.log(`✅ Job ${jobType}:${job.id} completed successfully`);
  });

  queue.on('failed', (job, err) => {
    console.error(`❌ Job ${jobType}:${job.id} failed:`, err.message);
  });

  queue.on('error', (err) => {
    console.error(`⚠️ Queue ${jobType} error:`, err.message);
  });
}

/**
 * Get queue statistics
 */
export async function getQueueStats(jobType: JobType) {
  const queue = queues[jobType];
  return {
    active: await queue.getActiveCount(),
    completed: await queue.getCompletedCount(),
    failed: await queue.getFailedCount(),
    delayed: await queue.getDelayedCount(),
    waiting: await queue.getWaitingCount(),
  };
}

/**
 * Get stats for all queues
 */
export async function getAllQueueStats() {
  const stats: Record<JobType, any> = {} as any;

  for (const jobType of Object.values(JobType)) {
    stats[jobType] = await getQueueStats(jobType);
  }

  return stats;
}

/**
 * Clear failed jobs from queue
 */
export async function clearFailedJobs(jobType: JobType) {
  const queue = queues[jobType];
  const failedJobs = await queue.getFailed();
  return Promise.all(failedJobs.map(job => job.remove()));
}

/**
 * Close all queues gracefully
 */
export async function closeQueues() {
  await Promise.all(Object.values(queues).map(q => q.close()));
  console.log('✅ All job queues closed');
}

export default queues;
