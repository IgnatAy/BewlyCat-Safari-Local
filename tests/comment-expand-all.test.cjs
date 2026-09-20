const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const source = readFileSync(`${__dirname}/../dist/contentScripts/inject.global.js`, 'utf8');

// Exercise the shipped enhancement together with its existing page accumulator.
// The fixture follows the native component's contract, including swallowed API
// errors (unchanged list), zero-based page buttons and cached preview on collapse.
function setup(mode = 'pagination', tree = null) {
  const context = vm.createContext({ assert, console, setTimeout: fn => setTimeout(fn, 0) });
  vm.runInContext(`
    const location = {href:'https://www.bilibili.com/video/test/'};
    const gt = {commentReplyPaginationMode:${JSON.stringify(mode)}};
    const te = () => ${JSON.stringify(tree)};
    const Le = new WeakMap(), Ye = new WeakMap(), qe = new WeakMap(), ts = new WeakMap();
    const ga = Symbol();
    const pe = host => host.identity;
    const ct = item => item.rpid_str;
    const Tt = (object, key) => Object.getOwnPropertyDescriptor(object, key);
    const X = () => {}, ye = () => {}, Vi = () => '';
    const requestAnimationFrame = fn => fn();
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
