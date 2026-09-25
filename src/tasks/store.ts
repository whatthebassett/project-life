// The task file's store: tasks.json held in memory (lib/fileStore.ts), with
// the task list's own shortcuts on top.
import { FileStore, type FileIO } from "../lib/fileStore";
import { setCurrentLists } from "./lists";
import { parseFile, serialize, type Task, type TaskFile } from "./model";

export class TaskStore extends FileStore<TaskFile> {
  constructor(io: FileIO, delay = 250) {
    super(
      io,
      {
        what: "tasks",
        empty: parseFile(null),
        parse: parseFile,
        serialize,
        onChange: (file) => setCurrentLists(file.Lists),
      },
      delay,
    );
  }

  // Change the tasks (not the lists or the Recycle Bin).
  update(change: (tasks: Task[]) => Task[]) {
    this.change((file) => {
      const tasks = change(file.Tasks);
      return tasks === file.Tasks ? file : { ...file, Tasks: tasks };
    });
  }
}
