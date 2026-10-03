export const MOBILE_WORKSPACE_FLUSH_EVENT = 'manufeo:flush-mobile-workspace';
export type WorkspaceFlushRequest = { resolve: () => void; reject: (error: Error) => void };

/** Wait for the cloud bridge before a reload can replace pending local edits. */
export function flushMobileWorkspace() {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('La sauvegarde est encore en attente. Réessayez sans fermer cet écran.')), 20_000);
    window.dispatchEvent(new CustomEvent<WorkspaceFlushRequest>(MOBILE_WORKSPACE_FLUSH_EVENT, { detail: {
      resolve: () => { window.clearTimeout(timer); resolve(); },
      reject: error => { window.clearTimeout(timer); reject(error); },
    } }));
  });
}
