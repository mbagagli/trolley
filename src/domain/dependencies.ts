import type { EntityId, Task } from "./types";

export function wouldCreateDependencyCycle(
  tasks: Task[],
  taskId: EntityId,
  dependencyId: EntityId,
): boolean {
  if (taskId === dependencyId) {
    return true;
  }
  const dependenciesByTask = new Map(
    tasks.map((task) => [task.id, task.dependencyIds] as const),
  );
  const toVisit = [dependencyId];
  const visited = new Set<EntityId>();
  while (toVisit.length > 0) {
    const current = toVisit.pop();
    if (!current || visited.has(current)) {
      continue;
    }
    if (current === taskId) {
      return true;
    }
    visited.add(current);
    toVisit.push(...(dependenciesByTask.get(current) ?? []));
  }
  return false;
}

export function wouldCreateParentCycle(
  tasks: Task[],
  taskId: EntityId,
  parentId: EntityId,
): boolean {
  if (taskId === parentId) {
    return true;
  }
  const parentByTask = new Map(
    tasks.map((task) => [task.id, task.parentId] as const),
  );
  const visited = new Set<EntityId>();
  let current: EntityId | null = parentId;
  while (current && !visited.has(current)) {
    if (current === taskId) {
      return true;
    }
    visited.add(current);
    current = parentByTask.get(current) ?? null;
  }
  return false;
}

export function topologicalTaskIds(tasks: Task[]): EntityId[] {
  const taskIds = new Set(tasks.map((task) => task.id));
  const incoming = new Map<EntityId, number>();
  const dependents = new Map<EntityId, EntityId[]>();
  for (const task of tasks) {
    const dependencies = task.dependencyIds.filter((id) => taskIds.has(id));
    incoming.set(task.id, dependencies.length);
    for (const dependencyId of dependencies) {
      const current = dependents.get(dependencyId) ?? [];
      current.push(task.id);
      dependents.set(dependencyId, current);
    }
  }
  const ready = tasks
    .filter((task) => incoming.get(task.id) === 0)
    .sort((left, right) => left.sortPosition - right.sortPosition)
    .map((task) => task.id);
  const ordered: EntityId[] = [];
  while (ready.length > 0) {
    const taskId = ready.shift();
    if (!taskId) {
      break;
    }
    ordered.push(taskId);
    for (const dependentId of dependents.get(taskId) ?? []) {
      const nextCount = (incoming.get(dependentId) ?? 1) - 1;
      incoming.set(dependentId, nextCount);
      if (nextCount === 0) {
        ready.push(dependentId);
      }
    }
  }
  if (ordered.length !== tasks.length) {
    throw new Error("Task dependencies contain a cycle.");
  }
  return ordered;
}
