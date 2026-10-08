export const MOBILE_WORKSPACE_FLUSH_EVENT = 'manufeo:flush-mobile-workspace';
export type WorkspaceFlushScope = { entity: 'quote' | 'invoice' | 'customer'; id: string };
export type WorkspaceFlushRequest = { scope?: WorkspaceFlushScope; resolve: () => void; reject: (error: Error) => void };

/** Wait for the cloud bridge before a reload can replace pending local edits. */
export function flushMobileWorkspace(scope?: WorkspaceFlushScope) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('La sauvegarde est encore en attente. Réessayez sans fermer cet écran.')), 20_000);
    window.dispatchEvent(new CustomEvent<WorkspaceFlushRequest>(MOBILE_WORKSPACE_FLUSH_EVENT, { detail: {
      scope,
      resolve: () => { window.clearTimeout(timer); resolve(); },
      reject: error => { window.clearTimeout(timer); reject(error); },
    } }));
  });
}
