import type {DiaryTopic} from './special-planet';

/** Filtering never deletes entries or changes saved colors/coordinates/read state. */
export function starFocusIds(entries:readonly {id:string;topic?:DiaryTopic|null;authorId?:string}[],topic:DiaryTopic|null|undefined,members?:readonly string[],authorId?:string|null) {
  if(members)return new Set(members);
  return topic||authorId?new Set(entries.filter(entry=>(!topic||entry.topic===topic)&&(!authorId||entry.authorId===authorId)).map(entry=>entry.id)):null;
}
