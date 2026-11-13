/**
 * Auto-continue glyph: a single-stroke infinity loop.
 *
 * Deliberately not the host's refresh icon. Refresh reads as "start over",
 * auto-continue means "keep going without stopping" (#86). Drawn on a 16px grid
 * with a 2px margin so both loops stay distinct at 14px.
 */
export function AutoContinueIcon() {
  return (
    <svg className="dshAcGlyph" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 8C7 5.6 6.1 4.6 4.8 4.6C3.1 4.6 2 6.1 2 8C2 9.9 3.1 11.4 4.8 11.4C6.1 11.4 7 10.4 8 8C9 5.6 9.9 4.6 11.2 4.6C12.9 4.6 14 6.1 14 8C14 9.9 12.9 11.4 11.2 11.4C9.9 11.4 9 10.4 8 8Z" />
    </svg>
  );
}
