-- Kaizen OS V5 Database Schema (Greenfield Design)
-- Principles: 4NF Normalization, Event Sourcing, Multi-Tenancy (UUID)

-- ============================================================
-- 1. EXTENSIONS & DOMAINS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 2. ENUMS
-- ============================================================
CREATE TYPE unit_type AS ENUM ('theme', 'goal', 'gate', 'experiment', 'routine', 'ops', 'task');
CREATE TYPE action_status AS ENUM ('backlog', 'active', 'completed', 'failed', 'paused');
CREATE TYPE goal_status AS ENUM ('active', 'achieved', 'abandoned', 'paused');
CREATE TYPE event_type_enum AS ENUM (
    'goal_created', 'goal_achieved', 'goal_abandoned',
    'action_created', 'action_started', 'action_completed', 'action_failed', 'action_paused',
    'criteria_graded', 'experiment_pivoted',
    'routine_replaced',
    'veto_violated',
    'time_logged', 'week_planned',
    'season_started', 'season_ended',
    'weekly_review_completed', 'calendar_synced'
);

-- ============================================================
-- 3. USERS (Multi-Tenant Root)
-- ============================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255),
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. THEMES (The "Why" / Direction)
-- ============================================================
CREATE TABLE themes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(7),
    sort_order SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, name)
);
CREATE INDEX idx_themes_user ON themes(user_id);

-- ============================================================
-- 5. GOALS (The "What" - NEW)
-- ============================================================
-- Decision: Goals are multi-season (long-term).
-- Decision: Max 3 active goals per theme enforced by app logic/trigger.
CREATE TABLE goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    theme_id UUID NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
    
    title VARCHAR(255) NOT NULL,
    description TEXT,
    target_date DATE,
    
    status goal_status NOT NULL DEFAULT 'active',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_goals_user_theme ON goals(user_id, theme_id);
CREATE INDEX idx_goals_status ON goals(user_id, status);

-- ============================================================
-- 6. SEASONS (Time Windows)
-- ============================================================
CREATE TABLE seasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    duration_weeks SMALLINT NOT NULL,
    utility_rate DECIMAL(5,2) NOT NULL DEFAULT 40.0,
    
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_seasons_active_user ON seasons(user_id) WHERE is_active = TRUE;

-- Junction table for Season-Theme budgeting
CREATE TABLE season_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    theme_id UUID NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
    allocation DECIMAL(4,3) NOT NULL CHECK (allocation >= 0 AND allocation <= 1),
    UNIQUE(season_id, theme_id)
);

-- ============================================================
-- 7. ACTIONS (The "How": Gate, Exp, Routine, Ops)
-- ============================================================
-- Normalized into separate tables per type? No, standard Single Table is usually fine for these 4 sharing 90% fields.
-- BUT to satisfy "Strict Schema" request, we'll keep one table with explicit types.
CREATE TABLE actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    season_id UUID REFERENCES seasons(id) ON DELETE SET NULL, -- Nullable: Routine/Ops might cross seasons
    
    unit_type unit_type NOT NULL CHECK (unit_type IN ('gate', 'experiment', 'routine', 'ops')),
    
    title VARCHAR(255) NOT NULL,
    description TEXT,
    criteria TEXT[], 
    
    -- Scheduling
    target_date DATE,
    lag_weeks SMALLINT,        -- Experiment only
    recurrence_rule TEXT,      -- Routine only (RRULE string)
    
    -- Calendar
    keywords TEXT[],
    default_duration_minutes SMALLINT DEFAULT 60,
    
    status action_status NOT NULL DEFAULT 'backlog',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_actions_user_goal ON actions(user_id, goal_id);
CREATE INDEX idx_actions_season ON actions(season_id);
CREATE INDEX idx_actions_type_status ON actions(user_id, unit_type, status);

-- ============================================================
-- 8. TASKS (Granular steps)
-- ============================================================
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_id UUID NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
    
    title VARCHAR(255) NOT NULL,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order SMALLINT NOT NULL DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_tasks_action ON tasks(action_id);

-- ============================================================
-- 9. VETOES (Global Constraints)
-- ============================================================
CREATE TABLE vetoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    statement TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 10. EVENTS (Partitioned Log)
-- ============================================================
CREATE TABLE events (
    id BIGSERIAL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    event_type event_type_enum NOT NULL,
    
    -- References
    goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,
    action_id UUID REFERENCES actions(id) ON DELETE SET NULL,
    season_id UUID REFERENCES seasons(id) ON DELETE SET NULL,
    
    payload JSONB NOT NULL DEFAULT '{}',
    
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    idempotency_key VARCHAR(255),
    
    -- Range partitioning on occurred_at
    PRIMARY KEY (occurred_at, id)
) PARTITION BY RANGE (occurred_at);

-- Initial partitions
CREATE TABLE events_2025_01 PARTITION OF events FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE events_2025_02 PARTITION OF events FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE events_default PARTITION OF events DEFAULT;

CREATE INDEX idx_events_user_type ON events(user_id, event_type);
CREATE INDEX idx_events_payload_gin ON events USING GIN (payload); -- Generic JSONB support

-- ============================================================
-- 11. CALENDAR LINKS (Junction)
-- ============================================================
CREATE TABLE calendar_event_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Google Side
    google_calendar_id VARCHAR(255) NOT NULL,
    google_event_id VARCHAR(255) NOT NULL,
    
    -- Kaizen Side
    action_id UUID REFERENCES actions(id) ON DELETE SET NULL,
    
    -- Cache
    event_title VARCHAR(255),
    event_start TIMESTAMPTZ,
    event_end TIMESTAMPTZ,
    
    is_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    time_logged_event_id BIGINT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, google_calendar_id, google_event_id)
);
CREATE INDEX idx_calevent_google_id ON calendar_event_links(google_event_id);
