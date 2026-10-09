import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import vm from 'node:vm';
import ts from 'typescript';

const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function harness() {
  const slots = []; const effects = []; const reads = []; const errors = [];
  let cursor = 0; let callback; let writes = 0;
  const auth = { currentUser: null };
  const jsx = (type, props) => ({ type, props });
  const hooks = {
    createContext: () => ({ Provider: 'provider' }),
    useContext: value => value,
    useState(value) {
      const index = cursor++;
      slots[index] ??= { value };
      return [slots[index].value, next => { writes++; slots[index].value = typeof next === 'function' ? next(slots[index].value) : next; }];
    },
    useRef(value) {
      const index = cursor++;
      slots[index] ??= { current: value };
      return slots[index];
    },
    useCallback(fn, deps) {
      const index = cursor++;
      if (!slots[index] || deps.some((value, at) => !Object.is(value, slots[index].deps[at]))) slots[index] = { value: fn, deps };
      return slots[index].value;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!slots[index] || deps.some((value, at) => !Object.is(value, slots[index].deps[at]))) {
        slots[index]?.cleanup?.();
        slots[index] = { deps };
        effects.push(() => { slots[index].cleanup = effect(); });
      }
    },
  };
  const imports = {
    react: hooks,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'firebase/auth': { onAuthStateChanged: (_auth, fn) => { callback = fn; return () => { callback = undefined; }; } },
    '@/lib/utils/operationalClient': {
      doc: (_db, collection, id) => ({ collection, id }),
      getDoc(ref) { const request = { ...ref, ...deferred() }; reads.push(request); return request.promise; },
    },
    '@/lib/configs/firebase': { auth, db: {} },
    '@/lib/utils/onboardingState': { resolveOnboardingComplete: value => value !== false },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./AuthContext.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: name => imports[name], console: { error: (...args) => errors.push(args) } });
  const render = () => { cursor = 0; return exports.AuthProvider({ children: null }).props.value; };
  render(); effects.splice(0).forEach(effect => effect());
  return {
    reads, errors, auth, render,
    get writes() { return writes; },
    emit(user) { auth.currentUser = user; return callback(user); },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
    settle(collection, id, value, index = 0) {
      const request = reads.filter(read => read.collection === collection && read.id === id)[index];
      assert.ok(request, `${collection}/${id} read should have started`);
      request.resolve({ data: () => ({ onboardingComplete: value }), exists: () => Boolean(value) });
    },
  };
}

const user = (uid, email = `${uid}@example.test`) => ({ uid, email, reload: async () => {} });

test('profile and admin startup checks begin together and both must finish before routes render', async () => {
  const h = harness(); const pending = h.emit(user('owner'));
  assert.deepEqual(h.reads.map(read => read.collection), ['users', 'admins']);
  assert.equal(h.render().loading, true); assert.equal(h.render().profileLoading, true);
  h.settle('users', 'owner', false); await setImmediate();
  assert.equal(h.render().loading, true); assert.equal(h.render().profileLoading, true);
  h.settle('admins', 'owner@example.test', true); await pending;
  assert.equal(h.render().loading, false); assert.equal(h.render().profileLoading, false);
  assert.equal(h.render().onboardingComplete, false); assert.equal(h.render().isAdmin, true);
});

test('admin completion alone cannot bypass a pending onboarding profile', async () => {
  const h = harness(); const pending = h.emit(user('owner'));
  h.settle('admins', 'owner@example.test', false); await setImmediate();
  assert.equal(h.render().loading, true); assert.equal(h.render().profileLoading, true);
  h.settle('users', 'owner', false); await pending;
  assert.equal(h.render().onboardingComplete, false); assert.equal(h.render().profileLoading, false);
});

test('allowlisted admin startup still waits for the profile without a redundant role lookup', async () => {
  const h = harness(); const pending = h.emit(user('owner', 'maclaurenz.cultura@gmail.com'));
  assert.deepEqual(h.reads.map(read => read.collection), ['users']);
  h.settle('users', 'owner', false); await pending;
  assert.equal(h.render().isAdmin, true); assert.equal(h.render().onboardingComplete, false);
});

test('an old account cannot release the next account loading guard or grant it admin access', async () => {
  const h = harness(); const old = h.emit(user('old')); const next = h.emit(user('next'));
  h.settle('users', 'old', false); h.settle('admins', 'old@example.test', true); await old;
  assert.equal(h.render().user.uid, 'next'); assert.equal(h.render().profileLoading, true);
  assert.equal(h.render().isAdmin, false); assert.equal(h.render().onboardingComplete, true);
  h.settle('users', 'next', true); h.settle('admins', 'next@example.test', false); await next;
  assert.equal(h.render().loading, false); assert.equal(h.render().isAdmin, false);
});

