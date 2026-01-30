# Player Platform Suite - Dependency Analysis & Sprint Plan

## Module Dependency Map

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FOUNDATION LAYER                                   │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  A) Player Accounts & Authentication (MUST HAVE - Block everything)    │  │
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
         │ H) Feedback                   │
         │ - Bug reports                 │
         │ - NPS/ratings                 │
         │ - Match reports               │
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

## Critical Path Analysis

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

## Must-Haves vs Good-to-Haves

### MUST-HAVE (MVP Definition of Done)
| Module | Requirements | Priority |
|--------|--------------|----------|
| A1-A3 | Steam/Epic login + JWT + session mgmt | P0 - Blocker |
| A4 | Audit logging | P0 - Security |
| B1 | Basic account linking | P0 - UX |
| C1-C2 | Progression snapshot + storage | P0 - Core |
| D1-D3 | Leaderboards + seasons + validation | P1 - Core |
| E1 | System inbox messages | P1 - Notifications |
| F1-F4 | SKU catalog + verification + entitlements | P0 - Revenue |
| F5 | Refund/clawback | P0 - Fraud prevention |
| G1-G4 | Upload + metadata + scanning + moderation | P1 - Community |
| G5-G6 | Discovery + ratings | P2 - Growth |
| H1-H2 | Bug reports + feature requests | P2 - Feedback |
| I1-I3 | Twitch linking + basic drops | P2 - Engagement |
| Admin | User lookup + audit logs + basic moderation | P0 - Operations |
| Player | View/manage linked accounts | P0 - UX |

### GOOD-TO-HAVE (Post-MVP)
| Module | Requirements | Reason |
|--------|--------------|--------|
| A2 | Email login (OTP/magic link) | Recovery only |
| B2-B3 | Unlink rules + merge conflicts | Advanced linking |
| C3-C4 | Conflict resolution + anti-cheat | Advanced |
| D2 | Regional leaderboards | Geography |
| E2 | Player-to-player messaging | Community |
| E3 | Realtime chat | Future expansion |
| G7 | DMCA takedowns | Legal compliance |
| H3 | Spam controls | Quality |
| I4-I5 | Advanced drop triggers | Engagement |
| Admin | Full commerce console | Operations efficiency |
| Player | Privacy settings | GDPR compliance |

## Risk Assessment Matrix

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| UGC moderation bomb | High | High | Phased rollout, strict limits, CDN |
| Commerce fraud | High | Medium | Ledger-based currency, idempotency |
| Account linking complexity | Medium | High | Strict rules + admin tools |
| Realtime chat policy burden | Medium | Low | Delay until necessary |
| Platform API changes | Medium | Medium | Abstraction layer, monitoring |
