-- Kaizen OS Database Schema V4
-- PostgreSQL schema for local development

-- Create enums for status and unit_type
CREATE TYPE task_status AS ENUM ('in_progress', 'not_started', 'completed', 'backlog');

-- V4 unit types: themes, 4 action types, tasks, vetoes
-- Note: CRITERIA removed - criteria are now stored as TEXT[] on action cards
CREATE TYPE unit_type AS ENUM (
    'THEME',
    'ACTION_GATE',
    'ACTION_EXPERIMENT',
    'ACTION_ROUTINE',
    'ACTION_OPS',
    'TASK',
    'VETO'
);

-- V4 event types: focused on gates, experiments, criteria, routines, ops, time tracking
CREATE TYPE event_type AS ENUM (
    'gate_started',
    'gate_completed',
    'gate_failed',
    'experiment_started',
    'experiment_completed',
    'experiment_failed',
    'experiment_pivoted',
    'criteria_graded',
    'routine_started',
    'routine_replaced',
    'ops_started',
    'ops_completed',
    'veto_added',
    'veto_violated',
    'time_logged',
    'week_planned',
    'season_started',
    'season_ended'
);

-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255),
    timezone VARCHAR(50) DEFAULT 'America/Los_Angeles',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seasons table (unchanged)
CREATE TABLE seasons (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Season identification
    name VARCHAR(100) NOT NULL,

    -- Time boundaries
    start_date DATE NOT NULL,
    duration_weeks INTEGER NOT NULL,

    -- Capacity planning
    utility_rate DECIMAL(5,2) NOT NULL DEFAULT 40.0,

    -- Theme allocations as JSON: { "themeId": allocation (0-1) }
    theme_allocations JSONB NOT NULL DEFAULT '{}',

    -- Status
    is_active BOOLEAN DEFAULT false,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- Cards table
-- Unified storage for themes, gates, experiments, routines, ops, tasks, vetoes
CREATE TABLE cards (
    id SERIAL PRIMARY KEY,

    -- Multi-tenant support
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Hierarchy (adjacency list)
    -- THEME: parent_id = null
    -- ACTION_*: parent_id = theme_id
    -- TASK: parent_id = any ACTION_* id
    -- VETO: parent_id = null
    parent_id INTEGER REFERENCES cards(id) ON DELETE SET NULL,

    -- Basic card information
    title VARCHAR(255) NOT NULL,
    description TEXT,

    -- Date tracking
    target_date DATE,           -- Due date for gates, eval date for experiments
    completion_date DATE,
    start_date DATE,

    -- Status tracking
    status task_status NOT NULL DEFAULT 'not_started',

    -- Unit type classification
    unit_type unit_type NOT NULL,

    -- Season scheduling
    season_id INTEGER REFERENCES seasons(id) ON DELETE SET NULL,

    -- V4 new fields
    lag_weeks INTEGER,          -- For experiments: evaluation delay (e.g., 6 weeks)
    criteria TEXT[],            -- Success criteria as text array (for gates/experiments)

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Events table - immutable event log (append-only)
-- Also used for time tracking via 'time_logged' event type
CREATE TABLE events (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- What happened
    event_type event_type NOT NULL,

    -- Context: which card this relates to
    card_id INTEGER REFERENCES cards(id) ON DELETE SET NULL,

    -- Event payload (flexible JSON for different event types)
    -- For time_logged: {"hours": 1.5, "source": "manual"}
    -- For week_planned: {"planned_hours": 10, "week_start": "2025-01-06"}
    payload JSONB NOT NULL DEFAULT '{}',

    -- Immutable timestamp
    occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- For idempotency (prevent duplicate events)
    idempotency_key VARCHAR(255)
);

-- Indexes for cards
CREATE INDEX idx_cards_user_type ON cards(user_id, unit_type);
CREATE INDEX idx_cards_user_parent ON cards(user_id, parent_id);
CREATE INDEX idx_cards_user_status ON cards(user_id, status);
CREATE INDEX idx_cards_season ON cards(season_id);
CREATE INDEX idx_cards_target_date ON cards(target_date);

-- Indexes for seasons
CREATE INDEX idx_seasons_user ON seasons(user_id);
CREATE INDEX idx_seasons_user_active ON seasons(user_id) WHERE is_active = true;

-- Indexes for events
CREATE INDEX idx_events_user_type ON events(user_id, event_type);
CREATE INDEX idx_events_user_card ON events(user_id, card_id);
CREATE INDEX idx_events_user_time ON events(user_id, occurred_at DESC);
CREATE UNIQUE INDEX idx_events_idempotency ON events(user_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- Insert a default user for development
INSERT INTO users (email, name) VALUES ('dev@kaizen.local', 'Developer');


-- ============================================
-- Calendar Integration Tables (Phase 1)
-- ============================================

-- Calendar accounts: OAuth connections to Google/Microsoft/etc
CREATE TABLE calendar_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL DEFAULT 'google',
    email VARCHAR(255) NOT NULL,
    access_token_encrypted TEXT NOT NULL,
    refresh_token_encrypted TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    scopes JSONB DEFAULT '[]'::jsonb,
    selected_calendar_ids JSONB DEFAULT '["primary"]'::jsonb,
    write_calendar_id VARCHAR(255) DEFAULT 'primary',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, provider, email)
);

CREATE INDEX idx_calendar_accounts_user ON calendar_accounts(user_id);

-- Calendar event annotations: durable event→card linking
CREATE TABLE calendar_event_annotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES calendar_accounts(id) ON DELETE CASCADE,
    calendar_id VARCHAR(255) NOT NULL,
    event_id VARCHAR(255) NOT NULL,
    instance_key VARCHAR(255) NOT NULL,
    card_id INTEGER REFERENCES cards(id) ON DELETE SET NULL,
    source VARCHAR(20) NOT NULL DEFAULT 'manual',
    confidence FLOAT DEFAULT 1.0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, account_id, calendar_id, event_id, instance_key)
);

CREATE INDEX idx_annotations_user ON calendar_event_annotations(user_id);
CREATE INDEX idx_annotations_card ON calendar_event_annotations(card_id);
CREATE INDEX idx_annotations_event ON calendar_event_annotations(account_id, calendar_id, event_id);

-- Event classification rules: auto-classify events to cards
CREATE TABLE event_classification_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    match_type VARCHAR(30) NOT NULL,
    match_value TEXT NOT NULL,
    card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    priority INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, match_type, match_value)
);

CREATE INDEX idx_rules_user_active ON event_classification_rules(user_id, is_active);

-- Routine calendar links: link routine cards to recurring GCal events
CREATE TABLE routine_calendar_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES calendar_accounts(id) ON DELETE CASCADE,
    calendar_id VARCHAR(255) NOT NULL,
    recurring_event_id VARCHAR(255) NOT NULL,
    ical_uid VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, card_id),
    UNIQUE(account_id, calendar_id, recurring_event_id)
);

CREATE INDEX idx_routine_links_user ON routine_calendar_links(user_id);
CREATE INDEX idx_routine_links_event ON routine_calendar_links(account_id, recurring_event_id);
