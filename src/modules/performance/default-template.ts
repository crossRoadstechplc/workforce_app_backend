import type { EvaluationItemSection, EvaluationScoringSource } from "../../generated/prisma/client.js";

export type DefaultTemplateItem = {
  section: EvaluationItemSection;
  itemKey: string;
  label: string;
  prompt: string;
  scoringSource: EvaluationScoringSource;
  sortOrder: number;
};

export const STANDARD_PERFORMANCE_TEMPLATE_NAME = "Standard performance evaluation";

export const RELIABILITY_ATTENDANCE_ITEM_KEY = "competency.reliability_attendance";

/** Old form names retired from the product. */
export const LEGACY_EVALUATION_TEMPLATE_NAMES = ["Internal — Software Engineer"] as const;

export const standardPerformanceTemplateItems: DefaultTemplateItem[] = [
  {
    section: "METRIC",
    itemKey: "competency.quality_of_work",
    label: "Quality of Work",
    prompt: "How consistently does the employee produce accurate, thorough, and high-quality work?",
    scoringSource: "HUMAN",
    sortOrder: 10
  },
  {
    section: "METRIC",
    itemKey: "competency.productivity",
    label: "Productivity",
    prompt: "How effectively does the employee complete assigned work within expected timelines?",
    scoringSource: "HUMAN",
    sortOrder: 20
  },
  {
    section: "METRIC",
    itemKey: "competency.job_knowledge",
    label: "Job Knowledge",
    prompt: "How well does the employee understand and apply the knowledge and skills required for the role?",
    scoringSource: "HUMAN",
    sortOrder: 30
  },
  {
    section: "METRIC",
    itemKey: RELIABILITY_ATTENDANCE_ITEM_KEY,
    label: "Reliability and Attendance",
    prompt: "How dependable is the employee in terms of attendance, punctuality, and completing commitments?",
    scoringSource: "SYSTEM_ATTENDANCE",
    sortOrder: 40
  },
  {
    section: "METRIC",
    itemKey: "competency.communication",
    label: "Communication",
    prompt: "How clearly and professionally does the employee communicate with colleagues, supervisors, and clients?",
    scoringSource: "HUMAN",
    sortOrder: 50
  },
  {
    section: "METRIC",
    itemKey: "competency.teamwork",
    label: "Teamwork",
    prompt: "How effectively does the employee cooperate with others and contribute to a positive working environment?",
    scoringSource: "HUMAN",
    sortOrder: 60
  },
  {
    section: "METRIC",
    itemKey: "competency.initiative",
    label: "Initiative",
    prompt: "How willing is the employee to take responsibility, work independently, and identify tasks that need attention?",
    scoringSource: "HUMAN",
    sortOrder: 70
  },
  {
    section: "METRIC",
    itemKey: "competency.problem_solving",
    label: "Problem-Solving",
    prompt: "How effectively does the employee identify problems and develop practical solutions?",
    scoringSource: "HUMAN",
    sortOrder: 80
  },
  {
    section: "METRIC",
    itemKey: "competency.adaptability",
    label: "Adaptability",
    prompt: "How well does the employee respond to changes, feedback, new responsibilities, and workplace challenges?",
    scoringSource: "HUMAN",
    sortOrder: 90
  },
  {
    section: "METRIC",
    itemKey: "competency.professionalism_accountability",
    label: "Professionalism and Accountability",
    prompt: "How consistently does the employee demonstrate integrity, respect, good judgment, and responsibility for their work?",
    scoringSource: "HUMAN",
    sortOrder: 100
  }
];
