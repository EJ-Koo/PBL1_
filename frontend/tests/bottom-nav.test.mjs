import test from 'node:test';import assert from 'node:assert/strict';import { getBottomNavLayout, getResponsiveLayout } from '../src/lib/responsive-layout.ts';
test('three equal rectangles fit mobile and desktop while retaining outside stripes',()=>{
 for(const width of [280,320,360,390,393,600,1280,1920]){
  const s=Math.min(width/393,1.15),layout=getBottomNavLayout(width/s),items=layout.items;
  assert.equal(items.length,3);assert.equal(items[0].width,items[1].width);assert.equal(items[1].width,items[2].width);
  assert(items[0].x>=layout.stripeLeft+layout.stripeWidth);
  assert(items[2].x+items[2].width<=layout.stripeRight);
  assert(items.every(x=>x.width*s>=65));
  const responsive=getResponsiveLayout(width,844,{left:0,right:0,top:0,bottom:0});assert(responsive.navHeight>=44);
 }
});
