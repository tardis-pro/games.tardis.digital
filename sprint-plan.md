# Player Platform Suite - Sprint Plan

## Sprint Overview

Based on the PRD requirements and dependency analysis, this plan breaks down the 6 milestones into **8 sprints** (2 weeks each, ~16 weeks total).

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                          SPRINT DEPENDENCY CHAIN                                │
│                                                                                 │
│  Sprint 1 (Foundation)                                                          │
│     │                                                                          │
│     ├─► Sprint 2 (Auth + Linking + Progression)                                 │
│     │                                                                          │
│     ├─► Sprint 3 (Leaderboards + Messages)                                      │
│     │                                                                          │
│     ├─► Sprint 4 (Commerce Core)                                                │
│     │                                                                          │
│     ├─► Sprint 5 (Commerce + Refunds)                                           │
│     │                                                                          │
│     ├─► Sprint 6 (UGC Upload + Scanning)                                        │
│     │                                                                          │
│     ├─► Sprint 7 (UGC Moderation + Discovery)                                   │
│     │                                                                          │
│     └─► Sprint 8 (Drops + Polish + Integration)                                 │
│                                                                                 │
│  Each sprint = 2 weeks, ends with deployed + tested features                   │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## Sprint 1: Foundation & Infrastructure (2 weeks)

### Goal: Set up all infrastructure, devops, and core data models

#### Must-Haves
| Task | Description | Effort |
|------|-------------|--------|
| INF-001 | Set up project structure (monorepo with pnpm/workspaces) | 2 days |
| INF-002 | Configure CI/CD pipeline (GitHub Actions) | 2 days |
| INF-003 | Set up PostgreSQL database with migrations | 1 day |
| INF-004 | Set up Redis cluster (leaderboards, rate limits, sessions) | 1 day |
| INF-005 | Set up object storage (S3-compatible) + CDN | 1 day |
| INF-006 | Set up message queue (RabbitMQ/Kafka) | 1 day |
| INF-007 | Configure logging (structured JSON logs) | 1 day |
| INF-008 | Configure metrics (Prometheus/Grafana) | 1 day |
| INF-009 | Set up API gateway (Kong/Traefik) | 2 days |
| INF-010 | Create OpenAPI spec skeleton for all services | 2 days |

#### Data Models (PostgreSQL)
```sql
-- Sprint 1 Deliverables (DDL)
-- users, identities, account_links
-- audit_logs (critical for all modules)
-- Initial enum types and constraints
```

#### Good-to-Haves
| Task | Description | Effort |
|------|-------------|--------|
| INF-011 | Set up local development environment (Docker Compose) | 2 days |
| INF-012 | API documentation (Swagger UI) | 1 day |

#### Sprint 1 Definition of Done
- [ ] All services compile and run locally
- [ ] CI/CD passes on main branch
- [ ] Database migrations apply cleanly
- [ ] Object storage bucket created and accessible
- [ ] Message queue consuming messages
- [ ] Basic health endpoints for all services

---

## Sprint 2: Authentication & Account Linking (2 weeks)

### Goal: Steam/Epic login + JWT + basic account linking

#### Must-Haves
| Task | Description | Effort | Dependencies |
|------|-------------|--------|--------------|
| AUTH-001 | Steam authentication flow (ticket verification) | 3 days | INF-003 |
| AUTH-002 | Epic/EOS authentication flow | 3 days | INF-003 |
| AUTH-003 | JWT issuance (access + refresh tokens) | 2 days | - |
| AUTH-004 | Token refresh rotation + revocation | 2 days | AUTH-003 |
| AUTH-005 | Rate limiting per IP/user | 2 days | INF-004 |
| AUTH-006 | Basic audit logging for auth events | 1 day | - |
| AUTH-007 | Account linking flow (Steam ↔ Epic) | 3 days | AUTH-001, AUTH-002 |
| AUTH-008 | Link validation (cannot unlink last method) | 1 day | AUTH-007 |
| AUTH-009 | Player profile creation on first login | 1 day | - |

