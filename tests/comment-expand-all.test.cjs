const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const source = readFileSync(`${__dirname}/../dist/contentScripts/inject.global.js`, 'utf8');

// Exercise the shipped enhancement together with its existing page accumulator.
// The fixture follows the native component's contract, including swallowed API
// errors (unchanged list), zero-based page buttons and cached preview on collapse.
function setup(mode = 'pagination', tree = null, manualSchedule = false) {
  const context = vm.createContext({ assert, console, realSetTimeout: setTimeout, queueMicrotask });
  vm.runInContext(`
    const timers = [], frames = [], delays = [];
    const setTimeout = (fn, delay) => {
      delays.push(delay);
      if (${manualSchedule}) timers.push(fn);
      else return realSetTimeout(fn, 0);
    };
    const location = {href:'https://www.bilibili.com/video/test/'};
    const gt = {commentReplyPaginationMode:${JSON.stringify(mode)}};
    const te = () => ${JSON.stringify(tree)};
    const Le = new WeakMap(), Ye = new WeakMap(), qe = new WeakMap(), ts = new WeakMap();
    const ga = Symbol();
    const pe = host => host.identity;
    let idReads = 0;
    const ct = item => { idReads++; return item.rpid_str; };
    const Tt = (object, key) => Object.getOwnPropertyDescriptor(object, key);
    const X = host => Ye.set(host, (Ye.get(host) ?? 0) + 1), Vi = () => '';
    let ye = () => {};
    const requestAnimationFrame = fn => ${manualSchedule} ? frames.push(fn) : fn();
    const Node = {TEXT_NODE:3};
    class Element {
      constructor() { this.style = {}; this.children = []; this.textContent = ''; }
      append(child) { child.remove(); this.children.push(child); child.parentElement = this; }
      after(child) { this.parentElement.append(child); }
      remove() { if(this.parentElement) this.parentElement.children = this.parentElement.children.filter(c => c !== this); this.parentElement = null; }
      addEventListener(name, listener) { this[name] = listener; }
    }
    const document = {createElement: () => new Element()};
    class Host {
      constructor() {
        this.identity = '1|1|100'; this.isConnected = true; this.user = {};
        this.currentPage = 1; this.totalPage = 3; this.count = 5;
        this.showPagination = false; this.showViewMore = true;
        this.list = [{rpid_str:'1'}]; this.cacheList = []; this.calls = [];
        this.view = new Element(); this.anchor = new Element(); this.view.append(this.anchor);
        this.foot = new Element(); this.styles = new Element();
        this.shadowRoot = {
          querySelector: selector => {
            if(selector === '#view-more bili-text-button') return this.showViewMore ? this.anchor : null;
            if(selector === '#pagination-foot') return this.showPagination ? this.foot : null;
            if(selector === '#expander-contents' || selector === '#pagination-head') return null;
            return [...this.view.children, ...this.foot.children, ...this.styles.children].find(c => '#' + c.id === selector) || null;
          },
          append: child => this.styles.append(child)
        };
      }
      requestUpdate() {}
      async getList() {
        this.calls.push(this.currentPage);
        if (this.beforeRequest) await this.beforeRequest(this.currentPage);
        if (this.currentPage === this.failPage) return;
        if (this.pageFactory) { this.list = this.pageFactory(this.currentPage); return; }
        this.list = this.currentPage === 1 ? [{rpid_str:'1'}, {rpid_str:'2'}]
          : this.currentPage === 2 ? [{rpid_str:'2'}, {rpid_str:'3'}, {rpid_str:'4'}] : [{rpid_str:'5'}];
      }
      handleChangePage(item) { this.currentPage = item.idx + 1; return this.getList(); }
      get paginationItems() { return [{idx:0}]; }
      handleRevert() { this.list = this.cacheList.slice(); this.showPagination = false; this.showViewMore = true; }
      handleViewMore() { this.loginRequested = true; }
    }
  `, context);
  const helpers = source.slice(source.indexOf('// Local Safari enhancement:'), source.indexOf('const Bc={en:'));
  const accumulator = source.slice(source.indexOf('qt=function('), source.indexOf(',Pe=function('));
  vm.runInContext(`${helpers}\nconst ${accumulator}; fe(Host); const host = new Host();`, context);
  return code => vm.runInContext(code, context);
}

