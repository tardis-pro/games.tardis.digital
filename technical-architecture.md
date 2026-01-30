# Player Platform Suite - Technical Architecture

## Recommended Tech Stack

### Core Services (Language: TypeScript/Node.js or Go)
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API GATEWAY (Kong/Traefik)                      │
│  - Rate limiting per IP/user                                                 │
│  - Webhook signature verification                                            │
│  - Request validation                                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SERVICES LAYER                                  │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ Auth Svc    │  │ User Svc    │  │ Commerce    │  │ UGC Svc     │        │
│  │ (JWT, SSO)  │  │ (Profiles)  │  │ (Orders)    │  │ (Content)   │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ Leaderboard │  │ Messaging   │  │ Drops Svc   │  │ Feedback    │        │
│  │ (Seasons)   │  │ (Inbox)     │  │ (Campaigns) │  │ (Reports)   │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Stores
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PostgreSQL (Primary)                                                        │
│  - users, identities, account_links                                          │
│  - profiles, progressions                                                    │
│  - orders, transactions, entitlements                                        │
│  - ugc_metadata, reports, appeals                                            │
│  - audit_logs, messages                                                      │
│  - campaigns, seasons                                                        │
│                                                                              │
│  INDEXES: user_id, provider_id, status, created_at                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│  Redis (Hot Data & Performance)                                              │
│  - session_tokens (TTL-based)                                               │
│  - rate_limiters (sliding window)                                            │
│  - leaderboard:{season_id} (sorted sets)                                     │
│  - hot_ugc_feeds (capped lists)                                              │
│  - idempotency_keys (short TTL)                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│  Object Storage (S3-compatible)                                              │
│  - ugc/{type}/{ugc_id}/{filename}                                           │
│  - receipts/{order_id}.json                                                 │
│  - scans/{ugc_id}/{scanner_type}/                                           │
│  - CDN-backed with signed URLs                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Message Queue (RabbitMQ or Kafka)
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  QUEUES                                                                       │
│                                                                              │
│  - grant_entitlement   (idempotent grant processing)                        │
│  - revoke_entitlement  (refund/clawback)                                     │
│  - scan_content        (virus/moderation scanning)                          │
│  - moderation_review   (human review queue)                                  │
│  - webhook_processing  (Twitch, Steam, Epic events)                         │
│  - leaderboard_update  (score updates)                                       │
│  - notification_send   (email, push, inbox)                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Data Models (PostgreSQL)

### Users & Identities
```sql
-- Canonical user (platform-agnostic)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_id VARCHAR(64) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'active', -- active, banned, suspended
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Platform identities (one per login method)
CREATE TABLE identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL, -- steam, epic, email
    provider_id VARCHAR(128) NOT NULL,
    provider_email VARCHAR(255),
    metadata JSONB,
    linked_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(provider, provider_id)
);

-- Account linking history (audit)
CREATE TABLE account_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    identity_id UUID REFERENCES identities(id),
    action VARCHAR(20) NOT NULL, -- link, unlink, merge
    performed_by UUID REFERENCES users(id), -- admin or self
    reason TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

### Commerce & Entitlements
```sql
-- SKU Catalog
CREATE TABLE skus (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku_id VARCHAR(64) UNIQUE NOT NULL,
    type VARCHAR(20) NOT NULL, -- durable, consumable, bundle
    name VARCHAR(255) NOT NULL,
    description TEXT,
    metadata JSONB, -- platform-specific pricing, etc.
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Orders
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id VARCHAR(64) UNIQUE NOT NULL,
    user_id UUID REFERENCES users(id),
    sku_id UUID REFERENCES skus(id),
    provider VARCHAR(20) NOT NULL, -- steam, epic
    provider_order_id VARCHAR(128),
    status VARCHAR(20) DEFAULT 'pending', -- pending, verified, failed, refunded
    idempotency_key VARCHAR(128) UNIQUE,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    verified_at TIMESTAMPTZ
);