#### Technical Implementation - Steam Auth
```typescript
// Steam ticket verification endpoint
POST /api/v1/auth/steam/login
Body: { steamId: string, ticket: string, sessionId: string }

async function verifySteamTicket(ticket: string, steamId: string): Promise<SteamUser> {
  // 1. Call Steam API
  const response = await fetch(
    `https://partner.steam-api.com/ISteamUserAuth/AuthenticateUserTicket/v1/?key=${STEAM_API_KEY}&ticket=${ticket}&appid=${APP_ID}`
  );

  // 2. Validate response
  const data = await response.json();
  if (!data.response?.authenticated) {
    throw new Unauthorized('Steam authentication failed');
  }

  // 3. Match steam ID
  const ticketSteamId = data.response.steamid;
  if (ticketSteamId !== steamId) {
    throw new Unauthorized('Steam ID mismatch');
  }

  // 4. Return user info
  return {
    steamId: ticketSteamId,
    personaName: data.response.personaname,
    // ...
  };
}
```

#### Technical Implementation - JWT
```typescript
interface PlayerToken {
  sub: string;              // canonical_user_id
  iss: 'player-platform';
  aud: string;              // client_id
  exp: number;              // 30 minutes
  iat: number;
  providers: string[];      // ['steam', 'epic']
  roles: string[];          // ['player', 'moderator', 'admin']
}

function generateAccessToken(user: User): string {
  return jwt.sign({
    sub: user.canonical_id,
    providers: user.identities.map(i => i.provider),
    roles: user.roles
  }, JWT_SECRET, { expiresIn: '30m' });
}

function generateRefreshToken(user: User): string {
  const tokenId = generateSecureId();
  // Store token reference in Redis with metadata
  redis.hset(`refresh_tokens:${tokenId}`, {
    user_id: user.id,
    created_at: Date.now(),
    rotated_at: null,
    revoked: false
  });
  redis.expire(`refresh_tokens:${tokenId}`, 30 * 24 * 3600); // 30 days

  return tokenId;
}
```

#### Sprint 2 Definition of Done
- [ ] Player can login via Steam, receive JWT
- [ ] Player can login via Epic, receive JWT
- [ ] Player can link Steam + Epic accounts
- [ ] Token refresh works, revocation works
- [ ] Rate limiting enforced (100 req/min per user)
- [ ] Audit logs capture all auth events
- [ ] Integration tests for all auth flows

---

## Sprint 3: Player Progression & Leaderboards (2 weeks)

### Goal: Cross-save progression + seasonal leaderboards

#### Must-Haves
| Task | Description | Effort | Dependencies |
|------|-------------|--------|--------------|
| PROG-001 | Player progression data model (snapshot + versioning) | 2 days | Sprint 1 |
| PROG-002 | Progression CRUD API (save, load, list) | 2 days | - |
| PROG-003 | Version-based conflict detection | 2 days | PROG-001 |
| PROG-004 | Leaderboard season data model | 1 day | Sprint 1 |
| PROG-005 | Redis sorted set leaderboard implementation | 3 days | INF-004 |
| PROG-006 | Score submission with validation | 2 days | - |
| PROG-007 | Season management (create, activate, archive) | 2 days | PROG-004 |
| PROG-008 | Admin: remove leaderboard entry | 1 day | - |
| PROG-009 | Basic leaderboard API (get rank, top N) | 2 days | PROG-005 |
| PROG-010 | Audit logging for all progression/leaderboard actions | 1 day | - |

#### Technical Implementation - Progression
```typescript
// Progression data model
interface PlayerProgression {
  id: string;
  user_id: string;
  version: number;          // Optimistic locking
  profile: {
    display_name: string;
    avatar_url?: string;
    bio?: string;
  };
  progression: {
    level: number;
    xp: number;
    achievements: string[];
    // Game-specific state
    [key: string]: unknown;
  };
  inventory: {
    currency: Record<string, number>;
    items: Entitlement[];
  };
  created_at: Date;
  updated_at: Date;
}

// Save progression with version check
async function saveProgression(
  userId: string,
  data: ProgressionData,
  expectedVersion: number
): Promise<Progression> {
  const current = await db.progressions.findOne({ userId });

  if (current.version !== expectedVersion) {
    throw new ConflictError('Progression version mismatch. Refresh and retry.');
  }

  return db.progressions.update(
    { userId },
    {
      ...data,
      version: expectedVersion + 1,
      updated_at: new Date()
    }
  );
}
```

#### Technical Implementation - Leaderboards
```typescript
// Redis leaderboard pattern
interface LeaderboardKey {
  seasonId: string;
  type: 'global' | 'regional' | 'friends';
}

