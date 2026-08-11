-- Migration to add execution columns to alert_investigations table
ALTER TABLE alert_investigations 
ADD COLUMN IF NOT EXISTS execution_results JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS executed_by TEXT DEFAULT NULL;
