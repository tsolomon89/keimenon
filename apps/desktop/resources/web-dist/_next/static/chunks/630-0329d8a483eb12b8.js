(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [630],
  {
    6031: function () {},
    4175: function (e, t, a) {
      'use strict';
      a.d(t, {
        AuthProvider: function () {
          return y;
        },
        LP: function () {
          return v;
        },
        aC: function () {
          return w;
        },
      });
      var o = a(7573),
        n = a(7653),
        i = a(1695),
        r = a(4374),
        s = a(2844);
      let l = [
        '__operatingAccount',
        '__operatingMode',
        '__cachedNodes',
        '__cachedEdges',
        '__cachedGroups',
        '__cachedBoards',
      ];
      var c = a(3291);
      let d = (0, n.createContext)(void 0),
        u = 'keimenon_token',
        p = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      function m() {
        let e = {};
        return (window.__TEST_DB_PATH__ && (e['X-Test-DB-Path'] = window.__TEST_DB_PATH__), e);
      }
      function f(e) {
        try {
          let t = e.split('.')[1],
            a = atob(t);
          return JSON.parse(a);
        } catch (e) {
          return (console.error('Failed to decode JWT:', e), null);
        }
      }
      function _(e) {
        let t = f(e);
        if (!t || !t.exp) return !0;
        let a = Math.floor(Date.now() / 1e3);
        return t.exp < a;
      }
      function h(e) {
        let t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {},
          a = new URLSearchParams(window.location.search),
          o = new URLSearchParams();
        for (let e of ['apiPort', 'dev']) {
          let t = a.get(e);
          t && o.set(e, t);
        }
        for (let [e, a] of Object.entries(t)) a && o.set(e, a);
        let n = o.toString();
        return n ? ''.concat(e, '?').concat(n) : e;
      }
      function g(e) {
        let t = f(e);
        return t
          ? {
              userId: t.userId,
              accountId: t.accountId,
              email: t.email,
              permissionLevel: t.permissionLevel,
              accountType: t.accountType,
              accountClass: t.accountClass,
              rank: t.rank || 1,
              overrides: t.overrides,
              sessionId: t.sessionId,
              allAccounts: t.allAccounts,
            }
          : null;
      }
      function y(e) {
        let { children: t } = e,
          [a, y] = (0, n.useState)(null),
          [w, v] = (0, n.useState)(!0),
          b = (0, i.useRouter)();
        ((0, n.useEffect)(() => {
          let e = !1,
            t = async () => {
              var e;
              if (
                (localStorage.removeItem(u),
                null === (e = window.electronAPI) || void 0 === e ? void 0 : e.accounts)
              )
                try {
                  await window.electronAPI.accounts.clearAll();
                } catch (e) {
                  console.warn('[AuthContext] Failed to clear desktop auth state:', e);
                }
            };
          return (
            (async () => {
              let a = (t) => {
                e || (y(t), v(!1));
              };
              try {
                let e = localStorage.getItem(u);
                if ((console.log('[AuthContext] Init check. Token present:', !!e), !e)) {
                  a(null);
                  return;
                }
                if (_(e)) {
                  (console.log('[AuthContext] Token expired on startup, clearing storage'),
                    await t(),
                    a(null));
                  return;
                }
                try {
                  let o = await fetch(''.concat(c.CT, '/api/v1/auth/verify'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...m() },
                    body: JSON.stringify({ token: e }),
                  });
                  if (!o.ok) {
                    (console.warn(
                      '[AuthContext] Stored token rejected by backend ('.concat(
                        o.status,
                        '), clearing auth state'
                      )
                    ),
                      await t(),
                      a(null));
                    return;
                  }
                } catch (e) {
                  console.warn(
                    '[AuthContext] Token verification request failed, using local token parse:',
                    e
                  );
                }
                let o = g(e);
                if (!o) {
                  (await t(), a(null));
                  return;
                }
                a(o);
              } catch (e) {
                (console.error('[AuthContext] initializeAuth failed:', e), a(null));
              }
            })(),
            () => {
              e = !0;
            }
          );
        }, []),
          (0, n.useEffect)(() => {
            if (a && a.accountId) {
              let e = r.O.getState().currentAccountId;
              (e &&
                e !== a.accountId &&
                (console.log(
                  '\uD83D\uDD04 Account switched from '
                    .concat(e, ' to ')
                    .concat(a.accountId, ' - resetting keimenon store')
                ),
                r.O.getState().reset()),
                r.O.getState().setCurrentAccountId(a.accountId));
            }
          }, [null == a ? void 0 : a.accountId]));
        let x = (0, n.useCallback)(
            async (e, t) => {
              v(!0);
              try {
                let a = await fetch(''.concat(c.CT, '/api/v1/auth/login'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...m() },
                  body: JSON.stringify({ email: e, password: t }),
                });
                if (!a.ok) {
                  let e = await a.json();
                  throw Error(e.error || 'Login failed');
                }
                let o = await a.json();
                if (o.requiresAccountSelection)
                  return (
                    v(!1),
                    {
                      requiresAccountSelection: !0,
                      availableAccounts: o.availableAccounts,
                      tempToken: o.tempToken,
                    }
                  );
                let { token: n } = o;
                if (!n) throw Error('No token received from server');
                localStorage.setItem(u, n);
                let i = g(n);
                if (!i) throw Error('Failed to parse user from token');
                (y(i),
                  v(!1),
                  console.log('Login successful:', {
                    email: i.email,
                    accountId: i.accountId,
                    rank: i.rank,
                    accountType: i.accountType,
                  }),
                  b.push(h('/keimenon')));
              } catch (e) {
                throw (v(!1), console.error('Login error:', e), e);
              }
            },
            [b]
          ),
          R = (0, n.useCallback)(
            async function (e, t, a) {
              let o = arguments.length > 3 && void 0 !== arguments[3] ? arguments[3] : 'free',
                n = a.trim();
              if (n.length < 2 || n.length > 120)
                throw Error('Name must be between 2 and 120 characters');
              if (!p.test(e)) throw Error('Please provide a valid email address');
              if (t.length < 8) throw Error('Password must be at least 8 characters');
              if (!/[a-zA-Z]/.test(t) || !/[0-9]/.test(t))
                throw Error('Password must include both letters and numbers');
              if (!['free', 'professional', 'business'].includes(o))
                throw Error('Invalid account class');
              v(!0);
              try {
                let a = await fetch(''.concat(c.CT, '/api/v1/auth/register'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    email: e,
                    password: t,
                    name: n,
                    accountType: 'client',
                    accountClass: o,
                  }),
                });
                if (!a.ok) {
                  let e = await a.json();
                  throw Error(e.error || 'Registration failed. Please try again.');
                }
                let { token: i } = await a.json();
                if (!i) throw Error('No token received from server');
                localStorage.setItem(u, i);
                let r = g(i);
                if (!r) throw Error('Failed to parse user from token');
                (y(r),
                  v(!1),
                  console.log('Registration successful:', {
                    email: r.email,
                    accountType: r.accountType,
                    accountClass: r.accountClass,
                  }),
                  b.push(h('/keimenon')));
              } catch (e) {
                if (
                  (v(!1),
                  console.error('Registration error:', e),
                  e instanceof TypeError &&
                    (e.message.includes('fetch') || e.message.includes('NetworkError')))
                )
                  throw Error('Network error. Please check your connection and try again.');
                throw e;
              }
            },
            [b]
          ),
          E = (0, n.useCallback)(
            async (e, t, a) => {
              v(!0);
              try {
                let o = await fetch(''.concat(c.CT, '/api/v1/auth/select-account'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ tempToken: e, accountId: t, accountPassword: a }),
                });
                if (!o.ok) {
                  let e = await o.json();
                  throw Error(e.error || 'Account selection failed');
                }
                let { token: n } = await o.json();
                if (!n) throw Error('No token received from server');
                localStorage.setItem(u, n);
                let i = g(n);
                if (!i) throw Error('Failed to parse user from token');
                (y(i),
                  v(!1),
                  console.log('Account selected:', { accountId: i.accountId, email: i.email }),
                  b.push(h('/keimenon')));
              } catch (e) {
                throw (v(!1), console.error('Account selection error:', e), e);
              }
            },
            [b]
          ),
          T = (0, n.useCallback)(async (e, t) => {
            v(!0);
            try {
              let a = localStorage.getItem(u);
              if (!a) throw Error('Not authenticated');
              console.log(
                '\uD83E\uDDF9 Clearing account-scoped runtime state before account switch...'
              );
              let o = (function () {
                let e =
                  arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : '__SENSITIVE__';
                for (let e of (r.O.getState().reset(), l)) delete window[e];
                let t = [];
                if (window.sessionStorage) {
                  let a = [];
                  for (let e = 0; e < window.sessionStorage.length; e += 1) {
                    let t = window.sessionStorage.key(e);
                    t && a.push(t);
                  }
                  for (let o of a)
                    (e.length > 0 && o.startsWith(e)) ||
                      (window.sessionStorage.removeItem(o), t.push(o));
                }
                return { clearedSessionKeys: t };
              })();
              console.log(
                '\uD83E\uDDF9 Cleared '.concat(o.clearedSessionKeys.length, ' sessionStorage items')
              );
              let n = await fetch(''.concat(c.CT, '/api/v1/auth/switch-account'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer '.concat(a) },
                body: JSON.stringify({ accountId: e, accountPassword: t }),
              });
              if (!n.ok) {
                let e = await n.json();
                throw Error(e.error || 'Account switch failed');
              }
              let i = (await n.json()).token;
              if (!i) throw Error('No token received from server');
              localStorage.setItem(u, i);
              let d = g(i);
              if (!d) throw Error('Failed to parse user from token');
              (y(d),
                (0, s.Et)('Switched to account: '.concat(d.accountId), {
                  domain: 'api',
                  operation: 'auth.switchAccount',
                  metadata: {
                    accountId: d.accountId,
                    userId: d.userId,
                    accountType: d.accountType,
                  },
                }),
                console.log('✅ Account switched successfully:', {
                  accountId: d.accountId,
                  email: d.email,
                }),
                v(!1),
                console.log(
                  '\uD83D\uDD04 Performing hard reload to clear all application state...'
                ),
                window.location.reload());
            } catch (e) {
              throw (v(!1), console.error('❌ Account switch error:', e), e);
            }
          }, []),
          k = (0, n.useCallback)(() => {
            (localStorage.removeItem(u),
              y(null),
              r.O.getState().reset(),
              b.push(h('/login')),
              console.log('Logged out'));
          }, [b]),
          I = (0, n.useCallback)(async () => {
            let e = localStorage.getItem(u);
            if (!e) return !1;
            try {
              let t = await fetch(''.concat(c.CT, '/api/v1/auth/refresh'), {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: 'Bearer '.concat(e),
                  ...m(),
                },
                body: JSON.stringify({ token: e }),
              });
              if (!t.ok) return !1;
              let a = await t.json();
              if (!(null == a ? void 0 : a.token) || 'string' != typeof a.token) return !1;
              localStorage.setItem(u, a.token);
              let o = g(a.token);
              return (o && y(o), !0);
            } catch (e) {
              return !1;
            }
          }, []);
        (0, n.useEffect)(() => {
          if (!a) return;
          let e = setInterval(async () => {
            let e = localStorage.getItem(u);
            if (!e) return;
            let t = f(e);
            if (!(null == t ? void 0 : t.exp)) return;
            let a = Math.floor(Date.now() / 1e3);
            t.exp - a <= 120 && !(await I()) && _(e) && k();
          }, 3e4);
          return () => clearInterval(e);
        }, [a, I, k]);
        let S = (0, n.useCallback)(() => {
          let e = localStorage.getItem(u);
          if (!e) {
            y(null);
            return;
          }
          if (_(e)) {
            I().then((e) => {
              e || k();
            });
            return;
          }
          let t = g(e);
          t ? y(t) : k();
        }, [k, I]);
        return (0, o.jsx)(d.Provider, {
          value: {
            user: a,
            isAuthenticated: !!a,
            isLoading: w,
            login: x,
            selectAccount: E,
            switchAccount: T,
            register: R,
            logout: k,
            refreshUser: S,
          },
          children: t,
        });
      }
      function w() {
        let e = (0, n.useContext)(d);
        if (void 0 === e) throw Error('useAuth must be used within an AuthProvider');
        return e;
      }
      function v() {
        return localStorage.getItem(u);
      }
    },
    1493: function (e, t, a) {
      'use strict';
      a.d(t, {
        $P: function () {
          return ea;
        },
        $Q: function () {
          return R;
        },
        Bk: function () {
          return B;
        },
        E0: function () {
          return v;
        },
        EZ: function () {
          return x;
        },
        FE: function () {
          return z;
        },
        IU: function () {
          return D;
        },
        In: function () {
          return L;
        },
        J$: function () {
          return J;
        },
        NT: function () {
          return k;
        },
        NU: function () {
          return E;
        },
        Ni: function () {
          return S;
        },
        Nm: function () {
          return P;
        },
        Nq: function () {
          return $;
        },
        PR: function () {
          return H;
        },
        PZ: function () {
          return q;
        },
        SK: function () {
          return en;
        },
        T1: function () {
          return K;
        },
        T8: function () {
          return X;
        },
        TE: function () {
          return Y;
        },
        U0: function () {
          return C;
        },
        UU: function () {
          return b;
        },
        W8: function () {
          return U;
        },
        W9: function () {
          return h;
        },
        Zd: function () {
          return N;
        },
        Zo: function () {
          return A;
        },
        _A: function () {
          return Z;
        },
        ax: function () {
          return u;
        },
        d: function () {
          return _;
        },
        e_: function () {
          return eo;
        },
        h8: function () {
          return Q;
        },
        hi: function () {
          return f;
        },
        lq: function () {
          return g;
        },
        m7: function () {
          return et;
        },
        oI: function () {
          return y;
        },
        qF: function () {
          return w;
        },
        qp: function () {
          return I;
        },
        r4: function () {
          return W;
        },
        rT: function () {
          return F;
        },
        tN: function () {
          return j;
        },
        tl: function () {
          return M;
        },
        tz: function () {
          return T;
        },
        u1: function () {
          return O;
        },
        v$: function () {
          return G;
        },
        w3: function () {
          return V;
        },
        wv: function () {
          return ee;
        },
        x1: function () {
          return ei;
        },
      });
      var o = a(2844),
        n = a(4175),
        i = a(3291),
        r = a(7271);
      let s = ''.concat(i.CT, '/api/v1/auth/refresh'),
        l = null;
      function c() {
        let e = {},
          t = (0, n.LP)();
        t && (e.Authorization = 'Bearer '.concat(t));
        {
          let t = window.__operatingAccount,
            a = window.__operatingMode;
          t && a && 'native' !== a && ((e['X-Operating-Account'] = t), (e['X-Operating-Mode'] = a));
        }
        return e;
      }
      async function d(e, t) {
        let a = String(e),
          o = t,
          i = (0, n.LP)();
        if (
          i &&
          (function (e) {
            let t = (function (e) {
              try {
                let t = e.split('.')[1],
                  a = atob(t);
                return JSON.parse(a);
              } catch (e) {
                return (console.error('Failed to decode JWT:', e), null);
              }
            })(e);
            if (!t || !t.exp) return !0;
            let a = Math.floor(Date.now() / 1e3);
            return t.exp - 30 < a;
          })(i) &&
          !a.includes('/api/v1/auth/refresh')
        ) {
          let e = await p();
          e && (o = m(t, e));
        }
        let r = await fetch(e, o);
        if ((401 === r.status || 403 === r.status) && !a.includes('/api/v1/auth/refresh')) {
          let a = await p();
          if (a && (r = await fetch(e, m(t, a))).ok) return r;
          let o = (await r.json().catch(() => ({}))).error || 'Authentication failed';
          throw (
            !(function () {
              let e =
                arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : 'Token expired';
              console.warn('\uD83D\uDD12 '.concat(e, ' - logging out user'));
              {
                localStorage.removeItem('keimenon_token');
                let t = new CustomEvent('auth:token-expired', { detail: { reason: e } });
                (window.dispatchEvent(t),
                  setTimeout(() => {
                    let e = new URLSearchParams(window.location.search),
                      t = new URLSearchParams({ reason: 'expired' });
                    for (let a of ['apiPort', 'dev']) {
                      let o = e.get(a);
                      o && t.set(a, o);
                    }
                    window.location.href = '/login?'.concat(t.toString());
                  }, 1e3));
              }
            })(o),
            Error(o)
          );
        }
        return r;
      }
      async function u(e, t) {
        let a = new Headers(c());
        return (
          (null == t ? void 0 : t.headers) &&
            new Headers(t.headers).forEach((e, t) => {
              a.set(t, e);
            }),
          d(e, { ...t, headers: a })
        );
      }
      async function p() {
        return (
          l ||
          (l = (async () => {
            let e = (0, n.LP)();
            if (!e) return null;
            try {
              let t = await fetch(s, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer '.concat(e) },
                body: JSON.stringify({ token: e }),
              });
              if (!t.ok) return null;
              let a = await t.json(),
                o = 'string' == typeof (null == a ? void 0 : a.token) ? a.token : null;
              if (!o) return null;
              return (localStorage.setItem('keimenon_token', o), o);
            } catch (e) {
              return null;
            } finally {
              l = null;
            }
          })())
        );
      }
      function m(e, t) {
        let a = new Headers((null == e ? void 0 : e.headers) || {});
        return (a.set('Authorization', 'Bearer '.concat(t)), { ...e, headers: a });
      }
      let f = {
        get: async (e) => {
          let t = await d(''.concat(i.CT, '/api/v1').concat(e));
          if (!t.ok) throw Error(t.statusText);
          return { data: await t.json() };
        },
        post: async (e, t) => {
          let a = await d(''.concat(i.CT, '/api/v1').concat(e), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...c() },
            body: JSON.stringify(t),
          });
          if (!a.ok) throw Error(a.statusText);
          return { data: await a.json() };
        },
        put: async (e, t) => {
          let a = await d(''.concat(i.CT, '/api/v1').concat(e), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...c() },
            body: JSON.stringify(t),
          });
          if (!a.ok) throw Error(a.statusText);
          return { data: await a.json() };
        },
        delete: async (e) => {
          let t = await d(''.concat(i.CT, '/api/v1').concat(e), {
            method: 'DELETE',
            headers: { ...c() },
          });
          if (!t.ok) throw Error(t.statusText);
          return { data: await t.json().catch(() => ({})) };
        },
      };
      async function _() {
        try {
          let e = await d(''.concat(i.CT, '/api/v1/import/presets'), {
            method: 'GET',
            headers: c(),
          });
          return (e.ok || (await (0, o.zG)({ response: e })), await e.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function h(e) {
        try {
          let t = await d(''.concat(i.CT, '/api/v1/import/presets'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...c() },
            body: JSON.stringify(e),
          });
          return (t.ok || (await (0, o.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function g(e, t) {
        try {
          let a = await d(''.concat(i.CT, '/api/v1/import/presets/').concat(e), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...c() },
            body: JSON.stringify(t),
          });
          return (a.ok || (await (0, o.zG)({ response: a })), await a.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function y(e) {
        try {
          let t = await d(''.concat(i.CT, '/api/v1/import/presets/').concat(e), {
            method: 'DELETE',
            headers: c(),
          });
          return (t.ok || (await (0, o.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function w() {
        let e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : '24h',
          t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : 12;
        try {
          let a = new URLSearchParams({ window: e, buckets: String(t) }),
            n = await d(''.concat(i.CT, '/api/v1/import/stats/series?').concat(a.toString()), {
              method: 'GET',
              headers: c(),
            });
          return (n.ok || (await (0, o.zG)({ response: n })), await n.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function v() {
        try {
          let e = await d(''.concat(i.CT, '/api/v1/me/features'), { method: 'GET', headers: c() });
          return (e.ok || (await (0, o.zG)({ response: e })), await e.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function b(e) {
        let t = await d(''.concat(i.CT, '/api/v1/jobs/').concat(e, '/cancel'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...c() },
        });
        if (!t.ok)
          throw Error(
            (await t.json().catch(() => ({}))).error ||
              'Failed to cancel job: '.concat(t.statusText)
          );
        return await t.json();
      }
      async function x(e) {
        let t = await d(''.concat(i.CT, '/api/v1/jobs/').concat(e, '/pause'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...c() },
        });
        if (!t.ok)
          throw Error(
            (await t.json().catch(() => ({}))).error || 'Failed to pause job: '.concat(t.statusText)
          );
        return await t.json();
      }
      async function R(e) {
        let t = await d(''.concat(i.CT, '/api/v1/jobs/').concat(e, '/resume'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...c() },
        });
        if (!t.ok)
          throw Error(
            (await t.json().catch(() => ({}))).error ||
              'Failed to resume job: '.concat(t.statusText)
          );
        return await t.json();
      }
      async function E(e, t, a) {
        var n;
        let s = new FormData();
        e.forEach((e) => {
          s.append('files', e);
        });
        let l = (0, r.p$)({
          platform: a,
          extraction: {
            includeUser: t.extraction.includeUser,
            includeAssistant: t.extraction.includeAssistant,
          },
          minMessageLength: t.minMessageLength,
          processingMode: t.processingMode,
          branches: t.branches,
          agent: {
            bootstrap: (null === (n = t.agent) || void 0 === n ? void 0 : n.bootstrap) || 'manual',
          },
          groups: 'manual' === t.processingMode || 'hybrid' === t.processingMode ? t.groups : [],
          extractCode: t.extractCode,
          codeSettings: {
            minLength: t.codeSettings.minLength,
            languages: t.codeSettings.languages,
            groupBy: t.codeSettings.groupBy,
            deduplicate: t.codeSettings.deduplicate,
            sourceHandling: t.codeSettings.sourceHandling,
          },
          duplicateDetection: {
            enabled: t.duplicateDetection.enabled,
            exactMatch: t.duplicateDetection.exactMatch,
            similarityThreshold: t.duplicateDetection.similarityThreshold,
            crossConversation: t.duplicateDetection.crossConversation,
            algorithm: t.duplicateDetection.algorithm,
            normalizeTokens: t.duplicateDetection.normalizeTokens,
            minTokenOverlap: t.duplicateDetection.minTokenOverlap,
            lengthRatioTolerance: t.duplicateDetection.lengthRatioTolerance,
            ignoreWhitespace: t.duplicateDetection.ignoreWhitespace,
            ignoreCase: t.duplicateDetection.ignoreCase,
            ignoreTimestamp: t.duplicateDetection.ignoreTimestamp,
            requireReview: t.duplicateDetection.requireReview,
            autoApproveExact: t.duplicateDetection.autoApproveExact,
            autoMergeThreshold: t.duplicateDetection.autoMergeThreshold,
          },
        });
        for (let t of (s.append('config', JSON.stringify(l)), e)) {
          if (!t.name.match(/\.(json|jsonl)$/i))
            throw new o.FE(
              'Invalid file type: '.concat(t.name, '. Only JSON and JSONL files are supported.')
            );
          if (t.size > 2147483648)
            throw new o.FE('File too large: '.concat(t.name, '. Maximum size is 2GB.'), {
              fileName: t.name,
              size: t.size,
              maxSize: 2147483648,
            });
        }
        let u = ''.concat(i.CT, '/api/v1/jobs/import');
        console.log(
          'Creating import job for files:',
          e.map((e) => e.name)
        );
        try {
          return await (0, o.JN)(
            async () => {
              var t;
              (console.log('[importChatFilesAsJob] Sending POST to '.concat(u)),
                console.log('[importChatFilesAsJob] FormData contains:', {
                  fileCount: e.length,
                  files: e.map((e) => ({ name: e.name, size: e.size, type: e.type })),
                  configSize:
                    (null === (t = s.get('config')) || void 0 === t
                      ? void 0
                      : t.toString().length) || 0,
                }));
              let a = new AbortController(),
                n = setTimeout(() => {
                  (a.abort(),
                    console.error('[importChatFilesAsJob] Request timed out after 5 minutes'));
                }, 3e5);
              try {
                let e = await d(u, { method: 'POST', headers: c(), body: s, signal: a.signal });
                if (
                  (clearTimeout(n),
                  console.log('[importChatFilesAsJob] Response status: '.concat(e.status)),
                  !e.ok)
                ) {
                  let t = await e.text();
                  (console.error('[importChatFilesAsJob] Error response:', {
                    status: e.status,
                    statusText: e.statusText,
                    body: t,
                  }),
                    await (0, o.zG)({ response: e }));
                }
                let t = await e.json();
                return (console.log('[importChatFilesAsJob] Success:', t), t);
              } catch (e) {
                if ((clearTimeout(n), e instanceof Error && 'AbortError' === e.name))
                  throw Error(
                    'Import job creation timed out after 5 minutes. The file may be too large or the server is not responding.'
                  );
                throw e;
              }
            },
            {
              maxAttempts: 2,
              delay: 1e3,
              onRetry: (e, t) => {
                console.warn('Import job creation attempt '.concat(e, ' failed, retrying...'), t);
              },
            }
          );
        } catch (e) {
          throw (console.error('[importChatFilesAsJob] Final error:', e), await (0, o.zG)(e));
        }
      }
      async function T(e) {
        let t = '';
        try {
          var a, o, n, i, r, s, l;
          if (e.size > 10485760) {
            let a = e.slice(0, 5242880);
            ((t = await a.text()),
              console.log(
                '[detectPlatform] Read 5MB sample. Preview: '.concat(t.substring(0, 200), '...')
              ));
          } else t = await e.text();
          let c = JSON.parse(t);
          if (
            (console.log('[detectPlatform] File keys:', Object.keys(c)),
            Array.isArray(c) &&
              console.log('[detectPlatform] Array first item keys:', Object.keys(c[0] || {})),
            Array.isArray(c) &&
              (null === (a = c[0]) || void 0 === a ? void 0 : a.chat_messages) &&
              (null === (o = c[0]) || void 0 === o ? void 0 : o.account))
          )
            return { platform: 'chatgpt', confidence: 0.95 };
          if (c.uuid && c.chat_messages && c.account)
            return { platform: 'chatgpt', confidence: 0.9 };
          if (
            Array.isArray(c) &&
            (null === (n = c[0]) || void 0 === n ? void 0 : n.chat_messages) &&
            (null === (i = c[0]) || void 0 === i ? void 0 : i.uuid)
          )
            return { platform: 'chatgpt', confidence: 0.85 };
          if (Array.isArray(c) && (null === (r = c[0]) || void 0 === r ? void 0 : r.mapping))
            return { platform: 'claude', confidence: 0.95 };
          if (!Array.isArray(c) && c.mapping) return { platform: 'claude', confidence: 0.9 };
          if (
            Array.isArray(c) &&
            (null === (s = c[0]) || void 0 === s ? void 0 : s.conversation_id)
          )
            return { platform: 'claude', confidence: 0.85 };
          if (c.conversations && Array.isArray(c.conversations))
            return { platform: 'gemini', confidence: 0.8 };
          if (Array.isArray(c) && (null === (l = c[0]) || void 0 === l ? void 0 : l.messages))
            return { platform: 'generic', confidence: 0.5 };
          return { platform: 'unknown', confidence: 0 };
        } catch (e) {
          if (
            (console.warn(
              '[detectPlatform] JSON parse failed (expected for large files), trying heuristic match:',
              e
            ),
            t.includes('"chat_messages":') && t.includes('"account":'))
          )
            return { platform: 'chatgpt', confidence: 0.8 };
          if (t.includes('"chat_messages":') && t.includes('"uuid":'))
            return { platform: 'chatgpt', confidence: 0.7 };
          if (t.includes('"mapping":')) return { platform: 'claude', confidence: 0.8 };
          if (t.includes('"conversation_id":')) return { platform: 'claude', confidence: 0.7 };
          if (t.includes('"conversations":')) return { platform: 'gemini', confidence: 0.8 };
          if (t.includes('"messages":') && t.includes('"role":'))
            return { platform: 'generic', confidence: 0.5 };
          return { platform: 'unknown', confidence: 0 };
        }
      }
      async function k(e) {
        let t = {},
          a = 0,
          o = 0;
        for (let n of e)
          try {
            let e = await T(n);
            if (((t[e.platform] = (t[e.platform] || 0) + 1), n.size > 52428800)) {
              console.log(
                'Large file detected ('.concat(
                  (n.size / 1024 / 1024).toFixed(2),
                  'MB), using estimates'
                )
              );
              let e = Math.floor(n.size / 256e3);
              ((a += e), (o += 10 * e));
              continue;
            }
            let i = await n.text(),
              r = JSON.parse(i);
            Array.isArray(r)
              ? ((a += r.length),
                r.forEach((e) => {
                  e.mapping
                    ? (o += Object.keys(e.mapping).length)
                    : e.messages && (o += e.messages.length);
                }))
              : r.conversations &&
                ((a += r.conversations.length),
                (o += r.conversations.reduce((e, t) => {
                  var a;
                  return e + ((null === (a = t.messages) || void 0 === a ? void 0 : a.length) || 0);
                }, 0)));
          } catch (e) {
            (console.error('Error analyzing file:', n.name, e), (a += 1), (o += 10));
          }
        return {
          total_conversations: Math.max(a, 1),
          total_messages: Math.max(o, 10),
          platforms: t,
        };
      }
      async function I(e) {
        try {
          let t = await d(''.concat(i.CT, '/api/v1/content/message/').concat(e), { headers: c() });
          return (t.ok || (await (0, o.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function S(e) {
        try {
          let t = await d(''.concat(i.CT, '/api/v1/content/source/').concat(e), { headers: c() });
          return (t.ok || (await (0, o.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function C(e) {
        try {
          let t = await d(''.concat(i.CT, '/api/v1/content/code/').concat(e), { headers: c() });
          return (t.ok || (await (0, o.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function A(e) {
        try {
          let t = await d(''.concat(i.CT, '/api/v1/content/conversation/').concat(e), {
            headers: c(),
          });
          return (t.ok || (await (0, o.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function O(e) {
        try {
          var t, a, n;
          let r = await d(''.concat(i.CT, '/api/v1/nodes/').concat(e), { headers: c() });
          r.ok || (await (0, o.zG)({ response: r }));
          let s = await r.json();
          return {
            id: s.id,
            lemma:
              s.lemma || (null === (t = s.properties) || void 0 === t ? void 0 : t.lemma) || '',
            pos: s.pos || (null === (a = s.properties) || void 0 === a ? void 0 : a.pos),
            frequency:
              s.frequency ||
              (null === (n = s.properties) || void 0 === n ? void 0 : n.frequency) ||
              0,
            source: 'database',
          };
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function Z(e) {
        try {
          var t, a, n, r, s;
          let l = await d(''.concat(i.CT, '/api/v1/nodes/').concat(e), { headers: c() });
          l.ok || (await (0, o.zG)({ response: l }));
          let u = await l.json();
          return {
            id: u.id,
            text: u.text || (null === (t = u.properties) || void 0 === t ? void 0 : t.text) || '',
            normalized_text:
              u.normalized_text ||
              (null === (a = u.properties) || void 0 === a ? void 0 : a.normalized_text) ||
              '',
            type:
              u.type || (null === (n = u.properties) || void 0 === n ? void 0 : n.type) || 'n-gram',
            entity_type:
              u.entity_type ||
              (null === (r = u.properties) || void 0 === r ? void 0 : r.entity_type),
            frequency:
              u.frequency ||
              (null === (s = u.properties) || void 0 === s ? void 0 : s.frequency) ||
              0,
            source: 'database',
          };
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function N(e) {
        try {
          var t, a, n, r;
          let s = await d(''.concat(i.CT, '/api/v1/nodes/').concat(e), { headers: c() });
          s.ok || (await (0, o.zG)({ response: s }));
          let l = await s.json();
          return {
            id: l.id,
            name: l.name || (null === (t = l.properties) || void 0 === t ? void 0 : t.name) || '',
            description:
              l.description ||
              (null === (a = l.properties) || void 0 === a ? void 0 : a.description),
            keywords:
              l.keywords ||
              (null === (n = l.properties) || void 0 === n ? void 0 : n.keywords) ||
              [],
            strength:
              l.strength ||
              (null === (r = l.properties) || void 0 === r ? void 0 : r.strength) ||
              0,
            source: 'database',
          };
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function P(e) {
        try {
          var t, a, n, r, s, l, u;
          let p = await d(''.concat(i.CT, '/api/v1/nodes/').concat(e), { headers: c() });
          p.ok || (await (0, o.zG)({ response: p }));
          let m = await p.json();
          return {
            id: m.id,
            url: m.url || (null === (t = m.properties) || void 0 === t ? void 0 : t.url) || '',
            title:
              m.title || (null === (a = m.properties) || void 0 === a ? void 0 : a.title) || '',
            publisher:
              m.publisher || (null === (n = m.properties) || void 0 === n ? void 0 : n.publisher),
            author: m.author || (null === (r = m.properties) || void 0 === r ? void 0 : r.author),
            published_at:
              m.published_at ||
              (null === (s = m.properties) || void 0 === s ? void 0 : s.published_at),
            accessed_at:
              m.accessed_at ||
              (null === (l = m.properties) || void 0 === l ? void 0 : l.accessed_at),
            trust_score:
              m.trust_score ||
              (null === (u = m.properties) || void 0 === u ? void 0 : u.trust_score) ||
              0,
            source: 'database',
          };
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function D(e) {
        try {
          var t, a, n, r, s;
          let l = await d(''.concat(i.CT, '/api/v1/nodes/').concat(e), { headers: c() });
          l.ok || (await (0, o.zG)({ response: l }));
          let u = await l.json();
          return {
            id: u.id,
            claim_text:
              u.claim_text ||
              (null === (t = u.properties) || void 0 === t ? void 0 : t.claim_text) ||
              '',
            source_id:
              u.source_id ||
              (null === (a = u.properties) || void 0 === a ? void 0 : a.source_id) ||
              '',
            evidence_excerpt:
              u.evidence_excerpt ||
              (null === (n = u.properties) || void 0 === n ? void 0 : n.evidence_excerpt),
            confidence:
              u.confidence ||
              (null === (r = u.properties) || void 0 === r ? void 0 : r.confidence) ||
              0,
            status:
              u.status ||
              (null === (s = u.properties) || void 0 === s ? void 0 : s.status) ||
              'proposed',
            source: 'database',
          };
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function L() {
        try {
          let e = await d(''.concat(i.CT, '/api/v1/content/stats'), { headers: c() });
          return (e.ok || (await (0, o.zG)({ response: e })), await e.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function j(e, t) {
        if (!t) throw Error('jobId is required to apply duplicate review decisions');
        try {
          let a = await d(''.concat(i.CT, '/api/v1/jobs/').concat(t, '/duplicate-review/apply'), {
            method: 'POST',
            headers: { ...c(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ decisions: e }),
          });
          return (a.ok || (await (0, o.zG)({ response: a })), await a.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function z(e) {
        if (!e) throw Error('jobId is required to fetch duplicate review status');
        try {
          let t = await d(''.concat(i.CT, '/api/v1/jobs/').concat(e, '/duplicate-review/status'), {
            method: 'GET',
            headers: c(),
          });
          return (t.ok || (await (0, o.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function M(e) {
        if (!e) throw Error('jobId is required to fetch duplicate review groups');
        try {
          let t = await d(''.concat(i.CT, '/api/v1/jobs/').concat(e, '/duplicate-review/groups'), {
            method: 'GET',
            headers: c(),
          });
          return (t.ok || (await (0, o.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function G(e) {
        try {
          var t;
          let a = new URLSearchParams();
          ((null == e ? void 0 : e.kind) && a.append('kind', e.kind),
            (null == e ? void 0 : e.limit) && a.append('limit', e.limit.toString()),
            (null == e ? void 0 : e.offset) && a.append('offset', e.offset.toString()),
            (null == e ? void 0 : e.search) && a.append('search', e.search));
          let n = ''.concat(i.CT, '/api/v1/nodes').concat(a.toString() ? '?'.concat(a) : ''),
            r = await u(n);
          r.ok || (await (0, o.zG)({ response: r }));
          let s = await r.json();
          return {
            nodes: s.nodes || [],
            total: s.total || (null === (t = s.nodes) || void 0 === t ? void 0 : t.length) || 0,
          };
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function U(e) {
        try {
          var t, a;
          let n = new URLSearchParams();
          ((null == e ? void 0 : e.kind) && n.append('kind', e.kind),
            (null == e ? void 0 : e.limit) && n.append('limit', e.limit.toString()),
            (null == e ? void 0 : e.offset) && n.append('offset', e.offset.toString()),
            (null == e ? void 0 : e.skip) !== void 0 && n.append('skip', e.skip.toString()),
            (null == e ? void 0 : e.cursor) && n.append('cursor', e.cursor),
            (null == e ? void 0 : e.sort) && n.append('sort', e.sort),
            (null == e ? void 0 : e.order) && n.append('order', e.order));
          let r = ''.concat(i.CT, '/api/v1/edges').concat(n.toString() ? '?'.concat(n) : ''),
            s = await u(r);
          s.ok || (await (0, o.zG)({ response: s }));
          let l = await s.json();
          return {
            edges: l.edges || [],
            total:
              l.total ||
              (null === (t = l.metadata) || void 0 === t ? void 0 : t.total) ||
              (null === (a = l.edges) || void 0 === a ? void 0 : a.length) ||
              0,
          };
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function B(e) {
        var t;
        let a = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {},
          n = await d(''.concat(i.CT, '/api/v1/nodes/').concat(e, '/sequester'), {
            method: 'POST',
            headers: { ...c(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ sequester: null === (t = a.sequester) || void 0 === t || t }),
          });
        return (n.ok || (await (0, o.zG)({ response: n })), n.json());
      }
      async function X() {
        try {
          let e = await d(''.concat(i.CT, '/api/v1/accounts'), { headers: c() });
          return (e.ok || (await (0, o.zG)({ response: e })), await e.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function F(e) {
        try {
          let t = await d(''.concat(i.CT, '/api/v1/accounts/').concat(e, '/stats'), {
            headers: c(),
          });
          return (t.ok || (await (0, o.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function V() {
        try {
          let e = await d(''.concat(i.CT, '/api/v1/analytics/overview'), { headers: c() });
          return (e.ok || (await (0, o.zG)({ response: e })), await e.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function K() {
        let e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : 'usage',
          t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : 10;
        try {
          let a = await u(
            ''
              .concat(i.CT, '/api/v1/analytics/top-accounts?metric=')
              .concat(e, '&limit=')
              .concat(t),
            {}
          );
          return (a.ok || (await (0, o.zG)({ response: a })), await a.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function J() {
        let e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : 50;
        try {
          let t = await u(
            ''.concat(i.CT, '/api/v1/analytics/recent-activity?limit=').concat(e),
            {}
          );
          return (t.ok || (await (0, o.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function q() {
        try {
          let e = await d(''.concat(i.CT, '/api/v1/analytics/alerts'), { headers: c() });
          return (e.ok || (await (0, o.zG)({ response: e })), await e.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function Y(e) {
        try {
          let t = await d(''.concat(i.CT, '/api/v1/accounts/').concat(e, '/users'), {
            headers: c(),
          });
          return (t.ok || (await (0, o.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function H(e) {
        try {
          let t = await d(''.concat(i.CT, '/api/v1/users/').concat(e), { headers: c() });
          return (t.ok || (await (0, o.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function W(e, t) {
        try {
          let a = await d(''.concat(i.CT, '/api/v1/accounts/').concat(e, '/users'), {
            method: 'POST',
            headers: { ...c(), 'Content-Type': 'application/json' },
            body: JSON.stringify(t),
          });
          return (a.ok || (await (0, o.zG)({ response: a })), await a.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function $(e, t) {
        try {
          let a = await d(''.concat(i.CT, '/api/v1/users/').concat(e), {
            method: 'PATCH',
            headers: { ...c(), 'Content-Type': 'application/json' },
            body: JSON.stringify(t),
          });
          return (a.ok || (await (0, o.zG)({ response: a })), await a.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function Q(e) {
        try {
          let t = await d(''.concat(i.CT, '/api/v1/users/').concat(e), {
            method: 'DELETE',
            headers: c(),
          });
          return (t.ok || (await (0, o.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function ee(e) {
        let t = await d(''.concat(i.CT, '/api/v1/settings?accountId=').concat(e), { headers: c() });
        return (t.ok || (await (0, o.zG)({ response: t })), t.json());
      }
      async function et(e, t) {
        if (!(0, n.LP)()) throw Error('Not authenticated');
        let a = await d(''.concat(i.CT, '/api/v1/settings/').concat(e), {
          method: 'PATCH',
          headers: { ...c(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: t }),
        });
        return (a.ok || (await (0, o.zG)({ response: a })), a.json());
      }
      async function ea(e, t) {
        let a = await d(''.concat(i.CT, '/api/v1/ingest/url'), {
          method: 'POST',
          headers: { ...c(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: e, board_id: t }),
        });
        if (!a.ok) {
          let e = await a.json().catch(() => ({}));
          throw Error(e.error || e.message || 'Failed to ingest URL: '.concat(a.statusText));
        }
        return a.json();
      }
      async function eo() {
        let e = await d(''.concat(i.CT, '/api/v1/system/reimport-status'), {
          method: 'GET',
          headers: c(),
        });
        if (!e.ok) throw await (0, o.zG)({ response: e });
        return e.json();
      }
      async function en() {
        let e = await d(''.concat(i.CT, '/api/v1/system/reimport-complete'), {
          method: 'POST',
          headers: { ...c(), 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (!e.ok) throw await (0, o.zG)({ response: e });
        return e.json();
      }
      let ei = {
        get: async (e, t) => {
          let a = await d(''.concat(i.CT).concat(e), {
            method: 'GET',
            headers: { ...c(), ...(null == t ? void 0 : t.headers) },
          });
          return (a.ok || (await (0, o.zG)({ response: a })), { data: await a.json() });
        },
        post: async (e, t, a) => {
          let n = t instanceof FormData,
            r = await d(''.concat(i.CT).concat(e), {
              method: 'POST',
              headers: {
                ...c(),
                ...(!n && { 'Content-Type': 'application/json' }),
                ...(null == a ? void 0 : a.headers),
              },
              body: n ? t : JSON.stringify(t),
            });
          return (r.ok || (await (0, o.zG)({ response: r })), { data: await r.json() });
        },
        patch: async (e, t, a) => {
          let n = await d(''.concat(i.CT).concat(e), {
            method: 'PATCH',
            headers: {
              ...c(),
              'Content-Type': 'application/json',
              ...(null == a ? void 0 : a.headers),
            },
            body: JSON.stringify(t),
          });
          return (n.ok || (await (0, o.zG)({ response: n })), { data: await n.json() });
        },
        delete: async (e, t) => {
          let a = await d(''.concat(i.CT).concat(e), {
            method: 'DELETE',
            headers: { ...c(), ...(null == t ? void 0 : t.headers) },
          });
          return (a.ok || (await (0, o.zG)({ response: a })), { data: await a.json() });
        },
      };
    },
    3291: function (e, t, a) {
      'use strict';
      a.d(t, {
        Ar: function () {
          return u;
        },
        CT: function () {
          return l;
        },
        Ku: function () {
          return y;
        },
        LS: function () {
          return v;
        },
        M6: function () {
          return h;
        },
        OJ: function () {
          return d;
        },
        Qn: function () {
          return g;
        },
        X8: function () {
          return _;
        },
        nj: function () {
          return c;
        },
        oj: function () {
          return f;
        },
        pA: function () {
          return m;
        },
        yD: function () {
          return p;
        },
        zC: function () {
          return w;
        },
      });
      var o = a(4859);
      function n(e) {
        let t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : '';
        return (void 0 !== o && o.env && o.env[e]) || t;
      }
      n('INTERNAL_API_URL');
      let i = { apiPort: 'keimenon.startup.apiPort', dev: 'keimenon.startup.dev' };
      function r(e) {
        let t = window.location ? new URLSearchParams(window.location.search).get(e) : null;
        if (t && t.trim().length > 0) {
          try {
            window.sessionStorage.setItem(i[e], t);
          } catch (e) {}
          return t;
        }
        try {
          let t = window.sessionStorage.getItem(i[e]);
          if (t && t.trim().length > 0) return t;
        } catch (e) {}
        return null;
      }
      let s = r('apiPort'),
        l =
          (s ? 'http://127.0.0.1:'.concat(s) : null) ||
          n('NEXT_PUBLIC_API_URL', 'http://127.0.0.1:4001');
      (console.log('[Config] API_BASE_URL resolved to:', l),
        n('NEXT_PUBLIC_ENABLE_PRO_FEATURES'),
        n('NEXT_PUBLIC_ENABLE_BUSINESS_FEATURES'));
      let c = '1' === n('NEXT_PUBLIC_ENABLE_LEGACY_IMPORTS'),
        d = '1' === n('NEXT_PUBLIC_ENABLE_HYBRID_LOCAL_FIRST'),
        u = 'false' !== n('NEXT_PUBLIC_ENABLE_3D_RENDERER', 'true');
      n('NEXT_PUBLIC_USE_DIRECT_SSE');
      let p = '1' === n('NEXT_PUBLIC_DEBUG_IMPORT_SELECTOR');
      r('dev');
      let m = 'true' === n('NEXT_PUBLIC_E2E_TESTING');
      (parseInt(n('NEXT_PUBLIC_JOB_POLL_INTERVAL_MS', '2000'), 10),
        parseInt(n('NEXT_PUBLIC_SSE_RECONNECT_TIMEOUT_MS', '5000'), 10),
        parseInt(n('NEXT_PUBLIC_MAX_JOB_WAIT_MS', '1500000'), 10));
      let f = n('NEXT_PUBLIC_SENTRY_DSN'),
        _ = n('NEXT_PUBLIC_SENTRY_ENVIRONMENT', n('NODE_ENV', 'production')),
        h = parseFloat(n('NEXT_PUBLIC_SENTRY_SAMPLE_RATE', '1.0')),
        g = parseFloat(n('NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE', '0.1')),
        y = parseFloat(n('NEXT_PUBLIC_SENTRY_REPLAY_SESSION_SAMPLE_RATE', '0.1')),
        w = parseFloat(n('NEXT_PUBLIC_SENTRY_REPLAY_ERROR_SAMPLE_RATE', '1.0')),
        v = 'false' !== n('NEXT_PUBLIC_SENTRY_SCRUB_PII', 'true');
      (n('NEXT_PUBLIC_AUTH_DOMAIN'), n('NEXT_PUBLIC_AUTH_CLIENT_ID'), n('NODE_ENV', 'production'));
    },
    2844: function (e, t, a) {
      'use strict';
      a.d(t, {
        Et: function () {
          return u;
        },
        FE: function () {
          return s;
        },
        JN: function () {
          return d;
        },
        Vo: function () {
          return m;
        },
        bK: function () {
          return p;
        },
        zG: function () {
          return c;
        },
      });
      var o = a(1482);
      class n extends Error {
        constructor(e, t, a = 500, o) {
          (super(e),
            (this.code = t),
            (this.statusCode = a),
            (this.details = o),
            (this.name = 'AppError'));
        }
      }
      class i extends n {
        constructor(e, t) {
          (super(e, 'VALIDATION_ERROR', 400, t), (this.name = 'ValidationError'));
        }
      }
      class r extends n {
        constructor(e, t) {
          (super(e, 'NETWORK_ERROR', 503, t), (this.name = 'NetworkError'));
        }
      }
      class s extends n {
        constructor(e, t) {
          (super(e, 'FILE_ERROR', 400, t), (this.name = 'FileError'));
        }
      }
      class l extends n {
        constructor(e, t) {
          (super(e, 'AUTH_ERROR', 401, t), (this.name = 'AuthError'));
        }
      }
      async function c(e) {
        let t;
        if ('TypeError' === e.name && e.message.includes('fetch'))
          throw (
            (t = new r('Unable to connect to server. Please check your connection.')),
            o.I.capture(
              t,
              { domain: 'api', operation: 'network.fetch', metadata: { originalError: e.message } },
              'error'
            ),
            t
          );
        if (e.response) {
          let a = e.response.status,
            c = await e.response.json().catch(() => ({})),
            d = c.error || {},
            u = d.message || c.message || 'An error occurred',
            p = d.domain || 'api',
            m = d.operation || 'api.'.concat(e.response.url || 'unknown');
          t = ((e) => {
            switch (e) {
              case 400:
              case 422:
                return new i(u, c.errors || d);
              case 401:
              case 403:
                return new l(u);
              case 404:
                return new n(u, 'NOT_FOUND', 404);
              case 413:
                return new s(u, { maxSize: '10MB' });
              case 500:
                return new n(u, 'SERVER_ERROR', 500);
              case 503:
                return new r(u);
              default:
                return new n(u, 'UNKNOWN_ERROR', e);
            }
          })(a);
          let f = a >= 500 ? 'error' : a >= 400 ? 'warn' : 'info';
          throw (
            o.I.capture(
              t,
              {
                domain: p,
                operation: m,
                metadata: { statusCode: a, backendError: d, url: e.response.url },
              },
              f
            ),
            t
          );
        }
        throw (
          (t = new n(e.message || 'An unexpected error occurred', 'UNKNOWN_ERROR')),
          o.I.capture(
            t,
            { domain: 'api', operation: 'unknown', metadata: { originalError: e } },
            'error'
          ),
          t
        );
      }
      async function d(e) {
        let t,
          a = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {},
          { maxAttempts: o = 3, delay: n = 1e3, backoff: i = !0, onRetry: r } = a;
        for (let a = 1; a <= o; a++)
          try {
            return await e();
          } catch (e) {
            if (((t = e), a < o)) {
              r && r(a, e);
              let t = i ? n * Math.pow(2, a - 1) : n;
              await new Promise((e) => setTimeout(e, t));
            }
          }
        throw t;
      }
      function u(e, t) {
        o.I.info(e, { domain: t.domain || 'api', operation: t.operation, metadata: t.metadata });
      }
      function p(e, t, a) {
        o.I.info(e, { domain: 'import', operation: t, metadata: a });
      }
      function m(e, t, a) {
        o.I.info(e, { domain: 'jobs', operation: t, metadata: a });
      }
    },
    1103: function (e, t, a) {
      'use strict';
      function o(e) {
        var t, a, o;
        let i = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : 24;
        return (o = e.label
          ? e.label
          : e.title
            ? e.title
            : e.name
              ? e.name
              : 'Lexeme' === e.kind && e.lemma
                ? e.lemma
                : 'Phrase' === e.kind && (e.text || e.normalized_text)
                  ? e.text || e.normalized_text || ''
                  : 'VerifiedClaim' === e.kind && e.claim_text
                    ? e.claim_text
                    : 'Principal' === e.kind
                      ? e.display_name
                        ? e.display_name
                        : 'agent' === e.principal_kind && e.platform
                          ? {
                              chatgpt: 'ChatGPT',
                              claude: 'Claude',
                              gemini: 'Gemini',
                              unknown: 'AI Assistant',
                            }[(t = e.platform).toLowerCase()] || t
                          : 'human' === e.principal_kind && e.email
                            ? e.email
                            : ((a = e.principal_kind) &&
                                { human: 'User', agent: 'AI Assistant', contact: 'Contact' }[a]) ||
                              'Principal'
                      : 'ConversationThread' === e.kind
                        ? e.title
                          ? e.title
                          : e.purpose
                            ? ''.concat(n(e.purpose), ' thread')
                            : 'Conversation'
                        : e.role
                          ? ''.concat(n(e.role), ' message')
                          : e.language
                            ? ''.concat(e.language, ' code')
                            : e.kind
                                .replace(/([a-z])([A-Z])/g, '$1 $2')
                                .replace(/^./, (e) => e.toUpperCase())).length <= i
          ? o
          : o.slice(0, i - 1) + '…';
      }
      function n(e) {
        return e.charAt(0).toUpperCase() + e.slice(1).toLowerCase();
      }
      a.d(t, {
        F: function () {
          return o;
        },
      });
    },
    1482: function (e, t, a) {
      'use strict';
      a.d(t, {
        I: function () {
          return i;
        },
      });
      var o = a(8155);
      class n {
        initialize() {
          this.isInitialized ||
            ((this.isInitialized = !0),
            window.addEventListener('error', (e) => {
              this.capture(e.error || Error(e.message), {
                domain: 'system',
                operation: 'window.error',
                metadata: { filename: e.filename, lineno: e.lineno, colno: e.colno },
              });
            }),
            window.addEventListener('unhandledrejection', (e) => {
              let t = e.reason instanceof Error ? e.reason : Error(String(e.reason));
              this.capture(t, {
                domain: 'system',
                operation: 'unhandledRejection',
                metadata: { reason: e.reason },
              });
            }),
            this.info('ErrorCaptureService initialized', {
              domain: 'system',
              operation: 'errorCapture.init',
            }));
        }
        capture(e, t) {
          let a = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : 'error',
            n =
              'string' == typeof e
                ? 'error' === a || 'warn' === a
                  ? Error(e)
                  : { message: e, name: 'LogMessage' }
                : e,
            i = {
              id: this.generateId(),
              timestamp: Date.now(),
              domain: t.domain,
              operation: t.operation,
              message: n.message,
              stack: n.stack,
              severity: a,
              context: t,
              error: n,
              userMessage: this.getUserMessage(n, t),
            };
          return (
            this.errors.push(i),
            this.errors.length > this.maxErrors && this.errors.shift(),
            'error' === a && this.persistError(i),
            this.notifySubscribers(i),
            ('error' === a || 'warn' === a) &&
              o.O7(n, {
                tags: { domain: t.domain, operation: t.operation },
                extra: { ...t.metadata, severity: a },
                user: t.userId && t.accountId ? { id: t.userId, accountId: t.accountId } : void 0,
                level: 'error' === a ? 'error' : 'warning',
              }),
            i
          );
        }
        error(e) {
          let t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {};
          return this.capture(
            Error(e),
            { domain: t.domain || 'system', operation: t.operation || 'unknown', ...t },
            'error'
          );
        }
        warn(e) {
          let t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {};
          return this.capture(
            Error(e),
            { domain: t.domain || 'system', operation: t.operation || 'unknown', ...t },
            'warn'
          );
        }
        info(e) {
          let t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {};
          return this.capture(
            e,
            { domain: t.domain || 'system', operation: t.operation || 'unknown', ...t },
            'info'
          );
        }
        debug(e) {
          let t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {};
          return this.capture(
            e,
            { domain: t.domain || 'system', operation: t.operation || 'unknown', ...t },
            'debug'
          );
        }
        subscribe(e) {
          return (
            this.subscribers.add(e),
            () => {
              this.subscribers.delete(e);
            }
          );
        }
        getRecent() {
          let e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : 50,
            t = arguments.length > 1 ? arguments[1] : void 0,
            a = [...this.errors];
          if (t) {
            if (t.domain) {
              let e = Array.isArray(t.domain) ? t.domain : [t.domain];
              a = a.filter((t) => e.includes(t.domain));
            }
            if (t.severity) {
              let e = Array.isArray(t.severity) ? t.severity : [t.severity];
              a = a.filter((t) => e.includes(t.severity));
            }
            if (t.search) {
              let e = t.search.toLowerCase();
              a = a.filter(
                (t) => t.message.toLowerCase().includes(e) || t.operation.toLowerCase().includes(e)
              );
            }
            (t.startTime && (a = a.filter((e) => e.timestamp >= t.startTime)),
              t.endTime && (a = a.filter((e) => e.timestamp <= t.endTime)));
          }
          return a.sort((e, t) => t.timestamp - e.timestamp).slice(0, e);
        }
        getByDomain() {
          let e = {
            api: [],
            import: [],
            analytics: [],
            ui: [],
            database: [],
            system: [],
            jobs: [],
          };
          return (
            this.errors.forEach((t) => {
              e[t.domain].push(t);
            }),
            e
          );
        }
        getCounts() {
          let e = { error: 0, warn: 0, info: 0, debug: 0 };
          return (
            this.errors.forEach((t) => {
              e[t.severity]++;
            }),
            e
          );
        }
        clear() {
          ((this.errors = []),
            this.clearPersistedErrors(),
            this.info('Error log cleared', { domain: 'system', operation: 'errorCapture.clear' }));
        }
        clearFiltered(e) {
          let t = this.errors.filter(
            (t) =>
              (!!e.domain &&
                !(Array.isArray(e.domain) ? e.domain : [e.domain]).includes(t.domain)) ||
              (!!e.severity &&
                !(Array.isArray(e.severity) ? e.severity : [e.severity]).includes(t.severity))
          );
          this.errors = t;
        }
        exportJSON(e) {
          return JSON.stringify(e ? this.getRecent(this.maxErrors, e) : this.errors, null, 2);
        }
        exportCSV(e) {
          return [
            'Timestamp,Domain,Operation,Severity,Message',
            ...(e ? this.getRecent(this.maxErrors, e) : this.errors)
              .map((e) => [
                new Date(e.timestamp).toISOString(),
                e.domain,
                e.operation,
                e.severity,
                '"'.concat(e.message.replace(/"/g, '""'), '"'),
              ])
              .map((e) => e.join(',')),
          ].join('\n');
        }
        generateId() {
          return 'err_'.concat(Date.now(), '_').concat(Math.random().toString(36).substr(2, 9));
        }
        notifySubscribers(e) {
          this.subscribers.forEach((t) => {
            try {
              t(e);
            } catch (e) {
              console.error('[ErrorCaptureService] Subscriber error:', e);
            }
          });
        }
        getUserMessage(e, t) {
          switch (t.domain) {
            case 'api':
              return 'Failed to communicate with server. Please check your connection.';
            case 'import':
              return 'Import failed. Please check your file format and try again.';
            case 'analytics':
              return 'Failed to load analytics data. Please refresh the page.';
            case 'database':
              return 'Database operation failed. Please contact support.';
            case 'ui':
              return 'Something went wrong. Please refresh the page.';
            default:
              return e.message;
          }
        }
        getConsoleStyle(e) {
          switch (e) {
            case 'error':
              return 'color: #ef4444; font-weight: bold';
            case 'warn':
              return 'color: #f59e0b; font-weight: bold';
            case 'info':
              return 'color: #3b82f6; font-weight: normal';
            case 'debug':
              return 'color: #64748b; font-weight: normal';
          }
        }
        persistError(e) {
          try {
            let t = 'keimenon_critical_errors',
              a = localStorage.getItem(t),
              o = a ? JSON.parse(a) : [];
            (o.push(e), o.length > 50 && o.shift(), localStorage.setItem(t, JSON.stringify(o)));
          } catch (e) {
            console.error('[ErrorCaptureService] Failed to persist error:', e);
          }
        }
        clearPersistedErrors() {
          try {
            localStorage.removeItem('keimenon_critical_errors');
          } catch (e) {
            console.error('[ErrorCaptureService] Failed to clear persisted errors:', e);
          }
        }
        constructor() {
          ((this.errors = []),
            (this.subscribers = new Set()),
            (this.maxErrors = 1e3),
            (this.isInitialized = !1),
            this.initialize());
        }
      }
      let i = new n();
      ((window.errorCapture = i),
        console.log('%c[system] errorCapture.init', 'color: #3b82f6; font-weight: normal'),
        console.log({ message: 'ErrorCaptureService initialized', name: 'LogMessage' }),
        console.groupEnd());
    },
    8155: function (e, t, a) {
      'use strict';
      a.d(t, {
        O7: function () {
          return p;
        },
        d4: function () {
          return l;
        },
        h2: function () {
          return c;
        },
        j6: function () {
          return u;
        },
        tN: function () {
          return d;
        },
      });
      var o = a(89),
        n = a(1052),
        i = a(8885),
        r = a(3953),
        s = a(3291);
      function l() {
        return !!s.oj;
      }
      function c() {
        return 'true' === localStorage.getItem('sentry_consent');
      }
      function d(e) {
        (localStorage.setItem('sentry_consent', e ? 'true' : 'false'), !e && l() && o.xv());
      }
      function u() {
        if (!s.oj) {
          console.log('\uD83D\uDCCA Sentry: Disabled (no NEXT_PUBLIC_SENTRY_DSN provided)');
          return;
        }
        if (!c()) {
          console.log('\uD83D\uDCCA Sentry: Disabled (user has not consented)');
          return;
        }
        (console.log(
          '\uD83D\uDCCA Sentry: Initializing (env: '.concat(s.X8, ', sample: ').concat(s.M6, ')')
        ),
          n.S({
            dsn: s.oj,
            environment: s.X8,
            sampleRate: s.M6,
            tracesSampleRate: s.Qn,
            integrations: [i.G({ maskAllText: !0, blockAllMedia: !0, maskAllInputs: !0 })],
            replaysSessionSampleRate: s.Ku,
            replaysOnErrorSampleRate: s.zC,
            beforeSend(e, t) {
              if (s.LS) {
                var a;
                (e.breadcrumbs &&
                  (e.breadcrumbs = e.breadcrumbs.map(
                    (e) => (
                      e.data &&
                        Object.keys(e.data).forEach((t) => {
                          (t.toLowerCase().includes('password') ||
                            t.toLowerCase().includes('token') ||
                            t.toLowerCase().includes('secret') ||
                            t.toLowerCase().includes('email')) &&
                            (e.data[t] = '[REDACTED]');
                        }),
                      e
                    )
                  )),
                  (null === (a = e.user) || void 0 === a ? void 0 : a.email) && delete e.user.email,
                  e.request &&
                    (e.request.headers &&
                      (delete e.request.headers.authorization,
                      delete e.request.headers.cookie,
                      delete e.request.headers['x-api-key']),
                    e.request.query_string &&
                      'string' == typeof e.request.query_string &&
                      (e.request.query_string = e.request.query_string
                        .replace(/token=[^&]*/gi, 'token=[REDACTED]')
                        .replace(/password=[^&]*/gi, 'password=[REDACTED]')
                        .replace(/key=[^&]*/gi, 'key=[REDACTED]'))),
                  e.extra &&
                    Object.keys(e.extra).forEach((t) => {
                      (t.toLowerCase().includes('password') ||
                        t.toLowerCase().includes('token') ||
                        t.toLowerCase().includes('secret')) &&
                        (e.extra[t] = '[REDACTED]');
                    }));
              }
              return e;
            },
            enabled: 'production' === s.X8,
          }),
          console.log('\uD83D\uDCCA Sentry: Initialized successfully'));
      }
      function p(e, t) {
        l() &&
          c() &&
          r.$e((a) => {
            ((null == t ? void 0 : t.tags) &&
              Object.entries(t.tags).forEach((e) => {
                let [t, o] = e;
                a.setTag(t, o);
              }),
              (null == t ? void 0 : t.extra) &&
                Object.entries(t.extra).forEach((e) => {
                  let [t, o] = e;
                  a.setExtra(t, o);
                }),
              (null == t ? void 0 : t.user) &&
                a.setUser({ id: t.user.id, accountId: t.user.accountId, rank: t.user.rank }),
              (null == t ? void 0 : t.level) && a.setLevel(t.level),
              o.Tb(e));
          });
      }
    },
    4374: function (e, t, a) {
      'use strict';
      a.d(t, {
        O: function () {
          return p;
        },
      });
      var o = a(7582),
        n = a(4452),
        i = a(1493),
        r = a(1103);
      let s = [300, 900, 2100],
        l = new Set([
          'AccountNode',
          'UserNode',
          'AgentNode',
          'ChatThread',
          'Source',
          'SourceDoc',
          'Group',
          'Folder',
          'ObjectiveClaim',
          'Constellation',
          'Principal',
          'ConversationThread',
          'VerifiedSource',
          'VerifiedClaim',
          'CodeBlock',
          'Topic',
          'Board',
        ]);
      function c(e) {
        var t, a;
        let o = e.properties || {},
          n = 'object' == typeof o.contact_info && o.contact_info ? o.contact_info : void 0,
          i =
            'string' == typeof (null == n ? void 0 : n.source_platform)
              ? n.source_platform
              : 'string' == typeof o.platform
                ? o.platform
                : void 0,
          s = (0, r.F)({ id: e.id, kind: e.kind, ...o, platform: i });
        return {
          id: e.id,
          type: (function (e) {
            switch (e) {
              case 'ChatThread':
                return 'conversation';
              case 'Message':
                return 'message';
              case 'Source':
                return 'source';
              case 'CodeBlock':
                return 'code';
              default:
                return e || 'source';
            }
          })(e.kind),
          kind: e.kind,
          sourceRole: null === (t = e.properties) || void 0 === t ? void 0 : t.source_role,
          position: { x: 800 * Math.random(), y: 600 * Math.random() },
          data: {
            label: s,
            content: null === (a = e.properties) || void 0 === a ? void 0 : a.content,
            metadata: e.properties,
          },
        };
      }
      function d(e) {
        return {
          id: e.id,
          source: 'string' == typeof e.from ? e.from : e.from.id,
          target: 'string' == typeof e.to ? e.to : e.to.id,
          type: (function (e) {
            switch (e) {
              case 'CONTAINS':
              case 'HAS_MESSAGE':
                return 'contains';
              case 'DERIVES_FROM':
              case 'EXTRACTED_FROM':
                return 'derives';
              case 'COMPILED_FROM':
              case 'STITCHED_FROM':
                return 'compiled';
              default:
                return 'references';
            }
          })(e.kind),
          kind: e.kind,
          data: e.properties,
        };
      }
      let u = {
          nodes: [],
          edges: [],
          isLoading: !1,
          error: null,
          selectedNode: null,
          selectedNodeIds: new Set(),
          hoveredNodeId: null,
          detailPanelNode: null,
          viewport: { x: 0, y: 0, zoom: 1 },
          filters: {
            nodeTypes: new Set(),
            searchQuery: '',
            filteredNodeIds: null,
            sourceRoleFilter: new Set(),
          },
          currentAccountId: null,
        },
        p = (0, o.Ue)()(
          (0, n.mW)(
            (e, t) => ({
              ...u,
              setNodes: (t) => e({ nodes: t }),
              setEdges: (t) => e({ edges: t }),
              loadGraphData: async () => {
                e({ isLoading: !0, error: null });
                try {
                  let t = null,
                    a = null;
                  for (let e = 0; e <= s.length; e += 1)
                    try {
                      [t, a] = await Promise.all([
                        (0, i.v$)({ limit: 1e5 }),
                        (0, i.W8)({ limit: 2e5, sort: 'created_at', order: 'desc' }),
                      ]);
                      break;
                    } catch (t) {
                      if (
                        !(
                          e < s.length &&
                          (function (e) {
                            let t = null == e ? void 0 : e.statusCode,
                              a = ((null == e ? void 0 : e.message) || '').toLowerCase();
                            return (
                              (null == e ? void 0 : e.code) === 'NETWORK_ERROR' ||
                              429 === t ||
                              ('number' == typeof t && t >= 500) ||
                              a.includes('timeout') ||
                              a.includes('network') ||
                              a.includes('fetch')
                            );
                          })(t)
                        )
                      )
                        throw t;
                      await (function (e) {
                        return new Promise((t) => setTimeout(t, e));
                      })(s[e]);
                    }
                  if (!t || !a) throw Error('Failed to load graph data after retries');
                  let o = t.nodes.map(c),
                    n = o;
                  o.length > 5e3 &&
                    ((n = o.filter((e) => l.has(e.kind || e.type))),
                    console.info(
                      '[Keimenon] Smart filter: '
                        .concat(o.length, ' nodes → ')
                        .concat(n.length, ' structural nodes')
                    ));
                  let r = new Set(n.map((e) => e.id)),
                    u = a.edges.map(d).filter((e) => r.has(e.source) && r.has(e.target));
                  e({ nodes: n, edges: u, isLoading: !1, error: null });
                } catch (t) {
                  (console.error('Failed to load graph data:', t),
                    e({ isLoading: !1, error: t.message || 'Failed to load graph data' }));
                }
              },
              hydrateGraphSubset: function (t) {
                let a = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : [];
                return e((e) => {
                  let o = new Map(e.nodes.map((e) => [e.id, e]));
                  for (let e of t) {
                    let t = c(e),
                      a = o.get(t.id);
                    a ? o.set(t.id, { ...a, ...t, position: a.position }) : o.set(t.id, t);
                  }
                  let n = Array.from(o.values()),
                    i = new Set(n.map((e) => e.id)),
                    r = new Map(e.edges.map((e) => [e.id, e]));
                  for (let e of a) {
                    let t = d(e);
                    i.has(t.source) && i.has(t.target) && r.set(t.id, t);
                  }
                  return { nodes: n, edges: Array.from(r.values()) };
                });
              },
              addNode: (t) =>
                e((e) => ({
                  nodes: e.nodes.some((e) => e.id === t.id)
                    ? e.nodes.map((e) => (e.id === t.id ? { ...e, ...t } : e))
                    : [...e.nodes, t],
                })),
              addEdge: (t) =>
                e((e) => ({
                  edges: e.edges.some((e) => e.id === t.id)
                    ? e.edges.map((e) => (e.id === t.id ? { ...e, ...t } : e))
                    : [...e.edges, t],
                })),
              updateNode: (t, a) =>
                e((e) => ({ nodes: e.nodes.map((e) => (e.id === t ? { ...e, ...a } : e)) })),
              deleteNode: (t) =>
                e((e) => ({
                  nodes: e.nodes.filter((e) => e.id !== t),
                  edges: e.edges.filter((e) => e.source !== t && e.target !== t),
                  selectedNodeIds: new Set(Array.from(e.selectedNodeIds).filter((e) => e !== t)),
                })),
              deleteEdge: (t) => e((e) => ({ edges: e.edges.filter((e) => e.id !== t) })),
              setSelectedNode: (t) => e({ selectedNode: t }),
              selectNode: function (t) {
                let a = arguments.length > 1 && void 0 !== arguments[1] && arguments[1];
                return e((e) => {
                  let o = new Set(a ? e.selectedNodeIds : []);
                  return (
                    o.add(t),
                    {
                      selectedNodeIds: o,
                      selectedNode: a ? e.selectedNode : e.nodes.find((e) => e.id === t) || null,
                    }
                  );
                });
              },
              deselectNode: (t) =>
                e((e) => {
                  var a;
                  let o = new Set(e.selectedNodeIds);
                  return (
                    o.delete(t),
                    {
                      selectedNodeIds: o,
                      selectedNode:
                        (null === (a = e.selectedNode) || void 0 === a ? void 0 : a.id) === t
                          ? null
                          : e.selectedNode,
                    }
                  );
                }),
              clearSelection: () => e({ selectedNodeIds: new Set(), selectedNode: null }),
              selectAll: () => e((e) => ({ selectedNodeIds: new Set(e.nodes.map((e) => e.id)) })),
              setHoveredNode: (t) => e({ hoveredNodeId: t }),
              openDetailPanel: (t) => e({ detailPanelNode: t }),
              closeDetailPanel: () => e({ detailPanelNode: null }),
              setViewport: (t) => e((e) => ({ viewport: { ...e.viewport, ...t } })),
              resetViewport: () => e({ viewport: { x: 0, y: 0, zoom: 1 } }),
              zoomIn: () =>
                e((e) => ({
                  viewport: { ...e.viewport, zoom: Math.min(1.2 * e.viewport.zoom, 3) },
                })),
              zoomOut: () =>
                e((e) => ({
                  viewport: { ...e.viewport, zoom: Math.max(e.viewport.zoom / 1.2, 0.1) },
                })),
              fitView: () => {
                let { nodes: a } = t();
                if (0 === a.length) return;
                let o = Math.min(...a.map((e) => e.position.x)) - 50,
                  n = Math.min(...a.map((e) => e.position.y)) - 50,
                  i = Math.max(...a.map((e) => e.position.x)) + 50,
                  r = Math.max(...a.map((e) => e.position.y)) + 50,
                  s = i - o,
                  l = r - n,
                  c = window.innerWidth,
                  d = window.innerHeight,
                  u = Math.min(c / s, d / l, 1);
                e({
                  viewport: { x: -o * u + (c - s * u) / 2, y: -n * u + (d - l * u) / 2, zoom: u },
                });
              },
              setNodeTypeFilter: (t) => e((e) => ({ filters: { ...e.filters, nodeTypes: t } })),
              setSearchQuery: (t) => e((e) => ({ filters: { ...e.filters, searchQuery: t } })),
              setFilteredNodeIds: (t) =>
                e((e) => ({ filters: { ...e.filters, filteredNodeIds: t } })),
              setSourceRoleFilter: (t) =>
                e((e) => ({ filters: { ...e.filters, sourceRoleFilter: new Set(t) } })),
              clearFilters: () =>
                e(() => ({
                  filters: {
                    nodeTypes: new Set(),
                    searchQuery: '',
                    filteredNodeIds: null,
                    sourceRoleFilter: new Set(),
                  },
                })),
              getNode: (e) => t().nodes.find((t) => t.id === e),
              getConnectedNodes: (e) => {
                let { nodes: a, edges: o } = t(),
                  n = new Set(
                    o
                      .filter((t) => t.source === e || t.target === e)
                      .flatMap((e) => [e.source, e.target])
                  );
                return (n.delete(e), a.filter((e) => n.has(e.id)));
              },
              setCurrentAccountId: (t) => e({ currentAccountId: t }),
              reset: () => e(u),
            }),
            { name: 'KeimenonStore' }
          )
        );
    },
    7271: function (e, t, a) {
      'use strict';
      a.d(t, {
        r3: function () {
          return j;
        },
        F7: function () {
          return n;
        },
        p$: function () {
          return v;
        },
      });
      var o,
        n,
        i = a(8204);
      let r = i.Ry({
          id: i.Z_(),
          kind: i.Z_(),
          created_at: i.Rx(),
          updated_at: i.Rx(),
          metadata: i.IM(i.Yj()).optional(),
        }),
        s = i.Ry({
          origin_principal_id: i.Z_(),
          origin_type: i.Km([
            'user_upload',
            'chat_import',
            'agent_import',
            'agent_generated',
            'system_seed',
            'migrated',
          ]),
          origin_ref: i.Z_(),
          trust_state: i.Km(['ugc', 'external_claim', 'verified_source']),
          original_url: i.Z_().url().optional(),
          retrieved_at: i.Rx().optional(),
          capture_hash: i.Z_().optional(),
          attested_by: i.IX(i.Z_()).optional(),
        }),
        l = i.Ry({ origin: i.Z_(), retrieved_at: i.Rx().optional(), attested: i.O7().default(!1) }),
        c = i.Ry({
          can_upload: i.O7().default(!0),
          can_run_tools: i.O7().default(!1),
          can_import_web: i.O7().default(!1),
          can_own_account: i.O7().default(!1),
          can_approve_runs: i.O7().default(!1),
        });
      r.extend({
        kind: i.i0('Principal'),
        display_name: i.Z_(),
        email: i.Z_().email().optional(),
        principal_kind: i.Km(['human', 'agent', 'contact']),
        capabilities: c,
        policy_profile_id: i.Z_().optional(),
        created_by: i.Z_().optional(),
        agent_config: i
          .Ry({
            model: i.Z_().optional(),
            tools_allowed: i.IX(i.Z_()).optional(),
            system_prompt: i.Z_().optional(),
          })
          .optional(),
        contact_info: i
          .Ry({ external_id: i.Z_().optional(), source_platform: i.Z_().optional() })
          .optional(),
      });
      let d = i.Km(['imported', 'workspace', 'brief', 'agent_output', 'research_bundle']),
        u = r.extend({
          kind: i.i0('Source'),
          url: i.Z_().optional(),
          file_path: i.Z_().optional(),
          fingerprint: i.Z_(),
          mime_type: i.Z_(),
          size_bytes: i.Rx(),
          title: i.Z_().optional(),
          content_location: i.Z_().optional(),
          provenance: i.G0([s, l]).optional(),
          source_role: d.default('imported'),
          attached_agents: i.IX(i.Z_()).optional(),
          context_pins: i.IX(i.Z_()).optional(),
        });
      (r.extend({
        kind: i.i0('SourceSpan'),
        source_id: i.Z_(),
        message_id: i.Z_().optional(),
        conversation_id: i.Z_().optional(),
        text: i.Z_(),
        normalized_text: i.Z_(),
        start_char: i.Rx().min(0),
        end_char: i.Rx().min(0),
        boundary_kind: i.Km(['line', 'sentence', 'paragraph', 'token_window']).default('sentence'),
        span_hash: i.Z_(),
      }),
        r.extend({
          kind: i.i0('Packet'),
          text: i.Z_(),
          normalized_text: i.Z_(),
          occurrences: i.Rx().min(1).default(1),
          mass: i.Rx().default(0),
          coverage: i.Rx().min(0).default(0),
          idf: i.Rx().min(0).default(0),
          entropy_factor: i.Rx().min(0).default(0),
          packet_hash: i.Z_(),
        }),
        r.extend({
          kind: i.i0('AtomicUnit'),
          unit_type: i.Km(['char', 'trigram']),
          value: i.Z_(),
          normalized_value: i.Z_(),
          unit_hash: i.Z_(),
        }),
        r.extend({
          kind: i.i0('SourceDoc'),
          title: i.Z_(),
          n_segments: i.Rx(),
          n_chars: i.Rx(),
          created_ts_min: i.Rx(),
          created_ts_max: i.Rx(),
          content_location: i.Z_().optional(),
          provenance: i.IX(
            i.Ry({
              conversation_id: i.Z_(),
              message_idx_start: i.Rx(),
              message_idx_end: i.Rx(),
              timestamp_min: i.Rx().optional(),
              timestamp_max: i.Rx().optional(),
              original_title: i.Z_().optional(),
            })
          ),
          metadata: i.IM(i.Yj()).default({}),
        }));
      let p = r.extend({
        kind: i.i0('Group'),
        name: i.Z_(),
        purpose: i.Z_().optional(),
        member_count: i.Rx().default(0),
        trust_metrics: i
          .Ry({
            objectivity: i.Rx().min(0).max(1).optional(),
            subjectivity: i.Rx().min(0).max(1).optional(),
            verification_ratio: i.Rx().min(0).max(1).optional(),
          })
          .optional(),
      });
      (r.extend({ kind: i.i0('Folder'), name: i.Z_(), parent_id: i.Z_().optional() }),
        r.extend({
          kind: i.i0('ObjectiveClaim'),
          claim_text: i.Z_(),
          type: i.Km(['fact', 'endpoint', 'parameter', 'definition', 'metric', 'config']),
          archetype: i
            .Km([
              'factual_claim',
              'endpoint_contract',
              'parameter_constraint',
              'definition_anchor',
              'metric_signal',
              'configuration_rule',
            ])
            .default('factual_claim'),
          status: i
            .dj(
              (e) => ('unverified' === e ? 'provisional' : e),
              i.Km(['provisional', 'verifying', 'verified', 'contested', 'stale'])
            )
            .default('provisional'),
          confidence: i.Rx().min(0).max(1).default(0.4),
          citations: i.IX(i.Ry({ node_id: i.Z_(), span: i.Z_().optional() })),
          supports: i.IX(i.Z_()).default([]),
          contradicts: i.IX(i.Z_()).default([]),
        }),
        r.extend({
          kind: i.i0('UnifiedDoc'),
          title: i.Z_(),
          ring: i.Km(['L0', 'L1', 'L2', 'L3']),
          content_markdown: i.Z_().optional(),
          content_location: i.Z_().optional(),
          token_count: i.Rx(),
          citations: i.IX(i.Ry({ node_id: i.Z_(), span: i.Z_().optional() })),
          claims_index: i.IX(i.Z_()),
        }),
        r.extend({
          kind: i.i0('Constellation'),
          members: i.IX(i.Z_()),
          centroid: i.Ry({ x: i.Rx(), y: i.Rx(), z: i.Rx().optional() }),
          metric: i.Z_(),
          collapsed: i.O7().default(!0),
        }),
        r.extend({
          kind: i.i0('UserNode'),
          email: i.Z_().email(),
          name: i.Z_(),
          preferences: i.IM(i.Yj()).optional(),
          policies: i.IM(i.Yj()).optional(),
        }),
        r.extend({
          kind: i.i0('AccountNode'),
          sql_account_id: i.Z_(),
          name: i.Z_(),
          account_type: i.Km(['admin', 'client']),
          account_class: i.Km(['free', 'professional', 'business']),
          owner_user_id: i.Z_().optional(),
          member_count: i.Rx().default(0),
          color: i.Z_().optional(),
          icon: i.Z_().optional(),
          policies: i.IM(i.Yj()).optional(),
        }),
        r.extend({
          kind: i.i0('ChatThread'),
          title: i.Z_(),
          system_preamble: i.Z_().optional(),
          persona: i.Ry({ name: i.Z_(), model: i.Z_(), tools_allowed: i.IX(i.Z_()) }).optional(),
        }));
      let m = i.Ry({
        source_ids: i.IX(i.Z_()),
        group_ids: i.IX(i.Z_()).default([]),
        workspace_id: i.Z_().optional(),
        include_pinned: i.O7().default(!0),
        expansion_rule: i.Km(['none', 'neighbors', 'connected']).default('none'),
      });
      (r.extend({
        kind: i.i0('ConversationThread'),
        human_principal_id: i.Z_(),
        agent_principal_id: i.Z_().optional(),
        context_set_id: i.Z_().optional(),
        purpose: i
          .Km(['summarize', 'cluster', 'draft', 'research', 'refactor', 'verify', 'general'])
          .default('general'),
        context_spec: m.optional(),
        title: i.Z_(),
        system_preamble: i.Z_().optional(),
        persona: i.Ry({ name: i.Z_(), model: i.Z_(), tools_allowed: i.IX(i.Z_()) }).optional(),
      }),
        r.extend({
          kind: i.i0('Board'),
          name: i.Z_(),
          description: i.Z_().optional(),
          columns: i.IX(i.Ry({ id: i.Z_(), title: i.Z_(), query: i.IM(i.Yj()).optional() })),
          view_mode: i.Km(['kanban', 'list', 'grid']).default('kanban'),
          query: i.IM(i.Yj()).optional(),
        }),
        r.extend({
          kind: i.i0('Message'),
          role: i.Km(['user', 'assistant', 'system']),
          content: i.Z_().optional(),
          content_location: i.Z_().optional(),
          content_hash: i.Z_().optional(),
          char_count: i.Rx().optional(),
          thread_id: i.Z_(),
          timestamp: i.Rx(),
          attachments: i.IX(i.Z_()).optional(),
        }),
        r.extend({
          kind: i.i0('CodeBlock'),
          language: i.Z_(),
          code: i.Z_().optional(),
          content_location: i.Z_().optional(),
          content_hash: i.Z_(),
          line_count: i.Rx(),
          char_count: i.Rx(),
          is_fenced: i.O7().default(!0),
          has_comments: i.O7().default(!1),
          derived_from_message_id: i.Z_().optional(),
        }),
        r.extend({
          kind: i.i0('Lexeme'),
          lemma: i.Z_(),
          pos: i.Z_().optional(),
          frequency: i.Rx().default(0),
        }),
        r.extend({
          kind: i.i0('Phrase'),
          text: i.Z_(),
          normalized_text: i.Z_(),
          type: i.Km(['n-gram', 'entity', 'concept']).default('n-gram'),
          entity_type: i.Z_().optional(),
          frequency: i.Rx().default(0),
        }),
        r.extend({
          kind: i.i0('Topic'),
          name: i.Z_(),
          description: i.Z_().optional(),
          keywords: i.IX(i.Z_()),
          strength: i.Rx().default(1),
        }),
        r.extend({
          kind: i.i0('VerifiedSource'),
          url: i.Z_().url(),
          title: i.Z_(),
          publisher: i.Z_().optional(),
          author: i.Z_().optional(),
          published_at: i.Rx().optional(),
          accessed_at: i.Rx(),
          trust_score: i.Rx().min(0).max(1).default(0.5),
        }),
        r.extend({
          kind: i.i0('VerifiedClaim'),
          claim_text: i.Z_(),
          source_id: i.Z_(),
          evidence_excerpt: i.Z_().optional(),
          confidence: i.Rx().min(0).max(1).default(0.8),
          status: i.Km(['proposed', 'verified', 'disputed', 'refuted']).default('proposed'),
        }));
      let f = i.Ry({
        id: i.Z_(),
        kind: i.Z_(),
        from: i.Z_(),
        to: i.Z_(),
        created_at: i.Rx(),
        metadata: i.IM(i.Yj()).optional(),
      });
      (f.extend({ kind: i.i0('CONTAINS'), rank: i.Rx().optional() }),
        f.extend({
          kind: i.i0('SEQUESTERS'),
          hidden_from_llm: i.O7().default(!1),
          hidden_from_tools: i.O7().default(!1),
          ui_only: i.O7().default(!1),
          reason: i.Km(['secret', 'noisy', 'untrusted', 'license', 'work_in_progress']),
          until: i.Z_().optional(),
        }),
        f.extend({
          kind: i.i0('DERIVES_FROM'),
          span: i.Z_().optional(),
          confidence: i.Rx().min(0).max(1).optional(),
        }),
        f.extend({
          kind: i.i0('IN_SCOPE_FOR'),
          rank: i.Rx().optional(),
          policy_chips: i.IX(i.Z_()).optional(),
        }),
        f.extend({
          kind: i.Km(['EQUIVALENT_TO', 'DUP_OF']),
          score: i.Rx().min(0).max(1),
          canonical: i.Z_(),
        }),
        f.extend({
          kind: i.Km(['SUPPORTS', 'REFUTES']),
          strength: i.Rx().min(0).max(1).optional(),
        }),
        f.extend({
          kind: i.i0('VERIFIED_BY'),
          verifier_run_id: i.Z_(),
          status: i.Km(['pass', 'fail', 'inconclusive']),
          artifacts: i.IM(i.Yj()).optional(),
          expires_at: i.Rx().optional(),
        }),
        f.extend({ kind: i.i0('EXACT_DUP'), canonical: i.Z_(), content_id: i.Z_() }),
        f.extend({
          kind: i.i0('NEAR_DUP'),
          canonical: i.Z_(),
          score: i.Rx().min(0).max(1),
          features_used: i.IX(i.Z_()),
          algorithm: i.Km(['jaccard', 'cosine', 'minhash', 'ast', 'combined']),
        }),
        f.extend({
          kind: i.i0('SPAN_CONTAINS'),
          byte_start: i.Rx(),
          byte_end: i.Rx(),
          blob_hash: i.Z_(),
        }),
        f.extend({ kind: i.i0('CLUSTER_MEMBER'), cluster_id: i.Z_(), score: i.Rx().min(0).max(1) }),
        f.extend({
          kind: i.i0('HAS_SPAN'),
          start_char: i.Rx().min(0).optional(),
          end_char: i.Rx().min(0).optional(),
          boundary_kind: i.Km(['line', 'sentence', 'paragraph', 'token_window']).optional(),
        }),
        f.extend({
          kind: i.i0('OCCURS_IN_SPAN'),
          count: i.Rx().min(1).default(1),
          mass: i.Rx().optional(),
        }),
        f.extend({
          kind: i.i0('COMPOSED_OF_ATOMIC'),
          unit_type: i.Km(['char', 'trigram']).optional(),
          position: i.Rx().min(0).optional(),
        }),
        f.extend({
          kind: i.i0('MENTIONS'),
          count: i.Rx().default(1),
          positions: i.IX(i.Rx()).optional(),
        }),
        f.extend({ kind: i.i0('ABOUT'), relevance: i.Rx().min(0).max(1).default(0.5) }),
        f.extend({
          kind: i.i0('CO_OCCURS_WITH'),
          count: i.Rx().default(1),
          pmi: i.Rx().optional(),
        }),
        f.extend({ kind: i.i0('BELONGS_TO_TOPIC'), weight: i.Rx().min(0).max(1).default(0.5) }),
        f.extend({
          kind: i.i0('SOURCED_FROM'),
          excerpt_span: i.Z_().optional(),
          extraction_confidence: i.Rx().min(0).max(1).default(0.8),
        }),
        f.extend({ kind: i.i0('CREATED_BY') }),
        f.extend({
          kind: i.i0('ATTACHED_TO'),
          role: i.Km(['primary', 'collaborator', 'observer']).default('primary'),
        }),
        f.extend({
          kind: i.i0('PINS_CONTEXT'),
          pin_type: i.Km(['explicit', 'derived']).default('explicit'),
        }),
        f.extend({ kind: i.i0('INITIATED_BY') }),
        f.extend({
          kind: i.i0('PARTICIPATED_IN'),
          role: i.Km(['agent', 'human', 'observer']).default('agent'),
        }),
        f.extend({ kind: i.i0('PRODUCED_BY'), run_id: i.Z_(), task_type: i.Z_().optional() }),
        i.Ry({
          max_file_size_mb: i.Rx().default(10),
          allowed_mime_types: i.IX(i.Z_()),
          daily_ingest_limit: i.Rx().default(50),
          max_sources: i.Rx().default(500),
          max_nodes: i.Rx().default(2e4),
          max_groups: i.Rx().default(50),
          storage_gb: i.Rx().default(5),
          upload_rate_limit_per_min: i.Rx().default(5),
          chat_calls_per_day: i.Rx().default(0),
          embedding_calls_per_day: i.Rx().default(0),
          verifier_runs_per_day: i.Rx().default(0),
          compute_timeout_ms: i.Rx().default(8e3),
          max_concurrency: i.Rx().default(2),
          retention_days: i.Rx().default(30),
          lenses_enabled: i.IX(i.Z_()).default(['2D']),
          doc_targets_tokens: i.IX(i.Rx()).default([5e3]),
          fallback_when_exceeded: i.Z_().default('block_then_prompt_upgrade'),
          overage_circuit_breaker: i.Ry({
            storage_pct: i.Rx().default(95),
            node_pct: i.Rx().default(95),
            requests_per_min: i.Rx().default(120),
          }),
        }),
        i.Ry({
          plan: i.Km(['admin_debug', 'free', 'pro', 'business']),
          features: i.Ry({
            ingest_files: i.O7(),
            autogroup: i.O7(),
            sequester: i.O7(),
            constellations: i.O7(),
            lenses: i.IX(i.Z_()),
            chat_models: i.IX(i.Z_()),
            verification_tools: i.IX(i.Z_()),
            unified_doc_targets: i.IX(i.Rx()),
            crm: i.O7(),
            email_send: i.O7(),
            webhooks: i.O7(),
          }),
          quotas: i.Ry({
            sources: i.Rx(),
            groups: i.Rx(),
            nodes: i.Rx(),
            storage_gb: i.Rx(),
            llm_tokens_month: i.Rx(),
            verifier_runs_day: i.Rx(),
          }),
        }),
        i.Ry({
          allow: i.IX(i.Z_()),
          deny: i.IX(i.Z_()).default([]),
          max_tokens: i.Rx().optional(),
          max_cost_usd: i.Rx().optional(),
          tool_permit: i.IX(i.Z_()).default([]),
          pii_rules: i.IM(i.Yj()).optional(),
        }),
        i.Km(['secret', 'noisy', 'untrusted', 'license', 'work_in_progress']),
        i.Ry({
          id: i.Z_(),
          board_id: i.Z_(),
          scope_nodes: i.IX(i.Z_()),
          policy: i.Ry({
            exclude_sequestered: i.O7().default(!0),
            include_edges: i.O7().default(!0),
          }),
          created_at: i.Rx(),
        }),
        i.Ry({
          id: i.Z_(),
          board_id: i.Z_(),
          scope_nodes: i.IX(i.Z_()),
          policy: i.Ry({ exclude_sequestered: i.O7() }),
          lens: i.Ry({ metric: i.Z_(), seed: i.Rx().optional() }).optional(),
          ranker: i.Ry({ order: i.IX(i.Z_()) }).optional(),
          model: i.Z_().optional(),
          timestamp: i.Rx(),
          metadata: i.IM(i.Yj()).optional(),
        }),
        i.Ry({
          run_id: i.Z_(),
          agent_id: i.Z_(),
          scope_id: i.Z_(),
          receipt_id: i.Z_().optional(),
          budget: i.Ry({ max_tokens: i.Rx(), max_cost_usd: i.Rx(), timeout_s: i.Rx() }),
          plan: i.IX(i.Z_()),
          artifacts: i.IX(i.Ry({ kind: i.Z_(), ref: i.Z_() })),
          events: i.IX(i.Ry({ ts: i.Rx(), level: i.Km(['info', 'warn', 'error']), msg: i.Z_() })),
          status: i.Km(['success', 'error', 'partial']),
          error: i.Z_().optional(),
          started_at: i.Rx(),
          completed_at: i.Rx().optional(),
        }));
      let _ = i.Ry({
          run_id: i.Z_(),
          kind: i.Km([
            'HTTP_CHECK',
            'SCHEMA_MATCH',
            'EXAMPLE_CALL',
            'COMPUTATION',
            'UNIT_TEST',
            'REPRO_NOTEBOOK',
            'PROOF_ASSISTANT',
          ]),
          claim_ids: i.IX(i.Z_()),
          inputs: i.IM(i.Yj()),
          outputs: i.IM(i.Yj()).optional(),
          status: i.Km(['pass', 'fail', 'inconclusive']),
          artifacts: i.IM(i.Yj()).optional(),
          expires_at: i.Rx().optional(),
          created_at: i.Rx(),
        }),
        h = i.Km(['admin_debug', 'free', 'pro', 'business']);
      (i.Ry({
        id: i.Z_(),
        name: i.Z_(),
        plan: h,
        owner_id: i.Z_(),
        created_at: i.Rx(),
        updated_at: i.Rx(),
        settings: i.IM(i.Yj()).optional(),
      }),
        i.Ry({
          id: i.Z_(),
          kind: i.i0('Board'),
          workspace_id: i.Z_(),
          name: i.Z_(),
          description: i.Z_().optional().nullable(),
          created_at: i.Rx(),
          updated_at: i.Rx(),
          settings: i.IM(i.Yj()).optional(),
          account_id: i.Z_().optional(),
          created_by: i.Z_().optional(),
          data_tag: i.Km(['test', 'real', 'automated', 'manual']).optional(),
        }),
        i.Ry({
          workspace_id: i.Z_(),
          period_start: i.Rx(),
          period_end: i.Rx(),
          counters: i.Ry({
            llm_tokens: i.Rx().default(0),
            verifier_runs: i.Rx().default(0),
            api_calls: i.Rx().default(0),
            storage_gb: i.Rx().default(0),
            emails_sent: i.Rx().default(0),
          }),
          updated_at: i.Rx(),
        }),
        i.Ry({
          ts: i.Rx(),
          workspace_id: i.Z_(),
          actor: i.Z_(),
          action: i.Z_(),
          reason: i.Z_(),
          plan: h,
          policy: i.Z_().optional(),
          receipt_id: i.Z_().optional(),
        }));
      let g = i
          .Ry({
            platform: i.Km(['chatgpt', 'claude', 'gemini', 'generic']).optional(),
            extraction: i
              .Ry({ includeUser: i.O7().default(!0), includeAssistant: i.O7().default(!1) })
              .default({ includeUser: !0, includeAssistant: !1 }),
            minMessageLength: i.Rx().min(0).default(400),
            processingMode: i.Km(['automatic', 'manual', 'hybrid']).default('automatic'),
            branches: i.Km(['merged', 'separate']).default('merged'),
            agent: i
              .Ry({ bootstrap: i.Km(['manual', 'auto']).default('manual') })
              .default({ bootstrap: 'manual' }),
            groups: i.IX(i.Ry({ id: i.Z_(), name: i.Z_(), keywords: i.IX(i.Z_()) })).default([]),
            extractCode: i.O7().default(!0),
            codeSettings: i
              .Ry({
                minLength: i.Rx().min(0).default(50),
                languages: i.IX(i.Z_()).default([]),
                groupBy: i.Km(['language', 'conversation', 'keyword']).default('language'),
                deduplicate: i.O7().default(!0),
                sourceHandling: i
                  .Km(['keep_inline', 'extract_and_remove'])
                  .default('extract_and_remove'),
              })
              .default({
                minLength: 50,
                languages: [],
                groupBy: 'language',
                deduplicate: !0,
                sourceHandling: 'extract_and_remove',
              }),
            duplicateDetection: i
              .Ry({
                enabled: i.O7().default(!0),
                exactMatch: i.O7().default(!0),
                similarityThreshold: i.Rx().min(0).max(1).default(0.85),
                crossConversation: i.O7().default(!0),
                algorithm: i
                  .Km(['jaccard', 'levenshtein', 'cosine', 'embedding'])
                  .default('jaccard'),
                normalizeTokens: i.O7().default(!0),
                minTokenOverlap: i.Rx().min(0).default(5),
                lengthRatioTolerance: i.Rx().min(0).default(0.2),
                ignoreWhitespace: i.O7().default(!0),
                ignoreCase: i.O7().default(!1),
                ignoreTimestamp: i.O7().default(!0),
                requireReview: i.O7().default(!0),
                autoApproveExact: i.O7().default(!1),
                autoMergeThreshold: i.Rx().min(0).max(1).default(0.95),
              })
              .default({
                enabled: !0,
                exactMatch: !0,
                similarityThreshold: 0.85,
                crossConversation: !0,
                algorithm: 'jaccard',
                normalizeTokens: !0,
                minTokenOverlap: 5,
                lengthRatioTolerance: 0.2,
                ignoreWhitespace: !0,
                ignoreCase: !1,
                ignoreTimestamp: !0,
                requireReview: !0,
                autoApproveExact: !1,
                autoMergeThreshold: 0.95,
              }),
          })
          .partial(),
        y = {
          platform: 'generic',
          extraction: { includeUser: !0, includeAssistant: !1 },
          minMessageLength: 400,
          processingMode: 'automatic',
          branches: 'merged',
          agent: { bootstrap: 'manual' },
          groups: [],
          extractCode: !0,
          codeSettings: {
            minLength: 50,
            languages: [],
            groupBy: 'language',
            deduplicate: !0,
            sourceHandling: 'extract_and_remove',
          },
          duplicateDetection: {
            enabled: !0,
            exactMatch: !0,
            similarityThreshold: 0.85,
            crossConversation: !0,
            algorithm: 'jaccard',
            normalizeTokens: !0,
            minTokenOverlap: 5,
            lengthRatioTolerance: 0.2,
            ignoreWhitespace: !0,
            ignoreCase: !1,
            ignoreTimestamp: !0,
            requireReview: !0,
            autoApproveExact: !1,
            autoMergeThreshold: 0.95,
          },
        };
      function w() {
        return JSON.parse(JSON.stringify(y));
      }
      function v(e) {
        var t, a, o, n, i, r, s, l, c, d, u, p, m, f;
        if (null == e) return w();
        let _ = g.parse(e),
          h = w();
        return {
          platform: null !== (o = _.platform) && void 0 !== o ? o : h.platform,
          extraction: null !== (n = _.extraction) && void 0 !== n ? n : h.extraction,
          minMessageLength:
            null !== (i = _.minMessageLength) && void 0 !== i ? i : h.minMessageLength,
          processingMode: null !== (r = _.processingMode) && void 0 !== r ? r : h.processingMode,
          branches: null !== (s = _.branches) && void 0 !== s ? s : h.branches,
          agent: null !== (l = _.agent) && void 0 !== l ? l : h.agent,
          groups: null !== (c = _.groups) && void 0 !== c ? c : h.groups,
          extractCode: null !== (d = _.extractCode) && void 0 !== d ? d : h.extractCode,
          codeSettings: {
            ...(null !== (u = _.codeSettings) && void 0 !== u ? u : h.codeSettings),
            minLength:
              null !== (p = null === (t = _.codeSettings) || void 0 === t ? void 0 : t.minLength) &&
              void 0 !== p
                ? p
                : h.codeSettings.minLength,
          },
          duplicateDetection: {
            ...(null !== (m = _.duplicateDetection) && void 0 !== m ? m : h.duplicateDetection),
            similarityThreshold:
              null !==
                (f =
                  null === (a = _.duplicateDetection) || void 0 === a
                    ? void 0
                    : a.similarityThreshold) && void 0 !== f
                ? f
                : h.duplicateDetection.similarityThreshold,
          },
        };
      }
      let b = i.i0('local'),
        x = i.Ry({
          mode: i.Km(['auto', 'manual', 'hybrid']),
          auto: i
            .Ry({
              targetGroupCount: i.Rx().min(1).max(500).default(25),
              createCatchAll: i.O7().default(!0),
              minGroupSize: i.Rx().min(1).default(2),
              algorithm: i.Km(['keyword', 'tfidf', 'embedding']).default('tfidf'),
            })
            .optional(),
          manual: i
            .IX(
              i.Ry({
                name: i.Z_().min(1).max(100),
                keywords: i.IX(i.Z_()),
                color: i.Z_().optional(),
                icon: i.Z_().optional(),
              })
            )
            .default([]),
        }),
        R = i.Ry({
          scope: i.Km(['message', 'conversation', 'auto']).default('message'),
          roleFilter: i.Ry({
            user: i.O7().default(!0),
            ai: i.O7().default(!0),
            separate: i.O7().default(!0),
          }),
          minLengthUser: i.Rx().min(0).default(400),
          minLengthAI: i.Rx().min(0).default(400),
          bundling: i.Ry({
            enabled: i.O7().default(!1),
            method: i.Km(['keyword', 'embedding', 'none']).default('keyword'),
            similarityThreshold: i.Rx().min(0).max(1).default(0.75),
          }),
        }),
        E = i.Ry({
          extract: i.O7().default(!0),
          removeFromSource: i.O7().default(!0),
          createEdges: i.O7().default(!0),
          minLength: i.Rx().min(0).default(50),
          deduplicate: i.O7().default(!0),
        }),
        T = i.Ry({
          enabled: i.O7().default(!0),
          level: i.Km(['message', 'conversation', 'both']).default('message'),
          detectExact: i.O7().default(!0),
          detectNear: i.O7().default(!0),
          nearThreshold: i.Rx().min(0).max(1).default(0.85),
          detectSemantic: i.O7().default(!1),
          semanticThreshold: i.Rx().min(0).max(1).default(0.9),
          createReviewFolders: i.O7().default(!0),
          autoMergeSuggestions: i.O7().default(!1),
        }),
        k = i.Ry({
          enabled: i.O7().default(!1),
          extractLexemes: i.O7().default(!0),
          extractPhrases: i.O7().default(!0),
          clusterTopics: i.O7().default(!0),
          minPhraseFrequency: i.Rx().min(1).default(2),
          minPhrasesPerTopic: i.Rx().min(1).default(3),
        }),
        I = i.Ry({
          storageMode: b.default('local'),
          allowExternalAPIs: i.O7().default(!1),
          apiKey: i.Z_().nullable().default(null),
        }),
        S = i.Ry({
          grouping: x,
          sources: R,
          code: E,
          duplicates: T,
          privacy: I,
          spine: k.optional(),
        }),
        C = i.G0([g, S]);
      (i.Ry({
        version: i.Z_().default('1.0'),
        storageMode: b.default('local'),
        database: i.Ry({
          local: i.Ry({
            path: i.Z_(),
            autoBackup: i.O7().default(!0),
            verbose: i.O7().default(!1),
          }),
        }),
        documentStore: i.Ry({ path: i.Z_(), enableDeduplication: i.O7().default(!0) }),
        defaults: C.optional(),
      }),
        v(),
        a(6031),
        a(9939),
        a(3902));
      let A = i.Ry({
          tokens: i.Rx().optional(),
          cost_usd: i.Rx().optional(),
          timeout_ms: i.Rx().optional(),
        }),
        O = i.Ry({ id: i.Z_(), url: i.Z_().optional() }),
        Z = i.Ry({ board_id: i.Z_(), snapshot_id: i.Z_() });
      (i.Ry({
        intent: i.Z_(),
        seed_sources: i.IX(O),
        budget: A.optional(),
        board_context: Z.optional(),
        planner_notes: i.Z_().optional(),
      }),
        i.Ry({ sources_pending: i.IX(u), notes: i.IX(i.Z_()) }),
        i.Ry({ sources: i.IX(O), hints: i.IX(i.Z_()).optional() }));
      let N = i.Ry({
        heuristics_used: i.IX(i.Z_()),
        decisions: i.IX(
          i.Ry({
            source_id: i.Z_(),
            action: i.Km(['keep', 'merge', 'discard']),
            target_id: i.Z_().optional(),
            reason: i.Z_(),
          })
        ),
      });
      i.Ry({
        groups: i.IX(p),
        contains_edges: i.IX(i.Ry({ from: i.Z_(), to: i.Z_() })),
        equivalent_to_edges: i.IX(i.Ry({ from: i.Z_(), to: i.Z_() })),
        dedupe_report: N,
      });
      let P = i.Ry({ plan_id: i.Z_(), checks: i.IX(i.Z_()) });
      i.Ry({ verifier_plan: P, claim_ids: i.IX(i.Z_()).optional(), budget: A.optional() });
      let D = i.Ry({
        claim_id: i.Z_(),
        status: i.Km(['provisional', 'verifying', 'verified', 'contested', 'stale']),
        receipt_id: i.Z_(),
      });
      (i.Ry({ verifier_run: _, claim_status_updates: i.IX(D), notes: i.IX(i.Z_()) }),
        a(7864),
        ((o = n || (n = {})).PARSE = 'PARSE'),
        (o.NORMALIZE = 'NORMALIZE'),
        (o.CANONICALIZE = 'CANONICALIZE'),
        (o.SPAN_EXTRACT = 'SPAN_EXTRACT'),
        (o.ATOMIC_EXTRACT = 'ATOMIC_EXTRACT'),
        (o.PACKET_DERIVE = 'PACKET_DERIVE'),
        (o.MASS_SCORE = 'MASS_SCORE'),
        (o.LAYER_LINK = 'LAYER_LINK'),
        (o.DEDUPE = 'DEDUPE'),
        (o.AWAIT_DECISIONS = 'AWAIT_DECISIONS'),
        (o.APPLY_DECISIONS = 'APPLY_DECISIONS'),
        (o.MATERIALIZE = 'MATERIALIZE'),
        (o.INDEXING = 'INDEXING'),
        (o.OBJECTIVE_QUEUE = 'OBJECTIVE_QUEUE'),
        (o.OBJECTIVE_EXTRACT = 'OBJECTIVE_EXTRACT'),
        (o.OBJECTIVE_VERIFY = 'OBJECTIVE_VERIFY'),
        (o.OBJECTIVE_PUBLISH = 'OBJECTIVE_PUBLISH'),
        (o.OBJECTIVE_DONE = 'OBJECTIVE_DONE'),
        (o.SUCCEEDED = 'SUCCEEDED'),
        (o.FAILED = 'FAILED'),
        (o.CANCELED = 'CANCELED'));
      let L = v(),
        j = {
          extraction: {
            includeUser: L.extraction.includeUser,
            includeAssistant: L.extraction.includeAssistant,
          },
          branches: L.branches,
          agent: { bootstrap: L.agent.bootstrap },
          minMessageLength: L.minMessageLength,
          processingMode: L.processingMode,
          groups: [],
          duplicateDetection: { ...L.duplicateDetection },
          extractCode: L.extractCode,
          codeSettings: {
            minLength: L.codeSettings.minLength,
            languages: [...L.codeSettings.languages],
            groupBy: L.codeSettings.groupBy,
            deduplicate: L.codeSettings.deduplicate,
            sourceHandling: L.codeSettings.sourceHandling,
          },
        };
      i.Ry({
        auto_graph: i.O7(),
        objective_layer: i.O7(),
        agent_runtime: i.O7(),
        business_hierarchy: i.O7(),
        proof_verification: i.O7(),
        external_research: i.O7(),
      });
      let z = i.Ry({
          id: i.Z_(),
          text: i.Z_(),
          confidence: i.Rx().min(0).max(1),
          sources: i.IX(i.Z_()),
          tags: i.IX(i.Z_()),
        }),
        M = i.Ry({ targetNodeId: i.Z_(), relation: i.Z_(), reasoning: i.Z_(), confidence: i.Rx() });
      i.Ry({
        sourceId: i.Z_(),
        summary: i.Z_(),
        claims: i.IX(z),
        suggestedTags: i.IX(i.Z_()),
        connections: i.IX(M),
        analyzedAt: i.Rx(),
        model: i.Z_(),
      });
    },
    7864: function (e, t, a) {
      'use strict';
      a.d(t, {
        HR: function () {
          return o;
        },
      });
      let o = [
        {
          id: 'general',
          label: 'General',
          icon: 'Settings',
          order: 1,
          sections: [
            {
              id: 'language',
              label: 'Language & Region',
              order: 1,
              controls: [
                {
                  id: 'language',
                  label: 'Language',
                  type: 'select',
                  defaultValue: 'en',
                  options: [
                    { value: 'en', label: 'English' },
                    { value: 'es', label: 'Espa\xf1ol' },
                    { value: 'fr', label: 'Fran\xe7ais' },
                  ],
                  scope: 'user',
                },
                {
                  id: 'timezone',
                  label: 'Timezone',
                  type: 'select',
                  defaultValue: 'UTC',
                  options: [
                    { value: 'UTC', label: 'UTC' },
                    { value: 'America/New_York', label: 'Eastern Time' },
                    { value: 'America/Los_Angeles', label: 'Pacific Time' },
                  ],
                  scope: 'user',
                },
              ],
            },
          ],
        },
        {
          id: 'appearance',
          label: 'Appearance',
          icon: 'Palette',
          order: 2,
          sections: [
            {
              id: 'theme',
              label: 'Theme',
              order: 1,
              controls: [
                {
                  id: 'theme_mode',
                  label: 'Theme Mode',
                  description: 'Choose between light, dark, or auto theme',
                  type: 'select',
                  defaultValue: 'dark',
                  options: [
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                    { value: 'auto', label: 'Auto (System)' },
                  ],
                  scope: 'user',
                  previewable: !0,
                },
                {
                  id: 'accent_color',
                  label: 'Accent Color',
                  type: 'color',
                  defaultValue: '#9333ea',
                  scope: 'user',
                  previewable: !0,
                },
              ],
            },
            {
              id: 'typography',
              label: 'Typography',
              order: 2,
              controls: [
                {
                  id: 'font_family',
                  label: 'Font Family',
                  type: 'select',
                  defaultValue: 'inter',
                  options: [
                    { value: 'inter', label: 'Inter' },
                    { value: 'system', label: 'System' },
                    { value: 'mono', label: 'Monospace' },
                  ],
                  scope: 'user',
                  previewable: !0,
                },
                {
                  id: 'font_size',
                  label: 'Font Size',
                  type: 'slider',
                  defaultValue: 14,
                  min: 12,
                  max: 18,
                  step: 1,
                  unit: 'px',
                  scope: 'user',
                  previewable: !0,
                },
              ],
            },
            {
              id: 'density',
              label: 'Density & Spacing',
              order: 3,
              controls: [
                {
                  id: 'ui_density',
                  label: 'UI Density',
                  type: 'select',
                  defaultValue: 'comfortable',
                  options: [
                    { value: 'compact', label: 'Compact' },
                    { value: 'comfortable', label: 'Comfortable' },
                    { value: 'spacious', label: 'Spacious' },
                  ],
                  scope: 'user',
                  previewable: !0,
                },
              ],
            },
          ],
        },
        {
          id: 'layout',
          label: 'Layout',
          icon: 'LayoutGrid',
          order: 3,
          sections: [
            {
              id: 'keimenon',
              label: 'Keimenon View',
              order: 1,
              controls: [
                {
                  id: 'keimenon_grid',
                  label: 'Show Grid',
                  type: 'boolean',
                  defaultValue: !0,
                  scope: 'user',
                  previewable: !0,
                },
                {
                  id: 'keimenon_minimap',
                  label: 'Show Minimap',
                  type: 'boolean',
                  defaultValue: !0,
                  scope: 'user',
                  previewable: !0,
                },
              ],
            },
            {
              id: 'sidebars',
              label: 'Sidebars',
              order: 2,
              controls: [
                {
                  id: 'sidebar_left_default',
                  label: 'Left Sidebar Default State',
                  type: 'select',
                  defaultValue: 'open',
                  options: [
                    { value: 'open', label: 'Open' },
                    { value: 'closed', label: 'Closed' },
                  ],
                  scope: 'user',
                },
                {
                  id: 'sidebar_right_default',
                  label: 'Right Sidebar Default State',
                  type: 'select',
                  defaultValue: 'closed',
                  options: [
                    { value: 'open', label: 'Open' },
                    { value: 'closed', label: 'Closed' },
                  ],
                  scope: 'user',
                },
              ],
            },
          ],
        },
        {
          id: 'account',
          label: 'Account',
          icon: 'Building2',
          order: 4,
          sections: [
            {
              id: 'profile',
              label: 'Profile',
              order: 1,
              controls: [
                {
                  id: 'display_name',
                  label: 'Display Name',
                  type: 'string',
                  defaultValue: '',
                  scope: 'user',
                  required: !0,
                },
                {
                  id: 'email',
                  label: 'Email',
                  type: 'string',
                  defaultValue: '',
                  scope: 'user',
                  required: !0,
                  pattern: '^[^@]+@[^@]+\\.[^@]+$',
                },
              ],
            },
            {
              id: 'billing',
              label: 'Billing & Limits',
              order: 2,
              controls: [
                {
                  id: 'account_name',
                  label: 'Account Name',
                  type: 'string',
                  defaultValue: '',
                  scope: 'workspace',
                  editableBy: ['admin'],
                },
                {
                  id: 'account_class',
                  label: 'Account Tier',
                  type: 'select',
                  defaultValue: 'free',
                  options: [
                    { value: 'free', label: 'Free' },
                    { value: 'professional', label: 'Professional' },
                    { value: 'business', label: 'Business' },
                  ],
                  scope: 'workspace',
                  editableBy: ['admin'],
                },
                {
                  id: 'max_nodes',
                  label: 'Max Nodes',
                  type: 'number',
                  defaultValue: 1e4,
                  min: 100,
                  max: 1e6,
                  scope: 'workspace',
                  editableBy: ['admin'],
                },
              ],
            },
            {
              id: 'members',
              label: 'Team Members',
              order: 3,
              controls: [
                {
                  id: 'allow_invites',
                  label: 'Allow Team Invites',
                  type: 'boolean',
                  defaultValue: !0,
                  scope: 'workspace',
                  editableBy: ['admin'],
                },
              ],
            },
            {
              id: 'users',
              label: 'Users',
              description: 'Manage users in your account',
              order: 4,
              controls: [
                {
                  id: 'user_management',
                  label: 'User Management',
                  description: 'View and manage users in your account',
                  type: 'string',
                  defaultValue: '',
                  scope: 'workspace',
                  visibleTo: ['junior', 'senior', 'leader', 'admin'],
                  editableBy: ['admin'],
                },
              ],
            },
          ],
        },
        {
          id: 'data',
          label: 'Data',
          icon: 'Database',
          order: 5,
          sections: [
            {
              id: 'retention',
              label: 'Data Retention',
              order: 1,
              controls: [
                {
                  id: 'retention_days',
                  label: 'Retention Period',
                  description: 'Days to keep deleted items before permanent deletion',
                  type: 'number',
                  defaultValue: 30,
                  min: 7,
                  max: 365,
                  unit: 'days',
                  scope: 'workspace',
                  editableBy: ['admin'],
                },
              ],
            },
            {
              id: 'management',
              label: 'Data Management',
              order: 2,
              controls: [
                {
                  id: 'clear_keimenon_data',
                  label: 'Clear Keimenon Data',
                  description:
                    'Delete all imported conversations, sources, code blocks, folders, and groups. Your account and settings will NOT be affected.',
                  type: 'string',
                  defaultValue: '',
                  scope: 'user',
                  helpUrl: '/docs/data-management',
                },
              ],
            },
            {
              id: 'admin_management',
              label: 'Admin Data Management',
              description: 'Administrative data clearing options',
              order: 3,
              adminOnly: !0,
              controls: [
                {
                  id: 'clear_all_client_data',
                  label: 'Clear All Client Data',
                  description:
                    'Delete keimenon data for ALL client accounts (preserves admin data, user accounts, and settings). Use with extreme caution!',
                  type: 'string',
                  defaultValue: '',
                  scope: 'workspace',
                  editableBy: ['admin'],
                  adminOnly: !0,
                },
              ],
            },
            {
              id: 'deduplication',
              label: 'Content Deduplication',
              description: 'Automatic duplicate detection and storage optimization',
              order: 4,
              controls: [
                {
                  id: 'deduplication_enabled',
                  label: 'Enable Automatic Deduplication',
                  description:
                    'Automatically detect and track duplicate content using SHA-256 hashing',
                  type: 'boolean',
                  defaultValue: !0,
                  scope: 'workspace',
                  editableBy: ['admin'],
                },
                {
                  id: 'deduplication_auto_merge',
                  label: 'Auto-Merge Duplicates',
                  description: 'Automatically merge duplicate nodes (requires manual approval)',
                  type: 'boolean',
                  defaultValue: !1,
                  scope: 'workspace',
                  editableBy: ['admin'],
                },
              ],
            },
          ],
        },
        {
          id: 'integrations',
          label: 'Integrations',
          icon: 'Plug',
          order: 6,
          sections: [
            {
              id: 'api',
              label: 'API Access',
              order: 1,
              controls: [
                {
                  id: 'api_enabled',
                  label: 'Enable API Access',
                  type: 'boolean',
                  defaultValue: !1,
                  scope: 'workspace',
                  editableBy: ['admin'],
                },
              ],
            },
            {
              id: 'api_keys',
              label: 'API Keys (BYOK)',
              description: 'Manage your own AI provider API keys',
              order: 2,
              controls: [
                {
                  id: 'byok_management',
                  label: 'API Key Management',
                  description: 'Store and manage your AI provider API keys securely',
                  type: 'string',
                  defaultValue: '',
                  scope: 'workspace',
                  editableBy: ['admin'],
                },
              ],
            },
          ],
        },
        {
          id: 'notifications',
          label: 'Notifications',
          icon: 'Bell',
          order: 7,
          sections: [
            {
              id: 'email',
              label: 'Email Notifications',
              order: 1,
              controls: [
                {
                  id: 'notifications_enabled',
                  label: 'Enable Email Notifications',
                  type: 'boolean',
                  defaultValue: !0,
                  scope: 'user',
                },
                {
                  id: 'notification_frequency',
                  label: 'Notification Frequency',
                  type: 'select',
                  defaultValue: 'realtime',
                  options: [
                    { value: 'realtime', label: 'Real-time' },
                    { value: 'daily', label: 'Daily Digest' },
                    { value: 'weekly', label: 'Weekly Digest' },
                  ],
                  scope: 'user',
                },
              ],
            },
          ],
        },
        {
          id: 'security',
          label: 'Security',
          icon: 'Shield',
          order: 8,
          sections: [
            {
              id: 'password',
              label: 'Password',
              order: 1,
              controls: [
                {
                  id: 'password_change',
                  label: 'Change Password',
                  type: 'string',
                  defaultValue: '',
                  scope: 'user',
                },
              ],
            },
            {
              id: 'privacy',
              label: 'Privacy & Error Tracking',
              description: 'Control how your data is used to improve the product',
              order: 2,
              controls: [
                {
                  id: 'error_tracking_consent',
                  label: 'Error Tracking',
                  description:
                    'Help improve Keimenon by sending anonymous error reports via Sentry',
                  type: 'boolean',
                  defaultValue: !1,
                  scope: 'user',
                },
              ],
            },
          ],
        },
        {
          id: 'import_export',
          label: 'Import / Export',
          icon: 'Download',
          order: 9,
          sections: [
            {
              id: 'export',
              label: 'Export Options',
              order: 1,
              controls: [
                {
                  id: 'export_format',
                  label: 'Default Export Format',
                  type: 'select',
                  defaultValue: 'json',
                  options: [
                    { value: 'json', label: 'JSON' },
                    { value: 'csv', label: 'CSV' },
                    { value: 'graphml', label: 'GraphML' },
                  ],
                  scope: 'user',
                },
              ],
            },
            {
              id: 'import_workflow',
              label: 'Import Workflow',
              order: 2,
              controls: [
                {
                  id: 'import_auto_switch_processing',
                  label: 'Auto-Switch to Processing View',
                  description: 'Automatically switch to Processing view when an import starts',
                  type: 'boolean',
                  defaultValue: !0,
                  scope: 'user',
                },
              ],
            },
          ],
        },
        {
          id: 'debug',
          label: 'Debug',
          icon: 'Bug',
          order: 10,
          adminOnly: !0,
          sections: [
            {
              id: 'modals',
              label: 'Modals',
              description: 'Reference for modal components and their wiring status',
              order: 1,
              adminOnly: !0,
              controls: [],
            },
          ],
        },
        {
          id: 'advanced',
          label: 'Advanced',
          icon: 'Wrench',
          order: 11,
          adminOnly: !0,
          sections: [
            {
              id: 'global_defaults',
              label: 'Global Defaults',
              description: 'System-wide defaults for all accounts',
              order: 1,
              adminOnly: !0,
              controls: [
                {
                  id: 'global_default_tier',
                  label: 'Default Account Tier',
                  type: 'select',
                  defaultValue: 'free',
                  options: [
                    { value: 'free', label: 'Free' },
                    { value: 'professional', label: 'Professional' },
                    { value: 'business', label: 'Business' },
                  ],
                  scope: 'defaults',
                  editableBy: ['admin'],
                  adminOnly: !0,
                },
                {
                  id: 'global_max_upload_size',
                  label: 'Max Upload Size',
                  type: 'number',
                  defaultValue: 10,
                  min: 1,
                  max: 100,
                  unit: 'MB',
                  scope: 'defaults',
                  editableBy: ['admin'],
                  adminOnly: !0,
                },
              ],
            },
            {
              id: 'global_policies',
              label: 'Global Policies',
              description: 'System-wide policies',
              order: 2,
              adminOnly: !0,
              controls: [
                {
                  id: 'global_enable_registration',
                  label: 'Enable User Registration',
                  type: 'boolean',
                  defaultValue: !1,
                  scope: 'defaults',
                  editableBy: ['admin'],
                  adminOnly: !0,
                },
                {
                  id: 'global_require_email_verification',
                  label: 'Require Email Verification',
                  type: 'boolean',
                  defaultValue: !0,
                  scope: 'defaults',
                  editableBy: ['admin'],
                  adminOnly: !0,
                },
              ],
            },
          ],
        },
      ];
    },
  },
]);