function getKey(key: LeaderboardKey): string {
  return `leaderboard:${key.seasonId}:${key.type}`;
}

// Submit score
async function submitScore(
  seasonId: string,
  userId: string,
  score: number,
  metadata?: ScoreMetadata
): Promise<RankInfo> {
  const key = getKey({ seasonId, type: 'global' });

  // Use transaction for atomicity
  const pipeline = redis.pipeline();

  // Add/update score (ZADD)
  pipeline.zadd(key, score, userId);

  // Store metadata (HSET)
  if (metadata) {
    pipeline.hset(`leaderboard:meta:${seasonId}`, userId, JSON.stringify(metadata));
  }

  // Get new rank
  pipeline.zrevrank(key, userId);
  pipeline.zscore(key, userId);

  const results = await pipeline.exec();

  return {
    rank: results[2][1] + 1,  // 1-indexed
    score: results[3][1]
  };
}

// Get top N players
async function getTopPlayers(seasonId: string, limit: number = 10): Promise<LeaderboardEntry[]> {
  const key = getKey({ seasonId, type: 'global' });

  const scores = await redis.zrevrange(key, 0, limit - 1, 'WITHSCORES');

  return scores.map((userId, index) => ({
    rank: index + 1,
    userId,
    score: parseInt(scores[index + limit])
  }));
}
```

#### Good-to-Haves
| Task | Description | Effort |
|------|-------------|--------|
| PROG-011 | Regional leaderboards | 2 days |
| PROG-012 | Client-side proof validation | 3 days |
| PROG-013 | Anti-cheat validation rules | 3 days |

#### Sprint 3 Definition of Done
- [ ] Player progression saves/loads with version locking
- [ ] Leaderboards support seasons (create, activate, list)
- [ ] Scores submit and rank correctly in Redis
- [ ] Admin can remove leaderboard entries
- [ ] Audit logs capture all changes
- [ ] Leaderboard API returns top N and user rank

---

## Sprint 4: Messaging System (2 weeks)

### Goal: System inbox + support threads

#### Must-Haves
| Task | Description | Effort | Dependencies |
|------|-------------|--------|--------------|
| MSG-001 | Message data model (inbox, thread, notification) | 1 day | Sprint 1 |
| MSG-002 | System notification types (purchase, drop, moderation) | 2 days | - |
| MSG-003 | Message sending API (internal + player) | 2 days | - |
| MSG-004 | Message inbox API (list, get, mark read) | 2 days | - |
| MSG-005 | Support thread creation + reply | 2 days | - |
| MSG-006 | Message status tracking (read, archived) | 1 day | - |
| MSG-007 | Admin: broadcast announcement | 2 days | - |
| MSG-008 | Admin: view support threads | 1 day | - |
| MSG-009 | Notification delivery (inbox + optional push) | 2 days | - |

#### Message Types (v1)
```typescript
enum MessageType {
  // System notifications
  PURCHASE_GRANTED = 'purchase_granted',
  PURCHASE_REFUNDED = 'purchase_refunded',
  DROP_CLAIMED = 'drop_claimed',
  MODERATION_DECISION = 'moderation_decision',
  CAMPAIGN_ANNOUNCEMENT = 'campaign_announcement',

  // Support
  SUPPORT_THREAD_CREATED = 'support_thread_created',
  SUPPORT_REPLY = 'support_reply',

  // General
  GENERIC = 'generic'
}

