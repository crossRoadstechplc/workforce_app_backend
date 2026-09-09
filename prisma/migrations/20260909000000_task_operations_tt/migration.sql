-- CreateEnum
CREATE TYPE "TtPermissionRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'LEAD', 'SENIOR_STAFF', 'JUNIOR_STAFF');

-- CreateEnum
CREATE TYPE "TtTaskStatus" AS ENUM ('TO_DO', 'IN_PROGRESS', 'DONE');

-- CreateEnum
CREATE TYPE "TtNotificationType" AS ENUM ('TASK_ASSIGNED', 'PROJECT_ASSIGNED', 'SCHEDULE_INVITED');

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
