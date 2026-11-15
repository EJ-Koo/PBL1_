import test from 'node:test';import assert from 'node:assert/strict';
import { controlsFor, rotateView, zoomView } from '../src/lib/universe-controls.ts';
test('home and groups use equal drag and proportional zoom, with independent saved views',()=>{
 const home=controlsFor('test:home'),a=controlsFor('test:group:a'),b=controlsFor('test:group:b');
 rotateView(home,25,10,1.2);rotateView(a,25,10,1.2);zoomView(home,.8);zoomView(a,.8);
 assert.deepEqual(home,a);assert.deepEqual(b,{yaw:0,pitch:0,zoom:1});
 rotateView(a,30,-20,.5);zoomView(a,1.4);assert.notDeepEqual(home,a);
 assert.equal(controlsFor('test:group:a'),a);assert.equal(controlsFor('test:home').zoom,.8);
 assert.deepEqual(controlsFor('new-session:group:a'),{yaw:0,pitch:0,zoom:1});
});
test('pinch is proportional, zoom and vertical rotation have shared bounds',()=>{
 const view=controlsFor('test:limits');zoomView(view,100/200);assert.equal(view.zoom,.5);
 zoomView(view,.0001);assert.equal(view.zoom,.25);zoomView(view,1000);assert.equal(view.zoom,5);
 rotateView(view,0,100000,1);assert.equal(view.pitch,Math.PI/2);
 rotateView(view,0,-100000,1);assert.equal(view.pitch,-Math.PI/2);
});