interface Message {
  id: string;
  recipient_id: string;
  type: MessageType;
  subject?: string;
  body: string;
  metadata?: Record<string, unknown>;
  read: boolean;
  archived: boolean;
  created_at: Date;
}
```

#### Sprint 4 Definition of Done
- [ ] System notifications sent on purchases/drops/moderation
- [ ] Player can view inbox and mark messages read
- [ ] Support threads work (player ↔ support)
- [ ] Admin can broadcast announcements
- [ ] Admin can view all support threads

---

## Sprint 5: Commerce Core (2 weeks)

### Goal: SKU catalog + receipt verification + entitlements

#### Must-Haves
| Task | Description | Effort | Dependencies |
|------|-------------|--------|--------------|
| COMM-001 | SKU catalog data model + CRUD API | 2 days | Sprint 1 |
| COMM-002 | Steam purchase verification (MicroTxn API) | 3 days | Sprint 2 |
| COMM-003 | Epic purchase verification (EOS) | 3 days | Sprint 2 |
| COMM-004 | Idempotency system (prevent duplicate grants) | 2 days | INF-004 |
| COMM-005 | Order creation + status tracking | 2 days | - |
| COMM-006 | Entitlement grant (transactional) | 2 days | - |
| COMM-007 | Entitlement query API (what does player own?) | 1 day | - |
| COMM-008 | Player purchase history API | 1 day | - |
| COMM-009 | Audit logging for all commerce actions | 1 day | - |
| COMM-010 | Admin: SKU management UI | 2 days | - |
| COMM-011 | Admin: order lookup + details | 1 day | - |

#### Technical Implementation - Receipt Verification
```typescript
// Steam receipt verification
async function verifySteamReceipt(
  userId: string,
  orderId: string,
  packageId: number
): Promise<VerificationResult> {
  // 1. Validate with Steam API
  const response = await fetch(
    'https://partner.steam-api.com/ISteamMicroTxn/Query/v3/',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${STEAM_API_KEY}:`).toString('base64')}`
      },
      body: JSON.stringify({
        appid: STEAM_APP_ID,
        packageid: packageId,
        transactionid: orderId
      })
    }
  );

  const result = await response.json();

  if (result.response?.result !== 'OK') {
    throw new VerificationFailed('Steam verification failed');
  }

  const order = result.response?.orders[0];
  if (order?.status !== 'Approved') {
    throw new VerificationFailed('Order not approved');
  }

  return {
    orderId: order.transactionid,
    userId: order.usersteamid,
    amount: order.total,
    currency: order.currency,
    items: order.lineitems
  };
}

