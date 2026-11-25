export type HomePanel = 'menu' | 'quest' | 'shop';
export type HomeOverlay = { kind: HomePanel } | { kind: 'diary'; id: string } | null;
export type HomeOverlayAction =
  | { type: 'open'; panel: HomePanel }
  | { type: 'toggle-menu' }
  | { type: 'select-diary'; id: string | null }
  | { type: 'close'; panel: HomePanel | 'diary' }
  | { type: 'reset' };

// One visible overlay at a time. A delayed close from the old panel must not
// dismiss a different panel the user has just opened.
export function reduceHomeOverlay(state: HomeOverlay, action: HomeOverlayAction): HomeOverlay {
  switch (action.type) {
    case 'open': return { kind: action.panel };
    case 'toggle-menu': return state?.kind === 'menu' ? null : { kind: 'menu' };
    case 'select-diary': return action.id ? { kind: 'diary', id: action.id } : state?.kind === 'diary' ? null : state;
    case 'close': return state?.kind === action.panel ? null : state;
    case 'reset': return null;
  }
}
