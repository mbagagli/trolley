import type { Task } from "./types";

export const MAX_HIERARCHY_DEPTH = 256;

export interface HierarchyTask {
  task: Task;
  depth: number;
}

export function flattenTaskHierarchy(
  tasks: Task[],
  collapsed: ReadonlySet<string>,
): HierarchyTask[] {
  const taskIds = new Set(tasks.map((task) => task.id));
  const childrenByParent = new Map<string, Task[]>();
  const roots: Task[] = [];
  for (const task of tasks) {
    if (!task.parentId || !taskIds.has(task.parentId)) {
      roots.push(task);
      continue;
    }
    const children = childrenByParent.get(task.parentId) ?? [];
    children.push(task);
    childrenByParent.set(task.parentId, children);
  }
  const byPosition = (left: Task, right: Task) =>
    left.sortPosition - right.sortPosition;
  roots.sort(byPosition);
  childrenByParent.forEach((children) => children.sort(byPosition));

  const ordered: HierarchyTask[] = [];
  const visited = new Set<string>();
  function visit(root: Task, initialDepth: number): void {
    const pending = [{ task: root, depth: initialDepth, hidden: false }];
    while (pending.length > 0) {
      const entry = pending.pop();
      if (!entry || visited.has(entry.task.id)) continue;
      visited.add(entry.task.id);
      if (!entry.hidden) ordered.push({ task: entry.task, depth: entry.depth });
      const hidden = entry.hidden || collapsed.has(entry.task.id);
      const children = childrenByParent.get(entry.task.id) ?? [];
      for (let index = children.length - 1; index >= 0; index -= 1) {
        pending.push({
          task: children[index]!,
          depth: Math.min(entry.depth + 1, MAX_HIERARCHY_DEPTH),
          hidden,
        });
      }
    }
  }
  roots.forEach((task) => visit(task, 0));
  tasks
    .filter((task) => !visited.has(task.id))
    .sort(byPosition)
    .forEach((task) => visit(task, 0));
  return ordered;
}