// Epic EOS verification (simplified)
async function verifyEpicReceipt(
  userId: string,
  receiptId: string
): Promise<VerificationResult> {
  // EOS provides receipt validation through Epic Account Services
  const response = await fetch(
    `https://epicapi.io/verify-receipt?receiptId=${receiptId}`,
    {
      headers: {
        'Authorization': `Bearer ${EOS_API_KEY}`
      }
    }
  );

  return response.json();
}
```

#### Idempotency Pattern
```typescript
async function grantEntitlement(
  userId: string,
  skuId: string,
  orderId: string,
  idempotencyKey: string
): Promise<Entitlement> {
  // Check idempotency cache first
  const cached = await redis.get(`idempotency:${idempotencyKey}`);
  if (cached) {
    return JSON.parse(cached);
  }

  // Check database for existing grant
  const existing = await db.entitlements.findOne({
    where: {
      order_id: orderId,
      status: 'active'
    }
  });

  if (existing) {
    await redis.set(`idempotency:${idempotencyKey}`, JSON.stringify(existing), 'EX', 86400);
    return existing;
  }

  // Grant in transaction
  const entitlement = await db.$transaction(async (tx) => {
    // Create order record
    const order = await tx.orders.create({
      order_id: orderId,
      user_id: userId,
      sku_id: skuId,
      status: 'verified',
      idempotency_key: idempotencyKey,
      verified_at: new Date()
    });

    // Create entitlement
    const entitlement = await tx.entitlements.create({
      entitlement_id: generateId(),
      user_id: userId,
      sku_id: skuId,
      order_id: order.id,
      status: 'active',
      granted_at: new Date()
    });

    // Update player inventory
    await tx.inventory_items.create({
      user_id: userId,
      entitlement_id: entitlement.id,
      sku_id: skuId
    });

    return entitlement;
  });

  await redis.set(`idempotency:${idempotencyKey}`, JSON.stringify(entitlement), 'EX', 86400);

  // Send notification
  await messageService.send({
    recipientId: userId,
    type: MessageType.PURCHASE_GRANTED,
    body: `You've received: ${skuId}`
  });

  return entitlement;
}
```

#### Sprint 5 Definition of Done
- [ ] SKU catalog CRUD works
- [ ] Steam receipt verification succeeds
- [ ] Epic receipt verification succeeds
- [ ] Duplicate receipt attempts grant once (idempotent)
- [ ] Entitlements stored in database
- [ ] Player can query owned items
- [ ] Admin can manage SKUs and view orders
- [ ] All commerce actions audited

---

## Sprint 6: Refunds & Clawback (2 weeks)

### Goal: Refund handling + ledger for consumables + debt state

#### Must-Haves
| Task | Description | Effort | Dependencies |
|------|-------------|--------|--------------|
| REF-001 | Refund notification webhooks (Steam/Epic) | 3 days | Sprint 5 |
| REF-002 | Refund reconciliation worker (polling fallback) | 2 days | - |
| REF-003 | Entitlement revocation (durable items) | 2 days | Sprint 5 |
| REF-004 | Ledger system for consumable tracking | 3 days | - |
| REF-005 | Debt state for spent consumables | 3 days | REF-004 |
| REF-006 | Manual refund UI for admin | 2 days | - |
| REF-007 | Refund history API | 1 day | - |
| REF-008 | Audit logging for all refund actions | 1 day | - |

#### Technical Implementation - Refund Handling
```typescript
// Refund webhook handler
async function handleRefundWebhook(
  provider: 'steam' | 'epic',
  payload: RefundPayload
): Promise<void> {
  const orderId = extractOrderId(provider, payload);

  await db.$transaction(async (tx) => {
    // Find original order
    const order = await tx.orders.findOne({
      where: { provider_order_id: orderId }
    });

    if (!order) {
      logger.warn(`Refund for unknown order: ${orderId}`);
      return;
    }

    // Update order status
    await tx.orders.update(order.id, { status: 'refunded' });

    // Find active entitlements
    const entitlements = await tx.entitlements.findMany({
      where: { order_id: order.id, status: 'active' }
    });

    for (const entitlement of entitlements) {
      const sku = await tx.skus.findById(entitlement.sku_id);

      if (sku.type === 'durable') {
        // Revoke durable entitlements
        await tx.entitlements.update(entitlement.id, {
          status: 'revoked',
          revoked_at: new Date(),
          revocation_reason: 'refund'
        });

        logger.info(`Revoked durable entitlement: ${entitlement.id}`);
      } else if (sku.type === 'consumable') {
        // Check if already spent via ledger
        const spent = await tx.ledger_entries.aggregate({
          where: {
            entitlement_id: entitlement.id,
            change_type: 'spend'
          },
          _sum: { quantity: true }
        });

        const granted = await tx.ledger_entries.aggregate({
          where: {
            entitlement_id: entitlement.id,
            change_type: 'grant'
          },
          _sum: { quantity: true }
        });

        const remaining = (grented._sum.quantity || 0) - (spent._sum.quantity || 0);

        if (remaining <= 0) {
          // Already spent - create debt
          await tx.ledger_entries.create({
            user_id: order.user_id,
            sku_id: sku.id,
            entitlement_id: entitlement.id,
            change_type: 'clawback',
            quantity: -Math.abs(remaining),
            balance_after: remaining,
            metadata: {
              reason: 'refund',
              original_entitlement_id: entitlement.id
            }
          });

          await tx.entitlements.update(entitlement.id, {
            status: 'revoked',
            revoked_at: new Date(),
            revocation_reason: 'refund'
          });

          logger.warn(`Created debt for spent consumable: user ${order.user_id}`);
        } else {
          // Not spent - revoke and update inventory
          await tx.entitlements.update(entitlement.id, {
            status: 'revoked',
            revoked_at: new Date(),
            revocation_reason: 'refund'
          });

          await tx.inventory_items.deleteMany({
            where: { entitlement_id: entitlement.id }
          });
        }
      }
    }

    // Send notification
    await messageService.send({
      recipientId: order.user_id,
      type: MessageType.PURCHASE_REFUNDED,
      body: `Refund processed for order ${orderId}`,
      metadata: { order_id: orderId }
    });
  });
}
```

#### Sprint 6 Definition of Done
- [ ] Refund webhooks processed
- [ ] Durable entitlements revoked on refund
- [ ] Consumable tracking via ledger works
- [ ] Debt state created for spent consumables
- [ ] Admin can manually process refunds
- [ ] Player sees refund in purchase history
- [ ] All refund actions audited

---

## Sprint 7: UGC System (2 weeks)

### Goal: Upload + metadata + scanning pipeline

#### Must-Haves
| Task | Description | Effort | Dependencies |
|------|-------------|--------|--------------|
| UGC-001 | UGC data model (metadata, lifecycle states) | 1 day | Sprint 1 |
| UGC-002 | Presigned URL upload system | 2 days | INF-005 |
| UGC-003 | Upload API (validate file, create metadata) | 2 days | - |
| UGC-004 | File scanning pipeline (virus/malware) | 3 days | - |
| UGC-005 | Content moderation (images/videos) | 3 days | - |
| UGC-006 | Scanning worker (async processing) | 2 days | - |
| UGC-007 | Status workflow (draft → scanning → published) | 2 days | - |
| UGC-008 | Player UGC list API | 1 day | - |
| UGC-009 | Admin: moderation queue | 2 days | - |
| UGC-010 | Admin: content removal | 1 day | - |
| UGC-011 | Audit logging for UGC actions | 1 day | - |

#### Technical Implementation - Upload
```typescript
// Request upload presigned URL
POST /api/v1/ugc/upload
Body: {
  type: 'mod' | 'image' | 'video' | 'map' | 'text',
  filename: string,
  contentType: string,
  size: number,
  checksum: string  // SHA-256
}

