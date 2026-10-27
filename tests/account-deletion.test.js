const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const store = new Map();
let requests, mode, fileFails, receipt;
global.wx = {
  getStorageSync: k => structuredClone(store.get(k) || ''),
  setStorageSync: (k,v) => store.set(k,structuredClone(v)), removeStorageSync: k => store.delete(k),
  getStorageInfoSync: () => ({ keys: [...store.keys()], currentSize: 50, limitSize: 10240 }),
  getAccountInfoSync: () => ({ miniProgram: { envVersion: 'develop' } }), getDeviceInfo: () => ({ platform: 'devtools' }),
  login: o => o.success({ code: 'fresh-code-' + requests.length }),
  getFileSystemManager: () => ({ removeSavedFile: o => fileFails ? o.fail({ errMsg: 'disk unavailable' }) : o.success({}), unlink: o => o.success({}) }),
  request(o) {
    requests.push(o);
    if (o.url.endsWith('/auth/wechat-login')) return o.success({ statusCode: 200, data: { token:'new-fixture-token',ownerId:'delete-fixture',expiresIn:3600 } });
    if (o.url.endsWith('/auth/account-deletion-status')) return o.success({statusCode:200,data:{ownerId:'delete-fixture',confirmed:o.data.operationId===receipt}});
    if (mode === 'offline') return o.fail({ errMsg: 'request:fail' });
    if(o.method==='DELETE') receipt=o.data.operationId;
    o.success({ statusCode:200, data:{ status:'deleted', ownerId:mode==='wrong-owner'?'other-fixture':'delete-fixture' } });
  }
};
const local = require('../miniprogram/utils/local-data');
const api = require('../miniprogram/utils/api');
function seed() {
  store.clear(); requests=[]; mode='ok';fileFails=false;receipt='';
  for(const ownerId of ['delete-fixture','other-fixture']) {
    local.migrate(ownerId,{ownerId,contacts:[],relationships:[]});
    local.handle(ownerId,'/contacts','POST',{name:'虚构联系人'});
  }
  const data=local.read('delete-fixture');data.profile.avatarUrl='wxfile://saved-avatar';local.write('delete-fixture',data);
  store.set('ai-network-owner-id','delete-fixture');store.set('ai-network-auth-token','old-fixture-token');
}
test('account deletion requires server acknowledgement and only clears the current owner',async()=>{
  seed();assert.equal(typeof api.deleteAccount,'function');
  await api.deleteAccount('delete-fixture');
  assert.equal(local.read('delete-fixture'),null);
  assert.equal(local.read('other-fixture').contacts.length,1);
  assert.equal(store.get('ai-network-owner-id'),undefined);
  const deletion=requests.find(r=>r.method==='DELETE');
  assert.equal(new URL(deletion.url).pathname,'/api/me/account');
  assert.equal(deletion.data.confirmation,'注销');
  assert.match(deletion.data.code,/fresh-code/);
});
test('offline or uncertain deletion never removes local records',async()=>{
  seed();mode='offline';assert.equal(typeof api.deleteAccount,'function');
  await assert.rejects(api.deleteAccount('delete-fixture'));
  assert.equal(local.read('delete-fixture').contacts.length,1);
});
test('a response for another owner cannot authorize local deletion',async()=>{
  seed();mode='wrong-owner';assert.equal(typeof api.deleteAccount,'function');
  await assert.rejects(api.deleteAccount('delete-fixture'));
  assert.equal(local.read('delete-fixture').contacts.length,1);
});
test('local cleanup failure after server deletion can resume without another network deletion',async()=>{
  seed();fileFails=true;assert.equal(typeof api.deleteAccount,'function');
  await assert.rejects(api.deleteAccount('delete-fixture'));
  assert.equal(api.getPendingAccountDeletion(),'delete-fixture');
  await assert.rejects(api.validateSession(), /清理/);
  const count=requests.length;
  fileFails=false;
  await api.deleteAccount('delete-fixture');
  assert.equal(requests.length,count);
  assert.equal(local.read('delete-fixture'),null);
});
function securityPage() {
  let page; const modals=[];
  global.wx.showModal=o=>modals.push(o);global.wx.showToast=()=>{};
  const directory=path.join(__dirname,'../miniprogram/pages/settings-security');
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(directory,'index.js'),'utf8'),{module,exports:module.exports,wx:global.wx,Error,
    Page:p=>page=p,require:id=>require(path.resolve(directory,id))});
  page.data=structuredClone(page.data);page.setData=u=>Object.assign(page.data,u);
  return {page,modals};
}
test('cancelling account deletion does not call the backend or erase local data',async()=>{
  seed(); const {page,modals}=securityPage();await page.onShow();
  assert.equal(typeof page.beginDeletion,'function');
  const pending=page.beginDeletion();modals[0].success({confirm:false});await pending;
  assert.equal(requests.length,0);assert.equal(local.read('delete-fixture').contacts.length,1);
});
test('account deletion requires the exact typed confirmation after the first warning',async()=>{
  seed();const {page,modals}=securityPage();await page.onShow();
  assert.equal(typeof page.beginDeletion,'function');
  const pending=page.beginDeletion();modals[0].success({confirm:true});await new Promise(r=>setImmediate(r));
  assert.equal(modals[1].editable,true);modals[1].success({confirm:true,content:'错误文字'});await pending;
  assert.equal(requests.length,0);assert.equal(local.read('delete-fixture').contacts.length,1);
});
test('returning to My during pending cleanup opens the cleanup page instead of old profile data',async()=>{
  seed();fileFails=true;await assert.rejects(api.deleteAccount('delete-fixture'));
  let page, destination='';global.wx.reLaunch=o=>destination=o.url;
  const directory=path.join(__dirname,'../miniprogram/pages/me'),module={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(directory,'index.js'),'utf8'),{module,exports:module.exports,wx:global.wx,Error,
    Page:p=>page=p,require:id=>require(path.resolve(directory,id))});
  page.data=structuredClone(page.data);page.setData=u=>Object.assign(page.data,u);
  await page.onShow();
  assert.equal(destination,'/pages/settings-security/index');
});


