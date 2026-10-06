import { en, zh, type SettingsCardKey } from './locales.ts';

type Permission = NotificationPermission | 'unsupported' | 'failed';
export type SettingsNotice = 'enabled' | 'disabled' | 'saved';
let pendingPermission: Promise<Permission> | undefined;

/** Called directly by Save, before a network await can consume user activation. */
export function prepareSettingsNotification(enabled: boolean): Promise<Permission> {
  try {
    if (typeof Notification === 'undefined') return Promise.resolve('unsupported');
    if (!enabled || Notification.permission !== 'default') return Promise.resolve(Notification.permission);
    if (!pendingPermission) {
      pendingPermission = Notification.requestPermission()
        .catch((): Permission => 'failed')
        .finally(() => { pendingPermission = undefined; });
    }
    return pendingPermission;
  } catch {
    return Promise.resolve('failed');
  }
}

/** The save is already committed. Notification failures must never undo it. */
export function showSettingsNotification(notice: SettingsNotice, locale: string, permission: Permission): SettingsCardKey {
  const message: SettingsCardKey = `notification.${notice}`;
  if (permission !== 'granted') {
    // Turning alerts off must not ask for permission just to confirm the change.
    if (notice === 'disabled') return message;
    return permission === 'unsupported' ? 'notification.unsupported'
      : permission === 'failed' ? 'notification.failed' : 'notification.blocked';
  }
  try {
    const copy = locale.startsWith('en') ? en : zh;
    const notification = new Notification(copy['notification.title'], { body: copy[message] });
    notification.onclick = () => {
      try { globalThis.focus?.(); } catch { /* Focusing is best effort. */ }
    };
    return message;
  } catch {
    return notice === 'disabled' ? message : 'notification.failed';
  }
}