async function createUploadUrl(
  userId: string,
  metadata: UploadMetadata
): Promise<UploadResponse> {
  // Validate file
  if (!ALLOWED_TYPES.includes(metadata.contentType)) {
    throw new BadRequest('Invalid content type');
  }

  if (metadata.size > MAX_FILE_SIZE[metadata.type]) {
    throw new BadRequest('File too large');
  }

  // Generate presigned URL
  const ugcId = generateUGCId();
  const storagePath = `ugc/${metadata.type}/${ugcId}/${metadata.filename}`;

  const uploadUrl = await storage.presignedPutObject(
    BUCKET_NAME,
    storagePath,
    3600,  // 1 hour expiry
    {
      'Content-Type': metadata.contentType,
      'x-amz-meta-uploader': userId,
      'x-amz-meta-checksum': metadata.checksum
    }
  );

  // Create metadata record
  await db.ugc.create({
    ugc_id: ugcId,
    creator_id: userId,
    type: metadata.type,
    name: metadata.name,
    storage_path: storagePath,
    checksum: metadata.checksum,
    status: 'draft',
    metadata: {
      filename: metadata.filename,
      size: metadata.size,
      contentType: metadata.contentType
    }
  });

  return {
    ugcId,
    uploadUrl,
    expiresIn: 3600
  };
}

// Confirm upload complete
POST /api/v1/ugc/:ugcId/publish
Body: { checksum: string }