test('a failed deletion journal reservation must prevent any server deletion',async()=>{
 seed();const original=wx.setStorageSync;wx.setStorageSync=(k,v)=>{if(k.startsWith('ai-network-deletion-confirmed:'))throw new Error('quota');original(k,v);};
 try{await assert.rejects(api.deleteAccount('delete-fixture'));assert.equal(requests.filter(r=>r.method==='DELETE').length,0);assert.equal(local.read('delete-fixture').contacts.length,1);}finally{wx.setStorageSync=original;}
});

test('a lost local acknowledgement is recovered by the same server receipt without deleting twice',async()=>{
 seed();const original=wx.setStorageSync;wx.setStorageSync=(k,v)=>{if(k.startsWith('ai-network-deletion-confirmed:')&&v.confirmed)throw new Error('disk');original(k,v);};
 try{await assert.rejects(api.deleteAccount('delete-fixture'));assert.equal(local.read('delete-fixture').contacts.length,1);}finally{wx.setStorageSync=original;}
 assert.equal(api.getPendingAccountDeletion(),'delete-fixture');await api.deleteAccount('delete-fixture');
 assert.equal(requests.filter(r=>r.method==='DELETE').length,1);assert.equal(local.read('delete-fixture'),null);
});

test('a login failure before sending deletion does not lock local offline data',async()=>{seed();const original=wx.login;wx.login=o=>o.fail({errMsg:'offline'});try{await assert.rejects(api.deleteAccount('delete-fixture'));assert.equal(api.getPendingAccountDeletion(),'');assert.equal((await api.request('/contacts')).length,1);}finally{wx.login=original;}});

test('pending account cleanup blocks fresh sessions and remote profile operations',async()=>{seed();fileFails=true;await assert.rejects(api.deleteAccount('delete-fixture'));const before=requests.length;await assert.rejects(api.ensureSession(true),/清理/);await assert.rejects(api.request('/me/import-code'),/清理/);assert.equal(requests.length,before);});
