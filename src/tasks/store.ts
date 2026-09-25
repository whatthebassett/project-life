// Holds the task file in memory and writes it back. Edits show at once and
// are written shortly after (a burst of edits is one write), one write at a
// time.
import { parseFile, serialize, type Task, type TaskFile } from "./model";

export interface TaskIO {
  read: () => Promise<string | null>;
  write: (json: string) => Promise<void>;
  // Tell the other windows the file changed.
  announce: () => void;
}

// What a view renders; replaced (never mutated) on every change, so it works
// as a useSyncExternalStore snapshot.
export interface TaskState {
  tasks: Task[];
  loaded: boolean;
  error: string | null;
}

export class TaskStore {
  private file: TaskFile = { Tasks: [] };
  private state: TaskState = { tasks: [], loaded: false, error: null };
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writing: Promise<void> = Promise.resolve();
  private inFlight = 0;
  private io: TaskIO;
  private delay: number;
  // False until the file has been read successfully. Until then nothing is
  // written, so a file that couldn't be read (locked, or damaged by a hand
  // edit) is never replaced by an empty or partial list.
  private readable = false;

  constructor(io: TaskIO, delay = 250) {
    this.io = io;
    this.delay = delay;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  getState = () => this.state;

  // The file hasn't been read successfully yet (so it's worth trying again).
  unread = () => !this.readable;

  private set(next: Partial<TaskState>) {
    this.state = { ...this.state, tasks: this.file.Tasks, ...next };
    for (const l of this.listeners) l();
  }

  // Read the file. Skipped while an edit made here is still on its way to
  // disk, so another window's older copy can't undo it.
  async load(): Promise<void> {
    if (this.timer || this.inFlight) return;
    try {
      const text = await this.io.read();
      if (this.timer || this.inFlight) return;
      this.file = parseFile(text);
      this.readable = true;
      this.set({ loaded: true, error: null });
    } catch (e) {
      const why = e instanceof SyntaxError ? "the file isn't valid JSON" : String(e);
      this.set({ loaded: true, error: `Couldn't read tasks (${why}). Nothing will be changed until it can be read.` });
    }
  }

  update(change: (tasks: Task[]) => Task[]) {
    if (!this.readable) return;
    this.file = { ...this.file, Tasks: change(this.file.Tasks) };
    this.set({});
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.delay);
  }

  // Write now if anything is waiting; resolves once everything is on disk.
  flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      const json = serialize(this.file);
      this.inFlight++;
      this.writing = this.writing.then(async () => {
        try {
          await this.io.write(json);
          this.io.announce();
          if (this.state.error) this.set({ error: null });
        } catch (e) {
          this.set({ error: `Couldn't save tasks: ${String(e)}` });
        } finally {
          this.inFlight--;
        }
      });
    }
    return this.writing;
  }
}
