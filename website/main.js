const views = {
  board: {
    question: "What is moving forward?",
    description: "Move work through a workflow that fits your project. " +
      "Drag a task, check its steps, and see what is ready next.",
    alt: "Trolley Board with the synthetic community garden project, " +
      "workflow columns, and task cards",
  },
  timeline: {
    question: "When does it happen?",
    description: "Give work a place in time. Adjust start and due dates, " +
      "see dependencies, and plan around your working days.",
    alt: "Trolley Timeline with scheduled demo tasks, date bars, " +
      "milestones, and dependency connectors",
  },
  matrix: {
    question: "What deserves your attention?",
    description: "Separate urgency from importance. Move a task between " +
      "quadrants to decide what to do, schedule, delegate, or leave behind.",
    alt: "Trolley Eisenhower Matrix with urgency rows and importance " +
      "columns showing the synthetic demo project",
  },
  list: {
    question: "What needs a closer look?",
    description: "Review the details side by side. Sort, select, and " +
      "update tasks together when you need a focused project overview.",
    alt: "Trolley List showing demo task statuses, priorities, " +
      "quadrants, assignees, dates, and progress",
  },
};
const tabs = Array.from(document.querySelectorAll("[data-view]"));
const image = document.querySelector("#view-image");
const imageDirectory = new URL(".", image.src);

/** Select a preview tab and update its accessible panel.
 *
 * Args:
 *     tab: The button for the requested app view.
 * Returns:
 *     undefined: Update the visible preview in place.
 */
function selectView(tab) {
  const key = tab.dataset.view;
  const view = views[key];
  tabs.forEach((candidate) => {
    candidate.setAttribute("aria-selected", String(candidate === tab));
    candidate.tabIndex = candidate === tab ? 0 : -1;
  });
  document.querySelector("#view-panel").setAttribute(
    "aria-labelledby", tab.id,
  );
  image.src = new URL(`${key}.jpg`, imageDirectory).href;
  image.alt = view.alt;
  document.querySelector("#view-question").textContent = view.question;
  document.querySelector("#view-description").textContent = view.description;
}

for (const tab of tabs) {
  tab.addEventListener("click", () => selectView(tab));
  tab.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    let index = tabs.indexOf(tab);
    if (event.key === "ArrowRight") index = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") {
      index = (index + tabs.length - 1) % tabs.length;
    } else if (event.key === "Home") index = 0;
    else if (event.key === "End") index = tabs.length - 1;
    else return;
    event.preventDefault();
    selectView(tabs[index]);
    tabs[index].focus();
  });
}
