# Player Platform Suite - Complete Sprint Plan

## Executive Summary

This document provides a comprehensive sprint plan for building the Player Platform Suite based on the PRD requirements. The plan is derived from deep technical research across authentication, commerce, UGC, leaderboards, and Twitch Drops integrations.

**Timeline**: 8 sprints × 2 weeks = 16 weeks to MVP  
**Team Size**: 4-6 engineers (full-stack)

---

## Part 1: Dependency Analysis & Module Map

### Module Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FOUNDATION LAYER                                   │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  A) Player Accounts & Authentication (BLOCKS EVERYTHING)               │  │
│  │     - Steam/Epic login + JWT issuance                                  │  │
│  │     - Session management (rate limiting, refresh, revocation)          │  │
│  │     - Audit logging for sensitive actions                              │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                      ↓                                       │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  B) Account Linking (Depends on A)                                     │  │
│  │     - Link Steam ↔ Epic                                               │  │
│  │     - Merge conflicts (admin-controlled)                               │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌──────────────────────────────────┬──────────────────────────────────┐
│  C) Player Progression           │  E) Messages (Inbox Only)        │
│  - Snapshot versioning           │  - System notifications          │
│  - Cross-save                    │  - Support threads               │
│  - Conflict resolution           │                                  │
└──────────────────────────────────┴──────────────────────────────────┘
         ↓                                ↓
         ├────────────────────────────────┤
         ↓                                ↓
┌─────────────────────────┐    ┌─────────────────────────┐
│ D) Leaderboards         │    │ F) Commerce             │
│ - Seasonal              │    │ - SKU catalog           │
│ - Anti-cheat validation │    │ - Receipt verification  │
│ - Admin removal         │    │ - Entitlements + refunds│
└─────────────────────────┘    └─────────────────────────┘
         ↓                                ↓
         └──────────────┬─────────────────┘
                        ↓
         ┌───────────────────────────────┐
         │ G) UGC                        │
         │ - Upload + metadata           │
         │ - Scanning pipeline           │
         │ - Moderation queue            │
         │ - Discovery (search/ratings)  │
         └───────────────────────────────┘
                        ↓
         ┌───────────────────────────────┐
         │ I) Twitch Drops               │
         │ - Twitch OAuth linking        │
         │ - Campaign management         │
         │ - EventSub webhook handling   │
         │ - Idempotent reward grants    │
         └───────────────────────────────┘
```

### Critical Path Analysis

**PATH 1: Commerce (Revenue)**
```
A (Auth) → C (Progression for entitlements) → F (Commerce) → Revenue
```

**PATH 2: Player Engagement**
```
A (Auth) → B (Linking) → C (Progression) → D (Leaderboards) → Engagement
```

**PATH 3: User-Generated Content**
```
A (Auth) → G (UGC) → H (Moderation) → Discovery → Community
```

---

## Part 2: Technical Stack Recommendations

### Core Services

| Component | Technology | Justification |
|-----------|------------|---------------|
| **Language** | TypeScript/Node.js | Full-stack consistency, excellent async support |
| **API Framework** | Fastify or NestJS | Fastify for performance, NestJS for structure |
| **Database** | PostgreSQL | ACID compliance, JSONB for metadata, robust auditing |
| **Cache/Queue** | Redis | Sorted sets for leaderboards, Pub/Sub for realtime |
| **Object Storage** | S3-compatible (Cloudflare R2) | Presigned URL support, CDN integration |
| **Message Queue** | BullMQ (Redis-based) | Job scheduling, retries, priorities |
| **API Gateway** | Kong or Traefik | Rate limiting, webhook verification |
| **Monitoring** | Prometheus + Grafana | Metrics, structured logging |

### Data Store Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PostgreSQL (Primary Data Store)                                            │
│                                                                              │
│  Tables:                                                                     │
│  - users, identities, account_links                                          │
│  - profiles, progressions                                                    │
│  - orders, transactions, entitlements                                        │
│  - ugc_metadata, reports, appeals                                            │
│  - messages, feedback                                                        │
│  - campaigns, seasons, leaderboard_entries                                   │
│  - audit_logs, processed_messages (idempotency)                              │
│                                                                              │
│  Indexes: user_id, provider_id, status, created_at                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│  Redis (Hot Data & Performance)                                              │
│                                                                              │
│  Keys:                                                                       │
│  - session_tokens (TTL-based)                                               │
│  - rate_limiters (sliding window)                                            │
│  - leaderboard:{season_id} (sorted sets)                                     │
│  - hot_ugc_feeds (capped lists)                                              │
│  - idempotency_keys (short TTL)                                              │
│  - refresh_token_rotation tracking                                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│  Object Storage (S3-compatible)                                              │
│                                                                              │
│  Buckets/Paths:                                                              │
│  - ugc/{type}/{ugc_id}/{filename}                                           │
│  - receipts/{order_id}.json                                                 │
│  - scans/{ugc_id}/{scanner_type}/                                           │
│  - CDN-backed with signed URLs                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 3: Must-Haves vs Good-to-Haves

### MUST-HAVE (MVP Definition of Done)

| Module | Requirements | Priority | Sprint |
|--------|--------------|----------|--------|
| **A1-A3** | Steam/Epic login + JWT + session mgmt | P0 - Blocker | Sprint 2 |
| **A4** | Audit logging | P0 - Security | Sprint 2 |
| **B1** | Basic account linking | P0 - UX | Sprint 2 |
| **C1-C2** | Progression snapshot + storage | P0 - Core | Sprint 3 |
| **D1-D3** | Leaderboards + seasons + validation | P1 - Core | Sprint 3 |
| **E1** | System inbox messages | P1 - Notifications | Sprint 4 |
| **F1-F4** | SKU catalog + verification + entitlements | P0 - Revenue | Sprint 5 |
| **F5** | Refund/clawback | P0 - Fraud prevention | Sprint 6 |
| **G1-G4** | Upload + metadata + scanning + moderation | P1 - Community | Sprint 7 |
| **G5-G6** | Discovery + ratings | P2 - Growth | Sprint 8 |
| **H1-H2** | Bug reports + feature requests | P2 - Feedback | Sprint 8 |
| **I1-I3** | Twitch linking + basic drops | P2 - Engagement | Sprint 8 |
| **Admin** | User lookup + audit logs + basic moderation | P0 - Operations | Ongoing |
| **Player** | View/manage linked accounts | P0 - UX | Sprint 2 |

### GOOD-TO-HAVE (Post-MVP)

| Module | Requirements | Reason | Sprint |
|--------|--------------|--------|--------|
| **A2** | Email login (OTP/magic link) | Recovery only | 9+ |
| **B2-B3** | Unlink rules + merge conflicts | Advanced linking | 9+ |
| **C3-C4** | Conflict resolution + anti-cheat | Advanced | 9+ |
| **D2** | Regional leaderboards | Geography | 9+ |
| **E2** | Player-to-player messaging | Community | 10+ |
| **E3** | Realtime chat | Future expansion | 10+ |
| **G7** | DMCA takedowns | Legal compliance | 9+ |
| **H3** | Spam controls | Quality | 9+ |
| **I4-I5** | Advanced drop triggers | Engagement | 9+ |
| **Admin** | Full commerce console | Operations efficiency | 9+ |
| **Player** | Privacy settings | GDPR compliance | 10+ |

---

## Part 4: Sprint Breakdown

### Sprint 1: Foundation & Infrastructure (2 weeks)

**Goal**: Set up all infrastructure, devops, and core data models

#### Tasks

| Task ID | Description | Effort | Dependencies |
|---------|-------------|--------|--------------|
| INF-001 | Set up project structure (monorepo with pnpm/workspaces) | 2 days | - |
| INF-002 | Configure CI/CD pipeline (GitHub Actions) | 2 days | - |
| INF-003 | Set up PostgreSQL database with migrations | 1 day | - |
| INF-004 | Set up Redis cluster (leaderboards, rate limits, sessions) | 1 day | - |
| INF-005 | Set up object storage (S3-compatible) + CDN | 1 day | - |
| INF-006 | Set up message queue (RabbitMQ/Kafka) | 1 day | - |
| INF-007 | Configure logging (structured JSON logs) | 1 day | - |
| INF-008 | Configure metrics (Prometheus/Grafana) | 1 day | - |
| INF-009 | Set up API gateway (Kong/Traefik) | 2 days | - |
| INF-010 | Create OpenAPI spec skeleton for all services | 2 days | - |
| INF-011 | Set up local development environment (Docker Compose) | 2 days | - |

#### Data Models (PostgreSQL DDL)

```sql
-- Core enum types
CREATE TYPE user_status AS ENUM ('active', 'banned', 'suspended');
CREATE TYPE ugc_status AS ENUM ('draft', 'uploaded', 'scanning', 'pending_review', 'published', 'flagged', 'removed');
CREATE TYPE order_status AS ENUM ('pending', 'verified', 'failed', 'refunded');
CREATE TYPE entitlement_type AS ENUM ('durable', 'consumable', 'bundle');

