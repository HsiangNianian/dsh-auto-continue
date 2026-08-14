/**
 * Staged form model behind the plugin settings card — a self-contained
 * implementation of the plugin-card store pattern used by the DSH plugin
 * configuration section.
 *
 * A card stages what the user types and writes it only when they save. Each
 * settings write is a durable, revision-fenced document mutation, so staging
 * keeps what is on screen exactly what a save would store. A field shows its
 * effective value — the user layer over the composition layer over the schema
 * default — and whether the user layer carries it (presence, not value
 * equality, marks an override).
 */
import type { SettingsScope, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';

/** The write one field's staged text performs when the card is saved. */
export type FieldWrite = { kind: 'set'; value: unknown } | { kind: 'clear' };

/** How one field converts between its stored value and its draft text. */
export interface CardFieldSpec {
  /** Field name inside the namespace section. */
  field: string;
  /** Render a stored value as draft text; the empty string when the section carries none. */
  format: (value: unknown) => string;
  /**
   * The write this draft text stages, or undefined when the text is not a
   * value this field accepts — which blocks the save rather than discarding it.
   */
  parse: (text: string) => FieldWrite | undefined;
}

/** One field as the card's control renders it. */
export interface CardFieldState {
  /** Draft text the control renders. */
  text: string;
  /** Whether saving would leave a user-layer entry for this field. */
  overridden: boolean;
  /** Whether the draft is not a value this field accepts, which blocks saving. */
  invalid: boolean;
}

/** Form state every plugin card shares. */
export interface CardShell {
  /** False while the namespace is not served to this client; the card renders nothing. */
  available: boolean;
  /** Whether the Host document accepts writes. */
  writable: boolean;
  /** Whether the form holds edits that a save would write. */
  dirty: boolean;
  /** Whether any staged draft is invalid, which blocks the save. */
  invalid: boolean;
  /** Whether a save is crossing the wire. */
  saving: boolean;
  /** Whether the last save did not land as staged; cleared by the next edit or save. */
  failed: boolean;
}

/** The write actions the card's slot entry injects. */
export interface CardActions {
  /** Stage draft text for one field. */
  edit: (field: string, text: string) => void;
  /** Stage a clear, so saving lets the field re-inherit the composition layer. */
  resetField: (field: string) => void;
  /** Write every staged edit, then re-seed from what the Host accepted. */
  save: () => void;
  /** Drop every staged edit. */
  discard: () => void;
}

/** A whole-number field. An empty draft clears the field; a non-number or out-of-range draft blocks the save. */
export function numberField(field: string, min = 0): CardFieldSpec {
  return {
    field,
    format: (value) => (typeof value === 'number' ? String(value) : ''),
    parse: (text) => {
      const trimmed = text.trim();
      if (trimmed === '') return { kind: 'clear' };
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min) return undefined;
      return { kind: 'set', value: parsed };
    },
  };
}

/** A free-text field. An empty draft clears the field, so emptying the control and saving is the same gesture as resetting it. */
export function textField(field: string): CardFieldSpec {
  return {
    field,
    format: (value) => (typeof value === 'string' ? value : ''),
    parse: (text) => {
      const trimmed = text.trim();
      return trimmed === '' ? { kind: 'clear' } : { kind: 'set', value: trimmed };
    },
  };
}

/** A boolean field, edited through true/false draft text; an empty draft inherits. */
export function booleanField(field: string): CardFieldSpec {
  return {
    field,
    format: (value) => (typeof value === 'boolean' ? String(value) : ''),
    parse: (text) => {
      const trimmed = text.trim();
      if (trimmed === '') return { kind: 'clear' };
      if (trimmed === 'true') return { kind: 'set', value: true };
      if (trimmed === 'false') return { kind: 'set', value: false };
      return undefined;
    },
  };
}

/** One field's staged edit. */
interface StagedEdit {
  /** Draft text the control renders. */
  text: string;
  /** True when this edit clears the field whatever text it shows. */
  clear: boolean;
}

/**
 * Stages one card's edits over one settings namespace and writes them on save.
 *
 * The Host is the only authority on whether a value was accepted, so the
 * outcome is read back from the section rather than predicted here. A save
 * that did not land keeps its drafts, so the user can correct them instead of
 * retyping.
 */
export class CardForm<T> {
  private readonly specs: Map<string, CardFieldSpec>;
  private readonly staged = new Map<string, StagedEdit>();
  private readonly listeners = new Set<() => void>();
  private saving = false;
  private failed = false;

  /**
   * @param scope - the bound settings scope for this card's namespace.
   * @param specs - the section fields this card edits.
   */
  constructor(
    private readonly scope: SettingsScope<T>,
    specs: CardFieldSpec[],
  ) {
    this.specs = new Map(specs.map((spec) => [spec.field, spec]));
    this.scope.subscribe(() => this.publish());
  }

