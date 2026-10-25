import {
  DEFAULT_COLUMN_TASK_LIMIT,
  DEFAULT_SETTINGS,
} from "../config/product";
import type {
  Project,
  Task,
  WorkspaceSnapshot,
  WorkflowColumn,
} from "../domain/types";

const PROJECT_ID = "2c828358-12fd-4dd0-9ea6-299398983826";

const COLUMN_IDS = {
  backlog: "c57281b8-5a34-4ec2-8c90-8cc6f23f77f4",
  ready: "18ea2db0-eb8a-42a7-b4e8-5805bd4d454a",
  progress: "3d2fe81a-2647-4491-888e-ecb4b8450c6b",
  review: "c5b438db-407c-4e6e-a58c-9d957820a285",
  done: "0271deef-bf9f-48ad-9e8b-40dfa5e5ff6f",
} as const;

const TASK_IDS = {
  permits: "54c987c0-286e-420a-9a6c-b7f54e31a597",
  volunteers: "00c83256-c8d5-4a96-b1a3-158d094792c1",
  beds: "b9624bbf-ee49-4e50-9c84-0afaf60fd690",
  irrigation: "65595515-bbac-4723-8a91-e63fe268aebb",
  signage: "0c0a5d63-b5a9-481b-b4ef-85b64625954a",
  suppliers: "0aa0d865-c31c-43b8-a392-82f92c22d0bc",
  launch: "cd6f0d9d-c32d-4f87-be29-26136f29372d",
  survey: "d6ad99b1-462f-4f01-a9e3-375a8e78e005",
} as const;