-- Base tables
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_id VARCHAR(64) UNIQUE NOT NULL,
    status user_status DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL,
    provider_id VARCHAR(128) NOT NULL,
    provider_email VARCHAR(255),
    metadata JSONB,
    linked_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(provider, provider_id)
);

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL,
    player_id VARCHAR(64),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(64),
    old_value JSONB,
    new_value JSONB,
    metadata JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    request_id UUID,
    server_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_player ON audit_logs(player_id, server_timestamp DESC);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);
```

#### Definition of Done
- [ ] All services compile and run locally
- [ ] CI/CD passes on main branch
- [ ] Database migrations apply cleanly
- [ ] Object storage bucket created and accessible
- [ ] Message queue consuming messages
- [ ] Basic health endpoints for all services

---

### Sprint 2: Authentication & Account Linking (2 weeks)

**Goal**: Steam/Epic login + JWT + basic account linking

#### Research-Based Implementation

**Steam Authentication** ([Steam Web API](https://partner.steam-api.com/ISteamUserAuth/)):

```typescript
// Steam ticket verification
async function verifySteamTicket(ticket: string, steamId: string): Promise<SteamUser> {
  const response = await fetch(
    `https://partner.steam-api.com/ISteamUserAuth/AuthenticateUserTicket/v1/?key=${STEAM_API_KEY}&ticket=${ticket}&appid=${APP_ID}`
  );

  const data = await response.json();

  if (!data.response?.authenticated) {
    throw new Unauthorized('Steam authentication failed');
  }

  // Use SteamID from response, not client
  const ticketSteamId = data.response.steamid;
  if (ticketSteamId !== steamId) {
    throw new Unauthorized('Steam ID mismatch');
  }

  return {
    steamId: ticketSteamId,
    personaName: data.response.personaname,
    vacBanned: data.response.vacbanned,
    publisherBanned: data.response.publisherbanned
  };
}
```

**Epic EOS Authentication** ([EOS Documentation](https://dev.epicgames.com/docs/services)):

```typescript
// EOS token validation
async function validateEOSToken(accessToken: string): Promise<EOSUser> {
  const response = await fetch(
    'https://api.epicgames.com/auth/v1/tokeninfo',
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );

  const data = await response.json();

  return {
    accountId: data.token.account_id,
    displayName: data.token.display_name,
    expiresAt: new Date(data.token.expires_at),
    scope: data.token.scope
  };
}
```

**JWT Token Structure** (Best practices from research):

```typescript
interface PlayerToken {
  sub: string;                    // canonical_user_id
  iss: 'player-platform';
  aud: string;                    // client_id
  exp: number;                    // 15-30 minutes
  iat: number;
  jti: string;                    // unique token ID for revocation
  session_id: string;
  providers: string[];            // ['steam', 'epic']
  roles: string[];                // ['player', 'moderator', 'admin']
}

