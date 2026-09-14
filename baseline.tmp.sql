-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'LOCKED');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'TERMINATED');

-- CreateEnum
CREATE TYPE "TokenType" AS ENUM ('REFRESH');

-- CreateEnum
CREATE TYPE "AttendanceCorrectnessStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('OPEN', 'PRESENT_ON_TIME', 'PRESENT_LATE', 'COMPLETED_ON_TIME', 'COMPLETED_LATE', 'MISSING_CHECKOUT');

-- CreateEnum
CREATE TYPE "AttendanceLocationType" AS ENUM ('CHECK_IN', 'CHECK_OUT');

-- CreateEnum
CREATE TYPE "WorksheetStatus" AS ENUM ('SUBMITTED', 'REVIEWED');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LeaveDecisionType" AS ENUM ('APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ACCOUNT_CREATED', 'PASSWORD_CHANGED', 'CHECK_IN_SUCCESS', 'CHECK_IN_LATE', 'CHECK_OUT_SUCCESS', 'CHECKOUT_REMINDER', 'MISSING_CHECKOUT', 'LEAVE_SUBMITTED', 'LEAVE_APPROVED', 'LEAVE_REJECTED', 'ATTENDANCE_CORRECTED', 'ATTENDANCE_CORRECTNESS_SUBMITTED', 'ATTENDANCE_CORRECTNESS_APPROVED', 'ATTENDANCE_CORRECTNESS_REJECTED', 'WORKSHEET_REVIEWED', 'EVALUATION_OPENED', 'EVALUATION_SELF_SUBMITTED', 'EVALUATION_SCORED', 'EVALUATION_FINALIZED', 'MEETING_BOOKED', 'MEETING_RESCHEDULED', 'MEETING_CANCELLED', 'CHAT_MESSAGE');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('ANDROID', 'IOS', 'WEB');

