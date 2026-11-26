import test from 'node:test';
import assert from 'node:assert/strict';
import { CONSTELLATION_TEMPLATES, GROUP_CONSTELLATION_TEMPLATES, groupTopicStatuses, drawableConnections, selectMembers, layoutConstellation } from '../src/lib/constellation.ts';
import { groupPreviewLayout } from '../src/lib/group-preview-layout.ts';

test('every group shape keeps its original outline with exactly triple the distinct stars', () => {
  for (const [topic,templates] of Object.entries(GROUP_CONSTELLATION_TEMPLATES)) for (let i=0;i<templates.length;i++) {
    const shape=templates[i],base=CONSTELLATION_TEMPLATES[topic][i];
    assert.equal(shape.points.length,base.points.length*3);
    assert.equal(shape.requiredPlanets,shape.points.length);
    assert.deepEqual(shape.points.slice(0,base.points.length),base.points);
    assert.equal(new Set(shape.points.map(p=>p.join(','))).size,shape.points.length);
    const lines=drawableConnections(shape);
    assert.equal(lines.length,shape.connections.length,'group lines must not be truncated at 40');
    assert.ok(lines.length<=120);
    const connected=new Set(lines.flat());
    assert.equal(connected.size,shape.points.length);
    assert.ok(shape.points.every(p=>p.every(Number.isFinite)));
  }
});
test('group topics combine authors but never borrow the viewer topic or count unknown topics', () => {
  const entries=Array.from({length:60},(_,i)=>({id:String(i),authorId:i%2?'friend':'me',topic:'travel',createdAt:i}));
  entries.push({id:'unknown',topic:null},{id:'other',topic:'other'});
  for (const [count,level] of [[14,0],[15,1],[29,1],[30,2],[59,2],[60,3]]) {
    const status=groupTopicStatuses(entries.slice(0,count)).find(s=>s.topic==='travel');
    assert.equal(status.highest?.level??0,level);
  }
  const statuses=groupTopicStatuses(entries);
  assert.equal(statuses.find(s=>s.topic==='travel').count,60);
  assert.equal(statuses.find(s=>s.topic==='other').count,1);
  assert.equal(selectMembers(entries,'travel',60).length,60);
  assert.equal(new Set(selectMembers(entries,'travel',60).map(e=>e.authorId)).size,2);
});
test('dense group shapes retain non-overlapping planet spacing and fit viewports', () => {
  for (const templates of Object.values(GROUP_CONSTELLATION_TEMPLATES)) for (const shape of templates) {
    const radii=shape.points.map(()=>.28);
    const layout=layoutConstellation(shape,radii,{aspect:1.8,fovDeg:50,insetTop:.15,insetBottom:.2,insetLeft:.35,insetRight:.04});
    assert.equal(layout.targets.length,shape.requiredPlanets);
    assert.ok(Number.isFinite(layout.cameraDistance));
    for(let i=0;i<layout.targets.length;i++) for(let j=i+1;j<layout.targets.length;j++) {
      assert.ok(Math.hypot(...layout.targets[i].map((v,k)=>v-layout.targets[j][k]))>=.56*1.7-1e-6);
    }
  }
});
test('group card frames all actual 3D positions with margins, including rings and outliers', () => {
  const items=[{position:[-20,-5,-10],radius:.3,ring:true},{position:[40,20,18],radius:.5},{position:[0,0,0],radius:.2}];
  for(const aspect of [.6,1.77,3]) {
    const {center,distance}=groupPreviewLayout(items,aspect);
    const tan=Math.tan(25*Math.PI/180);
    for(const item of items) {
      const depth=distance-(item.position[2]-center[2]);
      const r=item.radius*(item.ring?2.2:1.15);
      assert.ok((Math.abs(item.position[0]-center[0])+r)/(depth*tan*aspect)<=.76+1e-8);
      assert.ok((Math.abs(item.position[1]-center[1])+r)/(depth*tan)<=.76+1e-8);
    }
  }
  assert.ok(groupPreviewLayout([{position:[1,1,1],radius:.3}],1.77).distance>=3);
});