interface RefreshToken {
  sub: string;
  exp: number;                    // 7-30 days
  rotation_id: string;            // for revocation tracking
  session_id: string;
}
```

**Token Refresh Rotation** (Critical for security):

```typescript
async function refreshAccessToken(refreshToken: string): Promise<TokenPair> {
  const payload = decodeRefreshToken(refreshToken);

  // Check if rotation token is valid and active
  const rotationKey = `refresh_rotation:${payload.rotation_id}`;
  const rotationData = await redis.hgetall(rotationKey);

  if (!rotationData || rotationData.active !== 'true') {
    throw new Unauthorized('Refresh token revoked');
  }

  // Invalidate old refresh token
  await redis.hset(rotationKey, 'active', 'false');

  // Generate new token pair
  return createTokens(payload.sub, payload.roles);
}
```

**Rate Limiting** (Redis sliding window):

```typescript
async function checkRateLimit(userId: string, action: string): Promise<void> {
  const key = `ratelimit:${userId}:${action}`;
  const now = Date.now();
  const window = 60000; // 1 minute

  // Remove old entries
  await redis.zremrangebyscore(key, 0, now - window);

  // Count current
  const count = await redis.zcard(key);

  if (count >= 100) { // 100 requests per minute
    throw new RateLimitExceeded();
  }

  // Add current request
  await redis.zadd(key, now, `${now}-${Math.random()}`);
  await redis.expire(key, window + 1);
}
```

#### Tasks

| Task ID | Description | Effort | Dependencies |
|---------|-------------|--------|--------------|
| AUTH-001 | Steam authentication flow (ticket verification) | 3 days | INF-003 |
| AUTH-002 | Epic/EOS authentication flow | 3 days | INF-003 |
| AUTH-003 | JWT issuance (access + refresh tokens) | 2 days | - |
| AUTH-004 | Token refresh rotation + revocation | 2 days | AUTH-003 |
| AUTH-005 | Rate limiting per IP/user | 2 days | INF-004 |
| AUTH-006 | Basic audit logging for auth events | 1 day | - |
| AUTH-007 | Account linking flow (Steam ↔ Epic) | 3 days | AUTH-001, AUTH-002 |
| AUTH-008 | Link validation (cannot unlink last method) | 1 day | AUTH-007 |
| AUTH-009 | Player profile creation on first login | 1 day | - |

#### Definition of Done
- [ ] Player can login via Steam, receive JWT
- [ ] Player can login via Epic, receive JWT
- [ ] Player can link Steam + Epic accounts
- [ ] Token refresh works, revocation works
- [ ] Rate limiting enforced (100 req/min per user)
- [ ] Audit logs capture all auth events
- [ ] Integration tests for all auth flows

---

### Sprint 3: Player Progression & Leaderboards (2 weeks)

**Goal**: Cross-save progression + seasonal leaderboards

#### Research-Based Implementation

**Redis Sorted Sets for Leaderboards** ([Redis Documentation](https://redis.io/docs/data-types/sorted-sets/)):

```typescript
// Core leaderboard operations
async function submitScore(seasonId: string, userId: string, score: number): Promise<RankInfo> {
  const key = `leaderboard:${seasonId}`;
  const pipeline = redis.pipeline();

  pipeline.zadd(key, score, userId);
  pipeline.zrevrank(key, userId);
  pipeline.zscore(key, userId);

  const results = await pipeline.exec();

  return {
    rank: (results[1][1] as number) + 1, // 1-indexed
    score: results[2][1] as number
  };
}

async function getTopPlayers(seasonId: string, limit: number = 10): Promise<LeaderboardEntry[]> {
  const key = `leaderboard:${seasonId}`;
  const scores = await redis.zrevrange(key, 0, limit - 1, 'WITHSCORES');

  const entries: LeaderboardEntry[] = [];
  for (let i = 0; i < scores.length; i += 2) {
    entries.push({
      rank: (i / 2) + 1,
      userId: scores[i],
      score: parseInt(scores[i + 1])
    });
  }

  return entries;
}
```

**Season Reset with Lua Script** (Atomic operation):

```lua
-- season_reset.lua
local seasonId = ARGV[1]
local newSeasonId = ARGV[2]
local archiveKey = 'season:archive:' .. seasonId
local currentKey = 'leaderboard:active:' .. seasonId

-- Archive top 1000 players
local topPlayers = redis.call('ZREVRANGE', currentKey, 0, 999, 'WITHSCORES')
if #topPlayers > 0 then
  for i = 1, #topPlayers, 2 do
    local playerId = topPlayers[i]
    local score = tonumber(topPlayers[i+1])
    local rank = (i - 1) / 2
    redis.call('HSET', archiveKey, playerId, rank .. ':' .. score)
  end
end

-- Clear current leaderboard
redis.call('DEL', currentKey)

