import { z } from "zod";

const idParam = z.object({ id: z.string().min(1) });
const trashParam = z.object({ trashId: z.string().min(1) });

export const emptySchema = z.object({});

export const eventsQuerySchema = z.object({
  query: z.object({
    after: z.coerce.number().int().optional()
  })
});

export const createTaskSchema = z.object({
  body: z.object({
    title: z.string().trim().min(1),
    team: z.string().trim().min(1),
    description: z.string().optional(),
    priority: z.string().optional(),
    due: z.string().optional(),
    status: z.enum(["To Do", "In Progress", "Done"]).optional(),
    owners: z.array(z.string()).optional()
  })
});

export const updateTaskSchema = z.object({
  params: idParam,
  body: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    team: z.string().optional(),
    priority: z.string().optional(),
    due: z.string().optional(),
    owners: z.array(z.string()).optional()
  })
});

export const taskIdSchema = z.object({ params: idParam });

export const moveTaskSchema = z.object({
  params: idParam,
  body: z.object({
    status: z.enum(["To Do", "In Progress", "Done"]),
    sortOrder: z.number().int().optional()
  })
});

export const addUpdateSchema = z.object({
  params: idParam,
  body: z.object({ text: z.string().trim().min(1) })
});

export const restoreTrashSchema = z.object({ params: trashParam });

export const createProjectSchema = z.object({
  body: z.object({ name: z.string().trim().min(1) })
});

export const updateProjectSchema = z.object({
  params: idParam,
  body: z.object({
    name: z.string().trim().min(1).optional(),
    leaderId: z.string().nullable().optional()
  })
});

export const projectMembersSchema = z.object({
  params: idParam,
  body: z.object({ memberIds: z.array(z.string()) })
});

export const createOrgTeamSchema = z.object({
  body: z.object({ name: z.string().trim().min(1) })
});

export const updateOrgTeamSchema = z.object({
  params: idParam,
  body: z.object({ name: z.string().trim().min(1) })
});

export const orgTeamMembersSchema = z.object({
  params: idParam,
  body: z.object({ memberIds: z.array(z.string()) })
});

export const createScheduleSchema = z.object({
  body: z.object({
    id: z.string().optional(),
    title: z.string(),
    start: z.string(),
    end: z.string(),
    allDay: z.boolean().optional(),
    description: z.string().optional(),
    location: z.string().optional(),
    project: z.string().optional(),
    color: z.string(),
    guests: z.array(z.string()).optional()
  })
});

export const updateScheduleSchema = z.object({
  params: idParam,
  body: z.object({
    title: z.string().optional(),
    start: z.string().optional(),
    end: z.string().optional(),
    allDay: z.boolean().optional(),
    description: z.string().optional(),
    location: z.string().optional(),
    project: z.string().optional(),
    color: z.string().optional(),
    guests: z.array(z.string()).optional()
  })
});

export const updateStaffSchema = z.object({
  params: idParam,
  body: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    jobTitle: z.string().optional(),
    displayName: z.string().optional()
  })
});

export const updateStaffRoleSchema = z.object({
  params: idParam,
  body: z.object({ permissionRole: z.string().trim().min(1) })
});

export const inviteStaffSchema = z.object({
  body: z.object({
    firstName: z.string().trim().min(1),
    lastName: z.string().optional(),
    email: z.string().email(),
    jobTitle: z.string().optional(),
    permissionRole: z.string().optional()
  })
});

export const permissionsSchema = z.object({
  body: z.object({
    permissionMatrix: z.record(z.string(), z.record(z.string(), z.boolean()))
  })
});

export const workspacePutSchema = z.object({
  body: z.record(z.string(), z.unknown())
});

export const notificationIdSchema = z.object({ params: idParam });