  /** Publish a projection of this form, rebuilt whenever the scope or a draft changes. */
  bind<S>(project: () => S, createStore: (init: S) => SnapshotStore<S>): SnapshotStore<S> {
    const store = createStore(project());
    this.listeners.add(() => store.set(project()));
    return store;
  }

  /** Read the card-level state: what the Host serves, and what a save would do. */
  shell(): CardShell {
    const snapshot = this.scope.getSnapshot();
    return {
      available: snapshot.status === 'ready',
      writable: snapshot.writable,
      dirty: this.plan().length > 0,
      invalid: this.plan().some((item) => item.run === undefined),
      saving: this.saving,
      failed: this.failed,
    };
  }

  /** Read one field's state from the effective section and its staged draft. */
  field(field: string): CardFieldState {
    const spec = this.specOf(field);
    const staged = this.staged.get(field);
    if (staged === undefined) {
      return {
        text: spec.format(this.sectionValue(field)),
        overridden: this.stored(field),
        invalid: false,
      };
    }
    const write = staged.clear ? { kind: 'clear' as const } : spec.parse(staged.text);
    return {
      text: staged.text,
      overridden: write?.kind === 'set',
      invalid: write === undefined,
    };
  }

  /** The actions the card's slot registration injects. */
  actions(): CardActions {
    return {
      edit: (field, text) => this.stage(field, { text, clear: false }),
      resetField: (field) => {
        this.stage(field, { text: this.specOf(field).format(this.baseValue(field)), clear: true });
      },
      save: () => void this.save(),
      discard: () => {
        if (this.staged.size === 0 && !this.failed) return;
        this.staged.clear();
        this.failed = false;
        this.publish();
      },
    };
  }

  /**
   * Write every staged edit, then re-seed from what the Host accepted.
   * @returns settlement after every write and the read-back.
   */
  async save(): Promise<void> {
    const plan = this.plan();
    const writes = plan.flatMap((item) => (item.run === undefined ? [] : [item.run]));
    if (plan.length === 0 || this.saving || writes.length !== plan.length) return;
    // Snapshot the fields this save writes, so edits staged while it is in
    // flight survive: only the staged keys this save actually wrote are cleared.
    const fields = new Set(plan.map((item) => item.field));
    this.saving = true;
    this.failed = false;
    this.publish();
    let landed = true;
    for (const write of writes) {
      landed = (await write()) && landed;
    }
    if (landed) {
      for (const field of fields) this.staged.delete(field);
    }
    this.saving = false;
    this.failed = !landed;
    this.publish();
  }

  /**
   * Every staged edit a save would write. An entry whose draft is not a value
   * its field accepts carries no write: the form is still dirty, and the save
   * refuses rather than dropping the edit. A staged edit that matches the
   * effective section is not a write at all.
   */
  private plan(): { field: string; run: (() => Promise<boolean>) | undefined }[] {
    const plan: { field: string; run: (() => Promise<boolean>) | undefined }[] = [];
    for (const [field, staged] of this.staged) {
      const spec = this.specOf(field);
      if (staged.clear) {
        if (this.stored(field)) plan.push({ field, run: () => this.clear(field) });
        continue;
      }
      if (staged.text === spec.format(this.sectionValue(field))) continue;
      const write = spec.parse(staged.text);
      if (write === undefined) plan.push({ field, run: undefined });
      else if (write.kind === 'clear') plan.push({ field, run: () => this.clear(field) });
      else plan.push({ field, run: () => this.store(field, write.value) });
    }
    return plan;
  }

  private async clear(field: string): Promise<boolean> {
    await this.scope.unset(field);
    return !this.stored(field);
  }

  private async store(field: string, value: unknown): Promise<boolean> {
    await this.scope.set(field, value);
    return this.userLayer()?.[field] === value;
  }

  private stage(field: string, edit: StagedEdit): void {
    this.staged.set(field, edit);
    this.failed = false;
    this.publish();
  }

  private specOf(field: string): CardFieldSpec {
    const spec = this.specs.get(field);
    if (spec === undefined) throw new Error(`settings card has no field ${field}`);
    return spec;
  }

  private sectionValue(field: string): unknown {
    return (this.scope.getSnapshot().value as Record<string, unknown> | undefined)?.[field];
  }

  private baseValue(field: string): unknown {
    return (this.scope.getSnapshot().base as Record<string, unknown> | undefined)?.[field];
  }

  private userLayer(): Record<string, unknown> | undefined {
    return this.scope.getSnapshot().user as Record<string, unknown> | undefined;
  }

  private stored(field: string): boolean {
    const user = this.userLayer();
    return user !== undefined && Object.prototype.hasOwnProperty.call(user, field);
  }

  private publish(): void {
    for (const listener of this.listeners) listener();
  }
}
