interface OrderedItem {
  id: string;
}

export function reorderItemsById<T extends OrderedItem>(
  items: readonly T[],
  activeId: string,
  overId: string,
): T[] {
  const activeIndex = items.findIndex((item) => item.id === activeId);
  const overIndex = items.findIndex((item) => item.id === overId);
  if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) {
    return [...items];
  }
  const reordered = [...items];
  const [active] = reordered.splice(activeIndex, 1);
  if (!active) {
    return [...items];
  }
  reordered.splice(overIndex, 0, active);
  return reordered;
}

export function nextItemIdAfterMove(
  items: readonly OrderedItem[],
  activeId: string,
  overId: string,
): string | null {
  const reordered = reorderItemsById(items, activeId, overId);
  const activeIndex = reordered.findIndex((item) => item.id === activeId);
  return reordered[activeIndex + 1]?.id ?? null;
}
