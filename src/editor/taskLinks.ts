// To-dos sent to Tasks show a chip at the end of their line with the task's
// due day ("Today", "Sat"), read from Tasks (Notes.dc.html). Clicking it opens
// the task. Nothing is written into the note: the link lives on the task
// (its Note and NoteTodo), matched by the to-do's text.
import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface TodoLink {
  taskId: string;
  // "Today", "Sat", "Oct 3"; empty for a task with no date.
  label: string;
  tone: "danger" | "warn" | "muted";
}

export interface TaskLinksOptions {
  links: () => Map<string, TodoLink>;
  open: (taskId: string) => void;
}

export const taskLinksKey = new PluginKey<DecorationSet>("taskLinks");

// A to-do's text as the link knows it: its first paragraph, plain, with runs
// of spaces made one.
export function todoText(item: PMNode): string {
  return (item.firstChild?.textContent ?? "").replace(/\s+/g, " ").trim();
}

const calendarIcon =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3"></rect><path d="M3.5 10h17M8 3v4M16 3v4"></path></svg>';
const tasksIcon =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4"></rect><path d="m8 12 3 3 5-6"></path></svg>';

export const TaskLinks = Extension.create<TaskLinksOptions>({
  name: "taskLinks",

  addOptions() {
    return { links: () => new Map(), open: () => {} };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    const build = (doc: PMNode): DecorationSet => {
      const links = options.links();
      if (!links.size) return DecorationSet.empty;
      const found: Decoration[] = [];
      doc.descendants((node, pos) => {
        if (node.type.name !== "taskItem") return true;
        const link = links.get(todoText(node));
        const para = node.firstChild;
        if (link && para && !node.attrs.checked) {
          const at = pos + 1 + para.nodeSize - 1;
          found.push(
            Decoration.widget(
              at,
              () => {
                const chip = document.createElement("span");
                chip.className = `todo-task-chip tone-${link.tone}`;
                chip.contentEditable = "false";
                chip.title = "Open in Tasks";
                chip.setAttribute("role", "button");
                chip.innerHTML = `${link.label ? calendarIcon : tasksIcon}<span>${link.label || "In Tasks"}</span>`;
                chip.addEventListener("mousedown", (e) => e.preventDefault());
                chip.addEventListener("click", (e) => {
                  e.preventDefault();
                  options.open(link.taskId);
                });
                return chip;
              },
              { side: 1, key: `${link.taskId}:${link.label}:${link.tone}`, ignoreSelection: true },
            ),
          );
        }
        return true;
      });
      return DecorationSet.create(doc, found);
    };
    return [
      new Plugin<DecorationSet>({
        key: taskLinksKey,
        state: {
          init: (_, state) => build(state.doc),
          apply: (tr, old) => (tr.docChanged || tr.getMeta(taskLinksKey) ? build(tr.doc) : old),
        },
        props: {
          decorations: (state) => taskLinksKey.getState(state),
        },
      }),
    ];
  },
});