return {archiveKey, newSeasonId}
```

**Anti-Cheat: Server-Authoritative Scores** ([Research Finding](https://discussions.unity.com/t/preventing-fake-score-submissions/1528096)):

```typescript
// The only uncheatable leaderboard is server-authoritative
async function verifyScoreSubmission(
  playerId: string,
  claimedScore: number,
  sessionId: string,
  actions: GameAction[]
): Promise<{ valid: boolean; actualScore: number }> {
  // 1. Verify session exists and is valid
  const session = await getSession(sessionId);
  if (!session || session.playerId !== playerId) {
    return { valid: false, actualScore: 0 };
  }

  // 2. Replay actions to calculate actual score
  let calculatedScore = 0;
  for (const action of actions) {
    const impact = calculateActionImpact(action);
    if (!isValidAction(action, impact)) {
      return { valid: false, actualScore: calculatedScore };
    }
    calculatedScore += impact;
  }

  // 3. Verify final score matches claim
  return {
    valid: calculatedScore === claimedScore,
    actualScore: calculatedScore
  };
}
```

**Progression with Optimistic Locking**:

```typescript
interface PlayerProgression {
  playerId: string;
  version: number;  // Optimistic lock
  level: number;
  experience: number;
  achievements: string[];
  updated_at: string;
}

async function saveProgression(
  playerId: string,
  data: Partial<PlayerProgression>,
  expectedVersion: number
): Promise<{ success: boolean; newVersion: number }> {
  const key = `player:${playerId}:progression`;

  // Lua script for atomic read-modify-write
  const script = `
    local current = redis.call('GET', KEYS[1])
    if not current then return {0, 'NOT_FOUND'} end

    local data = cjson.decode(current)
    if data.version ~= tonumber(ARGV[1]) then
      return {0, 'VERSION_CONFLICT', data.version}
    end

    for k, v in pairs(ARGV) do
      if k > 1 then
        local key, value = string.match(v, '([^:]+):(.*)')
        if key and value then data[key] = value end
      end
    end

    data.version = data.version + 1
    data.updated_at = ARGV[#ARGV]

    redis.call('SET', KEYS[1], cjson.encode(data))
    return {1, data.version}
  `;

  const changesJson = Object.entries(data).map(([k, v]) => `${k}:${v}`);
  changesJson.push(new Date().toISOString());

  const result = await redis.eval(script, 1, key, expectedVersion, ...changesJson);

  if (result[0] === 1) {
    return { success: true, newVersion: result[1] };
  }

  throw new ConflictError(`Version ${expectedVersion} is stale`);
}
```

#### Tasks

| Task ID | Description | Effort | Dependencies |
|---------|-------------|--------|--------------|
| PROG-001 | Player progression data model (snapshot + versioning) | 2 days | Sprint 1 |
| PROG-002 | Progression CRUD API (save, load, list) | 2 days | - |
| PROG-003 | Version-based conflict detection | 2 days | PROG-001 |
| PROG-004 | Leaderboard season data model | 1 day | Sprint 1 |
| PROG-005 | Redis sorted set leaderboard implementation | 3 days | INF-004 |
| PROG-006 | Score submission with validation | 2 days | - |
| PROG-007 | Season management (create, activate, archive) | 2 days | PROG-004 |
| PROG-008 | Admin: remove leaderboard entry | 1 day | - |
| PROG-009 | Basic leaderboard API (get rank, top N) | 2 days | PROG-005 |
| PROG-010 | Audit logging for all actions | 1 day | - |

#### Definition of Done
- [ ] Player progression saves/loads with version locking
- [ ] Leaderboards support seasons (create, activate, list)
- [ ] Scores submit and rank correctly in Redis
- [ ] Admin can remove leaderboard entries
- [ ] Audit logs capture all changes
- [ ] Leaderboard API returns top N and user rank

---

### Sprint 4: Messaging System (2 weeks)

**Goal**: System inbox + support threads

#### Message Types (v1)

```typescript
enum MessageType {
  PURCHASE_GRANTED = 'purchase_granted',
  PURCHASE_REFUNDED = 'purchase_refunded',
  DROP_CLAIMED = 'drop_claimed',
  MODERATION_DECISION = 'moderation_decision',
  CAMPAIGN_ANNOUNCEMENT = 'campaign_announcement',
  SUPPORT_THREAD_CREATED = 'support_thread_created',
  SUPPORT_REPLY = 'support_reply',
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

#### Tasks

| Task ID | Description | Effort | Dependencies |
|---------|-------------|--------|--------------|
| MSG-001 | Message data model | 1 day | Sprint 1 |
| MSG-002 | System notification types | 2 days | - |
| MSG-003 | Message sending API | 2 days | - |
| MSG-004 | Message inbox API (list, get, mark read) | 2 days | - |
| MSG-005 | Support thread creation + reply | 2 days | - |
| MSG-006 | Message status tracking | 1 day | - |
| MSG-007 | Admin: broadcast announcement | 2 days | - |
| MSG-008 | Admin: view support threads | 1 day | - |
| MSG-009 | Notification delivery | 2 days | - |

#### Definition of Done
- [ ] System notifications sent on purchases/drops/moderation
- [ ] Player can view inbox and mark messages read
- [ ] Support threads work (player ↔ support)
- [ ] Admin can broadcast announcements
- [ ] Admin can view all support threads

---

### Sprint 5: Commerce Core (2 weeks)

**Goal**: SKU catalog + receipt verification + entitlements

#### Research-Based Implementation

**Steam Receipt Verification** ([ISteamMicroTxn API](https://partner.steam-api.com/ISteamMicroTxn/)):

```typescript
async function verifySteamReceipt(orderId: string, appId: string): Promise<VerificationResult> {
  const response = await fetch(
    'https://partner.steam-api.com/ISteamMicroTxn/FinalizeTxn/v2/',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${STEAM_API_KEY}:`).toString('base64')}`
      },
      body: new URLSearchParams({
        appid: appId,
        orderid: orderId
      })
    }
  );

  const result = await response.json();

  if (result.response?.result !== 'OK') {
    throw new VerificationFailed('Steam verification failed');
  }

  const order = result.response?.params;
  return {
    orderId: order.orderid,
    userId: order.steamid,
    amount: order.amount,
    currency: order.currency,
    items: order.lineitems
  };
}
```

**Idempotency Pattern** (Critical for preventing duplicate grants):

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
    where: { external_order_id: orderId, status: 'active' }
  });

  if (existing) {
    await redis.set(`idempotency:${idempotencyKey}`, JSON.stringify(existing), 'EX', 86400);
    return existing;
  }

  // Grant in transaction
  const entitlement = await db.$transaction(async (tx) => {
    const order = await tx.orders.create({
      order_id: orderId,
      user_id: userId,
      sku_id: skuId,
      status: 'verified',
      idempotency_key: idempotencyKey,
      verified_at: new Date()
    });

    const entitlement = await tx.entitlements.create({
      entitlement_id: generateId(),
      user_id: userId,
      sku_id: skuId,
      order_id: order.id,
      status: 'active',
      granted_at: new Date()
    });

    return entitlement;
  });

  await redis.set(`idempotency:${idempotencyKey}`, JSON.stringify(entitlement), 'EX', 86400);

  return entitlement;
}
```

**Entitlement Data Model**:

```sql
CREATE TABLE skus (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku_id VARCHAR(64) UNIQUE NOT NULL,
    type entitlement_type NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    metadata JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id VARCHAR(64) UNIQUE NOT NULL,
    user_id UUID REFERENCES users(id),
    sku_id UUID REFERENCES skus(id),
    provider VARCHAR(20) NOT NULL,
    provider_order_id VARCHAR(128),
    status order_status DEFAULT 'pending',
    idempotency_key VARCHAR(128) UNIQUE,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    verified_at TIMESTAMPTZ
);