-- Entitlements (what player owns)
CREATE TABLE entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entitlement_id VARCHAR(64) UNIQUE NOT NULL,
    user_id UUID REFERENCES users(id),
    sku_id UUID REFERENCES skus(id),
    order_id UUID REFERENCES orders(id),
    status VARCHAR(20) DEFAULT 'active', -- active, revoked, expired
    granted_at TIMESTAMPTZ DEFAULT now(),
    revoked_at TIMESTAMPTZ,
    revocation_reason VARCHAR(20), -- refund, ban, manual
    metadata JSONB
);

-- Ledger for consumables/currency
CREATE TABLE ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    sku_id UUID REFERENCES skus(id),
    entitlement_id UUID REFERENCES entitlements(id),
    change_type VARCHAR(20) NOT NULL, -- grant, spend, refund, clawback
    quantity INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    order_id UUID REFERENCES orders(id),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

### UGC
```sql
-- UGC Metadata
CREATE TABLE ugc (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ugc_id VARCHAR(64) UNIQUE NOT NULL,
    creator_id UUID REFERENCES users(id),
    type VARCHAR(20) NOT NULL, -- map, mod, image, video, text, bundle
    name VARCHAR(255) NOT NULL,
    description TEXT,
    tags TEXT[],
    metadata JSONB, -- file info, dimensions, duration, etc.
    storage_path VARCHAR(512) NOT NULL,
    checksum VARCHAR(64),
    status VARCHAR(20) DEFAULT 'draft', -- draft, uploaded, scanning, pending_review, published, flagged, removed
    visibility VARCHAR(20) DEFAULT 'public', -- public, private, unlisted
    moderation_notes TEXT,
    flagged_reason TEXT,
    flagged_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    published_at TIMESTAMPTZ,
    downloads_count INTEGER DEFAULT 0,
    rating_sum INTEGER DEFAULT 0,
    rating_count INTEGER DEFAULT 0
);

-- UGC Reports
CREATE TABLE ugc_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ugc_id UUID REFERENCES ugc(id),
    reporter_id UUID REFERENCES users(id),
    reason VARCHAR(50) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'pending', -- pending, reviewed, dismissed, upheld
    moderator_id UUID REFERENCES users(id),
    moderator_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    reviewed_at TIMESTAMPTZ
);
```

### Leaderboards
```sql
-- Seasons
CREATE TABLE seasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_id VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL, -- global, friends, regional
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ,
    reset_rule VARCHAR(20), -- none, archive, clear
    is_active BOOLEAN DEFAULT true,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Leaderboard entries (Redis for hot, PG for archive)
CREATE TABLE leaderboard_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_id UUID REFERENCES seasons(id),
    user_id UUID REFERENCES users(id),
    score BIGINT NOT NULL,
    rank INTEGER,
    metadata JSONB, -- proof, match info
    submitted_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    removed_at TIMESTAMPTZ,
    removal_reason VARCHAR(20),
    removed_by UUID REFERENCES users(id),
    UNIQUE(season_id, user_id)
);
```

### Audit Logs
```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    old_value JSONB,
    new_value JSONB,
    ip_address INET,
    user_agent TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

## API Design Patterns

### JWT Token Structure
```json
{
  "sub": "user_canonical_id",
  "iss": "player-platform",
  "aud": "game-client",
  "exp": 1800,  // 30 min
  "iat": "now",
  "providers": ["steam", "epic"],
  "roles": ["player", "moderator"],
  "linked_accounts": ["steam_12345", "epic_67890"]
}
```

### Idempotency Pattern
```typescript
// POST /api/v1/commerce/verify-receipt
// Idempotency-Key: unique_per_request (e.g., order_id + provider)

