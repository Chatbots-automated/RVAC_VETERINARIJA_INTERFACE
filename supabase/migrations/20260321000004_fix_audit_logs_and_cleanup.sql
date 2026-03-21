-- =====================================================================
-- Fix Audit Logs and Cleanup Old Data
-- =====================================================================
-- Migration: 20260321000004
-- Created: 2026-03-21
--
-- OVERVIEW:
-- 1. Make user_audit_logs.farm_id nullable for warehouse actions
-- 2. Truncate old batches to start fresh with warehouse system
-- =====================================================================

-- =====================================================================
-- 1. UPDATE USER_AUDIT_LOGS TABLE
-- =====================================================================
-- Allow farm_id to be NULL for warehouse-level actions

ALTER TABLE public.user_audit_logs 
ALTER COLUMN farm_id DROP NOT NULL;

COMMENT ON COLUMN public.user_audit_logs.farm_id IS 'Farm ID for farm-specific actions, or NULL for warehouse-level actions';

-- =====================================================================
-- 2. CLEANUP OLD DATA
-- =====================================================================
-- Truncate old batches so farms start fresh with warehouse allocations
-- WARNING: This will delete all existing farm inventory!

TRUNCATE TABLE public.batches CASCADE;

COMMENT ON TABLE public.batches IS 'Farm-level inventory batches (populated via warehouse allocation or direct farm receipt)';