CREATE TABLE entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entitlement_id VARCHAR(64) UNIQUE NOT NULL,
    user_id UUID REFERENCES users(id),
    sku_id UUID REFERENCES skus(id),
    order_id UUID REFERENCES orders(id),
    status VARCHAR(20) DEFAULT 'active',
    granted_at TIMESTAMPTZ DEFAULT now(),
    revoked_at TIMESTAMPTZ,
    revocation_reason VARCHAR(20)
);

CREATE TABLE ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    sku_id UUID REFERENCES skus(id),
    entitlement_id UUID REFERENCES entitlements(id),
    change_type VARCHAR(20) NOT NULL,
    quantity INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    order_id UUID REFERENCES orders(id),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

#### Tasks

| Task ID | Description | Effort | Dependencies |
|---------|-------------|--------|--------------|
| COMM-001 | SKU catalog data model + CRUD API | 2 days | Sprint 1 |
| COMM-002 | Steam purchase verification | 3 days | Sprint 2 |
| COMM-003 | Epic purchase verification | 3 days | Sprint 2 |
| COMM-004 | Idempotency system | 2 days | INF-004 |
| COMM-005 | Order creation + status tracking | 2 days | - |
| COMM-006 | Entitlement grant (transactional) | 2 days | - |
| COMM-007 | Entitlement query API | 1 day | - |
| COMM-008 | Player purchase history API | 1 day | - |
| COMM-009 | Audit logging | 1 day | - |
| COMM-010 | Admin: SKU management UI | 2 days | - |
| COMM-011 | Admin: order lookup | 1 day | - |

#### Definition of Done
- [ ] SKU catalog CRUD works
- [ ] Steam receipt verification succeeds
- [ ] Epic receipt verification succeeds
- [ ] Duplicate receipt attempts grant once (idempotent)
- [ ] Entitlements stored in database
- [ ] Player can query owned items
- [ ] Admin can manage SKUs and view orders
- [ ] All commerce actions audited

---

### Sprint 6: Refunds & Clawback (2 weeks)

**Goal**: Refund handling + ledger for consumables + debt state

#### Refund Processing Flow

```typescript
async function handleRefund(provider: 'steam' | 'epic', payload: RefundPayload): Promise<void> {
  const orderId = extractOrderId(provider, payload);

  await db.$transaction(async (tx) => {
    const order = await tx.orders.findOne({
      where: { provider_order_id: orderId }
    });

    if (!order) {
      logger.warn(`Refund for unknown order: ${orderId}`);
      return;
    }

    await tx.orders.update(order.id, { status: 'refunded' });

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
      } else if (sku.type === 'consumable') {
        // Check if already spent
        const spent = await tx.ledger_entries.aggregate({
          where: { entitlement_id: entitlement.id, change_type: 'spend' },
          _sum: { quantity: true }
        });

        const granted = await tx.ledger_entries.aggregate({
          where: { entitlement_id: entitlement.id, change_type: 'grant' },
          _sum: { quantity: true }
        });

        const remaining = (granted._sum.quantity || 0) - (spent._sum.quantity || 0);

        if (remaining <= 0) {
          // Already spent - create debt
          await tx.ledger_entries.create({
            user_id: order.user_id,
            sku_id: sku.id,
            entitlement_id: entitlement.id,
            change_type: 'clawback',
            quantity: -Math.abs(remaining),
            balance_after: remaining,
            metadata: { reason: 'refund' }
          });
        }

        await tx.entitlements.update(entitlement.id, {
          status: 'revoked',
          revoked_at: new Date(),
          revocation_reason: 'refund'
        });
      }
    }

    // Send notification
    await messageService.send({
      recipientId: order.user_id,
      type: MessageType.PURCHASE_REFUNDED,
      body: `Refund processed for order ${orderId}`
    });
  });
}
```

#### Tasks

| Task ID | Description | Effort | Dependencies |
|---------|-------------|--------|--------------|
| REF-001 | Refund notification webhooks | 3 days | Sprint 5 |
| REF-002 | Refund reconciliation worker | 2 days | - |
| REF-003 | Entitlement revocation (durable) | 2 days | Sprint 5 |
| REF-004 | Ledger system for consumable tracking | 3 days | - |
| REF-005 | Debt state for spent consumables | 3 days | REF-004 |
| REF-006 | Manual refund UI for admin | 2 days | - |
| REF-007 | Refund history API | 1 day | - |
| REF-008 | Audit logging | 1 day | - |

