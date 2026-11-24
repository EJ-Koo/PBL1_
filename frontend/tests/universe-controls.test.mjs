import test from 'node:test';import assert from 'node:assert/strict';
import { controlsFor, limitDiaryZoom, rotateView, zoomView } from '../src/lib/universe-controls.ts';
test('home and all groups share angle and zoom within one login, while accounts stay isolated',()=>{
 const home=controlsFor('test:home'),a=controlsFor('test:group:a'),b=controlsFor('test:group:b');
 assert.equal(home,a);assert.equal(home,b);
 rotateView(home,25,10,1.2);zoomView(home,.8);
 assert.equal(a.zoom,.8);assert.equal(b.yaw,.3);
 rotateView(a,30,-20,.5);zoomView(a,1.4);assert.equal(home.zoom,a.zoom);
 assert.equal(controlsFor('test:group:a'),a);assert.equal(controlsFor('test:home').zoom,.8*1.4);
 assert.deepEqual(controlsFor('new-session:group:a'),{yaw:0,pitch:0,zoom:1});
});
test('pinch is proportional, zoom and vertical rotation have shared bounds',()=>{
 const view=controlsFor('limits:home');zoomView(view,100/200);assert.equal(view.zoom,.5);
 zoomView(view,.0001);assert.equal(view.zoom,.25);zoomView(view,1000);assert.equal(view.zoom,5);
 rotateView(view,0,100000,1);assert.equal(view.pitch,Math.PI/2);
 rotateView(view,0,-100000,1);assert.equal(view.pitch,-Math.PI/2);
});

test('opening a diary limits extreme zoom without moving angle or zooming in from a distant view', () => {
 const view={yaw:1,pitch:.3,zoom:.25};limitDiaryZoom(view);
 assert.deepEqual(view,{yaw:1,pitch:.3,zoom:.6});
 zoomView(view,.5);limitDiaryZoom(view);assert.equal(view.zoom,.6);
 view.zoom=2;limitDiaryZoom(view);assert.equal(view.zoom,2);
});