async function verifyReceipt(
  userId: string,
  receipt: ReceiptData,
  idempotencyKey: string
): Promise<GrantResult> {
  // Check Redis for existing result
  const existing = await redis.get(`idempotency:${idempotencyKey}`);
  if (existing) return JSON.parse(existing);

  // Check database for processed receipt
  const order = await db.orders.findOne({ idempotencyKey });
  if (order?.status === 'verified') {
    const entitlement = await db.entitlements.findOne({ orderId: order.id });
    await redis.set(`idempotency:${idempotencyKey}`, JSON.stringify(entitlement), 'EX', 86400);
    return entitlement;
  }

  // Verify with platform API
  const verification = await verifyWithSteam(receipt);

  // Create order and grant entitlement (transactional)
  const result = await db.transaction(async (tx) => {
    const order = await tx.orders.create({
      orderId: generateOrderId(),
      userId,
      skuId: verification.skuId,
      provider: 'steam',
      providerOrderId: verification.orderId,
      status: 'verified',
      idempotencyKey
    });

    const entitlement = await tx.entitlements.create({
      entitlementId: generateEntitlementId(),
      userId,
      skuId: verification.skuId,
      orderId: order.id,
      status: 'active'
    });

    return entitlement;
  });

  await redis.set(`idempotency:${idempotencyKey}`, JSON.stringify(result), 'EX', 86400);
  return result;
}
```

### Rate Limiting (Redis)
```typescript
const rateLimiter = async (userId: string, action: string, limit: number, window: number) => {
  const key = `ratelimit:${userId}:${action}`;
  const current = await redis.incr(key);

  if (current === 1) {
    await redis.expire(key, window);
  }

  if (current > limit) {
    throw new RateLimitExceeded(`Too many ${action} attempts`);
  }

  return current;
};
```

## Webhook Handling (Twitch/Steam/Epic)
```typescript
async function handleWebhook(
  provider: string,
  payload: unknown,
  signature: string
): Promise<void> {
  // 1. Verify signature
  if (!verifyWebhookSignature(provider, payload, signature)) {
    throw new Unauthorized('Invalid webhook signature');
  }

  // 2. Extract event ID for idempotency
  const eventId = extractEventId(provider, payload);
  const lockKey = `webhook_lock:${eventId}`;

  // 3. Acquire distributed lock (prevent duplicate processing)
  const lock = await redis.set(lockKey, '1', 'NX', 'EX', 60);
  if (!lock) {
    logger.warn(`Duplicate webhook event: ${eventId}`);
    return; // Already processing
  }

  try {
    // 4. Check idempotency (event already processed)
    const processed = await redis.get(`webhook_processed:${eventId}`);
    if (processed) {
      logger.info(`Webhook already processed: ${eventId}`);
      return;
    }

    // 5. Process event based on type
    await processWebhookEvent(provider, payload);

    // 6. Mark as processed
    await redis.set(`webhook_processed:${eventId}`, '1', 'EX', 86400 * 7); // Keep for 7 days
  } finally {
    await redis.del(lockKey);
  }
}
```

## Scaling Considerations

### Horizontal Scaling (Stateless Services)
- All services stateless (JWT-based auth)
- Redis Cluster for leaderboards/rate limits
- PostgreSQL with read replicas
- Object storage with CDN

### Caching Strategy
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CACHE LAYERS                                                               │
│                                                                              │
│  L1: CDN (static UGC) - TTL-based, cache-control headers                    │
│  L2: Redis (hot data) - sessions, rate limits, leaderboards                 │
│  L3: Application (in-memory) - config, feature flags                        │
│                                                                              │
│  CACHE INVALIDATION:                                                         │
│  - Write-through for entitlements (critical data)                           │
│  - Write-behind for leaderboards (eventual consistency acceptable)          │
│  - Time-based for UGC metadata (5 min TTL)                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Background Workers
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  WORKER ARCHITECTURE                                                         │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  Receipt Verification Worker                                          │  │
│  │  - Polles webhook queue                                               │  │
│  │  - Verifies with platform API                                         │  │
│  │  - Creates orders + grants entitlements                               │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  Refund Reconciliation Worker                                         │  │
│  │  - Polles platform refund APIs                                        │  │
│  │  - Revokes entitlements                                               │  │
│  │  - Updates ledger (clawback)                                          │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  UGC Scanning Worker                                                  │  │
│  │  - Triggers virus scan (ClamAV)                                       │  │
│  │  - Triggers content moderation (AI/API)                               │  │
│  │  - Updates status → pending_review                                    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  Leaderboard Season Worker                                            │  │
│  │  - Runs on schedule                                                   │  │
│  │  - Archives completed seasons                                         │  │
│  │  - Creates new seasons                                               │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```