#### Definition of Done
- [ ] Refund webhooks processed
- [ ] Durable entitlements revoked on refund
- [ ] Consumable tracking via ledger works
- [ ] Debt state created for spent consumables
- [ ] Admin can manually process refunds
- [ ] Player sees refund in purchase history
- [ ] All refund actions audited

---

### Sprint 7: UGC Upload System (2 weeks)

**Goal**: Upload + metadata + scanning pipeline

#### Research-Based Implementation

**Presigned URL Upload** ([AWS S3 Documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrl.html)):

```typescript
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

  const ugcId = generateUGCId();
  const storagePath = `ugc/${metadata.type}/${ugcId}/${metadata.filename}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: storagePath,
    ContentType: metadata.contentType,
    Metadata: {
      uploader: userId,
      checksum: metadata.checksum
    }
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

  await db.ugc.create({
    ugc_id: ugcId,
    creator_id: userId,
    type: metadata.type,
    name: metadata.name,
    storage_path: storagePath,
    checksum: metadata.checksum,
    status: 'draft',
    metadata: { filename: metadata.filename, size: metadata.size }
  });

  return { ugcId, uploadUrl, expiresIn: 3600 };
}
```

**Scanning Pipeline** ([ClamAV Integration](https://github.com/DFE-Digital/rsd-clamav-api)):

```typescript
async function scanContent(job: ScanJob): Promise<void> {
  const { ugcId, type, storagePath } = job;

  try {
    // Virus scan for executables/mods
    if (type === 'mod' || type === 'bundle') {
      const virusResult = await scanForViruses(storagePath);
      if (virusResult.infected) {
        await updateUGCStatus(ugcId, 'flagged', { reason: 'virus_detected' });
        return;
      }
    }

    // Content moderation for images/videos
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

    await updateUGCStatus(ugcId, 'pending_review', { scan_passed: true });

  } catch (error) {
    await updateUGCStatus(ugcId, 'flagged', { reason: 'scan_error' });
  }
}
```

**UGC Status State Machine**:

```typescript
enum UGCStatus {
  DRAFT = 'draft',
  UPLOADED = 'uploaded',
  SCANNING = 'scanning',
  PENDING_REVIEW = 'pending_review',
  PUBLISHED = 'published',
  FLAGGED = 'flagged',
  REMOVED = 'removed'
}

function transitionAllowed(current: UGCStatus, next: UGCStatus): boolean {
  const transitions: Record<UGCStatus, UGCStatus[]> = {
    [UGCStatus.DRAFT]: [UGCStatus.UPLOADED, UGCStatus.REMOVED],
    [UGCStatus.UPLOADED]: [UGCStatus.SCANNING],
    [UGCStatus.SCANNING]: [UGCStatus.PENDING_REVIEW, UGCStatus.FLAGGED],
    [UGCStatus.PENDING_REVIEW]: [UGCStatus.PUBLISHED, UGCStatus.FLAGGED, UGCStatus.REMOVED],
    [UGCStatus.PUBLISHED]: [UGCStatus.FLAGGED, UGCStatus.REMOVED],
    [UGCStatus.FLAGGED]: [UGCStatus.PUBLISHED, UGCStatus.REMOVED, UGCStatus.PENDING_REVIEW],
    [UGCStatus.REMOVED]: []
  };

  return transitions[current]?.includes(next) ?? false;
}
```

#### Tasks

| Task ID | Description | Effort | Dependencies |
|---------|-------------|--------|--------------|
| UGC-001 | UGC data model | 1 day | Sprint 1 |
| UGC-002 | Presigned URL upload system | 2 days | INF-005 |
| UGC-003 | Upload API | 2 days | - |
| UGC-004 | File scanning pipeline (virus/malware) | 3 days | - |
| UGC-005 | Content moderation (images/videos) | 3 days | - |
| UGC-006 | Scanning worker | 2 days | - |
| UGC-007 | Status workflow | - |
| UGC-008 | 2 days | Player UGC list API | 1 day | - |
| UGC-009 | Admin: moderation queue | 2 days | - |
| UGC-010 | Admin: content removal | 1 day | - |
| UGC-011 | Audit logging | 1 day | - |

#### Definition of Done
- [ ] Player can upload UGC via presigned URLs
- [ ] Files scanned for viruses/malware
- [ ] Images/videos pass content moderation
- [ ] Status workflow works (draft → scanning → pending_review → published)
- [ ] Moderation queue exists
- [ ] Admin can view and remove content
- [ ] All UGC actions audited

---

### Sprint 8: UGC Discovery & Twitch Drops (2 weeks)

**Goal**: Search/ratings + moderation queue + appeals + Twitch Drops

#### Discovery Implementation

```typescript
async function getDiscovery(
  filter: DiscoveryFilter,
  pagination: Pagination
): Promise<UGCListResponse> {
  const query = db.ugc
    .createQueryBuilder('ugc')
    .where('ugc.status = :status', { status: 'published' })
    .andWhere('ugc.visibility = :visibility', { visibility: 'public' });

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

  switch (filter.sort) {
    case 'trending':
      query.orderBy('(ugc.rating_sum * 0.3 + ugc.downloads_count * 0.2 + ugc.published_at)', 'DESC');
      break;
    case 'newest':
      query.orderBy('ugc.published_at', 'DESC');
      break;
    case 'top_rated':
      query.orderBy('(ugc.rating_sum::float / NULLIF(ugc.rating_count, 0))', 'DESC');
      break;
  }

  const [items, total] = await query
    .skip(pagination.offset)
    .take(pagination.limit)
    .getManyAndCount();

  return { items, total, page: pagination.page, pageSize: pagination.limit };
}
```

#### Twitch Drops Implementation

**EventSub Webhook Verification** ([Twitch Documentation](https://dev.twitch.tv/docs/eventsub/)):

```typescript
function verifyWebhookSignature(
  messageId: string,
  timestamp: string,
  body: string,
  secret: string,
  signature: string
): boolean {
  const message = messageId + timestamp + body;
  const computedHmac = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(computedHmac),
    Buffer.from(signature)
  );
}

