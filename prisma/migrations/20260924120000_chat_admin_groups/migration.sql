-- Add ADMIN conversation type for admin ↔ employee threads
ALTER TYPE "ConversationType" ADD VALUE IF NOT EXISTS 'ADMIN';