test('logout and unmount discard unfinished profile and role completions', async () => {
  const h = harness(); const pending = h.emit(user('old')); await h.emit(null);
  h.settle('users', 'old', false); h.settle('admins', 'old@example.test', true); await pending;
  assert.equal(h.render().user, null); assert.equal(h.render().profileLoading, false);
  assert.equal(h.render().isAdmin, false); assert.equal(h.render().onboardingComplete, true);
  const mounted = harness(); const completion = mounted.emit(user('owner')); mounted.unmount();
  const writes = mounted.writes;
  mounted.settle('users', 'owner', false); mounted.settle('admins', 'owner@example.test', true); await completion;
  assert.equal(mounted.writes, writes, 'unmounted providers must not publish state');
});

test('profile and role failures settle independently and preserve existing fallback behavior', async () => {
  const h = harness(); const pending = h.emit(user('owner'));
  h.reads.find(read => read.collection === 'admins').reject(Error('Role unavailable'));
  await setImmediate(); assert.equal(h.render().profileLoading, true);
  h.reads.find(read => read.collection === 'users').reject(Error('Profile unavailable')); await pending;
  assert.equal(h.render().onboardingComplete, true); assert.equal(h.render().isAdmin, false);
  assert.equal(h.render().loading, false); assert.equal(h.errors.length, 2);
});

test('refreshUser ignores a completed reload after logout or account change', async () => {
  const h = harness(); const reload = deferred(); const owner = { ...user('old'), reload: () => reload.promise };
  const startup = h.emit(owner); h.settle('users', 'old', true); h.settle('admins', 'old@example.test', false); await startup;
  const refresh = h.render().refreshUser(); const next = h.emit(user('next'));
  reload.resolve(); await refresh;
  assert.equal(h.reads.filter(read => read.collection === 'users' && read.id === 'next').length, 1);
  assert.equal(h.render().user.uid, 'next'); assert.equal(h.render().profileLoading, true);
  h.settle('users', 'next', true); h.settle('admins', 'next@example.test', false); await next;
  const logoutReload = deferred(); h.auth.currentUser = { ...user('next'), reload: () => logoutReload.promise };
  const logoutRefresh = h.render().refreshUser(); await h.emit(null); logoutReload.resolve(); await logoutRefresh;
  assert.equal(h.render().user, null); assert.equal(h.render().onboardingComplete, true);
});

test('refreshUser cannot overwrite a newer profile refresh or a different account', async () => {
  const h = harness(); const startup = h.emit(user('owner'));
  h.settle('users', 'owner', true); h.settle('admins', 'owner@example.test', false); await startup;
  const old = h.render().refreshUser(); await setImmediate();
  const latest = h.render().refreshUser(); await setImmediate();
  h.settle('users', 'owner', false, 2); await latest;
  h.settle('users', 'owner', true, 1); await old;
  assert.equal(h.render().onboardingComplete, false);
  const stale = h.render().refreshUser(); await setImmediate(); const next = h.emit(user('next'));
  h.settle('users', 'owner', false, 3); await stale;
  assert.equal(h.render().user.uid, 'next'); assert.equal(h.render().onboardingComplete, true);
  h.settle('users', 'next', true); h.settle('admins', 'next@example.test', false); await next;
});

test('a successful refresh during startup cannot be overwritten by the earlier profile read', async () => {
  const h = harness(); const startup = h.emit(user('owner'));
  const refresh = h.render().refreshUser(); await setImmediate();
  h.settle('users', 'owner', false, 1); await refresh;
  assert.equal(h.render().loading, true, 'the required startup role check remains pending');
  h.settle('users', 'owner', true); h.settle('admins', 'owner@example.test', false); await startup;
  assert.equal(h.render().onboardingComplete, false); assert.equal(h.render().profileLoading, false);
});

test('an account change keeps required role checks guarded even when its profile is refreshed first', async () => {
  const h = harness(); const first = h.emit(user('first'));
  h.settle('users', 'first', true); h.settle('admins', 'first@example.test', false); await first;
  assert.equal(h.render().loading, false);
  const next = h.emit(user('next')); const refresh = h.render().refreshUser(); await setImmediate();
  h.settle('users', 'next', true, 1); await refresh;
  assert.equal(h.render().loading, true, 'a profile refresh cannot release the next account role guard');
  h.settle('users', 'next', true); h.settle('admins', 'next@example.test', false); await next;
  assert.equal(h.render().loading, false); assert.equal(h.render().profileLoading, false);
});

test('an older reload cannot start a stale profile request after a newer refresh finishes', async () => {
  const h = harness(); const firstReload = deferred(); const secondReload = deferred(); let calls = 0;
  const owner = { ...user('owner'), reload: () => (++calls === 1 ? firstReload.promise : secondReload.promise) };
  const startup = h.emit(owner); h.settle('users', 'owner', true); h.settle('admins', 'owner@example.test', false); await startup;
  const old = h.render().refreshUser(); const latest = h.render().refreshUser();
  secondReload.resolve(); await setImmediate(); h.settle('users', 'owner', false, 1); await latest;
  firstReload.resolve(); await old;
  assert.equal(h.reads.filter(read => read.collection === 'users').length, 2);
  assert.equal(h.render().onboardingComplete, false);
  const afterUnmount = h.render().refreshUser(); await setImmediate(); h.unmount(); const writes = h.writes;
  h.settle('users', 'owner', true, 2); await afterUnmount;
  assert.equal(h.writes, writes);
});