async function publishUGC(ugcId: string, userId: string): Promise<void> {
  const ugc = await db.ugc.findOne({ where: { ugc_id: ugcId } });

  if (!ugc || ugc.creator_id !== userId) {
    throw new NotFound('UGC not found');
  }

  if (ugc.status !== 'draft') {
    throw new BadRequest('UGC already published or in progress');
  }

  // Verify checksum
  const storedChecksum = await storage.headObject(BUCKET_NAME, ugc.storage_path)
    .then(obj => obj.metadata.checksum);

  if (storedChecksum !== ugc.checksum) {
    throw new BadRequest('Checksum mismatch');
  }

  // Update status to trigger scanning
  await db.ugc.update(ugcId, {
    status: 'scanning',
    updated_at: new Date()
  });

  // Queue scanning job
  await queue.add('scan_content', {
    ugcId,
    type: ugc.type,
    storagePath: ugc.storage_path
  });
}
```

#### Scanning Pipeline
```typescript
// Scanning worker
async function scanContent(job: ScanJob): Promise<void> {
  const { ugcId, type, storagePath } = job;

  try {
    // 1. Virus scan (for executables/mods)
    if (type === 'mod' || type === 'bundle') {
      const virusResult = await scanForViruses(storagePath);
      if (virusResult.infected) {
        await updateUGCStatus(ugcId, 'flagged', {
          reason: 'virus_detected',
          details: virusResult.details
        });
        return;
      }
    }

    // 2. Content moderation (images/videos)
    if (type === 'image' || type === 'video') {
      const moderationResult = await contentModeration.scan(storagePath);
      if (moderationResult.flagged) {
        await updateUGCStatus(ugcId, 'pending_review', {
          flagged_by: 'automod',
          reason: moderationResult.categories
        });
        return;
      }
    }

    // 3. Success - mark for review or publish
    await updateUGCStatus(ugcId, 'pending_review', {
      scan_passed: true,
      scanned_at: new Date()
    });

  } catch (error) {
    await updateUGCStatus(ugcId, 'flagged', {
      reason: 'scan_error',
      error: error.message
    });
  }
}
```

#### Sprint 7 Definition of Done
- [ ] Player can upload UGC via presigned URLs
- [ ] Files scanned for viruses/malware
- [ ] Images/videos pass content moderation
- [ ] Status workflow works (draft → scanning → pending_review → published)
- [ ] Moderation queue exists
- [ ] Admin can view and remove content
- [ ] All UGC actions audited

---

## Sprint 8: UGC Discovery & Moderation (2 weeks)

### Goal: Search/ratings + moderation queue + appeals

#### Must-Haves
| Task | Description | Effort | Dependencies |
|------|-------------|--------|--------------|
| DISC-001 | Discovery API (trending, newest, top rated) | 3 days | Sprint 7 |
| DISC-002 | Full-text search (Postgres tsvector or Elasticsearch) | 2 days | - |
| DISC-003 | UGC ratings API (thumbs up/down, stars) | 2 days | - |
| DISC-004 | UGC download API (signed URLs) | 1 day | - |
| DISC-005 | Player reporting system | 2 days | - |
| DISC-006 | Moderation queue UI (admin) | 2 days | Sprint 7 |
| DISC-007 | Moderation actions (approve, reject, flag) | 2 days | - |
| DISC-008 | Appeals workflow (player can appeal removal) | 2 days | - |
| DISC-009 | CDN cache invalidation on status change | 1 day | - |
| DISC-010 | DMCA takedown workflow | 2 days | - |

#### Technical Implementation - Discovery
```typescript
// Discovery queries
async function getDiscovery(
  filter: DiscoveryFilter,
  pagination: Pagination
): Promise<UGCListResponse> {
  const query = db.ugc
    .createQueryBuilder('ugc')
    .where('ugc.status = :status', { status: 'published' })
    .andWhere('ugc.visibility = :visibility', { visibility: 'public' });

  // Apply filters
  if (filter.type) {
    query.andWhere('ugc.type = :type', { type: filter.type });
  }

  if (filter.tags?.length) {
    query.andWhere('ugc.tags && :tags', { tags: filter.tags });
  }

  if (filter.search) {
    query.andWhere(
      '(ugc.name ILIKE :search OR ugc.description ILIKE :search)',
      { search: `%${filter.search}%` }
    );
  }

  // Apply sorting
  switch (filter.sort) {
    case 'trending':
      // Weighted score: (rating * 0.3) + (downloads * 0.2) + (recency * 0.5)
      query.orderBy('(ugc.rating_sum * 0.3 + ugc.downloads_count * 0.2 + ugc.published_at)', 'DESC');
      break;
    case 'newest':
      query.orderBy('ugc.published_at', 'DESC');
      break;
    case 'top_rated':
      query.orderBy('(ugc.rating_sum::float / NULLIF(ugc.rating_count, 0))', 'DESC');
      break;
    default:
      query.orderBy('ugc.published_at', 'DESC');
  }

  const [items, total] = await query
    .skip(pagination.offset)
    .take(pagination.limit)
    .getManyAndCount();

  return {
    items,
    total,
    page: pagination.page,
    pageSize: pagination.limit
  };
}
```

#### Moderation Queue
```typescript
// Get moderation queue
async function getModerationQueue(
  filters: ModerationQueueFilters
): Promise<ModerationItem[]> {
  return db.ugc.find({
    where: [
      { status: 'pending_review' },
      { status: 'flagged' }
    ],
    order: { created_at: 'ASC' },
    take: 50
  });
}

