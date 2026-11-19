/**
 * Link a package into a temporary host, falling back to a copy.
 *
 * `symlinkSync` needs Developer Mode or an elevated account on Windows; without it the whole
 * `npm test` chain dies at the first harness script with
 * `EPERM: operation not permitted, symlink`. A copy is functionally equivalent for a throwaway
 * host — it only has to be importable — so the test keeps its meaning instead of being skipped.
 */
import { cpSync, existsSync, symlinkSync } from 'node:fs';

// `_type` is accepted for call-site compatibility with the old `symlinkSync(src, dest, 'dir')`.
export function linkOrCopy(source, destination, _type = 'dir') {
  if (!existsSync(source)) {
    throw new Error(`linkOrCopy: source does not exist: ${source}`);
  }
  try {
    symlinkSync(source, destination);
    return 'symlink';
  } catch (error) {
    if (error?.code !== 'EPERM' && error?.code !== 'EACCES' && error?.code !== 'ENOSYS') {
      throw error;
    }
    cpSync(source, destination, { recursive: true, dereference: true });
    return 'copy';
  }
}
