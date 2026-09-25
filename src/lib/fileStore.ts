// Holds one of the Data\ JSON files in memory and writes it back. Edits show
// at once and are written shortly after (a burst of edits is one write), one
// write at a time. Ported from Checkpoint's task store, made to hold any file
// (tasks.json, events.json …).

export interface FileIO {
  read: () => Promise<string | null>;
  write: (json: string) => Promise<void>;
  // Tell the other windows the file changed.
  announce: () => void;
}

// What a view renders; replaced (never mutated) on every change, so it works
// as a useSyncExternalStore snapshot.
export interface FileState<F> {
  file: F;
  loaded: boolean;
  error: string | null;
}

export interface FileFormat<F> {
  // What the file is, for messages: "tasks".
  what: string;
  empty: F;
  // Throws when the text can't be read; nothing is saved until it can.
  parse: (text: string | null) => F;
  serialize: (file: F) => string;
  // Told about every new version (the task lists keep a copy).
  onChange?: (file: F) => void;
}

export class FileStore<F> {
  private state: FileState<F>;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writing: Promise<void> = Promise.resolve();
  private inFlight = 0;
  private io: FileIO;
  private format: FileFormat<F>;
  private delay: number;
  // False until the file has been read successfully. Until then nothing is
  // written, so a file that couldn't be read (locked, or damaged by a hand
  // edit) is never replaced by an empty or partial one.
  private readable = false;

  constructor(io: FileIO, format: FileFormat<F>, delay = 250) {
    this.io = io;
    this.format = format;
    this.delay = delay;
    this.state = { file: format.empty, loaded: false, error: null };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  getState = () => this.state;

  // The file hasn't been read successfully yet (so it's worth trying again).
  unread = () => !this.readable;

  private set(next: Partial<FileState<F>>) {
    this.state = { ...this.state, ...next };
    if (next.file) this.format.onChange?.(next.file);
    for (const l of this.listeners) l();
  }

  // Read the file. Skipped while an edit made here is still on its way to
  // disk, so another window's older copy can't undo it.
  async load(): Promise<void> {
    if (this.timer || this.inFlight) return;
    try {
      const text = await this.io.read();
      if (this.timer || this.inFlight) return;
      const file = this.format.parse(text);
      this.readable = true;
      this.set({ file, loaded: true, error: null });
    } catch (e) {
      const why = e instanceof SyntaxError ? "the file isn't valid JSON" : String(e);
      this.set({ loaded: true, error: `Couldn't read ${this.format.what} (${why}). Nothing will be changed until it can be read.` });
    }
  }

  // Change the whole file.
  change(edit: (file: F) => F) {
    if (!this.readable) return;
    const file = edit(this.state.file);
    if (file === this.state.file) return;
    this.set({ file });
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.delay);
  }

  // Write now if anything is waiting; resolves once everything is on disk.
  flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      const json = this.format.serialize(this.state.file);
      this.inFlight++;
      this.writing = this.writing.then(async () => {
        try {
          await this.io.write(json);
          this.io.announce();
          if (this.state.error) this.set({ error: null });
        } catch (e) {
          this.set({ error: `Couldn't save ${this.format.what}: ${String(e)}` });
        } finally {
          this.inFlight--;
        }
      });
    }
    return this.writing;
  }
}
