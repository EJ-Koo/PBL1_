import type {DiaryTopic} from './special-planet';

/** Filtering never deletes entries or changes saved colors/coordinates/read state. */
export function starFocusIds(entries:readonly {id:string;topic?:DiaryTopic|null}[],topic:DiaryTopic|null|undefined,members?:readonly string[]) {
  if(members)return new Set(members);
  return topic?new Set(entries.filter(entry=>entry.topic===topic).map(entry=>entry.id)):null;
}
