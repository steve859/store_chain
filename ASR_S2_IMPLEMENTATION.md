# ASR-S2: Real-time Inventory Synchronization Across Stores

## Requirement
Inventory updates must synchronize near real-time across all stores for centralized management of >100 stores.

## Architectural Decisions

### 1. Event-Driven Architecture
- **Event Bus**: In-memory EventEmitter-based pub-sub system (`eventBus.ts`)
- **Event Types**: `InventoryUpdateEvent` and `StoreTransferEvent` with type-safe subscribers
- **Asynchronous Processing**: Bull.js job queue for persistent event handling

### 2. Real-time WebSocket Broadcasting
- **Socket.IO Integration**: Store-scoped rooms (`store_${storeId}`) for granular subscriptions
- **Event Type**: `inventory_updated` event with delta and movement details
- **Client Coverage**: Clients join store rooms to receive live inventory updates

### 3. Distributed Cache Invalidation
- **Scope**: Redis Cluster support with pattern-based cache deletion
- **Trigger**: Inventory movements (receive, adjust, sale, return, transfer) trigger catalog cache invalidation
- **Distributed SCAN**: Cross-node cache key deletion for Redis Cluster environments

### 4. Job Queue System
- **Framework**: Bull.js with Redis backend
- **Job Type**: `SYNC_INVENTORY` for async inventory synchronization
- **Concurrency**: 10 concurrent jobs with exponential backoff (3 retries)
- **Purpose**: Decouple inventory mutations from sync operations, enable persistence

## Implementation Details

### File Structure
```
backend/src/
├── lib/
│   ├── events/
│   │   ├── eventBus.ts                    # Event pub-sub infrastructure
│   │   └── inventoryPublisher.ts          # WebSocket broadcast & job enqueueing
│   └── queues/
│       ├── jobQueue.ts                    # Bull queue setup
│       └── processors/
│           ├── index.ts                   # Processor registry
│           └── inventorySyncProcessor.ts  # Async inventory sync handler
├── middlewares/
│   └── io.middleware.ts                   # Express middleware for Socket.IO access
└── modules/
    └── inventory/
        └── inventory.router.ts            # /receive & /adjust with event emission
```

### Event Flow

**User Trigger** (Receive/Adjust Inventory)
```
POST /api/v1/inventory/receive
  ↓
1. Prisma transaction (atomic update)
2. Create InventoryUpdateEvent {storeId, variantId, quantity, change, movementType, ...}
3. Get Socket.IO instance from app (if available)
   ├─→ broadcastInventoryUpdate() → io.to(store_${storeId}).emit('inventory_updated', {...})
4. eventBus.publish('inventory.updated', event)
5. enqueueInventorySyncJob(event)
   ├─→ Bull queue.add(SYNC_INVENTORY, data, {priority: 10, ...})
```

**Job Processing**
```
Bull Queue processes SYNC_INVENTORY job
  ↓
inventorySyncProcessor:
  1. Verify inventory record consistency
  2. Invalidate store catalog cache for impactful movements
  3. Log synchronization completion
```

### Event Types & Messages

**Socket Event: `inventory_updated`**
```typescript
{
  variantId: number;
  quantity: string;            // Current quantity (Decimal → string)
  reserved: string;            // Reserved quantity
  change: number;              // Delta (positive = increase, negative = decrease)
  movementType: 'receive' | 'adjustment' | 'sale' | 'return' | 'transfer';
  reason?: string;             // Optional reason (e.g., "Stock receive", "Manual adjustment")
  timestamp: string;           // ISO 8601 timestamp
}
```

**Domain Event: `InventoryUpdateEvent`**
```typescript
{
  storeId: number;
  variantId: number;
  quantity: number;
  reserved: number;
  previousQuantity: number;
  change: number;
  movementType: 'receive' | 'adjustment' | 'sale' | 'return' | 'transfer';
  reason?: string;
  timestamp: Date;
}
```

## Configuration

### Environment Variables (backend/.env)

