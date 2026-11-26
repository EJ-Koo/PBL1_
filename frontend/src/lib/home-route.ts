export type HomeTab = 'home' | 'diary' | 'group';
export function homeTabFromParams({tab,groupId}: {tab?:string;groupId?:string}): HomeTab {
  return groupId || tab==='group' ? 'group' : tab==='diary' ? 'diary' : 'home';
}
// Complete destination, never merge the old group's id/chat/query into a new tab.
export function homeTabHref(tab:HomeTab) {
  return tab==='home' ? '/' as const : {pathname:'/' as const,params:{tab}};
}
