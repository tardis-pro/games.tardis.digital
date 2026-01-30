// ============================================================================
// User Types
// ============================================================================

export enum Provider {
  STEAM = 'STEAM',
  EPIC = 'EPIC',
}

export enum UserRole {
  PLAYER = 'PLAYER',
  MODERATOR = 'MODERATOR',
  ADMIN = 'ADMIN',
}

export interface User {
  id: string;
  canonicalId: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  roles: UserRole[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Identity {
  id: string;
  userId: string;
  provider: Provider;
  providerId: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Authentication Types
// ============================================================================

export interface TokenPayload {
  sub: string; // canonical user ID
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  providers: Provider[];
  roles: UserRole[];
}

export interface AccessToken extends TokenPayload {
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
  tokenId: string;
  providers: Provider[];
  roles: UserRole[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

// ============================================================================
// Progression Types
// ============================================================================

export interface PlayerProgression {
  id: string;
  userId: string;
  version: number;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  level: number;
  xp: number;
  achievements: string[];
  currency: Record<string, number>;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Leaderboard Types
// ============================================================================

export interface LeaderboardSeason {
  id: string;
  name: string;
  description?: string;
  type: 'global' | 'regional' | 'friends';
  isActive: boolean;
  startsAt: Date;
  endsAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface LeaderboardEntry {
  id: string;
  seasonId: string;
  userId: string;
  score: bigint;
  rank?: number;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface LeaderboardRank {
  rank: number;
  userId: string;
  score: number;
  displayName?: string;
  avatarUrl?: string;
}

// ============================================================================
// Messaging Types
// ============================================================================

export enum MessageType {
  PURCHASE_GRANTED = 'purchase_granted',
  PURCHASE_REFUNDED = 'purchase_refunded',
  DROP_CLAIMED = 'drop_claimed',
  MODERATION_DECISION = 'moderation_decision',
  CAMPAIGN_ANNOUNCEMENT = 'campaign_announcement',
  SUPPORT_THREAD_CREATED = 'support_thread_created',
  SUPPORT_REPLY = 'support_reply',
  GENERIC = 'generic',
}

export interface Message {
  id: string;
  recipientId: string;
  senderId?: string;
  type: MessageType;
  subject?: string;
  body: string;
  metadata?: Record<string, unknown>;
  isRead: boolean;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SupportThread {
  id: string;
  userId: string;
  subject: string;
  status: 'open' | 'pending' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
}

export interface SupportMessage {
  id: string;
  threadId: string;
  senderId: string;
  senderType: 'player' | 'support' | 'admin';
  body: string;
  attachments?: Record<string, unknown>[];
  createdAt: Date;
}

// ============================================================================
// Commerce Types
// ============================================================================

export enum SKUType {
  DURABLE = 'durable',
  CONSUMABLE = 'consumable',
  SUBSCRIPTION = 'subscription',
}

export interface SKU {
  id: string;
  name: string;
  description?: string;
  type: SKUType;
  category: string;
  price: number;
  currency: string;
  metadata?: Record<string, unknown>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Order {
  id: string;
  userId: string;
  provider: Provider;
  providerOrderId: string;
  status: 'pending' | 'verified' | 'failed' | 'refunded';
  totalAmount: number;
  currency: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
  verifiedAt?: Date;
  refundedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Entitlement {
  id: string;
  userId: string;
  skuId: string;
  orderId?: string;
  status: 'active' | 'revoked' | 'expired';
  grantedAt: Date;
  revokedAt?: Date;
  revocationReason?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// UGC Types
// ============================================================================

export enum UGCType {
  MOD = 'mod',
  IMAGE = 'image',
  VIDEO = 'video',
  MAP = 'map',
  TEXT = 'text',
}

export enum UGCStatus {
  DRAFT = 'draft',
  SCANNING = 'scanning',
  PENDING_REVIEW = 'pending_review',
  PUBLISHED = 'published',
  FLAGGED = 'flagged',
  REMOVED = 'removed',
}

export enum UGCVisibility {
  PUBLIC = 'public',
  PRIVATE = 'private',
  FRIENDS_ONLY = 'friends_only',
}

export interface UGCItem {
  id: string;
  creatorId: string;
  type: UGCType;
  name: string;
  description?: string;
  tags: string[];
  status: UGCStatus;
  visibility: UGCVisibility;
  storagePath: string;
  checksum: string;
  fileSize: bigint;
  contentType: string;
  metadata?: Record<string, unknown>;
  downloadCount: number;
  ratingSum: number;
  ratingCount: number;
  flaggedReason?: string;
  moderationNotes?: string;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UGCItemRating {
  id: string;
  ugcId: string;
  userId: string;
  rating: number;
  createdAt: Date;
}

export interface UGCReport {
  id: string;
  ugcId: string;
  reporterId: string;
  reason: string;
  description?: string;
  status: 'pending' | 'reviewed' | 'dismissed' | 'upheld';
  createdAt: Date;
  reviewedAt?: Date;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiSuccess<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

// ============================================================================
// Event Types
// ============================================================================

export interface BaseEvent {
  eventId: string;
  eventType: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface UserEvent extends BaseEvent {
  eventType: 'user.login' | 'user.logout' | 'user.created' | 'user.updated';
  userId: string;
}

export interface PurchaseEvent extends BaseEvent {
  eventType: 'purchase.completed' | 'purchase.refunded';
  userId: string;
  orderId: string;
  amount: number;
  currency: string;
}

export interface ProgressionEvent extends BaseEvent {
  eventType: 'progression.saved' | 'progression.loaded';
  userId: string;
  version: number;
}
