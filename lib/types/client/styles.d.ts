/**
 * Styles for the auto-continue settings card, injected at factory
 * materialization so the client module system's style bookkeeping (HMR) owns
 * them. Uses the DSH design tokens (`--dsw-alias-*`) so the card follows the
 * active theme.
 */
/** Inject the stylesheet once; a no-op outside a browser environment. */
export declare function injectStyles(): void;
