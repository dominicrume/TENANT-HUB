-- Migration: 024_worker_dlq_backoff.sql
-- FEATURE: Dead Letter Queue and Exponential Backoff for blockchain stamping

ALTER TABLE public.stamp_queue
ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ DEFAULT NULL;