-- CreateEnum
CREATE TYPE "InviteType" AS ENUM ('ORG_ADMIN', 'OFFICE_ADMIN', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EvaluationCycleStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "EvaluationStatus" AS ENUM ('OPEN', 'SELF_DRAFT', 'SELF_SUBMITTED', 'EVALUATOR_DRAFT', 'EVALUATOR_SUBMITTED', 'FINALIZED');

-- CreateEnum
CREATE TYPE "EvaluationItemSection" AS ENUM ('METRIC', 'RESPONSIBILITY', 'SKILL_IMPROVED', 'GOAL');

-- CreateEnum
CREATE TYPE "EvaluationScoringSource" AS ENUM ('HUMAN', 'SYSTEM_ATTENDANCE');

-- CreateEnum
CREATE TYPE "MeetingBookingStatus" AS ENUM ('BOOKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DisplayBoardMode" AS ENUM ('ROOMS', 'PEOPLE', 'BOTH');

-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('DIRECT', 'GROUP');

-- CreateEnum
CREATE TYPE "ChatMemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "ChatMessageType" AS ENUM ('TEXT', 'IMAGE', 'FILE', 'LINK');

-- CreateEnum
CREATE TYPE "VaultCredentialType" AS ENUM ('EMAIL', 'PASSWORD', 'WIFI', 'BANK', 'SOFTWARE', 'API_KEY', 'OTHER');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SubscriptionBillingCycle" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "TtPermissionRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'LEAD', 'SENIOR_STAFF', 'JUNIOR_STAFF');

-- CreateEnum
CREATE TYPE "TtTaskStatus" AS ENUM ('TO_DO', 'IN_PROGRESS', 'DONE');

-- CreateEnum
CREATE TYPE "TtNotificationType" AS ENUM ('TASK_ASSIGNED', 'PROJECT_ASSIGNED', 'SCHEDULE_INVITED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "attendance_photo_required" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_memberships" (
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("user_id","organization_id")
);

-- CreateTable
CREATE TABLE "admin_offices" (
    "user_id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_offices_pkey" PRIMARY KEY ("user_id","office_id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "offices" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "allowed_radius_meters" INTEGER NOT NULL,
    "maximum_accuracy_meters" INTEGER NOT NULL DEFAULT 100,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Addis_Ababa',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "offices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_schedules" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "check_in_time" TEXT NOT NULL,
    "check_out_time" TEXT NOT NULL,
    "late_grace_minutes" INTEGER NOT NULL DEFAULT 0,
    "working_days" INTEGER[],
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Addis_Ababa',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "work_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_schedule_days" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "check_in_time" TEXT NOT NULL,
    "check_out_time" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "work_schedule_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "employee_code" TEXT NOT NULL,
    "office_id" UUID,
    "schedule_id" UUID,
    "department_id" UUID,
    "evaluation_template_id" UUID,
    "first_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "last_name" TEXT NOT NULL,
    "phone" TEXT,
    "job_title" TEXT,
    "employment_start_date" DATE NOT NULL,
    "supervisor_id" UUID,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invites" (
    "id" UUID NOT NULL,
    "type" "InviteType" NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "email" TEXT NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID,
    "office_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "office_id" UUID,
    "schedule_id" UUID,
    "payload" JSONB,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "invited_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "device_id" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "replaced_by_token_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "old_values" JSONB,
    "new_values" JSONB,
    "reason" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheets" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "scheduled_check_in" TIMESTAMPTZ(6) NOT NULL,
    "scheduled_check_out" TIMESTAMPTZ(6) NOT NULL,
    "actual_check_in" TIMESTAMPTZ(6) NOT NULL,
    "actual_check_out" TIMESTAMPTZ(6),
    "late_minutes" INTEGER NOT NULL DEFAULT 0,
    "early_checkout_minutes" INTEGER NOT NULL DEFAULT 0,
    "worked_minutes" INTEGER NOT NULL DEFAULT 0,
    "overtime_minutes" INTEGER NOT NULL DEFAULT 0,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'OPEN',
    "is_open" BOOLEAN NOT NULL DEFAULT true,
    "is_late" BOOLEAN NOT NULL DEFAULT false,
    "is_early_checkout" BOOLEAN NOT NULL DEFAULT false,
    "is_missing_checkout" BOOLEAN NOT NULL DEFAULT false,
    "check_in_idempotency_key" TEXT NOT NULL,
    "check_out_idempotency_key" TEXT,
    "schedule_check_in_time" TEXT NOT NULL,
    "schedule_check_out_time" TEXT NOT NULL,
    "schedule_late_grace_minutes" INTEGER NOT NULL,
    "office_latitude" DECIMAL(10,7) NOT NULL,
    "office_longitude" DECIMAL(10,7) NOT NULL,
    "office_allowed_radius_meters" INTEGER NOT NULL,
    "office_maximum_accuracy_meters" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "timesheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_locations" (
    "id" UUID NOT NULL,
    "timesheet_id" UUID NOT NULL,
    "type" "AttendanceLocationType" NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "accuracy_meters" DECIMAL(8,2) NOT NULL,
    "distance_from_office_meters" DECIMAL(10,2) NOT NULL,
    "allowed_radius_meters" INTEGER NOT NULL,
    "is_inside_radius" BOOLEAN NOT NULL,
    "captured_at" TIMESTAMPTZ(6) NOT NULL,
    "server_received_at" TIMESTAMPTZ(6) NOT NULL,
    "photo_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "late_reasons" (
    "id" UUID NOT NULL,
    "timesheet_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "reason_type" TEXT NOT NULL,
    "reason_description" TEXT,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "late_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worksheets" (
    "id" UUID NOT NULL,
    "timesheet_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "work_description" TEXT NOT NULL,
    "status" "WorksheetStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submitted_at" TIMESTAMPTZ(6) NOT NULL,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "admin_comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "worksheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_corrections" (
    "id" UUID NOT NULL,
    "timesheet_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "previous_values" JSONB NOT NULL,
    "corrected_values" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_correctness_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "timesheet_id" UUID,
    "status" "AttendanceCorrectnessStatus" NOT NULL DEFAULT 'PENDING',
    "employee_note" TEXT,
    "admin_note" TEXT,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attendance_correctness_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_types" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "leave_type_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "number_of_days" DECIMAL(6,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_decisions" (
    "id" UUID NOT NULL,
    "leave_request_id" UUID NOT NULL,
    "admin_user_id" UUID NOT NULL,
    "decision" "LeaveDecisionType" NOT NULL,
    "decision_reason" TEXT,
    "decided_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "related_entity_type" TEXT,
    "related_entity_id" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_devices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_id" TEXT NOT NULL,
    "fcm_token" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "app_version" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "job_title_hint" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "evaluation_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_template_items" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "section" "EvaluationItemSection" NOT NULL,
    "item_key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "prompt" TEXT,
    "scoring_source" "EvaluationScoringSource" NOT NULL DEFAULT 'HUMAN',
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_cycles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "number_prefix" TEXT,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "self_due_at" TIMESTAMPTZ(6),
    "evaluator_due_at" TIMESTAMPTZ(6),
    "status" "EvaluationCycleStatus" NOT NULL DEFAULT 'DRAFT',
    "opened_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "evaluation_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "template_id" UUID,
    "number" TEXT NOT NULL,
    "status" "EvaluationStatus" NOT NULL DEFAULT 'OPEN',
    "template_snapshot" JSONB NOT NULL,
    "period_snapshot" JSONB NOT NULL,
    "focus_competency" TEXT,
    "action_plan" TEXT,
    "overall_self" DECIMAL(4,2),
    "overall_evaluator" DECIMAL(4,2),
    "self_submitted_at" TIMESTAMPTZ(6),
    "evaluator_user_id" UUID,
    "evaluator_submitted_at" TIMESTAMPTZ(6),
    "finalized_at" TIMESTAMPTZ(6),
    "finalized_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_scores" (
    "id" UUID NOT NULL,
    "evaluation_id" UUID NOT NULL,
    "item_key" TEXT NOT NULL,
    "section" "EvaluationItemSection" NOT NULL,
    "label" TEXT NOT NULL,
    "prompt" TEXT,
    "scoring_source" "EvaluationScoringSource" NOT NULL DEFAULT 'HUMAN',
    "sort_order" INTEGER NOT NULL,
    "self_score" INTEGER,
    "evaluator_score" INTEGER,
    "system_score" INTEGER,
    "evaluator_comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "evaluation_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_goals" (
    "id" UUID NOT NULL,
    "evaluation_id" UUID NOT NULL,
    "skill" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "previous_self_score" INTEGER,
    "previous_evaluator_score" INTEGER,
    "improvement_self_score" INTEGER,
    "improvement_evaluator_score" INTEGER,
    "target_date" DATE,
    "criteria" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "evaluation_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_rooms" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "meeting_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_bookings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "booked_by_user_id" UUID NOT NULL,
    "organizer_employee_id" UUID,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "MeetingBookingStatus" NOT NULL DEFAULT 'BOOKED',
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_by_user_id" UUID,
    "rescheduled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "meeting_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "display_devices" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "board_mode" "DisplayBoardMode" NOT NULL DEFAULT 'BOTH',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "pairing_code_hash" TEXT,
    "pairing_expires_at" TIMESTAMPTZ(6),
    "refresh_token_hash" TEXT,
    "last_seen_at" TIMESTAMPTZ(6),
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "display_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_conversations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "type" "ConversationType" NOT NULL,
    "name" TEXT,
    "direct_key" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_participants" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "ChatMemberRole" NOT NULL DEFAULT 'MEMBER',
    "last_read_at" TIMESTAMPTZ(6),
    "muted_until" TIMESTAMPTZ(6),
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(6),

    CONSTRAINT "chat_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "type" "ChatMessageType" NOT NULL DEFAULT 'TEXT',
    "body" TEXT,
    "attachment_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vault_credentials" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "office_id" UUID,
    "title" TEXT NOT NULL,
    "type" "VaultCredentialType" NOT NULL,
    "username" TEXT,
    "email" TEXT,
    "url" TEXT,
    "notes" TEXT,
    "secret_encrypted" TEXT NOT NULL,
    "last_revealed_at" TIMESTAMPTZ(6),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "vault_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "office_subscriptions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "office_id" UUID,
    "name" TEXT NOT NULL,
    "vendor" TEXT,
    "category" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "billing_cycle" "SubscriptionBillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "seats" INTEGER NOT NULL DEFAULT 1,
    "unit_amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ETB',
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "renewal_day" INTEGER,
    "notes" TEXT,
    "login_credential_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "office_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_periods" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "year_month" TEXT NOT NULL,
    "seats" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paid_at" TIMESTAMPTZ(6),
    "notes" TEXT,

    CONSTRAINT "subscription_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tt_workspaces" (
    "id" TEXT NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Task Operations',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "enabled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tt_workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tt_workspace_events" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resource_id" TEXT,
    "payload" JSONB NOT NULL,
    "actor_user_id" UUID,
    "actor_client_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tt_workspace_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tt_staff_members" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "employee_id" UUID,
    "display_name" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL DEFAULT '',
    "job_title" TEXT NOT NULL DEFAULT '',
    "permission_role" "TtPermissionRole" NOT NULL DEFAULT 'JUNIOR_STAFF',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tt_staff_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tt_projects" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "leader_id" TEXT,

    CONSTRAINT "tt_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tt_project_members" (
    "project_id" TEXT NOT NULL,
    "staff_member_id" TEXT NOT NULL,

    CONSTRAINT "tt_project_members_pkey" PRIMARY KEY ("project_id","staff_member_id")
);

-- CreateTable
CREATE TABLE "tt_org_teams" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tt_org_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tt_org_team_members" (
    "org_team_id" TEXT NOT NULL,
    "staff_member_id" TEXT NOT NULL,

    CONSTRAINT "tt_org_team_members_pkey" PRIMARY KEY ("org_team_id","staff_member_id")
);

-- CreateTable
CREATE TABLE "tt_tasks" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "priority" TEXT NOT NULL,
    "due" TEXT NOT NULL DEFAULT '',
    "status" "TtTaskStatus" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tt_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tt_task_owners" (
    "task_id" TEXT NOT NULL,
    "staff_member_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tt_task_owners_pkey" PRIMARY KEY ("task_id","staff_member_id")
);

-- CreateTable
CREATE TABLE "tt_task_updates" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "staff_member_id" TEXT,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tt_task_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tt_deleted_tasks" (
    "trash_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "previous_status" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(6) NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "tt_deleted_tasks_pkey" PRIMARY KEY ("trash_id")
);

-- CreateTable
CREATE TABLE "tt_archived_tasks" (
    "archived_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "archived_at" TIMESTAMPTZ(6) NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "tt_archived_tasks_pkey" PRIMARY KEY ("archived_id")
);

-- CreateTable
CREATE TABLE "tt_schedule_events" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" TEXT,
    "title" TEXT NOT NULL,
    "start" TIMESTAMPTZ(6) NOT NULL,
    "end" TIMESTAMPTZ(6) NOT NULL,
    "all_day" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL,

    CONSTRAINT "tt_schedule_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tt_schedule_event_guests" (
    "event_id" TEXT NOT NULL,
    "staff_member_id" TEXT NOT NULL,

    CONSTRAINT "tt_schedule_event_guests_pkey" PRIMARY KEY ("event_id","staff_member_id")
);

-- CreateTable
CREATE TABLE "tt_permission_rules" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "role" "TtPermissionRole" NOT NULL,
    "action_id" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,

    CONSTRAINT "tt_permission_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tt_notifications" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "type" "TtNotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "actor_staff_id" TEXT,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tt_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tt_session_exchanges" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "context_key" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tt_session_exchanges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organization_memberships_organization_id_idx" ON "organization_memberships"("organization_id");

-- CreateIndex
CREATE INDEX "admin_offices_office_id_idx" ON "admin_offices"("office_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "offices_organization_id_is_active_idx" ON "offices"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "offices_organization_id_name_key" ON "offices"("organization_id", "name");

-- CreateIndex
CREATE INDEX "work_schedules_organization_id_is_active_idx" ON "work_schedules"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "work_schedules_organization_id_name_key" ON "work_schedules"("organization_id", "name");

-- CreateIndex
CREATE INDEX "work_schedule_days_schedule_id_idx" ON "work_schedule_days"("schedule_id");

-- CreateIndex
CREATE UNIQUE INDEX "work_schedule_days_schedule_id_weekday_key" ON "work_schedule_days"("schedule_id", "weekday");

-- CreateIndex
CREATE INDEX "departments_organization_id_is_active_idx" ON "departments"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "departments_organization_id_name_key" ON "departments"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "employees_user_id_key" ON "employees"("user_id");

-- CreateIndex
CREATE INDEX "employees_organization_id_status_idx" ON "employees"("organization_id", "status");

-- CreateIndex
CREATE INDEX "employees_office_id_idx" ON "employees"("office_id");

-- CreateIndex
CREATE INDEX "employees_schedule_id_idx" ON "employees"("schedule_id");

-- CreateIndex
CREATE INDEX "employees_department_id_idx" ON "employees"("department_id");

-- CreateIndex
CREATE INDEX "employees_evaluation_template_id_idx" ON "employees"("evaluation_template_id");

-- CreateIndex
CREATE INDEX "employees_status_office_id_idx" ON "employees"("status", "office_id");

-- CreateIndex
CREATE INDEX "employees_supervisor_id_idx" ON "employees"("supervisor_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_organization_id_employee_code_key" ON "employees"("organization_id", "employee_code");

-- CreateIndex
CREATE UNIQUE INDEX "invites_token_hash_key" ON "invites"("token_hash");

-- CreateIndex
CREATE INDEX "invites_organization_id_status_idx" ON "invites"("organization_id", "status");

-- CreateIndex
CREATE INDEX "invites_email_idx" ON "invites"("email");

-- CreateIndex
CREATE INDEX "invites_user_id_idx" ON "invites"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_revoked_at_idx" ON "refresh_tokens"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "timesheets_check_in_idempotency_key_key" ON "timesheets"("check_in_idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "timesheets_check_out_idempotency_key_key" ON "timesheets"("check_out_idempotency_key");

-- CreateIndex
CREATE INDEX "timesheets_employee_id_is_open_idx" ON "timesheets"("employee_id", "is_open");

-- CreateIndex
CREATE INDEX "timesheets_work_date_status_idx" ON "timesheets"("work_date", "status");

-- CreateIndex
CREATE INDEX "timesheets_office_id_work_date_idx" ON "timesheets"("office_id", "work_date");

-- CreateIndex
CREATE INDEX "timesheets_employee_id_work_date_status_idx" ON "timesheets"("employee_id", "work_date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "timesheets_employee_id_work_date_key" ON "timesheets"("employee_id", "work_date");

-- CreateIndex
CREATE INDEX "attendance_locations_timesheet_id_type_idx" ON "attendance_locations"("timesheet_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "late_reasons_timesheet_id_key" ON "late_reasons"("timesheet_id");

-- CreateIndex
CREATE INDEX "late_reasons_employee_id_submitted_at_idx" ON "late_reasons"("employee_id", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "worksheets_timesheet_id_key" ON "worksheets"("timesheet_id");

-- CreateIndex
CREATE INDEX "worksheets_employee_id_work_date_idx" ON "worksheets"("employee_id", "work_date");

-- CreateIndex
CREATE INDEX "worksheets_work_date_status_idx" ON "worksheets"("work_date", "status");

-- CreateIndex
CREATE INDEX "attendance_corrections_timesheet_id_created_at_idx" ON "attendance_corrections"("timesheet_id", "created_at");

-- CreateIndex
CREATE INDEX "attendance_correctness_requests_organization_id_work_date_s_idx" ON "attendance_correctness_requests"("organization_id", "work_date", "status");

-- CreateIndex
CREATE INDEX "attendance_correctness_requests_employee_id_work_date_idx" ON "attendance_correctness_requests"("employee_id", "work_date");

-- CreateIndex
CREATE INDEX "attendance_correctness_requests_employee_id_status_idx" ON "attendance_correctness_requests"("employee_id", "status");

-- CreateIndex
CREATE INDEX "leave_types_organization_id_is_active_idx" ON "leave_types"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_organization_id_name_key" ON "leave_types"("organization_id", "name");

-- CreateIndex
CREATE INDEX "leave_requests_employee_id_status_start_date_idx" ON "leave_requests"("employee_id", "status", "start_date");

-- CreateIndex
CREATE INDEX "leave_requests_status_requested_at_idx" ON "leave_requests"("status", "requested_at");

-- CreateIndex
CREATE INDEX "leave_requests_start_date_end_date_status_idx" ON "leave_requests"("start_date", "end_date", "status");

-- CreateIndex
CREATE INDEX "leave_decisions_leave_request_id_decided_at_idx" ON "leave_decisions"("leave_request_id", "decided_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_created_at_idx" ON "notifications"("user_id", "is_read", "created_at");

-- CreateIndex
CREATE INDEX "user_devices_user_id_is_active_idx" ON "user_devices"("user_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "user_devices_user_id_device_id_key" ON "user_devices"("user_id", "device_id");

-- CreateIndex
CREATE INDEX "evaluation_templates_organization_id_is_active_idx" ON "evaluation_templates"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX "evaluation_template_items_template_id_sort_order_idx" ON "evaluation_template_items"("template_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_template_items_template_id_item_key_key" ON "evaluation_template_items"("template_id", "item_key");

-- CreateIndex
CREATE INDEX "evaluation_cycles_organization_id_status_idx" ON "evaluation_cycles"("organization_id", "status");

-- CreateIndex
CREATE INDEX "evaluation_cycles_organization_id_period_start_period_end_idx" ON "evaluation_cycles"("organization_id", "period_start", "period_end");

-- CreateIndex
CREATE INDEX "evaluations_organization_id_status_idx" ON "evaluations"("organization_id", "status");

-- CreateIndex
CREATE INDEX "evaluations_employee_id_status_idx" ON "evaluations"("employee_id", "status");

-- CreateIndex
CREATE INDEX "evaluations_cycle_id_status_idx" ON "evaluations"("cycle_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "evaluations_cycle_id_employee_id_key" ON "evaluations"("cycle_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "evaluations_organization_id_number_key" ON "evaluations"("organization_id", "number");

-- CreateIndex
CREATE INDEX "evaluation_scores_evaluation_id_sort_order_idx" ON "evaluation_scores"("evaluation_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_scores_evaluation_id_item_key_key" ON "evaluation_scores"("evaluation_id", "item_key");

-- CreateIndex
CREATE INDEX "evaluation_goals_evaluation_id_sort_order_idx" ON "evaluation_goals"("evaluation_id", "sort_order");

-- CreateIndex
CREATE INDEX "meeting_rooms_organization_id_office_id_is_active_idx" ON "meeting_rooms"("organization_id", "office_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_rooms_office_id_name_key" ON "meeting_rooms"("office_id", "name");

-- CreateIndex
CREATE INDEX "meeting_bookings_room_id_starts_at_status_idx" ON "meeting_bookings"("room_id", "starts_at", "status");

-- CreateIndex
CREATE INDEX "meeting_bookings_organization_id_office_id_starts_at_idx" ON "meeting_bookings"("organization_id", "office_id", "starts_at");

-- CreateIndex
CREATE INDEX "meeting_bookings_booked_by_user_id_starts_at_idx" ON "meeting_bookings"("booked_by_user_id", "starts_at");

-- CreateIndex
CREATE INDEX "meeting_bookings_status_starts_at_idx" ON "meeting_bookings"("status", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "display_devices_refresh_token_hash_key" ON "display_devices"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "display_devices_organization_id_office_id_idx" ON "display_devices"("organization_id", "office_id");

-- CreateIndex
CREATE INDEX "display_devices_organization_id_is_active_idx" ON "display_devices"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX "display_devices_pairing_code_hash_idx" ON "display_devices"("pairing_code_hash");

-- CreateIndex
CREATE INDEX "chat_conversations_organization_id_updated_at_idx" ON "chat_conversations"("organization_id", "updated_at");

-- CreateIndex
CREATE INDEX "chat_conversations_created_by_id_idx" ON "chat_conversations"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_conversations_organization_id_direct_key_key" ON "chat_conversations"("organization_id", "direct_key");

-- CreateIndex
CREATE INDEX "chat_participants_user_id_left_at_idx" ON "chat_participants"("user_id", "left_at");

-- CreateIndex
CREATE UNIQUE INDEX "chat_participants_conversation_id_user_id_key" ON "chat_participants"("conversation_id", "user_id");

-- CreateIndex
CREATE INDEX "chat_messages_conversation_id_created_at_idx" ON "chat_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "chat_messages_sender_id_created_at_idx" ON "chat_messages"("sender_id", "created_at");

-- CreateIndex
CREATE INDEX "vault_credentials_organization_id_idx" ON "vault_credentials"("organization_id");

-- CreateIndex
CREATE INDEX "vault_credentials_office_id_idx" ON "vault_credentials"("office_id");

-- CreateIndex
CREATE INDEX "office_subscriptions_organization_id_status_idx" ON "office_subscriptions"("organization_id", "status");

-- CreateIndex
CREATE INDEX "office_subscriptions_office_id_idx" ON "office_subscriptions"("office_id");

-- CreateIndex
CREATE INDEX "subscription_periods_year_month_idx" ON "subscription_periods"("year_month");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_periods_subscription_id_year_month_key" ON "subscription_periods"("subscription_id", "year_month");

-- CreateIndex
CREATE UNIQUE INDEX "tt_workspaces_organization_id_key" ON "tt_workspaces"("organization_id");

-- CreateIndex
CREATE INDEX "tt_workspace_events_workspace_id_revision_idx" ON "tt_workspace_events"("workspace_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "tt_staff_members_employee_id_key" ON "tt_staff_members"("employee_id");

-- CreateIndex
CREATE INDEX "tt_staff_members_workspace_id_sort_order_idx" ON "tt_staff_members"("workspace_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "tt_staff_members_workspace_id_user_id_key" ON "tt_staff_members"("workspace_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tt_staff_members_workspace_id_display_name_key" ON "tt_staff_members"("workspace_id", "display_name");

-- CreateIndex
CREATE INDEX "tt_projects_workspace_id_sort_order_idx" ON "tt_projects"("workspace_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "tt_projects_workspace_id_name_key" ON "tt_projects"("workspace_id", "name");

-- CreateIndex
CREATE INDEX "tt_org_teams_workspace_id_sort_order_idx" ON "tt_org_teams"("workspace_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "tt_org_teams_workspace_id_name_key" ON "tt_org_teams"("workspace_id", "name");

-- CreateIndex
CREATE INDEX "tt_tasks_workspace_id_status_sort_order_idx" ON "tt_tasks"("workspace_id", "status", "sort_order");

-- CreateIndex
CREATE INDEX "tt_task_updates_task_id_created_at_idx" ON "tt_task_updates"("task_id", "created_at");

-- CreateIndex
CREATE INDEX "tt_deleted_tasks_workspace_id_deleted_at_idx" ON "tt_deleted_tasks"("workspace_id", "deleted_at");

-- CreateIndex
CREATE INDEX "tt_archived_tasks_workspace_id_archived_at_idx" ON "tt_archived_tasks"("workspace_id", "archived_at");

-- CreateIndex
CREATE INDEX "tt_schedule_events_workspace_id_start_idx" ON "tt_schedule_events"("workspace_id", "start");

-- CreateIndex
CREATE UNIQUE INDEX "tt_permission_rules_workspace_id_role_action_id_key" ON "tt_permission_rules"("workspace_id", "role", "action_id");

-- CreateIndex
CREATE INDEX "tt_notifications_recipient_id_read_at_created_at_idx" ON "tt_notifications"("recipient_id", "read_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "tt_session_exchanges_token_hash_key" ON "tt_session_exchanges"("token_hash");

-- CreateIndex
CREATE INDEX "tt_session_exchanges_expires_at_idx" ON "tt_session_exchanges"("expires_at");

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_offices" ADD CONSTRAINT "admin_offices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_offices" ADD CONSTRAINT "admin_offices_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offices" ADD CONSTRAINT "offices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_schedule_days" ADD CONSTRAINT "work_schedule_days_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "work_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "work_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_evaluation_template_id_fkey" FOREIGN KEY ("evaluation_template_id") REFERENCES "evaluation_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "work_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "work_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_locations" ADD CONSTRAINT "attendance_locations_timesheet_id_fkey" FOREIGN KEY ("timesheet_id") REFERENCES "timesheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "late_reasons" ADD CONSTRAINT "late_reasons_timesheet_id_fkey" FOREIGN KEY ("timesheet_id") REFERENCES "timesheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "late_reasons" ADD CONSTRAINT "late_reasons_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worksheets" ADD CONSTRAINT "worksheets_timesheet_id_fkey" FOREIGN KEY ("timesheet_id") REFERENCES "timesheets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worksheets" ADD CONSTRAINT "worksheets_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worksheets" ADD CONSTRAINT "worksheets_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_timesheet_id_fkey" FOREIGN KEY ("timesheet_id") REFERENCES "timesheets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_correctness_requests" ADD CONSTRAINT "attendance_correctness_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_correctness_requests" ADD CONSTRAINT "attendance_correctness_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_correctness_requests" ADD CONSTRAINT "attendance_correctness_requests_timesheet_id_fkey" FOREIGN KEY ("timesheet_id") REFERENCES "timesheets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_correctness_requests" ADD CONSTRAINT "attendance_correctness_requests_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_decisions" ADD CONSTRAINT "leave_decisions_leave_request_id_fkey" FOREIGN KEY ("leave_request_id") REFERENCES "leave_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_decisions" ADD CONSTRAINT "leave_decisions_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_templates" ADD CONSTRAINT "evaluation_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_template_items" ADD CONSTRAINT "evaluation_template_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "evaluation_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_cycles" ADD CONSTRAINT "evaluation_cycles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_cycles" ADD CONSTRAINT "evaluation_cycles_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "evaluation_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "evaluation_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_evaluator_user_id_fkey" FOREIGN KEY ("evaluator_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_finalized_by_user_id_fkey" FOREIGN KEY ("finalized_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_scores" ADD CONSTRAINT "evaluation_scores_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_goals" ADD CONSTRAINT "evaluation_goals_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_rooms" ADD CONSTRAINT "meeting_rooms_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_rooms" ADD CONSTRAINT "meeting_rooms_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_bookings" ADD CONSTRAINT "meeting_bookings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_bookings" ADD CONSTRAINT "meeting_bookings_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_bookings" ADD CONSTRAINT "meeting_bookings_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "meeting_rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_bookings" ADD CONSTRAINT "meeting_bookings_booked_by_user_id_fkey" FOREIGN KEY ("booked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_bookings" ADD CONSTRAINT "meeting_bookings_cancelled_by_user_id_fkey" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_bookings" ADD CONSTRAINT "meeting_bookings_organizer_employee_id_fkey" FOREIGN KEY ("organizer_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "display_devices" ADD CONSTRAINT "display_devices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "display_devices" ADD CONSTRAINT "display_devices_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "display_devices" ADD CONSTRAINT "display_devices_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_participants" ADD CONSTRAINT "chat_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_participants" ADD CONSTRAINT "chat_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_credentials" ADD CONSTRAINT "vault_credentials_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_credentials" ADD CONSTRAINT "vault_credentials_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_credentials" ADD CONSTRAINT "vault_credentials_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_subscriptions" ADD CONSTRAINT "office_subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_subscriptions" ADD CONSTRAINT "office_subscriptions_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_subscriptions" ADD CONSTRAINT "office_subscriptions_login_credential_id_fkey" FOREIGN KEY ("login_credential_id") REFERENCES "vault_credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_periods" ADD CONSTRAINT "subscription_periods_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "office_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tt_workspaces" ADD CONSTRAINT "tt_workspaces_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tt_workspace_events" ADD CONSTRAINT "tt_workspace_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "tt_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tt_staff_members" ADD CONSTRAINT "tt_staff_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "tt_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tt_staff_members" ADD CONSTRAINT "tt_staff_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tt_staff_members" ADD CONSTRAINT "tt_staff_members_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tt_projects" ADD CONSTRAINT "tt_projects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "tt_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tt_projects" ADD CONSTRAINT "tt_projects_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "tt_staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tt_project_members" ADD CONSTRAINT "tt_project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "tt_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tt_project_members" ADD CONSTRAINT "tt_project_members_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "tt_staff_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tt_org_teams" ADD CONSTRAINT "tt_org_teams_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "tt_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tt_org_team_members" ADD CONSTRAINT "tt_org_team_members_org_team_id_fkey" FOREIGN KEY ("org_team_id") REFERENCES "tt_org_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tt_org_team_members" ADD CONSTRAINT "tt_org_team_members_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "tt_staff_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tt_tasks" ADD CONSTRAINT "tt_tasks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "tt_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tt_tasks" ADD CONSTRAINT "tt_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "tt_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tt_task_owners" ADD CONSTRAINT "tt_task_owners_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tt_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tt_task_owners" ADD CONSTRAINT "tt_task_owners_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "tt_staff_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tt_task_updates" ADD CONSTRAINT "tt_task_updates_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tt_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tt_task_updates" ADD CONSTRAINT "tt_task_updates_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "tt_staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tt_deleted_tasks" ADD CONSTRAINT "tt_deleted_tasks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "tt_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tt_archived_tasks" ADD CONSTRAINT "tt_archived_tasks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "tt_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tt_schedule_events" ADD CONSTRAINT "tt_schedule_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "tt_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tt_schedule_events" ADD CONSTRAINT "tt_schedule_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "tt_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tt_schedule_event_guests" ADD CONSTRAINT "tt_schedule_event_guests_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "tt_schedule_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tt_schedule_event_guests" ADD CONSTRAINT "tt_schedule_event_guests_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "tt_staff_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tt_permission_rules" ADD CONSTRAINT "tt_permission_rules_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "tt_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tt_notifications" ADD CONSTRAINT "tt_notifications_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "tt_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tt_notifications" ADD CONSTRAINT "tt_notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "tt_staff_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tt_notifications" ADD CONSTRAINT "tt_notifications_actor_staff_id_fkey" FOREIGN KEY ("actor_staff_id") REFERENCES "tt_staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tt_session_exchanges" ADD CONSTRAINT "tt_session_exchanges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
