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
export type FieldWrite = {
    kind: 'set';
    value: unknown;
} | {
    kind: 'clear';
};
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
export declare function numberField(field: string, min?: number): CardFieldSpec;
/** A free-text field. An empty draft clears the field, so emptying the control and saving is the same gesture as resetting it. */
export declare function textField(field: string): CardFieldSpec;
/** A boolean field, edited through true/false draft text; an empty draft inherits. */
export declare function booleanField(field: string): CardFieldSpec;
/**
 * Stages one card's edits over one settings namespace and writes them on save.
 *
 * The Host is the only authority on whether a value was accepted, so the
 * outcome is read back from the section rather than predicted here. A save
 * that did not land keeps its drafts, so the user can correct them instead of
 * retyping.
 */
export declare class CardForm<T> {
    private readonly scope;
    private readonly specs;
    private readonly staged;
    private readonly listeners;
    private saving;
    private failed;
    /**
     * @param scope - the bound settings scope for this card's namespace.
     * @param specs - the section fields this card edits.
     */
    constructor(scope: SettingsScope<T>, specs: CardFieldSpec[]);
    /** Publish a projection of this form, rebuilt whenever the scope or a draft changes. */
    bind<S>(project: () => S, createStore: (init: S) => SnapshotStore<S>): SnapshotStore<S>;
    /** Read the card-level state: what the Host serves, and what a save would do. */
    shell(): CardShell;
    /** Read one field's state from the effective section and its staged draft. */
    field(field: string): CardFieldState;
    /** The actions the card's slot registration injects. */
    actions(): CardActions;
    /**
     * Write every staged edit, then re-seed from what the Host accepted.
     * @returns settlement after every write and the read-back.
     */
    save(): Promise<void>;
    /**
     * Every staged edit a save would write. An entry whose draft is not a value
     * its field accepts carries no write: the form is still dirty, and the save
     * refuses rather than dropping the edit. A staged edit that matches the
     * effective section is not a write at all.
     */
    private plan;
    private clear;
    private store;
    private stage;
    private specOf;
    private sectionValue;
    private baseValue;
    private userLayer;
    private stored;
    private publish;
}
