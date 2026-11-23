import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../site/assets/institution-v3/note-insights.js',import.meta.url),'utf8'),context);
const stats=vm.runInContext('issueStats',context),state=vm.runInContext('issueState',context);
const note=(id,fields={})=>({id,bank:'众安银行',theme:'开户与办卡',sentiment:'中评',comments:3,likes:2,engage:7,...fields});
test('issue counts are independent of sentiment and exclude irrelevant records',()=>{
  const rows=[note('a',{sentiment:'差评',issue:{status:'no'}}),note('b',{issue:{status:'yes'}}),note('c',{sentiment:'好评',issue:{status:'yes'}}),note('d',{theme:'不相关',issue:{status:'yes'}}),note('b',{issue:{status:'yes'}})];
  const r=stats(rows,'众安银行');
  assert.equal(r.count,2);assert.equal(r.related,3);assert.equal(r.comments,6);assert.equal(r.share,2/3);
});
test('unreviewed history is missing, not zero; incomplete coverage suppresses ratio',()=>{
  assert.equal(state(note('a')),'unreviewed');
  const old=stats([note('a')],'众安银行');assert.equal(old.count,null);assert.equal(old.share,null);assert.equal(old.pending,1);
  const partial=stats([note('a'),note('b',{issue:{status:'yes'}})],'众安银行');
  assert.equal(partial.count,1);assert.equal(partial.share,null);
});
test('uncertain feedback is visible separately and not counted as a confirmed issue',()=>{
  const r=stats([note('a',{issue:{status:'unclear'}}),note('b',{issue:{status:'no'}})],'众安银行');
  assert.equal(r.count,0);assert.equal(r.unclear,1);assert.equal(r.pending,0);assert.equal(r.share,0);
});