test('button sits next to native view control and is not duplicated', () => {
  setup()(`bewlySyncExpandAll(host); bewlySyncExpandAll(host);
    assert.equal(host.view.children.length,2);
    assert.equal(host.view.children[1].textContent,'展开所有评论');`);
});
for (const [mode, tree] of [['pagination', null], ['loadMore', 'lineKeepMain']]) {
  test(`loads every page and deduplicates replies with ${mode}`, async () => {
    await setup(mode, tree)(`(async () => {
      await bewlyRunExpandAll(host);
      assert.equal(host.calls.join(','),'1,2,3');
      assert.equal(host.list.map(ct).join(','),'1,2,3,4,5');
      assert.equal(bewlyExpandAllState.get(host).complete,true);
      assert.equal(host.foot.children[0].textContent,'已展开全部评论');
      host.handleRevert();
      assert.equal(host.list.map(ct).join(','),'1');
      assert.equal(bewlyExpandAllState.has(host),false);
    })()`);
  });
}

test('swallowed API failure retains replies and retries the missing page', async () => {
  await setup()(`(async () => {
    host.failPage=2;
    await bewlyRunExpandAll(host);
    assert.equal(host.list.map(ct).join(','),'1,2');
    assert.equal(he(host).pages.has(2),false);
    assert.equal(bewlyExpandAllState.get(host).message,'加载失败，点击重试');
    host.failPage=0;
    await bewlyRunExpandAll(host);
    assert.equal(host.calls.join(','),'1,2,2,3');
    assert.equal(host.list.map(ct).join(','),'1,2,3,4,5');
  })()`);
});

test('stop and resume; repeated clicks and native pagination cannot race', async () => {
  await setup()(`(async () => {
    host.beforeRequest=async page => {
      if(page===1) {
        await bewlyRunExpandAll(host);
        host.handleChangePage({idx:8});
        assert.equal(host.currentPage,1);
        host.foot.children[0].click({preventDefault(){},stopPropagation(){}});
      }
    };
    await bewlyRunExpandAll(host);
    assert.equal(host.calls.join(','),'1');
    assert.equal(bewlyExpandAllState.get(host).complete,false);
    host.beforeRequest=null;
    await bewlyRunExpandAll(host);
    assert.equal(host.calls.join(','),'1,2,3');
  })()`);
});

test('collapse during a request restores the preview and stops later pages', async () => {
  await setup()(`(async () => {
    host.beforeRequest=async () => host.handleRevert();
    await bewlyRunExpandAll(host);
    assert.equal(host.calls.join(','),'1');
    assert.equal(host.list.map(ct).join(','),'1');
    assert.equal(bewlyExpandAllState.has(host),false);
  })()`);
});

test('logged-out user uses the native login gate without loading replies', async () => {
  await setup()(`(async () => {
    host.user=null;
    await bewlyRunExpandAll(host);
    assert.equal(host.loginRequested,true);
    assert.equal(host.calls.length,0);
  })()`);
});

test('page navigation stops further requests', async () => {
  await setup()(`(async () => {
    host.beforeRequest=async () => { location.href += '?p=2'; };
    await bewlyRunExpandAll(host);
    assert.equal(host.calls.length,1);
    assert.equal(bewlyExpandAllState.get(host).complete,false);
  })()`);
});

test('200 pages keep ID work proportional to new replies and use shorter yields', async () => {
  await setup()(`(async () => {
    host.totalPage = 200;
    host.pageFactory = page => Array.from({length: 21}, (_, index) => ({rpid_str: String((page - 1) * 20 + index + 1)}));
    await bewlyRunExpandAll(host);
    assert.equal(host.calls.length, 200);
    assert.equal(host.list.length, 4001);
    assert.ok(idReads < 10000, 'existing replies should not be reindexed on every page: ' + idReads);
    assert.equal(host.list[0].rpid_str, '1');
    assert.equal(host.list.at(-1).rpid_str, '4001');
    assert.equal(new Set(host.list.map(ct)).size, 4001);
    assert.equal(delays.length, 199);
    assert.ok(delays.every(delay => delay === 80));
  })()`);
});