```bash
# WebSocket Broadcasting
WEBSOCKET_BROADCAST_ENABLED=true

# Event Bus
EVENT_DRIVEN_ENABLED=true
EVENT_BUS_MAX_LISTENERS=100

# Inventory Sync Job Queue
INVENTORY_SYNC_PRIORITY=10        # 1-10, higher = more important
INVENTORY_SYNC_CONCURRENCY=10     # Max concurrent sync jobs

# Redis (required for Bull queue)
REDIS_URL=redis://localhost:6379
REDIS_CLUSTER_NODES=...           # Optional for distributed setup
```

## Frontend Integration

### Client-Side WebSocket Handler
```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:3000');

// Join store room
socket.emit('join_store_room', storeId);

// Listen for inventory updates
socket.on('inventory_updated', (data) => {
  console.log('Inventory updated:', {
    variantId: data.variantId,
    change: data.change,
    movementType: data.movementType,
    timestamp: data.timestamp,
  });
  
  // Update local UI/cache with new inventory state
  updateProductVariantStock(data.variantId, data.quantity);
});

// Leave room on navigation
socket.emit('leave_store_room', storeId);
```

## Testing

### Unit Tests
- Catalog invalidation tests verify event publishing
- Job queue is mocked in tests to prevent Redis connection issues
- Event bus subscriber pattern tested independently

### Integration Testing (Future)
1. Deploy with actual PostgreSQL read replicas + Redis Cluster
2. Trigger inventory update → verify WebSocket broadcast → verify Bull job processed
3. Monitor event bus subscriber health and queue backlog

## Scalability Considerations

### Current Approach (Phase 2)
- In-memory event bus: Fast, low-latency, local to instance
- WebSocket broadcast: Store-scoped rooms reduce message volume
- Bull queue: Persistent job queue with Redis backend, survives restarts

### Future Enhancements (Phase 3+)
1. **Distributed Message Broker**: Replace event bus with Kafka/RabbitMQ for multi-instance deployments
2. **CDC (Change Data Capture)**: Use PostgreSQL logical replication for true event streaming
3. **Event Sourcing**: Store event history for audit trails and replay
4. **Cross-Store Orchestration**: Implement reorder triggers, automatic inventory transfers

## Concurrency & Consistency

### Inventory Atomicity
- Receives/adjustments use Prisma transactions
- `previousQuantity` captured in transaction for accurate delta calculation
- No race conditions for single-store inventory mutations

### Multi-Store Sync
- Event bus runs subscribers sequentially (ordered processing)
- Bull queue ensures reliable job persistence with retries
- Cache invalidation is eventual-consistent (seconds-level)

## Monitoring & Observability

### Event Bus Health
```typescript
// Check subscriber counts
eventBus.getSubscriberCount('inventory.updated');     // → 3
eventBus.getEventTypes();                             // → ['inventory.updated', ...]
```

### Bull Queue Stats
```typescript
const stats = await getQueueStats(JobType.SYNC_INVENTORY);
// {
//   active: 2,
//   completed: 1523,
//   failed: 0,
//   delayed: 0,
//   waiting: 12
// }
```

### Logging
- Event bus logs subscriber errors with handler ID
- Inventory sync processor logs job progress and failures
- WebSocket broadcasts logged on client-side

## Known Limitations

1. **Event Bus Scope**: Local to single instance; multi-instance setups need Kafka/RabbitMQ
2. **Replication Lag**: Read replicas may lag; SLA not defined in ASR
3. **Cross-Store Transfers**: Currently enqueued but not fully orchestrated
4. **No Conflict Resolution**: Concurrent updates to same variant across stores not handled

## References

- Event Bus: `backend/src/lib/events/eventBus.ts`
- Inventory Publisher: `backend/src/lib/events/inventoryPublisher.ts`
- Sync Processor: `backend/src/lib/queues/processors/inventorySyncProcessor.ts`
- Inventory Router: `backend/src/modules/inventory/inventory.router.ts` (lines 271-363, 376-491)
- Socket Types: `backend/src/types/socket.d.ts`
