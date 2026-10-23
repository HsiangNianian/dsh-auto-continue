/**
 * Auto-continue glyph.
 *
 * Prefers the host's own icon so the composer label matches the surrounding
 * DSH chrome; older hosts without the primitives module get an equivalent
 * inline stroke icon. The icon stays visible when the label text is hidden at
 * narrow widths.
 */
import type { ComponentType } from 'react';

interface IconProps {
  className?: string;
}

const primitives = (() => {
  try {
    return require('@deepseek-ai/dsh-client-ui-primitives') as {
      IconRefreshOutlineRegular?: ComponentType<IconProps>;
    };
  } catch {
    return {};
  }
})();

const HostRefresh = primitives.IconRefreshOutlineRegular;

export function AutoContinueIcon() {
  if (HostRefresh) return <HostRefresh />;
  return (
    <svg className="dshAcComposerIconFallback" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M13.25 8a5.25 5.25 0 1 1-1.54-3.71" />
      <path d="M13.25 3.1v3.3h-3.3" />
    </svg>
  );
}
