import { useMemo, useState } from 'react';
import { allTopicStatus, groupTopicStatuses, selectMembers } from '@/lib/constellation';
import type { DiaryTopic } from '@/lib/special-planet';
import type { DiaryEntry } from '@/store/diary-context';
export function useGroupConstellation(entries: DiaryEntry[], scope: 'group' | 'member' = 'group') {
  const [enabled,setEnabledState]=useState(false);
  const [selectedTopic,setSelectedTopic]=useState<DiaryTopic|null>(null);
  const [templateId,setTemplateId]=useState<string|null>(null);
  const [collapsed,setCollapsed]=useState(false);
  const [panelHeight,setPanelHeight]=useState(0);
  const [frontViewRequest,setFrontViewRequest]=useState(0);
  const statuses=useMemo(()=>scope==='member'?allTopicStatus(entries):groupTopicStatuses(entries),[entries,scope]);
  const best=[...statuses].sort((a,b)=>(b.highest?.level??0)-(a.highest?.level??0)||b.count-a.count)[0];
  const topic=selectedTopic??best.topic;
  const status=statuses.find(item=>item.topic===topic)!;
  const template=status.levels.find(item=>item.unlocked&&item.template.id===templateId)?.template??null;
  const members=useMemo(()=>template?selectMembers(entries,template.topic,template.requiredPlanets):[],[entries,template]);
  const selectTopic=(next:DiaryTopic)=>{setSelectedTopic(next);setTemplateId(null);};
  const setEnabled=(next:boolean)=>{setEnabledState(next);setTemplateId(null);if(next)setCollapsed(false);};
  const selectTemplate=(id:string)=>{
    const chosen=status.levels.find(item=>item.unlocked&&item.template.id===id)?.template;
    if(chosen){setSelectedTopic(chosen.topic);setTemplateId(id);}
  };
  return {enabled,setEnabled,topic,statuses,template,members,collapsed,setCollapsed,panelHeight,setPanelHeight,frontViewRequest,
    front:()=>setFrontViewRequest(n=>n+1),selectTopic,selectTemplate};
}
