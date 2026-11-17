/* Push only: deliberately no fetch handler, auth cache, or private diary content. */
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
function activeUser(){return new Promise(resolve=>{
 const request=indexedDB.open('star2day-group-push',1);
 request.onupgradeneeded=()=>request.result.createObjectStore('identity');
 request.onerror=()=>resolve(null);
 request.onsuccess=()=>{const db=request.result;const tx=db.transaction('identity','readonly');const get=tx.objectStore('identity').get('user');get.onsuccess=()=>resolve(get.result||null);get.onerror=()=>resolve(null);tx.oncomplete=()=>db.close();};
});}
function destination(data){
 if(typeof data.group_id!=='string'||!/^[0-9a-f-]{36}$/i.test(data.group_id))return null;
 const params=new URLSearchParams({groupId:data.group_id});
 if(data.kind==='chat')params.set('chat','1');
 if(data.kind==='diary'&&typeof data.source_id==='string'&&/^[0-9a-f-]{36}$/i.test(data.source_id))params.set('diaryId',data.source_id);
 return '/?'+params;
}
self.addEventListener('push',event=>event.waitUntil((async()=>{
 let data;try{data=event.data.json();}catch{return;}
 if(!data||data.user_id!==await activeUser()||!destination(data))return;
 await self.registration.showNotification('오늘의 별일',{body:data.kind==='chat'?'그룹에 새 메시지가 도착했어요.':'그룹에 새로운 별이 생겼어요.',
  icon:'/share-planet-v1.png',tag:'group-'+data.group_id+'-'+data.kind,data});
})()));
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{
 const data=event.notification.data;if(data?.user_id!==await activeUser())return;
 const path=destination(data);if(!path)return;
 const url=new URL(path,self.location.origin).href;
 const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 for(const client of windows){if(new URL(client.url).origin===self.location.origin){await client.navigate(url);await client.focus();return;}}
 await self.clients.openWindow(url);
})());});