app.post('/webhooks/twitch', express.raw({ type: 'application/json' }), (req, res) => {
  const messageId = req.headers['twitch-eventsub-message-id'];
  const timestamp = req.headers['twitch-eventsub-message-timestamp'];
  const signature = req.headers['twitch-eventsub-message-signature'];
  const messageType = req.headers['twitch-eventsub-message-type'];
  const body = req.body;

  if (!verifyWebhookSignature(messageId, timestamp, body, WEBHOOK_SECRET, signature)) {
    return res.sendStatus(403);
  }

  const notification = JSON.parse(body);

  switch (messageType) {
    case 'notification':
      handleDropEntitlementGrant(notification.event);
      res.sendStatus(204);
      break;
    case 'webhook_callback_verification':
      res.set('Content-Type', 'text/plain').status(200).send(notification.challenge);
      break;
    case 'revocation':
      console.log(`${notification.subscription.type} revoked`);
      res.sendStatus(204);
      break;
  }
});
```

**Idempotent Drop Grant**:

```typescript
async function handleDropEntitlementGrant(event: DropEntitlementEvent): Promise<void> {
  const { entitlement_id, user_id, benefit_id, campaign_id } = event;

  // Check idempotency
  const existing = await db.processed_messages.findOne({
    where: { message_id: entitlement_id }
  });

  if (existing?.status === 'fulfilled') {
    console.log(`Entitlement ${entitlement_id} already processed`);
    return;
  }

  // Get user's linked game account
  const accountLink = await db.account_links.findOne({
    where: { twitch_user_id: user_id }
  });

  if (!accountLink) {
    // Queue for later - user needs to link account
    await queueUnlinkedEntitlement(event);
    return;
  }

  // Grant in-game item
  await inventoryService.grantItem({
    accountId: accountLink.game_account_id,
    benefitId: benefit_id,
    entitlementId: entitlement_id
  });

  // Mark as processed
  await db.processed_messages.upsert({
    where: { message_id: entitlement_id },
    update: { status: 'fulfilled', processed_at: new Date() },
    create: {
      message_id: entitlement_id,
      entitlement_id,
      user_id,
      benefit_id,
      campaign_id,
      status: 'fulfilled'
    }
  });
}
```

#### Tasks

| Task ID | Description | Effort | Dependencies |
|---------|-------------|--------|--------------|
| DISC-001 | Discovery API (trending, newest, top rated) | 3 days | Sprint 7 |
| DISC-002 | Full-text search | 2 days | - |
| DISC-003 | UGC ratings API | 2 days | - |
| DISC-004 | UGC download API | 1 day | - |
| DISC-005 | Player reporting system | 2 days | - |
| DISC-006 | Moderation queue UI | 2 days | Sprint 7 |
| DISC-007 | Moderation actions | 2 days | - |
| DISC-008 | Appeals workflow | 2 days | - |
| DISC-009 | CDN cache invalidation | 1 day | - |
| DROP-001 | Twitch OAuth linking | 2 days | Sprint 2 |
| DROP-002 | Twitch EventSub webhook handling | 2 days | - |
| DROP-003 | Campaign management UI | 2 days | - |
| DROP-004 | Idempotent drop grant worker | 2 days | - |

#### Definition of Done
- [ ] Discovery (trending/newest/top_rated) works
- [ ] Search returns relevant results
- [ ] Ratings system works
- [ ] Player can report content
- [ ] Moderation queue processes items
- [ ] Appeals workflow works
- [ ] Twitch account linking works
- [ ] Drop entitlements grant idempotently

---

## Part 5: Risk Assessment & Mitigations

### High-Priority Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| UGC moderation bomb | High | High | Phased rollout, strict file limits, CDN, automated scanning first |
| Commerce fraud | High | Medium | Ledger-based currency, idempotency keys, periodic reconciliation |
| Account linking complexity | Medium | High | Strict linking rules, admin merge tools, audit trails |
| Realtime chat policy burden | Medium | Low | Delay until necessary, start with inbox only |
| Platform API changes | Medium | Medium | Abstraction layer, monitoring, fallback mechanisms |

### Mitigation Strategies

**UGC Risk**:
- Default all uploads to private drafts
- Strict file size limits by type
- Mandatory virus/content scanning before publish
- CDN with rate limiting on downloads
- Progressive rollout (invite-only first)

**Commerce Risk**:
- All purchase operations use idempotency keys
- Consumables tracked in immutable ledger
- Daily reconciliation with platform APIs
- Suspicious transaction flagging
- Manual review for high-value orders

**Account Linking Risk**:
- Cannot unlink last remaining login method
- Require re-authentication for unlinking
- Admin-only merge operations with audit trail
- Clear user communication about linking consequences

---

## Part 6: Success Metrics

### Technical KPIs

| Metric | Target | Sprint |
|--------|--------|--------|
| Login success rate | > 99.5% | Sprint 2 |
| Link success rate | > 98% | Sprint 2 |
| Purchase verification latency p95 | < 5s | Sprint 5 |
| Duplicate grant rate | 0% | Sprint 5 |
| UGC publish success rate | > 95% | Sprint 7 |
| Leaderboard submission success rate | > 99% | Sprint 3 |
| Drop claim success rate | > 99% | Sprint 8 |

### Operational KPIs

| Metric | Target | Sprint |
|--------|--------|--------|
| Moderation queue SLA | < 24h | Sprint 8 |
| Refund processing time | < 24h | Sprint 6 |
| API response time p95 | < 300ms | Sprint 2 |
| System availability | 99.9% | Ongoing |

---

## Part 7: Complete Sprint Timeline

| Sprint | Focus | Duration | Key Deliverables | Dependencies |
|--------|-------|----------|------------------|--------------|
| 1 | Infrastructure | 2 weeks | DB, Redis, Storage, Queue, CI/CD | - |
| 2 | Auth + Linking | 2 weeks | Steam/Epic login, JWT, account linking | 1 |
| 3 | Progression + Leaderboards | 2 weeks | Cross-save, seasonal leaderboards | 1, 2 |
| 4 | Messaging | 2 weeks | System inbox, support threads | 1 |
| 5 | Commerce Core | 2 weeks | SKU catalog, receipt verification, entitlements | 1, 2 |
| 6 | Refunds + Clawback | 2 weeks | Refund handling, debt state | 5 |
| 7 | UGC Upload | 2 weeks | Upload pipeline, scanning | 1, 2 |
| 8 | UGC Discovery + Drops | 2 weeks | Search, ratings, moderation, Twitch Drops | 2, 7 |

**Total: 16 weeks to MVP**

---

## Part 8: Research References

### Authentication
- [Steam Web API Documentation](https://partner.steam-api.com/)
- [Epic Online Services Documentation](https://dev.epicgames.com/docs/services)
- [JWT Best Practices for Gaming](https://auth0.com/blog/a-look-at-the-latest-draft-for-jwt-bcp/)

### Commerce
- [ISteamMicroTxn API](https://partner.steam-api.com/ISteamMicroTxn/)
- [EOS Ecom Web API](https://dev.epicgames.com/docs/services/en-US/eos-web-api)
- [Idempotency Patterns](https://stripe.com/blog/idempotency)

### UGC
- [AWS S3 Presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrl.html)
- [ClamAV Integration](https://github.com/DFE-Digital/rsd-clamav-api)
- [Content Moderation Pipeline](https://dev.to/silentwatcher_95/content-moderation-in-nodejs-building-a-scalable-image-moderation-pipeline-with-minio-bullmq-f53)

### Leaderboards
- [Redis Sorted Sets](https://redis.io/docs/data-types/sorted-sets/)
- [Server-Authoritative Leaderboards](https://discussions.unity.com/t/preventing-fake-score-submissions/1528096)

### Twitch Drops
- [Twitch Drops Campaign Guide](https://dev.twitch.tv/docs/drops/campaign-guide)
- [Twitch Drops Technical Guide](https://dev.twitch.tv/docs/drops/technical-guide/)
- [EventSub Webhooks](https://dev.twitch.tv/docs/eventsub/)
- [Webhook Signature Verification](https://dev.twitch.tv/docs/eventsub/handling-webhook-events)

---

## Appendices

### A. Sample API Endpoints

#### Authentication
```
POST /api/v1/auth/steam/login
POST /api/v1/auth/epic/login
POST /api/v1/auth/refresh
POST /api/v1/auth/revoke
POST /api/v1/auth/link
DELETE /api/v1/auth/link/{provider}
```

#### Player
```
GET /api/v1/player/profile
PUT /api/v1/player/profile
GET /api/v1/player/progression
PUT /api/v1/player/progression
GET /api/v1/player/entitlements
GET /api/v1/player/linked-accounts
```

#### Leaderboards
```
GET /api/v1/leaderboards/{seasonId}/top
GET /api/v1/leaderboards/{seasonId}/rank/{playerId}
POST /api/v1/leaderboards/{seasonId}/submit
GET /api/v1/leaderboards/seasons
```

#### Commerce
```
GET /api/v1/commerce/skus
GET /api/v1/commerce/skus/{skuId}
POST /api/v1/commerce/verify-receipt
GET /api/v1/commerce/orders
GET /api/v1/commerce/orders/{orderId}
```

#### UGC
```
POST /api/v1/ugc/upload-url
POST /api/v1/ugc/{ugcId}/publish
GET /api/v1/ugc/{ugcId}
GET /api/v1/ugc/discover
GET /api/v1/ugc/search
POST /api/v1/ugc/{ugcId}/rate
POST /api/v1/ugc/{ugcId}/report
```

#### Messages
```
GET /api/v1/messages/inbox
GET /api/v1/messages/{messageId}
PUT /api/v1/messages/{messageId}/read
POST /api/v1/messages/support
```

### B. Database Schema Summary

```
users
├── identities (1:N)
├── profiles (1:1)
├── progressions (1:N)
├── entitlements (1:N)
├── messages (recipient)
├── ugc (creator)
├── reports (reporter)
└── account_links (1:N)

orders
├── entitlements (1:N)
└── ledger_entries (1:N)

ugc
├── reports (1:N)
└── ratings (1:N)

seasons
└── leaderboard_entries (1:N)
```

### C. Redis Key Patterns

```
# Sessions
session:{token} → JWT data (TTL 30min)

# Rate Limiting
ratelimit:{userId}:{action} → Sorted set of timestamps

# Leaderboards
leaderboard:{seasonId} → Sorted set (userId → score)
leaderboard:meta:{seasonId} → Hash of metadata

# Idempotency
idempotency:{key} → Cached response (TTL 24h)

# Refresh Tokens
refresh_rotation:{rotationId} → Hash (user_id, session_id, active)

# UGC Hot Feed
ugc:trending:{type} → List of ugcIds
ugc:newest:{type} → List of ugcIds
```

---

**Document Version**: 1.0  
**Last Updated**: January 29, 2026  
**Status**: Ready for Team Review