// Moderate content
async function moderateContent(
  moderatorId: string,
  ugcId: string,
  decision: ModerationDecision
): Promise<void> {
  const ugc = await db.ugc.findById(ugcId);

  await db.$transaction(async (tx) => {
    // Update UGC status
    let newStatus: UGCStatus;
    switch (decision.action) {
      case 'approve':
        newStatus = 'published';
        break;
      case 'reject':
        newStatus = 'removed';
        break;
      case 'flag':
        newStatus = 'flagged';
        break;
      default:
        throw new BadRequest('Invalid action');
    }

    await tx.ugc.update(ugcId, {
      status: newStatus,
      moderation_notes: decision.notes,
      flagged_reason: decision.reason
    });

    // Create audit log
    await tx.audit_logs.create({
      user_id: moderatorId,
      action: 'ugc_moderate',
      resource_type: 'ugc',
      resource_id: ugcId,
      new_value: { decision: decision.action, notes: decision.notes }
    });

    // Notify creator
    await messageService.send({
      recipientId: ugc.creator_id,
      type: MessageType.MODERATION_DECISION,
      body: `Your "${ugc.name}" has been ${decision.action}`,
      metadata: {
        ugcId,
        decision: decision.action,
        reason: decision.reason
      }
    });
  });
}
```

#### Sprint 8 Definition of Done
- [ ] Discovery (trending/newest/top_rated) works
- [ ] Search returns relevant results
- [ ] Ratings system works
- [ ] Player can report content
- [ ] Moderation queue processes items
- [ ] Appeals workflow works
- [ ] DMCA takedowns create audit trail
- [ ] CDN invalidates on status change

---

## Post-Sprint Tasks (Ongoing)

### Sprint 9+: Twitch Drops (If prioritized)
| Task | Description | Effort |
|------|-------------|--------|
| DROP-001 | Twitch OAuth linking | 2 days |
| DROP-002 | Twitch EventSub webhook handling | 2 days |
| DROP-003 | Campaign management UI | 3 days |
| DROP-004 | Idempotent drop grant worker | 2 days |
| DROP-005 | Drop eligibility tracking | 2 days |

### Sprint 10+: Feedback & Polish
| Task | Description | Effort |
|------|-------------|--------|
| FEED-001 | Bug report submission | 2 days |
| FEED-002 | NPS/rating system | 2 days |
| FEED-003 | Cheater reports | 2 days |
| FEED-004 | Player portal UI polish | 3 days |
| FEED-005 | Admin portal UI polish | 3 days |

---

## Summary: Sprint Timeline

| Sprint | Focus | Duration | Key Deliverables |
|--------|-------|----------|------------------|
| 1 | Infrastructure | 2 weeks | DB, Redis, Storage, Queue, CI/CD |
| 2 | Auth + Linking | 2 weeks | Steam/Epic login, JWT, account linking |
| 3 | Progression + Leaderboards | 2 weeks | Cross-save, seasonal leaderboards |
| 4 | Messaging | 2 weeks | System inbox, support threads |
| 5 | Commerce Core | 2 weeks | SKU catalog, receipt verification, entitlements |
| 6 | Refunds + Clawback | 2 weeks | Refund handling, debt state |
| 7 | UGC Upload | 2 weeks | Upload pipeline, scanning |
| 8 | UGC Discovery | 2 weeks | Search, ratings, moderation, appeals |
| 9+ | Twitch Drops | 2 weeks | Drops campaigns, EventSub |
| 10+ | Feedback + Polish | 2 weeks | Reports, UI improvements |

**Total: 16-20 weeks to MVP**

## Risk Mitigation Summary

| Risk | Sprint | Mitigation |
|------|--------|------------|
| Auth complexity | 2 | Focus on Steam first, add Epic after validated |
| Commerce fraud | 5-6 | Idempotency + ledger + reconciliation worker |
| UGC moderation | 7-8 | Automated scanning first, human review queue |
| Performance | 3, 8 | Redis caching, CDN, pagination |
| Compliance | 8 | Audit logs, appeals, DMCA workflow |
