import test from 'node:test';
import assert from 'node:assert/strict';
import {homeTabFromParams,homeTabHref} from '../src/lib/home-route.ts';
test('home clears all group parameters; diary/group survive reload with matching tabs',()=>{
  assert.equal(homeTabHref('home'),'/');
  for(const tab of ['diary','group']) {
    const href=homeTabHref(tab);
    assert.deepEqual(href,{pathname:'/',params:{tab}});
    assert.equal(homeTabFromParams(href.params),tab);
  }
  assert.equal(homeTabFromParams({groupId:'g',tab:'home'}),'group');
  assert.equal(homeTabFromParams({tab:'unexpected'}),'home');
  assert.equal(homeTabFromParams({}),'home');
});
