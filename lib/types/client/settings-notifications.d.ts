import { type SettingsCardKey } from './locales.ts';
type Permission = NotificationPermission | 'unsupported' | 'failed';
export type SettingsNotice = 'enabled' | 'disabled' | 'saved';
/** Called directly by Save, before a network await can consume user activation. */
export declare function prepareSettingsNotification(enabled: boolean): Promise<Permission>;
/** The save is already committed. Notification failures must never undo it. */
export declare function showSettingsNotification(notice: SettingsNotice, locale: string, permission: Permission): SettingsCardKey;
export {};