test('new and previously loaded hidden replies stay removed', async () => {
  await setup()(`(async () => {
    host.beforeRequest = async page => {
      if (page === 2) host.invisibleID = {'1':true, '3':true};
    };
    await bewlyRunExpandAll(host);
    assert.equal(host.list.map(ct).join(','), '2,4,5');
    assert.equal([...he(host).pages.values()].flat().some(reply => reply.rpid_str === '1' || reply.rpid_str === '3'), false);
  })()`);
});

test('rejected native request clears the lock and resumes from the missing page', async () => {
  await setup()(`(async () => {
    host.beforeRequest = async page => { if (page === 2) throw new Error('Network failure'); };
    await bewlyRunExpandAll(host);
    assert.equal(host.list.map(ct).join(','), '1,2');
    assert.equal(he(host).loading, undefined);
    assert.equal(he(host).pages.has(2), false);
    host.beforeRequest = null;
    await bewlyRunExpandAll(host);
    assert.equal(host.calls.join(','), '1,2,2,3');
    assert.equal(host.list.map(ct).join(','), '1,2,3,4,5');
  })()`);
});

test('ordinary pagination and load-more still honor their configured behavior', async () => {
  await setup()(`(async () => {
    await host.getList();
    await host.handleChangePage({idx:1});
    assert.equal(host.list.map(ct).join(','), '2,3,4');
    assert.equal(Le.has(host), false);
  })()`);
  await setup('loadMore', 'lineKeepMain')(`(async () => {
    await host.getList();
    await host.handleChangePage({idx:1});
    assert.equal(host.list.map(ct).join(','), '1,2,3,4');
    await host.handleChangePage({idx:0});
    assert.equal(host.list.map(ct).join(','), '1,2,3,4');
  })()`);
});

test('reply lifecycle notifications rebuild the tree once per frame', () => {
  const shippedTreeUpdate = source.slice(source.indexOf('ye=function(') + 3, source.indexOf(',lo=function('));
  setup('pagination', null, true)(`
    let renders = 0;
    const Ji = new Set(), ya = new WeakMap();
    host.removeAttribute = () => renders++;
    ye = ${shippedTreeUpdate};
    for (let i = 0; i < 1000; i++) ye(host);
    assert.equal(renders, 0);
    assert.equal(frames.length, 1);
    frames.shift()();
    assert.equal(renders, 1);
    ye(host);
    frames.shift()();
    assert.equal(renders, 2);
  `);
});

test('bulk tree rebuilds are paced and the final pending rebuild is preserved', () => {
  setup('pagination', null, true)(`
    let renders = 0;
    ye = host => { if (!bewlyDeferReplyTree(host)) renders++; };
    bewlyExpandAllState.set(host, {busy:true});
    for (let i = 0; i < 1000; i++) ye(host);
    assert.equal(timers.length, 1);
    assert.equal(delays[0], 120);
    assert.equal(frames.length, 0);
    bewlyExpandAllState.get(host).busy = false;
    ye(host);
    timers.shift()();
    frames.shift()();
    assert.equal(renders, 1);
    assert.equal(bewlyReplyTreeTasks.has(host), false);
  `);
});

test('scheduled tree work is discarded after collapse, navigation or disconnect', () => {
  for (const invalidate of ['host.handleRevert()', 'host.identity = "another thread"', 'location.href += "?p=2"', 'host.isConnected = false']) {
    setup('pagination', null, true)(`
      let renders = 0;
      ye = host => { if (!bewlyDeferReplyTree(host)) renders++; };
      ye(host);
      ${invalidate};
      frames.shift()();
      assert.equal(renders, 0);
      assert.equal(bewlyReplyTreeTasks.has(host), false);
    `);
  }
});

test('a reused host can schedule fresh tree work before an obsolete callback runs', () => {
  setup('pagination', null, true)(`
    let renders = 0;
    ye = host => { if (!bewlyDeferReplyTree(host)) renders++; };
    ye(host);
    host.identity = 'another thread';
    ye(host);
    assert.equal(frames.length, 2);
    frames.shift()();
    assert.equal(renders, 0);
    frames.shift()();
    assert.equal(renders, 1);
  `);
});
