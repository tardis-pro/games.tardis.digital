-- Initialize Player Platform Database
-- Sprint 1: Core schema setup

-- Create custom types
DO $$ BEGIN
  CREATE TYPE provider_type AS ENUM ('STEAM', 'EPIC');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('PLAYER', 'MODERATOR', 'ADMIN');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE audit_action AS ENUM ('CREATE', 'READ', 'UPDATE', 'DELETE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE sku_type AS ENUM ('durable', 'consumable', 'subscription');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE ugc_item_type AS ENUM ('mod', 'image', 'video', 'map', 'text');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE ugc_status AS ENUM ('draft', 'scanning', 'pending_review', 'published', 'flagged', 'removed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE ugc_visibility AS ENUM ('public', 'private', 'friends_only');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Grant permissions
GRANT ALL ON DATABASE player_platform TO playerplatform;
GRANT ALL ON SCHEMA public TO playerplatform;
