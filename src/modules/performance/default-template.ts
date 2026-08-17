import type { EvaluationItemSection } from "../../generated/prisma/client.js";

export type DefaultTemplateItem = {
  section: EvaluationItemSection;
  itemKey: string;
  label: string;
  sortOrder: number;
};

export const SOFTWARE_ENGINEER_TEMPLATE_NAME = "Internal — Software Engineer";

export const softwareEngineerTemplateItems: DefaultTemplateItem[] = [
  { section: "METRIC", itemKey: "metric.timeliness_punctuality", label: "Timeliness Punctuality", sortOrder: 10 },
  { section: "METRIC", itemKey: "metric.communication_skills", label: "Communication Skills", sortOrder: 20 },
  { section: "METRIC", itemKey: "metric.problem_solving_ability", label: "Problem-Solving Ability", sortOrder: 30 },
  { section: "METRIC", itemKey: "metric.collaboration_and_teamwork", label: "Collaboration and Teamwork", sortOrder: 40 },
  { section: "METRIC", itemKey: "metric.initiative_and_proactivity", label: "Initiative and Proactivity", sortOrder: 50 },
  { section: "METRIC", itemKey: "metric.system_implementation", label: "System implementation", sortOrder: 60 },
  {
    section: "RESPONSIBILITY",
    itemKey: "responsibility.scalable_architecture",
    label: "Design a scalable, secure system with the right architecture, data flow, and tech stack.",
    sortOrder: 110
  },
  {
    section: "RESPONSIBILITY",
    itemKey: "responsibility.responsive_frontends",
    label: "Build responsive frontends with smooth state management and API integration.",
    sortOrder: 120
  },
  {
    section: "RESPONSIBILITY",
    itemKey: "responsibility.secure_backends",
    label: "Develop secure, high-performance backends with optimized logic and data management.",
    sortOrder: 130
  },
  {
    section: "RESPONSIBILITY",
    itemKey: "responsibility.code_quality",
    label: "Ensure code quality through testing, debugging, and code reviews.",
    sortOrder: 140
  },
  {
    section: "RESPONSIBILITY",
    itemKey: "responsibility.qa_processes",
    label: "Implement QA processes to maintain reliability and performance.",
    sortOrder: 150
  },
  {
    section: "RESPONSIBILITY",
    itemKey: "responsibility.site_email_config",
    label: "Manage web-site and email server configuration",
    sortOrder: 160
  },
  {
    section: "RESPONSIBILITY",
    itemKey: "responsibility.monitor_systems",
    label: "Monitor systems to ensure reliability, performance, and scalability.",
    sortOrder: 170
  },
  {
    section: "SKILL_IMPROVED",
    itemKey: "skill.ai_machine_learning",
    label: "AI & Machine Learning Development (Build AI Systems)",
    sortOrder: 210
  },
  {
    section: "SKILL_IMPROVED",
    itemKey: "skill.communication_business_logic",
    label: "Communication & Business Logic Understanding",
    sortOrder: 220
  },
  {
    section: "SKILL_IMPROVED",
    itemKey: "skill.system_design_problem_solving",
    label: "System Design & Problem-Solving",
    sortOrder: 230
  },
  {
    section: "GOAL",
    itemKey: "goal.ai_machine_learning",
    label: "AI & Machine Learning Development (Build AI Systems)",
    sortOrder: 310
  },
  {
    section: "GOAL",
    itemKey: "goal.communication_business_logic",
    label: "Communication & Business Logic Understanding",
    sortOrder: 320
  },
  {
    section: "GOAL",
    itemKey: "goal.system_design_problem_solving",
    label: "System Design & Problem-Solving",
    sortOrder: 330
  }
];