function dateOffset(origin: Date, days: number): string {
  const value = new Date(origin);
  value.setHours(12, 0, 0, 0);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function project(
  id: string,
  name: string,
  color: string,
  archived: boolean,
  sortPosition: number,
  timestamp: string,
): Project {
  return {
    id,
    name,
    color,
    icon: null,
    archived,
    createdAt: timestamp,
    updatedAt: timestamp,
    sortPosition,
    settings: structuredClone(DEFAULT_SETTINGS),
  };
}

function task(
  values: Pick<
    Task,
    | "id"
    | "columnId"
    | "title"
    | "priority"
    | "isUrgent"
    | "isImportant"
    | "progress"
    | "sortPosition"
  > &
    Partial<Task>,
  timestamp: string,
): Task {
  return {
    projectId: PROJECT_ID,
    description: "",
    startDate: null,
    dueDate: null,
    labelIds: [],
    assigneeId: null,
    parentId: null,
    checklist: [],
    dependencyIds: [],
    estimatedHours: null,
    actualHours: null,
    milestone: false,
    notes: "",
    createdAt: timestamp,
    updatedAt: timestamp,
    completed: false,
    archived: false,
    ...values,
  };
}

export function createDemoWorkspace(origin = new Date()): WorkspaceSnapshot {
  const timestamp = origin.toISOString();
  const columns: WorkflowColumn[] = [
    {
      id: COLUMN_IDS.backlog,
      projectId: PROJECT_ID,
      name: "Backlog",
      color: "#756b76",
      icon: "Archive",
      completed: false,
      limit: null,
      collapsed: false,
      sortPosition: 0,
    },
    {
      id: COLUMN_IDS.ready,
      projectId: PROJECT_ID,
      name: "Ready",
      color: "#477b78",
      icon: "CircleDot",
      completed: false,
      limit: DEFAULT_COLUMN_TASK_LIMIT,
      collapsed: false,
      sortPosition: 1,
    },
    {
      id: COLUMN_IDS.progress,
      projectId: PROJECT_ID,
      name: "In progress",
      color: "#d39a3c",
      icon: "Wrench",
      completed: false,
      limit: DEFAULT_COLUMN_TASK_LIMIT,
      collapsed: false,
      sortPosition: 2,
    },
    {
      id: COLUMN_IDS.review,
      projectId: PROJECT_ID,
      name: "Review",
      color: "#aa654a",
      icon: "ScanSearch",
      completed: false,
      limit: DEFAULT_COLUMN_TASK_LIMIT,
      collapsed: false,
      sortPosition: 3,
    },
    {
      id: COLUMN_IDS.done,
      projectId: PROJECT_ID,
      name: "Complete",
      color: "#456052",
      icon: "BadgeCheck",
      completed: true,
      limit: null,
      collapsed: true,
      sortPosition: 4,
    },
  ];
  const tasks: Task[] = [
    task(
      {
        id: TASK_IDS.survey,
        columnId: COLUMN_IDS.done,
        title: "Survey the north plot",
        description: "Record shade, access, and available water points.",
        priority: 3,
        isUrgent: false,
        isImportant: true,
        startDate: dateOffset(origin, -20),
        dueDate: dateOffset(origin, -17),
        progress: 100,
        labelIds: ["f5dcf4e0-3dd4-4fef-9962-bef322e5f2f9"],
        assigneeId: "7ea597cf-a905-4b4d-b1bf-65b9bc42c753",
        completed: true,
        checklist: [
          {
            id: "276c379e-8a16-4f9a-93fb-0e52df9e70f0",
            title: "Measure boundaries",
            completed: true,
            sortPosition: 0,
          },
          {
            id: "ed4f6036-e0f4-4ece-b3ad-caf6a106975a",
            title: "Mark water points",
            completed: true,
            sortPosition: 1,
          },
        ],
        estimatedHours: 4,
        actualHours: 3.5,
        sortPosition: 0,
      },
      timestamp,
    ),
    task(
      {
        id: TASK_IDS.permits,
        columnId: COLUMN_IDS.review,
        title: "Confirm site permit",
        description: "Verify the final permit conditions with the council.",
        priority: 5,
        isUrgent: true,
        isImportant: true,
        startDate: dateOffset(origin, -4),
        dueDate: dateOffset(origin, 1),
        progress: 80,
        labelIds: ["702dc2a8-6813-45e3-95ac-9f66abaef9e1"],
        assigneeId: "a1a8fd02-0b60-4e04-b22f-9636f70796d8",
        dependencyIds: [TASK_IDS.survey],
        estimatedHours: 6,
        actualHours: 5,
        sortPosition: 0,
      },
      timestamp,
    ),
    task(
      {
        id: TASK_IDS.beds,
        columnId: COLUMN_IDS.progress,
        title: "Build the first raised beds",
        description: "Assemble four cedar beds and prepare the soil mix.",
        priority: 4,
        isUrgent: false,
        isImportant: true,
        startDate: dateOffset(origin, -2),
        dueDate: dateOffset(origin, 6),
        progress: 45,
        labelIds: [
          "f5dcf4e0-3dd4-4fef-9962-bef322e5f2f9",
          "44a5cafe-a9a1-48ce-8e1d-1f0a9938abca",
        ],
        assigneeId: "7ea597cf-a905-4b4d-b1bf-65b9bc42c753",
        dependencyIds: [TASK_IDS.permits],
        estimatedHours: 18,
        actualHours: 7.5,
        sortPosition: 0,
      },
      timestamp,
    ),
    task(
      {
        id: TASK_IDS.irrigation,
        columnId: COLUMN_IDS.ready,
        title: "Lay the irrigation mainline",
        description: "Run the mainline and add isolation valves for each bed.",
        priority: 4,
        isUrgent: true,
        isImportant: true,
        startDate: dateOffset(origin, 5),
        dueDate: dateOffset(origin, 9),
        progress: 0,
        labelIds: ["44a5cafe-a9a1-48ce-8e1d-1f0a9938abca"],
        assigneeId: "2ec4baad-91a3-4b99-aa07-24719fa834c5",
        dependencyIds: [TASK_IDS.beds],
        estimatedHours: 12,
        sortPosition: 0,
      },
      timestamp,
    ),
    task(
      {
        id: TASK_IDS.volunteers,
        columnId: COLUMN_IDS.progress,
        title: "Build volunteer schedule",
        description:
          "Match volunteer skills to build, planting, and welcome shifts.",
        priority: 3,
        isUrgent: true,
        isImportant: true,
        startDate: dateOffset(origin, -1),
        dueDate: dateOffset(origin, 4),
        progress: 33,
        labelIds: ["bf4c2426-7afc-463c-bf16-ceff2a162b24"],
        assigneeId: "a1a8fd02-0b60-4e04-b22f-9636f70796d8",
        checklist: [
          {
            id: "1de30d88-adde-41cf-ac73-563750e6a145",
            title: "Collect availability",
            completed: true,
            sortPosition: 0,
          },
          {
            id: "38b08fd7-a36e-461d-a478-c75d10182c47",
            title: "Assign team leads",
            completed: false,
            sortPosition: 1,
          },
          {
            id: "548c3535-617e-4058-83a2-51f9be37ec00",
            title: "Share final shifts",
            completed: false,
            sortPosition: 2,
          },
        ],
        estimatedHours: 8,
        actualHours: 4,
        sortPosition: 1,
      },
      timestamp,
    ),
    task(
      {
        id: TASK_IDS.signage,
        columnId: COLUMN_IDS.ready,
        title: "Draft wayfinding signs",
        description: "Create weatherproof signs for plots and shared tools.",
        priority: 2,
        isUrgent: false,
        isImportant: false,
        startDate: dateOffset(origin, 7),
        dueDate: dateOffset(origin, 12),
        progress: 10,
        labelIds: ["0cb77137-9cb5-481c-aa9c-e71817a60753"],
        assigneeId: "2ec4baad-91a3-4b99-aa07-24719fa834c5",
        estimatedHours: 5,
        sortPosition: 1,
      },
      timestamp,
    ),
    task(
      {
        id: TASK_IDS.suppliers,
        columnId: COLUMN_IDS.backlog,
        title: "Compare compost suppliers",
        description: "Collect local pricing and delivery lead times.",
        priority: 1,
        isUrgent: false,
        isImportant: true,
        startDate: dateOffset(origin, 8),
        dueDate: dateOffset(origin, 15),
        progress: 0,
        labelIds: ["702dc2a8-6813-45e3-95ac-9f66abaef9e1"],
        estimatedHours: 3,
        sortPosition: 0,
      },
      timestamp,
    ),
    task(
      {
        id: TASK_IDS.launch,
        columnId: COLUMN_IDS.backlog,
        title: "Opening morning",
        description: "Welcome neighbors and open the first planting session.",
        priority: 4,
        isUrgent: false,
        isImportant: true,
        startDate: dateOffset(origin, 24),
        dueDate: dateOffset(origin, 24),
        progress: 0,
        labelIds: ["bf4c2426-7afc-463c-bf16-ceff2a162b24"],
        dependencyIds: [TASK_IDS.irrigation, TASK_IDS.signage],
        milestone: true,
        sortPosition: 1,
      },
      timestamp,
    ),
  ];
  return {
    schemaVersion: 1,
    projects: [
      project(
        PROJECT_ID,
        "Community garden launch",
        "#456052",
        false,
        0,
        timestamp,
      ),
    ],
    columns,
    labels: [
      {
        id: "f5dcf4e0-3dd4-4fef-9962-bef322e5f2f9",
        projectId: PROJECT_ID,
        name: "Site work",
        color: "#456052",
        icon: "Shovel",
        sortPosition: 0,
      },
      {
        id: "44a5cafe-a9a1-48ce-8e1d-1f0a9938abca",
        projectId: PROJECT_ID,
        name: "Materials",
        color: "#d39a3c",
        icon: "PackageOpen",
        sortPosition: 1,
      },
      {
        id: "bf4c2426-7afc-463c-bf16-ceff2a162b24",
        projectId: PROJECT_ID,
        name: "People",
        color: "#aa654a",
        icon: "Users",
        sortPosition: 2,
      },
      {
        id: "0cb77137-9cb5-481c-aa9c-e71817a60753",
        projectId: PROJECT_ID,
        name: "Design",
        color: "#74546c",
        icon: "PenTool",
        sortPosition: 3,
      },
      {
        id: "702dc2a8-6813-45e3-95ac-9f66abaef9e1",
        projectId: PROJECT_ID,
        name: "Admin",
        color: "#477b78",
        icon: "FileCheck2",
        sortPosition: 4,
      },
    ],
    members: [
      {
        id: "7ea597cf-a905-4b4d-b1bf-65b9bc42c753",
        projectId: PROJECT_ID,
        name: "Maya Chen",
        initials: "MC",
        color: "#456052",
        sortPosition: 0,
      },
      {
        id: "a1a8fd02-0b60-4e04-b22f-9636f70796d8",
        projectId: PROJECT_ID,
        name: "Jon Bell",
        initials: "JB",
        color: "#aa654a",
        sortPosition: 1,
      },
      {
        id: "2ec4baad-91a3-4b99-aa07-24719fa834c5",
        projectId: PROJECT_ID,
        name: "Noor Khan",
        initials: "NK",
        color: "#477b78",
        sortPosition: 2,
      },
    ],
    tasks,
    savedFilters: [],
    preferences: {
      columnTaskLimitMigrated: true,
      theme: "system",
      density: "comfortable",
      onboardingComplete: false,
      lastProjectId: PROJECT_ID,
    },
  };
}
