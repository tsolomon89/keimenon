'use strict';
(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [772],
  {
    4175: function (e, t, n) {
      n.d(t, {
        AuthProvider: function () {
          return g;
        },
        LP: function () {
          return T;
        },
        aC: function () {
          return v;
        },
      });
      var r = n(7573),
        o = n(7653),
        a = n(1695),
        i = n(2766),
        s = n(2844);
      let c = [
        '__operatingAccount',
        '__operatingMode',
        '__cachedNodes',
        '__cachedEdges',
        '__cachedGroups',
        '__cachedBoards',
      ];
      var l = n(3291);
      let u = (0, o.createContext)(void 0),
        d = 'keimenon_token',
        p = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      function h() {
        let e = {};
        return (window.__TEST_DB_PATH__ && (e['X-Test-DB-Path'] = window.__TEST_DB_PATH__), e);
      }
      function f(e) {
        try {
          let t = e.split('.')[1],
            n = atob(t);
          return JSON.parse(n);
        } catch (e) {
          return (console.error('Failed to decode JWT:', e), null);
        }
      }
      function w(e) {
        let t = f(e);
        if (!t || !t.exp) return !0;
        let n = Math.floor(Date.now() / 1e3);
        return t.exp < n;
      }
      function m(e) {
        let t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {},
          n = new URLSearchParams(window.location.search),
          r = new URLSearchParams();
        for (let e of ['apiPort', 'dev']) {
          let t = n.get(e);
          t && r.set(e, t);
        }
        for (let [e, n] of Object.entries(t)) n && r.set(e, n);
        let o = r.toString();
        return o ? ''.concat(e, '?').concat(o) : e;
      }
      function y(e) {
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
      function g(e) {
        let { children: t } = e,
          [n, g] = (0, o.useState)(null),
          [v, T] = (0, o.useState)(!0),
          _ = (0, a.useRouter)();
        ((0, o.useEffect)(() => {
          let e = !1,
            t = async () => {
              var e;
              if (
                (localStorage.removeItem(d),
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
              let n = (t) => {
                e || (g(t), T(!1));
              };
              try {
                let e = localStorage.getItem(d);
                if ((console.log('[AuthContext] Init check. Token present:', !!e), !e)) {
                  n(null);
                  return;
                }
                if (w(e)) {
                  (console.log('[AuthContext] Token expired on startup, clearing storage'),
                    await t(),
                    n(null));
                  return;
                }
                try {
                  let r = await fetch(''.concat(l.CT, '/api/v1/auth/verify'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...h() },
                    body: JSON.stringify({ token: e }),
                  });
                  if (!r.ok) {
                    (console.warn(
                      '[AuthContext] Stored token rejected by backend ('.concat(
                        r.status,
                        '), clearing auth state'
                      )
                    ),
                      await t(),
                      n(null));
                    return;
                  }
                } catch (e) {
                  console.warn(
                    '[AuthContext] Token verification request failed, using local token parse:',
                    e
                  );
                }
                let r = y(e);
                if (!r) {
                  (await t(), n(null));
                  return;
                }
                n(r);
              } catch (e) {
                (console.error('[AuthContext] initializeAuth failed:', e), n(null));
              }
            })(),
            () => {
              e = !0;
            }
          );
        }, []),
          (0, o.useEffect)(() => {
            if (n && n.accountId) {
              let e = i.O.getState().currentAccountId;
              (e &&
                e !== n.accountId &&
                (console.log(
                  '\uD83D\uDD04 Account switched from '
                    .concat(e, ' to ')
                    .concat(n.accountId, ' - resetting keimenon store')
                ),
                i.O.getState().reset()),
                i.O.getState().setCurrentAccountId(n.accountId));
            }
          }, [null == n ? void 0 : n.accountId]));
        let E = (0, o.useCallback)(
            async (e, t) => {
              T(!0);
              try {
                let n = await fetch(''.concat(l.CT, '/api/v1/auth/login'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...h() },
                  body: JSON.stringify({ email: e, password: t }),
                });
                if (!n.ok) {
                  let e = await n.json();
                  throw Error(e.error || 'Login failed');
                }
                let r = await n.json();
                if (r.requiresAccountSelection)
                  return (
                    T(!1),
                    {
                      requiresAccountSelection: !0,
                      availableAccounts: r.availableAccounts,
                      tempToken: r.tempToken,
                    }
                  );
                let { token: o } = r;
                if (!o) throw Error('No token received from server');
                localStorage.setItem(d, o);
                let a = y(o);
                if (!a) throw Error('Failed to parse user from token');
                (g(a),
                  T(!1),
                  console.log('Login successful:', {
                    email: a.email,
                    accountId: a.accountId,
                    rank: a.rank,
                    accountType: a.accountType,
                  }),
                  _.push(m('/keimenon')));
              } catch (e) {
                throw (T(!1), console.error('Login error:', e), e);
              }
            },
            [_]
          ),
          S = (0, o.useCallback)(
            async function (e, t, n) {
              let r = arguments.length > 3 && void 0 !== arguments[3] ? arguments[3] : 'free',
                o = n.trim();
              if (o.length < 2 || o.length > 120)
                throw Error('Name must be between 2 and 120 characters');
              if (!p.test(e)) throw Error('Please provide a valid email address');
              if (t.length < 8) throw Error('Password must be at least 8 characters');
              if (!/[a-zA-Z]/.test(t) || !/[0-9]/.test(t))
                throw Error('Password must include both letters and numbers');
              if (!['free', 'professional', 'business'].includes(r))
                throw Error('Invalid account class');
              T(!0);
              try {
                let n = await fetch(''.concat(l.CT, '/api/v1/auth/register'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    email: e,
                    password: t,
                    name: o,
                    accountType: 'client',
                    accountClass: r,
                  }),
                });
                if (!n.ok) {
                  let e = await n.json();
                  throw Error(e.error || 'Registration failed. Please try again.');
                }
                let { token: a } = await n.json();
                if (!a) throw Error('No token received from server');
                localStorage.setItem(d, a);
                let i = y(a);
                if (!i) throw Error('Failed to parse user from token');
                (g(i),
                  T(!1),
                  console.log('Registration successful:', {
                    email: i.email,
                    accountType: i.accountType,
                    accountClass: i.accountClass,
                  }),
                  _.push(m('/keimenon')));
              } catch (e) {
                if (
                  (T(!1),
                  console.error('Registration error:', e),
                  e instanceof TypeError &&
                    (e.message.includes('fetch') || e.message.includes('NetworkError')))
                )
                  throw Error('Network error. Please check your connection and try again.');
                throw e;
              }
            },
            [_]
          ),
          C = (0, o.useCallback)(
            async (e, t, n) => {
              T(!0);
              try {
                let r = await fetch(''.concat(l.CT, '/api/v1/auth/select-account'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ tempToken: e, accountId: t, accountPassword: n }),
                });
                if (!r.ok) {
                  let e = await r.json();
                  throw Error(e.error || 'Account selection failed');
                }
                let { token: o } = await r.json();
                if (!o) throw Error('No token received from server');
                localStorage.setItem(d, o);
                let a = y(o);
                if (!a) throw Error('Failed to parse user from token');
                (g(a),
                  T(!1),
                  console.log('Account selected:', { accountId: a.accountId, email: a.email }),
                  _.push(m('/keimenon')));
              } catch (e) {
                throw (T(!1), console.error('Account selection error:', e), e);
              }
            },
            [_]
          ),
          k = (0, o.useCallback)(async (e, t) => {
            T(!0);
            try {
              let n = localStorage.getItem(d);
              if (!n) throw Error('Not authenticated');
              console.log(
                '\uD83E\uDDF9 Clearing account-scoped runtime state before account switch...'
              );
              let r = (function () {
                let e =
                  arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : '__SENSITIVE__';
                for (let e of (i.O.getState().reset(), c)) delete window[e];
                let t = [];
                if (window.sessionStorage) {
                  let n = [];
                  for (let e = 0; e < window.sessionStorage.length; e += 1) {
                    let t = window.sessionStorage.key(e);
                    t && n.push(t);
                  }
                  for (let r of n)
                    (e.length > 0 && r.startsWith(e)) ||
                      (window.sessionStorage.removeItem(r), t.push(r));
                }
                return { clearedSessionKeys: t };
              })();
              console.log(
                '\uD83E\uDDF9 Cleared '.concat(r.clearedSessionKeys.length, ' sessionStorage items')
              );
              let o = await fetch(''.concat(l.CT, '/api/v1/auth/switch-account'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer '.concat(n) },
                body: JSON.stringify({ accountId: e, accountPassword: t }),
              });
              if (!o.ok) {
                let e = await o.json();
                throw Error(e.error || 'Account switch failed');
              }
              let a = (await o.json()).token;
              if (!a) throw Error('No token received from server');
              localStorage.setItem(d, a);
              let u = y(a);
              if (!u) throw Error('Failed to parse user from token');
              (g(u),
                (0, s.Et)('Switched to account: '.concat(u.accountId), {
                  domain: 'api',
                  operation: 'auth.switchAccount',
                  metadata: {
                    accountId: u.accountId,
                    userId: u.userId,
                    accountType: u.accountType,
                  },
                }),
                console.log('✅ Account switched successfully:', {
                  accountId: u.accountId,
                  email: u.email,
                }),
                T(!1),
                console.log(
                  '\uD83D\uDD04 Performing hard reload to clear all application state...'
                ),
                window.location.reload());
            } catch (e) {
              throw (T(!1), console.error('❌ Account switch error:', e), e);
            }
          }, []),
          I = (0, o.useCallback)(() => {
            (localStorage.removeItem(d),
              g(null),
              i.O.getState().reset(),
              _.push(m('/login')),
              console.log('Logged out'));
          }, [_]),
          N = (0, o.useCallback)(async () => {
            let e = localStorage.getItem(d);
            if (!e) return !1;
            try {
              let t = await fetch(''.concat(l.CT, '/api/v1/auth/refresh'), {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: 'Bearer '.concat(e),
                  ...h(),
                },
                body: JSON.stringify({ token: e }),
              });
              if (!t.ok) return !1;
              let n = await t.json();
              if (!(null == n ? void 0 : n.token) || 'string' != typeof n.token) return !1;
              localStorage.setItem(d, n.token);
              let r = y(n.token);
              return (r && g(r), !0);
            } catch (e) {
              return !1;
            }
          }, []);
        (0, o.useEffect)(() => {
          if (!n) return;
          let e = setInterval(async () => {
            let e = localStorage.getItem(d);
            if (!e) return;
            let t = f(e);
            if (!(null == t ? void 0 : t.exp)) return;
            let n = Math.floor(Date.now() / 1e3);
            t.exp - n <= 120 && !(await N()) && w(e) && I();
          }, 3e4);
          return () => clearInterval(e);
        }, [n, N, I]);
        let A = (0, o.useCallback)(() => {
          let e = localStorage.getItem(d);
          if (!e) {
            g(null);
            return;
          }
          if (w(e)) {
            N().then((e) => {
              e || I();
            });
            return;
          }
          let t = y(e);
          t ? g(t) : I();
        }, [I, N]);
        return (0, r.jsx)(u.Provider, {
          value: {
            user: n,
            isAuthenticated: !!n,
            isLoading: v,
            login: E,
            selectAccount: C,
            switchAccount: k,
            register: S,
            logout: I,
            refreshUser: A,
          },
          children: t,
        });
      }
      function v() {
        let e = (0, o.useContext)(u);
        if (void 0 === e) throw Error('useAuth must be used within an AuthProvider');
        return e;
      }
      function T() {
        return localStorage.getItem(d);
      }
    },
    1493: function (e, t, n) {
      n.d(t, {
        $P: function () {
          return ei;
        },
        $Q: function () {
          return S;
        },
        BP: function () {
          return J;
        },
        Bk: function () {
          return B;
        },
        E0: function () {
          return v;
        },
        EZ: function () {
          return E;
        },
        IU: function () {
          return L;
        },
        In: function () {
          return G;
        },
        J$: function () {
          return $;
        },
        Jl: function () {
          return _;
        },
        NT: function () {
          return k;
        },
        Nd: function () {
          return eu;
        },
        Ni: function () {
          return N;
        },
        Nm: function () {
          return R;
        },
        Nq: function () {
          return er;
        },
        PR: function () {
          return et;
        },
        PZ: function () {
          return Z;
        },
        SK: function () {
          return ec;
        },
        T1: function () {
          return Q;
        },
        T8: function () {
          return Y;
        },
        TE: function () {
          return ee;
        },
        U0: function () {
          return A;
        },
        UU: function () {
          return T;
        },
        UV: function () {
          return z;
        },
        W9: function () {
          return w;
        },
        Xy: function () {
          return F;
        },
        Zd: function () {
          return O;
        },
        Zo: function () {
          return j;
        },
        _A: function () {
          return P;
        },
        _X: function () {
          return D;
        },
        ax: function () {
          return u;
        },
        d: function () {
          return f;
        },
        e6: function () {
          return el;
        },
        e_: function () {
          return es;
        },
        h8: function () {
          return eo;
        },
        hi: function () {
          return h;
        },
        jH: function () {
          return U;
        },
        jM: function () {
          return x;
        },
        lq: function () {
          return m;
        },
        mQ: function () {
          return X;
        },
        o0: function () {
          return H;
        },
        oI: function () {
          return y;
        },
        qC: function () {
          return V;
        },
        qF: function () {
          return g;
        },
        qp: function () {
          return I;
        },
        r4: function () {
          return en;
        },
        rT: function () {
          return W;
        },
        tz: function () {
          return C;
        },
        u1: function () {
          return b;
        },
        vm: function () {
          return q;
        },
        w3: function () {
          return K;
        },
        wv: function () {
          return ea;
        },
        x1: function () {
          return ed;
        },
        z2: function () {
          return M;
        },
      });
      var r = n(2844),
        o = n(4175),
        a = n(3291);
      let i = ''.concat(a.CT, '/api/v1/auth/refresh'),
        s = null;
      function c() {
        let e = {},
          t = (0, o.LP)();
        t && (e.Authorization = 'Bearer '.concat(t));
        {
          let t = window.__operatingAccount,
            n = window.__operatingMode;
          (t &&
            n &&
            'native' !== n &&
            ((e['X-Operating-Account'] = t), (e['X-Operating-Mode'] = n)),
            window.__TEST_DB_PATH__ && (e['X-Test-DB-Path'] = window.__TEST_DB_PATH__));
        }
        return e;
      }
      async function l(e, t) {
        let n = String(e),
          r = t,
          a = (0, o.LP)();
        if (
          a &&
          (function (e) {
            let t = (function (e) {
              try {
                let t = e.split('.')[1],
                  n = atob(t);
                return JSON.parse(n);
              } catch (e) {
                return (console.error('Failed to decode JWT:', e), null);
              }
            })(e);
            if (!t || !t.exp) return !0;
            let n = Math.floor(Date.now() / 1e3);
            return t.exp - 30 < n;
          })(a) &&
          !n.includes('/api/v1/auth/refresh')
        ) {
          let e = await d();
          e && (r = p(t, e));
        }
        let i = await fetch(e, r);
        if ((401 === i.status || 403 === i.status) && !n.includes('/api/v1/auth/refresh')) {
          let n = await d();
          if (n && (i = await fetch(e, p(t, n))).ok) return i;
          let r = (await i.json().catch(() => ({}))).error || 'Authentication failed';
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
                    for (let n of ['apiPort', 'dev']) {
                      let r = e.get(n);
                      r && t.set(n, r);
                    }
                    window.location.href = '/login?'.concat(t.toString());
                  }, 1e3));
              }
            })(r),
            Error(r)
          );
        }
        return i;
      }
      async function u(e, t) {
        let n = new Headers(c());
        return (
          (null == t ? void 0 : t.headers) &&
            new Headers(t.headers).forEach((e, t) => {
              n.set(t, e);
            }),
          l(e, { ...t, headers: n })
        );
      }
      async function d() {
        return (
          s ||
          (s = (async () => {
            let e = (0, o.LP)();
            if (!e) return null;
            try {
              let t = await fetch(i, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer '.concat(e) },
                body: JSON.stringify({ token: e }),
              });
              if (!t.ok) return null;
              let n = await t.json(),
                r = 'string' == typeof (null == n ? void 0 : n.token) ? n.token : null;
              if (!r) return null;
              return (localStorage.setItem('keimenon_token', r), r);
            } catch (e) {
              return null;
            } finally {
              s = null;
            }
          })())
        );
      }
      function p(e, t) {
        let n = new Headers((null == e ? void 0 : e.headers) || {});
        return (n.set('Authorization', 'Bearer '.concat(t)), { ...e, headers: n });
      }
      let h = {
        get: async (e) => {
          let t = await l(''.concat(a.CT, '/api/v1').concat(e), { headers: { ...c() } });
          if (!t.ok) throw Error(t.statusText);
          return { data: await t.json() };
        },
        post: async (e, t) => {
          let n = await l(''.concat(a.CT, '/api/v1').concat(e), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...c() },
            body: JSON.stringify(t),
          });
          if (!n.ok) throw Error(n.statusText);
          return { data: await n.json() };
        },
        put: async (e, t) => {
          let n = await l(''.concat(a.CT, '/api/v1').concat(e), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...c() },
            body: JSON.stringify(t),
          });
          if (!n.ok) throw Error(n.statusText);
          return { data: await n.json() };
        },
        delete: async (e) => {
          let t = await l(''.concat(a.CT, '/api/v1').concat(e), {
            method: 'DELETE',
            headers: { ...c() },
          });
          if (!t.ok) throw Error(t.statusText);
          return { data: await t.json().catch(() => ({})) };
        },
      };
      async function f() {
        try {
          let e = await l(''.concat(a.CT, '/api/v1/import/presets'), {
            method: 'GET',
            headers: c(),
          });
          return (e.ok || (await (0, r.zG)({ response: e })), await e.json());
        } catch (e) {
          throw await (0, r.zG)(e);
        }
      }
      async function w(e) {
        try {
          let t = await l(''.concat(a.CT, '/api/v1/import/presets'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...c() },
            body: JSON.stringify(e),
          });
          return (t.ok || (await (0, r.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, r.zG)(e);
        }
      }
      async function m(e, t) {
        try {
          let n = await l(''.concat(a.CT, '/api/v1/import/presets/').concat(e), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...c() },
            body: JSON.stringify(t),
          });
          return (n.ok || (await (0, r.zG)({ response: n })), await n.json());
        } catch (e) {
          throw await (0, r.zG)(e);
        }
      }
      async function y(e) {
        try {
          let t = await l(''.concat(a.CT, '/api/v1/import/presets/').concat(e), {
            method: 'DELETE',
            headers: c(),
          });
          return (t.ok || (await (0, r.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, r.zG)(e);
        }
      }
      async function g() {
        let e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : '24h',
          t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : 12;
        try {
          let n = new URLSearchParams({ window: e, buckets: String(t) }),
            o = await l(''.concat(a.CT, '/api/v1/import/stats/series?').concat(n.toString()), {
              method: 'GET',
              headers: c(),
            });
          return (o.ok || (await (0, r.zG)({ response: o })), await o.json());
        } catch (e) {
          throw await (0, r.zG)(e);
        }
      }
      async function v() {
        try {
          let e = await l(''.concat(a.CT, '/api/v1/me/features'), { method: 'GET', headers: c() });
          return (e.ok || (await (0, r.zG)({ response: e })), await e.json());
        } catch (e) {
          throw await (0, r.zG)(e);
        }
      }
      async function T(e) {
        let t = await l(''.concat(a.CT, '/api/v1/jobs/').concat(e, '/cancel'), {
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
      async function _(e) {
        let t = await l(''.concat(a.CT, '/api/v1/jobs/').concat(e, '/retry'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...c() },
        });
        if (!t.ok)
          throw Error(
            (await t.json().catch(() => ({}))).error || 'Failed to retry job: '.concat(t.statusText)
          );
        return await t.json();
      }
      async function E(e) {
        let t = await l(''.concat(a.CT, '/api/v1/jobs/').concat(e, '/pause'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...c() },
        });
        if (!t.ok)
          throw Error(
            (await t.json().catch(() => ({}))).error || 'Failed to pause job: '.concat(t.statusText)
          );
        return await t.json();
      }
      async function S(e) {
        let t = await l(''.concat(a.CT, '/api/v1/jobs/').concat(e, '/resume'), {
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
      async function C(e) {
        let t = '';
        try {
          var n, r, o, a, i, s, c;
          if (e.size > 10485760) {
            let n = e.slice(0, 5242880);
            ((t = await n.text()),
              console.log(
                '[detectPlatform] Read 5MB sample. Preview: '.concat(t.substring(0, 200), '...')
              ));
          } else t = await e.text();
          let l = JSON.parse(t);
          if (
            (console.log('[detectPlatform] File keys:', Object.keys(l)),
            Array.isArray(l) &&
              console.log('[detectPlatform] Array first item keys:', Object.keys(l[0] || {})),
            Array.isArray(l) &&
              (null === (n = l[0]) || void 0 === n ? void 0 : n.chat_messages) &&
              (null === (r = l[0]) || void 0 === r ? void 0 : r.account))
          )
            return { platform: 'chatgpt', confidence: 0.95 };
          if (l.uuid && l.chat_messages && l.account)
            return { platform: 'chatgpt', confidence: 0.9 };
          if (
            Array.isArray(l) &&
            (null === (o = l[0]) || void 0 === o ? void 0 : o.chat_messages) &&
            (null === (a = l[0]) || void 0 === a ? void 0 : a.uuid)
          )
            return { platform: 'chatgpt', confidence: 0.85 };
          if (Array.isArray(l) && (null === (i = l[0]) || void 0 === i ? void 0 : i.mapping))
            return { platform: 'claude', confidence: 0.95 };
          if (!Array.isArray(l) && l.mapping) return { platform: 'claude', confidence: 0.9 };
          if (
            Array.isArray(l) &&
            (null === (s = l[0]) || void 0 === s ? void 0 : s.conversation_id)
          )
            return { platform: 'claude', confidence: 0.85 };
          if (l.conversations && Array.isArray(l.conversations))
            return { platform: 'gemini', confidence: 0.8 };
          if (Array.isArray(l) && (null === (c = l[0]) || void 0 === c ? void 0 : c.messages))
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
          n = 0,
          r = 0;
        for (let o of e)
          try {
            let e = await C(o);
            if (((t[e.platform] = (t[e.platform] || 0) + 1), o.size > 52428800)) {
              console.log(
                'Large file detected ('.concat(
                  (o.size / 1024 / 1024).toFixed(2),
                  'MB), using estimates'
                )
              );
              let e = Math.floor(o.size / 256e3);
              ((n += e), (r += 10 * e));
              continue;
            }
            let a = await o.text(),
              i = JSON.parse(a);
            Array.isArray(i)
              ? ((n += i.length),
                i.forEach((e) => {
                  e.mapping
                    ? (r += Object.keys(e.mapping).length)
                    : e.messages && (r += e.messages.length);
                }))
              : i.conversations &&
                ((n += i.conversations.length),
                (r += i.conversations.reduce((e, t) => {
                  var n;
                  return e + ((null === (n = t.messages) || void 0 === n ? void 0 : n.length) || 0);
                }, 0)));
          } catch (e) {
            (console.error('Error analyzing file:', o.name, e), (n += 1), (r += 10));
          }
        return {
          total_conversations: Math.max(n, 1),
          total_messages: Math.max(r, 10),
          platforms: t,
        };
      }
      async function I(e) {
        try {
          let t = await l(''.concat(a.CT, '/api/v1/content/message/').concat(e), { headers: c() });
          return (t.ok || (await (0, r.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, r.zG)(e);
        }
      }
      async function N(e) {
        try {
          let t = await l(''.concat(a.CT, '/api/v1/content/source/').concat(e), { headers: c() });
          return (t.ok || (await (0, r.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, r.zG)(e);
        }
      }
      async function A(e) {
        try {
          let t = await l(''.concat(a.CT, '/api/v1/content/code/').concat(e), { headers: c() });
          return (t.ok || (await (0, r.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, r.zG)(e);
        }
      }
      async function j(e) {
        try {
          let t = await l(''.concat(a.CT, '/api/v1/content/conversation/').concat(e), {
            headers: c(),
          });
          return (t.ok || (await (0, r.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, r.zG)(e);
        }
      }
      async function b(e) {
        try {
          var t, n, o;
          let i = await l(''.concat(a.CT, '/api/v1/nodes/').concat(e), { headers: c() });
          i.ok || (await (0, r.zG)({ response: i }));
          let s = await i.json(),
            u = s.node || s;
          return {
            id: u.id,
            lemma:
              u.lemma || (null === (t = u.properties) || void 0 === t ? void 0 : t.lemma) || '',
            pos: u.pos || (null === (n = u.properties) || void 0 === n ? void 0 : n.pos),
            frequency:
              u.frequency ||
              (null === (o = u.properties) || void 0 === o ? void 0 : o.frequency) ||
              0,
            source: 'database',
          };
        } catch (e) {
          throw await (0, r.zG)(e);
        }
      }
      async function P(e) {
        try {
          var t, n, o, i, s;
          let u = await l(''.concat(a.CT, '/api/v1/nodes/').concat(e), { headers: c() });
          u.ok || (await (0, r.zG)({ response: u }));
          let d = await u.json(),
            p = d.node || d;
          return {
            id: p.id,
            text: p.text || (null === (t = p.properties) || void 0 === t ? void 0 : t.text) || '',
            normalized_text:
              p.normalized_text ||
              (null === (n = p.properties) || void 0 === n ? void 0 : n.normalized_text) ||
              '',
            type:
              p.type || (null === (o = p.properties) || void 0 === o ? void 0 : o.type) || 'n-gram',
            entity_type:
              p.entity_type ||
              (null === (i = p.properties) || void 0 === i ? void 0 : i.entity_type),
            frequency:
              p.frequency ||
              (null === (s = p.properties) || void 0 === s ? void 0 : s.frequency) ||
              0,
            source: 'database',
          };
        } catch (e) {
          throw await (0, r.zG)(e);
        }
      }
      async function O(e) {
        try {
          var t, n, o, i;
          let s = await l(''.concat(a.CT, '/api/v1/nodes/').concat(e), { headers: c() });
          s.ok || (await (0, r.zG)({ response: s }));
          let u = await s.json(),
            d = u.node || u;
          return {
            id: d.id,
            name: d.name || (null === (t = d.properties) || void 0 === t ? void 0 : t.name) || '',
            description:
              d.description ||
              (null === (n = d.properties) || void 0 === n ? void 0 : n.description),
            keywords:
              d.keywords ||
              (null === (o = d.properties) || void 0 === o ? void 0 : o.keywords) ||
              [],
            strength:
              d.strength ||
              (null === (i = d.properties) || void 0 === i ? void 0 : i.strength) ||
              0,
            source: 'database',
          };
        } catch (e) {
          throw await (0, r.zG)(e);
        }
      }
      async function z(e) {
        try {
          var t, n, o, i;
          let s = await l(''.concat(a.CT, '/api/v1/nodes/').concat(e), { headers: c() });
          s.ok || (await (0, r.zG)({ response: s }));
          let u = await s.json(),
            d = u.node || u;
          return {
            id: d.id,
            title:
              d.title || (null === (t = d.properties) || void 0 === t ? void 0 : t.title) || '',
            content_markdown:
              d.content_markdown ||
              (null === (n = d.properties) || void 0 === n ? void 0 : n.content_markdown) ||
              '',
            token_count:
              d.token_count ||
              (null === (o = d.properties) || void 0 === o ? void 0 : o.token_count) ||
              0,
            citations:
              d.citations ||
              (null === (i = d.properties) || void 0 === i ? void 0 : i.citations) ||
              [],
            source: 'database',
          };
        } catch (e) {
          throw await (0, r.zG)(e);
        }
      }
      async function R(e) {
        try {
          var t, n, o, i, s, u, d;
          let p = await l(''.concat(a.CT, '/api/v1/nodes/').concat(e), { headers: c() });
          p.ok || (await (0, r.zG)({ response: p }));
          let h = await p.json(),
            f = h.node || h;
          return {
            id: f.id,
            url: f.url || (null === (t = f.properties) || void 0 === t ? void 0 : t.url) || '',
            title:
              f.title || (null === (n = f.properties) || void 0 === n ? void 0 : n.title) || '',
            publisher:
              f.publisher || (null === (o = f.properties) || void 0 === o ? void 0 : o.publisher),
            author: f.author || (null === (i = f.properties) || void 0 === i ? void 0 : i.author),
            published_at:
              f.published_at ||
              (null === (s = f.properties) || void 0 === s ? void 0 : s.published_at),
            accessed_at:
              f.accessed_at ||
              (null === (u = f.properties) || void 0 === u ? void 0 : u.accessed_at),
            trust_score:
              f.trust_score ||
              (null === (d = f.properties) || void 0 === d ? void 0 : d.trust_score) ||
              0,
            source: 'database',
          };
        } catch (e) {
          throw await (0, r.zG)(e);
        }
      }
      async function L(e) {
        try {
          var t, n, o, i, s;
          let u = await l(''.concat(a.CT, '/api/v1/nodes/').concat(e), { headers: c() });
          u.ok || (await (0, r.zG)({ response: u }));
          let d = await u.json(),
            p = d.node || d;
          return {
            id: p.id,
            claim_text:
              p.claim_text ||
              (null === (t = p.properties) || void 0 === t ? void 0 : t.claim_text) ||
              '',
            source_id:
              p.source_id ||
              (null === (n = p.properties) || void 0 === n ? void 0 : n.source_id) ||
              '',
            evidence_excerpt:
              p.evidence_excerpt ||
              (null === (o = p.properties) || void 0 === o ? void 0 : o.evidence_excerpt),
            confidence:
              p.confidence ||
              (null === (i = p.properties) || void 0 === i ? void 0 : i.confidence) ||
              0,
            status:
              p.status ||
              (null === (s = p.properties) || void 0 === s ? void 0 : s.status) ||
              'proposed',
            source: 'database',
          };
        } catch (e) {
          throw await (0, r.zG)(e);
        }
      }
      async function G() {
        try {
          let e = await l(''.concat(a.CT, '/api/v1/content/stats'), { headers: c() });
          return (e.ok || (await (0, r.zG)({ response: e })), await e.json());
        } catch (e) {
          throw await (0, r.zG)(e);
        }
      }
      async function x(e, t) {
        if (!t) throw Error('jobId is required to apply similarity review decisions');
        try {
          let n = await l(''.concat(a.CT, '/api/v1/jobs/').concat(t, '/similarity-review/apply'), {
            method: 'POST',
            headers: { ...c(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ decisions: e }),
          });
          return (n.ok || (await (0, r.zG)({ response: n })), await n.json());
        } catch (e) {
          throw await (0, r.zG)(e);
        }
      }
      async function D(e) {
        if (!e) throw Error('jobId is required to fetch similarity review status');
        try {
          let t = await l(''.concat(a.CT, '/api/v1/jobs/').concat(e, '/similarity-review/status'), {
            method: 'GET',
            headers: c(),
          });
          return (t.ok || (await (0, r.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, r.zG)(e);
        }
      }
      async function M(e) {
        if (!e) throw Error('jobId is required to fetch similarity review groups');
        try {
          let t = await l(''.concat(a.CT, '/api/v1/jobs/').concat(e, '/similarity-review/groups'), {
            method: 'GET',
            headers: c(),
          });
          return (t.ok || (await (0, r.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, r.zG)(e);
        }
      }
      async function U(e) {
        try {
          let t = new URLSearchParams();
          ((null == e ? void 0 : e.node_budget) && t.append('node_budget', String(e.node_budget)),
            (null == e ? void 0 : e.edge_budget) && t.append('edge_budget', String(e.edge_budget)),
            (null == e ? void 0 : e.seed_node_ids) &&
              e.seed_node_ids.length > 0 &&
              t.append('seed_node_ids', e.seed_node_ids.join(',')));
          let n = ''
              .concat(a.CT, '/api/v1/graph/read-model')
              .concat(t.toString() ? '?'.concat(t.toString()) : ''),
            o = await u(n);
          o.ok || (await (0, r.zG)({ response: o }));
          let i = await o.json();
          return {
            nodes: i.nodes || [],
            edges: i.edges || [],
            metadata: i.metadata || {
              total_nodes: 0,
              total_edges: 0,
              selected_node_count: 0,
              selected_edge_count: 0,
              truncated: !1,
              selection_strategy: 'unknown',
              edge_kind_breakdown: {},
            },
          };
        } catch (e) {
          throw await (0, r.zG)(e);
        }
      }
      async function B(e) {
        var t;
        let n = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {},
          o = await l(''.concat(a.CT, '/api/v1/nodes/').concat(e, '/sequester'), {
            method: 'POST',
            headers: { ...c(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ sequester: null === (t = n.sequester) || void 0 === t || t }),
          });
        return (o.ok || (await (0, r.zG)({ response: o })), o.json());
      }
      async function F(e) {
        let t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {},
          n = new URLSearchParams({ q: e });
        (t.limit && n.set('limit', String(t.limit)),
          t.minScore && n.set('minScore', String(t.minScore)),
          void 0 !== t.explain && n.set('explain', String(t.explain)));
        let o = await l(''.concat(a.CT, '/api/v1/search/query?').concat(n.toString()), {
          headers: c(),
        });
        return (o.ok || (await (0, r.zG)({ response: o })), o.json());
      }
      async function J(e, t) {
        let n = new URLSearchParams({ sourceA: e, sourceB: t }),
          o = await l(''.concat(a.CT, '/api/v1/search/explain-connection?').concat(n.toString()), {
            headers: c(),
          });
        return (o.ok || (await (0, r.zG)({ response: o })), o.json());
      }
      async function X() {
        let e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : 50,
          t = await l(''.concat(a.CT, '/api/v1/spine/topics/suggestions?limit=').concat(e), {
            headers: c(),
          });
        return (t.ok || (await (0, r.zG)({ response: t })), t.json());
      }
      async function q(e) {
        let t = await l(''.concat(a.CT, '/api/v1/spine/topics/').concat(e, '/promote'), {
          method: 'POST',
          headers: { ...c(), 'Content-Type': 'application/json' },
        });
        return (t.ok || (await (0, r.zG)({ response: t })), t.json());
      }
      async function H(e) {
        let t = await l(''.concat(a.CT, '/api/v1/spine/topics/').concat(e, '/reject'), {
          method: 'POST',
          headers: { ...c(), 'Content-Type': 'application/json' },
        });
        return (t.ok || (await (0, r.zG)({ response: t })), t.json());
      }
      async function V(e, t) {
        let n = await l(''.concat(a.CT, '/api/v1/spine/topics/').concat(e), {
          method: 'PATCH',
          headers: { ...c(), 'Content-Type': 'application/json' },
          body: JSON.stringify(t),
        });
        return (n.ok || (await (0, r.zG)({ response: n })), n.json());
      }
      async function Y() {
        try {
          let e = await l(''.concat(a.CT, '/api/v1/accounts'), { headers: c() });
          return (e.ok || (await (0, r.zG)({ response: e })), await e.json());
        } catch (e) {
          throw await (0, r.zG)(e);
        }
      }
      async function W(e) {
        try {
          let t = await l(''.concat(a.CT, '/api/v1/accounts/').concat(e, '/stats'), {
            headers: c(),
          });
          return (t.ok || (await (0, r.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, r.zG)(e);
        }
      }
      async function K() {
        try {
          let e = await l(''.concat(a.CT, '/api/v1/analytics/overview'), { headers: c() });
          return (e.ok || (await (0, r.zG)({ response: e })), await e.json());
        } catch (e) {
          throw await (0, r.zG)(e);
        }
      }
      async function Q() {
        let e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : 'usage',
          t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : 10;
        try {
          let n = await u(
            ''
              .concat(a.CT, '/api/v1/analytics/top-accounts?metric=')
              .concat(e, '&limit=')
              .concat(t),
            {}
          );
          return (n.ok || (await (0, r.zG)({ response: n })), await n.json());
        } catch (e) {
          throw await (0, r.zG)(e);
        }
      }
      async function $() {
        let e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : 50;
        try {
          let t = await u(
            ''.concat(a.CT, '/api/v1/analytics/recent-activity?limit=').concat(e),
            {}
          );
          return (t.ok || (await (0, r.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, r.zG)(e);
        }
      }
      async function Z() {
        try {
          let e = await l(''.concat(a.CT, '/api/v1/analytics/alerts'), { headers: c() });
          return (e.ok || (await (0, r.zG)({ response: e })), await e.json());
        } catch (e) {
          throw await (0, r.zG)(e);
        }
      }
      async function ee(e) {
        try {
          let t = await l(''.concat(a.CT, '/api/v1/accounts/').concat(e, '/users'), {
            headers: c(),
          });
          return (t.ok || (await (0, r.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, r.zG)(e);
        }
      }
      async function et(e) {
        try {
          let t = await l(''.concat(a.CT, '/api/v1/users/').concat(e), { headers: c() });
          return (t.ok || (await (0, r.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, r.zG)(e);
        }
      }
      async function en(e, t) {
        try {
          let n = await l(''.concat(a.CT, '/api/v1/accounts/').concat(e, '/users'), {
            method: 'POST',
            headers: { ...c(), 'Content-Type': 'application/json' },
            body: JSON.stringify(t),
          });
          return (n.ok || (await (0, r.zG)({ response: n })), await n.json());
        } catch (e) {
          throw await (0, r.zG)(e);
        }
      }
      async function er(e, t) {
        try {
          let n = await l(''.concat(a.CT, '/api/v1/users/').concat(e), {
            method: 'PATCH',
            headers: { ...c(), 'Content-Type': 'application/json' },
            body: JSON.stringify(t),
          });
          return (n.ok || (await (0, r.zG)({ response: n })), await n.json());
        } catch (e) {
          throw await (0, r.zG)(e);
        }
      }
      async function eo(e) {
        try {
          let t = await l(''.concat(a.CT, '/api/v1/users/').concat(e), {
            method: 'DELETE',
            headers: c(),
          });
          return (t.ok || (await (0, r.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, r.zG)(e);
        }
      }
      async function ea(e) {
        let t = await l(''.concat(a.CT, '/api/v1/settings?accountId=').concat(e), { headers: c() });
        return (t.ok || (await (0, r.zG)({ response: t })), t.json());
      }
      async function ei(e, t) {
        let n = await l(''.concat(a.CT, '/api/v1/ingest/url'), {
          method: 'POST',
          headers: { ...c(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: e, board_id: t }),
        });
        if (!n.ok) {
          let e = await n.json().catch(() => ({}));
          throw Error(e.error || e.message || 'Failed to ingest URL: '.concat(n.statusText));
        }
        return n.json();
      }
      async function es() {
        let e = await l(''.concat(a.CT, '/api/v1/system/reimport-status'), {
          method: 'GET',
          headers: c(),
        });
        if (!e.ok) throw await (0, r.zG)({ response: e });
        return e.json();
      }
      async function ec() {
        let e = await l(''.concat(a.CT, '/api/v1/system/reimport-complete'), {
          method: 'POST',
          headers: { ...c(), 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (!e.ok) throw await (0, r.zG)({ response: e });
        return e.json();
      }
      async function el(e) {
        try {
          let t = await l(''.concat(a.CT, '/api/v1/spine/unified-doc'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...c() },
            body: JSON.stringify(e),
          });
          return (t.ok || (await (0, r.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, r.zG)(e);
        }
      }
      async function eu(e) {
        try {
          let t = await l(''.concat(a.CT, '/api/v1/spine/hub/').concat(encodeURIComponent(e)), {
            headers: c(),
          });
          return (t.ok || (await (0, r.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, r.zG)(e);
        }
      }
      let ed = {
        get: async (e, t) => {
          let n = await l(''.concat(a.CT).concat(e), {
            method: 'GET',
            headers: { ...c(), ...(null == t ? void 0 : t.headers) },
          });
          return (n.ok || (await (0, r.zG)({ response: n })), { data: await n.json() });
        },
        post: async (e, t, n) => {
          let o = t instanceof FormData,
            i = await l(''.concat(a.CT).concat(e), {
              method: 'POST',
              headers: {
                ...c(),
                ...(!o && { 'Content-Type': 'application/json' }),
                ...(null == n ? void 0 : n.headers),
              },
              body: o ? t : JSON.stringify(t),
            });
          return (i.ok || (await (0, r.zG)({ response: i })), { data: await i.json() });
        },
        patch: async (e, t, n) => {
          let o = await l(''.concat(a.CT).concat(e), {
            method: 'PATCH',
            headers: {
              ...c(),
              'Content-Type': 'application/json',
              ...(null == n ? void 0 : n.headers),
            },
            body: JSON.stringify(t),
          });
          return (o.ok || (await (0, r.zG)({ response: o })), { data: await o.json() });
        },
        delete: async (e, t) => {
          let n = await l(''.concat(a.CT).concat(e), {
            method: 'DELETE',
            headers: { ...c(), ...(null == t ? void 0 : t.headers) },
          });
          return (n.ok || (await (0, r.zG)({ response: n })), { data: await n.json() });
        },
      };
    },
    3291: function (e, t, n) {
      n.d(t, {
        Ar: function () {
          return d;
        },
        CT: function () {
          return c;
        },
        Ku: function () {
          return g;
        },
        LS: function () {
          return T;
        },
        M6: function () {
          return m;
        },
        OJ: function () {
          return u;
        },
        Qn: function () {
          return y;
        },
        X8: function () {
          return w;
        },
        nj: function () {
          return l;
        },
        oj: function () {
          return f;
        },
        pA: function () {
          return h;
        },
        yD: function () {
          return p;
        },
        zC: function () {
          return v;
        },
      });
      var r = n(4859);
      function o(e) {
        let t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : '';
        return (void 0 !== r && r.env && r.env[e]) || t;
      }
      o('INTERNAL_API_URL');
      let a = { apiPort: 'keimenon.startup.apiPort', dev: 'keimenon.startup.dev' };
      function i(e) {
        let t = window.location ? new URLSearchParams(window.location.search).get(e) : null;
        if (t && t.trim().length > 0) {
          try {
            window.sessionStorage.setItem(a[e], t);
          } catch (e) {}
          return t;
        }
        try {
          let t = window.sessionStorage.getItem(a[e]);
          if (t && t.trim().length > 0) return t;
        } catch (e) {}
        return null;
      }
      let s = i('apiPort'),
        c =
          (s ? 'http://127.0.0.1:'.concat(s) : null) ||
          o('NEXT_PUBLIC_API_URL', 'http://127.0.0.1:4001');
      (console.log('[Config] API_BASE_URL resolved to:', c),
        o('NEXT_PUBLIC_ENABLE_PRO_FEATURES'),
        o('NEXT_PUBLIC_ENABLE_BUSINESS_FEATURES'));
      let l = '1' === o('NEXT_PUBLIC_ENABLE_LEGACY_IMPORTS'),
        u = '1' === o('NEXT_PUBLIC_ENABLE_HYBRID_LOCAL_FIRST'),
        d = 'false' !== o('NEXT_PUBLIC_ENABLE_3D_RENDERER', 'true');
      o('NEXT_PUBLIC_USE_DIRECT_SSE');
      let p = '1' === o('NEXT_PUBLIC_DEBUG_IMPORT_SELECTOR');
      i('dev');
      let h = 'true' === o('NEXT_PUBLIC_E2E_TESTING');
      (parseInt(o('NEXT_PUBLIC_JOB_POLL_INTERVAL_MS', '2000'), 10),
        parseInt(o('NEXT_PUBLIC_SSE_RECONNECT_TIMEOUT_MS', '5000'), 10),
        parseInt(o('NEXT_PUBLIC_MAX_JOB_WAIT_MS', '1500000'), 10));
      let f = o('NEXT_PUBLIC_SENTRY_DSN'),
        w = o('NEXT_PUBLIC_SENTRY_ENVIRONMENT', o('NODE_ENV', 'production')),
        m = parseFloat(o('NEXT_PUBLIC_SENTRY_SAMPLE_RATE', '1.0')),
        y = parseFloat(o('NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE', '0.1')),
        g = parseFloat(o('NEXT_PUBLIC_SENTRY_REPLAY_SESSION_SAMPLE_RATE', '0.1')),
        v = parseFloat(o('NEXT_PUBLIC_SENTRY_REPLAY_ERROR_SAMPLE_RATE', '1.0')),
        T = 'false' !== o('NEXT_PUBLIC_SENTRY_SCRUB_PII', 'true');
      (o('NEXT_PUBLIC_AUTH_DOMAIN'), o('NEXT_PUBLIC_AUTH_CLIENT_ID'), o('NODE_ENV', 'production'));
    },
    2844: function (e, t, n) {
      n.d(t, {
        Et: function () {
          return u;
        },
        Vo: function () {
          return p;
        },
        bK: function () {
          return d;
        },
        zG: function () {
          return l;
        },
      });
      var r = n(1482);
      class o extends Error {
        constructor(e, t, n = 500, r) {
          (super(e),
            (this.code = t),
            (this.statusCode = n),
            (this.details = r),
            (this.name = 'AppError'));
        }
      }
      class a extends o {
        constructor(e, t) {
          (super(e, 'VALIDATION_ERROR', 400, t), (this.name = 'ValidationError'));
        }
      }
      class i extends o {
        constructor(e, t) {
          (super(e, 'NETWORK_ERROR', 503, t), (this.name = 'NetworkError'));
        }
      }
      class s extends o {
        constructor(e, t) {
          (super(e, 'FILE_ERROR', 400, t), (this.name = 'FileError'));
        }
      }
      class c extends o {
        constructor(e, t) {
          (super(e, 'AUTH_ERROR', 401, t), (this.name = 'AuthError'));
        }
      }
      async function l(e) {
        let t;
        if ('TypeError' === e.name && e.message.includes('fetch'))
          throw (
            (t = new i('Unable to connect to server. Please check your connection.')),
            r.I.capture(
              t,
              { domain: 'api', operation: 'network.fetch', metadata: { originalError: e.message } },
              'error'
            ),
            t
          );
        if (e.response) {
          let n = e.response.status,
            l = await e.response.json().catch(() => ({})),
            u = 'object' == typeof l.error && null !== l.error ? l.error : {},
            d =
              'string' == typeof l.error ? l.error : u.message || l.message || 'An error occurred',
            p = u.domain || 'api',
            h = u.operation || 'api.'.concat(e.response.url || 'unknown');
          t = ((e) => {
            switch (e) {
              case 400:
              case 422:
                return new a(d, l.errors || u);
              case 401:
              case 403:
                return new c(d);
              case 404:
                return new o(d, 'NOT_FOUND', 404);
              case 409:
                var t;
                return new o(
                  d,
                  'IMPORT_COLLISION',
                  409,
                  l.details ||
                    (null === (t = l.error) || void 0 === t ? void 0 : t.details) ||
                    u.details
                );
              case 413:
                return new s(d, { maxSize: '10MB' });
              case 500:
                return new o(d, 'SERVER_ERROR', 500);
              case 503:
                return new i(d);
              default:
                return new o(d, 'UNKNOWN_ERROR', e);
            }
          })(n);
          let f = n >= 500 ? 'error' : n >= 400 ? 'warn' : 'info';
          throw (
            r.I.capture(
              t,
              {
                domain: p,
                operation: h,
                metadata: { statusCode: n, backendError: u, url: e.response.url },
              },
              f
            ),
            t
          );
        }
        throw (
          (t = new o(e.message || 'An unexpected error occurred', 'UNKNOWN_ERROR')),
          r.I.capture(
            t,
            { domain: 'api', operation: 'unknown', metadata: { originalError: e } },
            'error'
          ),
          t
        );
      }
      function u(e, t) {
        r.I.info(e, { domain: t.domain || 'api', operation: t.operation, metadata: t.metadata });
      }
      function d(e, t, n) {
        r.I.info(e, { domain: 'import', operation: t, metadata: n });
      }
      function p(e, t, n) {
        r.I.info(e, { domain: 'jobs', operation: t, metadata: n });
      }
    },
    1103: function (e, t, n) {
      function r(e) {
        var t, n, r;
        let a = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : 24;
        return (r = e.label
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
                            : ((n = e.principal_kind) &&
                                { human: 'User', agent: 'AI Assistant', contact: 'Contact' }[n]) ||
                              'Principal'
                      : 'ConversationThread' === e.kind
                        ? e.title
                          ? e.title
                          : e.purpose
                            ? ''.concat(o(e.purpose), ' thread')
                            : 'Conversation'
                        : e.role
                          ? ''.concat(o(e.role), ' message')
                          : e.language
                            ? ''.concat(e.language, ' code')
                            : e.kind
                                .replace(/([a-z])([A-Z])/g, '$1 $2')
                                .replace(/^./, (e) => e.toUpperCase())).length <= a
          ? r
          : r.slice(0, a - 1) + '…';
      }
      function o(e) {
        return e.charAt(0).toUpperCase() + e.slice(1).toLowerCase();
      }
      n.d(t, {
        F: function () {
          return r;
        },
      });
    },
    1482: function (e, t, n) {
      n.d(t, {
        I: function () {
          return a;
        },
      });
      var r = n(8155);
      class o {
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
          let n = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : 'error',
            o =
              'string' == typeof e
                ? 'error' === n || 'warn' === n
                  ? Error(e)
                  : { message: e, name: 'LogMessage' }
                : e,
            a = {
              id: this.generateId(),
              timestamp: Date.now(),
              domain: t.domain,
              operation: t.operation,
              message: o.message,
              stack: o.stack,
              severity: n,
              context: t,
              error: o,
              userMessage: this.getUserMessage(o, t),
            };
          return (
            this.errors.push(a),
            this.errors.length > this.maxErrors && this.errors.shift(),
            'error' === n && this.persistError(a),
            this.notifySubscribers(a),
            ('error' === n || 'warn' === n) &&
              r.O7(o, {
                tags: { domain: t.domain, operation: t.operation },
                extra: { ...t.metadata, severity: n },
                user: t.userId && t.accountId ? { id: t.userId, accountId: t.accountId } : void 0,
                level: 'error' === n ? 'error' : 'warning',
              }),
            a
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
            n = [...this.errors];
          if (t) {
            if (t.domain) {
              let e = Array.isArray(t.domain) ? t.domain : [t.domain];
              n = n.filter((t) => e.includes(t.domain));
            }
            if (t.severity) {
              let e = Array.isArray(t.severity) ? t.severity : [t.severity];
              n = n.filter((t) => e.includes(t.severity));
            }
            if (t.search) {
              let e = t.search.toLowerCase();
              n = n.filter(
                (t) => t.message.toLowerCase().includes(e) || t.operation.toLowerCase().includes(e)
              );
            }
            (t.startTime && (n = n.filter((e) => e.timestamp >= t.startTime)),
              t.endTime && (n = n.filter((e) => e.timestamp <= t.endTime)));
          }
          return n.sort((e, t) => t.timestamp - e.timestamp).slice(0, e);
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
              n = localStorage.getItem(t),
              r = n ? JSON.parse(n) : [];
            (r.push(e), r.length > 50 && r.shift(), localStorage.setItem(t, JSON.stringify(r)));
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
      let a = new o();
      ((window.errorCapture = a),
        console.log('%c[system] errorCapture.init', 'color: #3b82f6; font-weight: normal'),
        console.log({ message: 'ErrorCaptureService initialized', name: 'LogMessage' }),
        console.groupEnd());
    },
    8155: function (e, t, n) {
      n.d(t, {
        O7: function () {
          return p;
        },
        d4: function () {
          return c;
        },
        h2: function () {
          return l;
        },
        j6: function () {
          return d;
        },
        tN: function () {
          return u;
        },
      });
      var r = n(89),
        o = n(1052),
        a = n(8885),
        i = n(3953),
        s = n(3291);
      function c() {
        return !!s.oj;
      }
      function l() {
        return 'true' === localStorage.getItem('sentry_consent');
      }
      function u(e) {
        (localStorage.setItem('sentry_consent', e ? 'true' : 'false'), !e && c() && r.xv());
      }
      function d() {
        if (!s.oj) {
          console.log('\uD83D\uDCCA Sentry: Disabled (no NEXT_PUBLIC_SENTRY_DSN provided)');
          return;
        }
        if (!l()) {
          console.log('\uD83D\uDCCA Sentry: Disabled (user has not consented)');
          return;
        }
        (console.log(
          '\uD83D\uDCCA Sentry: Initializing (env: '.concat(s.X8, ', sample: ').concat(s.M6, ')')
        ),
          o.S({
            dsn: s.oj,
            environment: s.X8,
            sampleRate: s.M6,
            tracesSampleRate: s.Qn,
            integrations: [a.G({ maskAllText: !0, blockAllMedia: !0, maskAllInputs: !0 })],
            replaysSessionSampleRate: s.Ku,
            replaysOnErrorSampleRate: s.zC,
            beforeSend(e, t) {
              if (s.LS) {
                var n;
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
                  (null === (n = e.user) || void 0 === n ? void 0 : n.email) && delete e.user.email,
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
        c() &&
          l() &&
          i.$e((n) => {
            ((null == t ? void 0 : t.tags) &&
              Object.entries(t.tags).forEach((e) => {
                let [t, r] = e;
                n.setTag(t, r);
              }),
              (null == t ? void 0 : t.extra) &&
                Object.entries(t.extra).forEach((e) => {
                  let [t, r] = e;
                  n.setExtra(t, r);
                }),
              (null == t ? void 0 : t.user) &&
                n.setUser({ id: t.user.id, accountId: t.user.accountId, rank: t.user.rank }),
              (null == t ? void 0 : t.level) && n.setLevel(t.level),
              r.Tb(e));
          });
      }
    },
    2766: function (e, t, n) {
      n.d(t, {
        O: function () {
          return v;
        },
      });
      var r = n(7582),
        o = n(4452),
        a = n(1493),
        i = n(1103);
      function s(e) {
        return (
          (function (e) {
            let t = 2166136261;
            for (let n = 0; n < e.length; n += 1)
              ((t ^= e.charCodeAt(n)), (t = Math.imul(t, 16777619)));
            return t >>> 0;
          })(e) / 4294967296
        );
      }
      let c = { 0: 0, 1: 80, 2: 180, 3: 300, 4: 420, 5: 550 },
        l = {
          AccountNode: 0,
          Principal: 1,
          UserNode: 1,
          AgentNode: 1,
          Group: 2,
          Folder: 2,
          Source: 3,
          SourceDoc: 3,
          ChatThread: 3,
          ConversationThread: 3,
          ObjectiveClaim: 4,
          VerifiedSource: 4,
          VerifiedClaim: 4,
          Evidence: 4,
          Topic: 5,
          Phrase: 5,
          Lexeme: 5,
          Constellation: 5,
          CodeBlock: 5,
          SourceSpan: 5,
          Packet: 5,
          Board: 5,
          UnifiedDoc: 5,
          CanonicalDoc: 5,
          DuplicateCluster: 5,
          Message: 5,
          UploadItem: 5,
          AtomicUnit: 5,
        },
        u = new Set([
          'OWNED_BY',
          'CREATED_BY',
          'IN_GROUP',
          'FOLDS_INTO_FOLDER',
          'CONTAINS',
          'HAS_MESSAGE',
        ]);
      function d(e) {
        return 'string' == typeof e ? e : e.id;
      }
      function p(e) {
        return 'number' == typeof e && Number.isFinite(e);
      }
      function h(e) {
        var t;
        return null !== (t = l[e]) && void 0 !== t ? t : 5;
      }
      var f = n(4859);
      let w = [300, 900, 2100];
      function m(e) {
        var t, n;
        let r = e.properties || {},
          o = 'object' == typeof r.contact_info && r.contact_info ? r.contact_info : void 0,
          a =
            'string' == typeof (null == o ? void 0 : o.source_platform)
              ? o.source_platform
              : 'string' == typeof r.platform
                ? r.platform
                : void 0,
          s = (0, i.F)({ id: e.id, kind: e.kind, ...r, platform: a });
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
          position: { x: 0, y: 0 },
          data: {
            label: s,
            content: null === (n = e.properties) || void 0 === n ? void 0 : n.content,
            metadata: e.properties,
          },
        };
      }
      function y(e) {
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
      let g = {
          nodes: [],
          edges: [],
          isLoading: !1,
          error: null,
          selectedNode: null,
          selectedNodeIds: new Set(),
          hoveredNodeId: null,
          detailPanelNode: null,
          evidenceDetail: null,
          viewport: { x: 0, y: 0, zoom: 1 },
          filters: {
            nodeTypes: new Set(),
            searchQuery: '',
            filteredNodeIds: null,
            sourceRoleFilter: new Set(),
          },
          currentAccountId: null,
          graphLoadMetrics: null,
        },
        v = (0, r.Ue)()(
          (0, o.mW)(
            (e, t) => ({
              ...g,
              setNodes: (t) => e({ nodes: t }),
              setEdges: (t) => e({ edges: t }),
              loadGraphData: async () => {
                e({ isLoading: !0, error: null });
                try {
                  var t, n, r;
                  let o = null;
                  for (let e = 0; e <= w.length; e += 1)
                    try {
                      o = await (0, a.jH)();
                      break;
                    } catch (t) {
                      if (
                        !(
                          e < w.length &&
                          (function (e) {
                            let t = null == e ? void 0 : e.statusCode,
                              n = ((null == e ? void 0 : e.message) || '').toLowerCase();
                            return (
                              (null == e ? void 0 : e.code) === 'NETWORK_ERROR' ||
                              429 === t ||
                              ('number' == typeof t && t >= 500) ||
                              n.includes('timeout') ||
                              n.includes('network') ||
                              n.includes('fetch')
                            );
                          })(t)
                        )
                      )
                        throw t;
                      await (function (e) {
                        return new Promise((t) => setTimeout(t, e));
                      })(w[e]);
                    }
                  if (!o) throw Error('Failed to load graph data after retries');
                  let i = o.metadata,
                    l = o.nodes.map(m),
                    f = new Set(l.map((e) => e.id)),
                    g = o.edges.map(y).filter((e) => f.has(e.source) && f.has(e.target)),
                    v =
                      null !==
                        (r =
                          null !==
                            (n =
                              null === (t = i.readModel) || void 0 === t ? void 0 : t.truncated) &&
                          void 0 !== n
                            ? n
                            : i.truncated) &&
                      void 0 !== r &&
                      r,
                    T = (function (e, t) {
                      let n = new Map();
                      if (0 === e.length) return n;
                      let r = (function (e) {
                          let t = new Map();
                          for (let n of e) {
                            if (!u.has(n.kind)) continue;
                            let e = d(n.source),
                              r = d(n.target);
                            'CONTAINS' === n.kind || 'HAS_MESSAGE' === n.kind
                              ? t.has(r) || t.set(r, e)
                              : t.has(e) || t.set(e, r);
                          }
                          return t;
                        })(t),
                        o = new Map();
                      for (let t of [...e].sort((e, t) => {
                        let n = h(e.kind),
                          r = h(t.kind);
                        return n !== r ? n - r : e.id.localeCompare(t.id);
                      })) {
                        let e = (function (e, t, n) {
                          var r;
                          let o;
                          if (p(e.x) && p(e.y)) return null;
                          let a = h(e.kind);
                          if (0 === a) return { x: 0, y: 0 };
                          let i = null !== (r = c[a]) && void 0 !== r ? r : 550,
                            l = s(''.concat(e.id, ':angle')) * Math.PI * 2,
                            u = (function (e, t, n) {
                              let r = t.get(e);
                              if (!r) return null;
                              let o = n.get(r);
                              if (void 0 !== o) return o;
                              let a = s(''.concat(r, ':angle')) * Math.PI * 2;
                              return (n.set(r, a), a);
                            })(e.id, t, n);
                          o =
                            null !== u
                              ? u + (s(''.concat(e.id, ':child-offset')) - 0.5) * (Math.PI / 3)
                              : l;
                          let d = (s(''.concat(e.id, ':radius-jitter')) - 0.5) * (0.15 * i),
                            f = i + d,
                            w = Math.cos(o) * f,
                            m = Math.sin(o) * f;
                          return (n.set(e.id, o), { x: w, y: m });
                        })(t, r, o);
                        e ? n.set(t.id, e) : n.set(t.id, { x: t.x, y: t.y });
                      }
                      return n;
                    })(
                      l.map((e) => ({ id: e.id, kind: e.kind || e.type })),
                      g
                    );
                  for (let e of l) {
                    let t = T.get(e.id);
                    t && (e.position = t);
                  }
                  e({
                    nodes: l,
                    edges: g,
                    isLoading: !1,
                    error: null,
                    graphLoadMetrics: {
                      apiNodeCount: i.total_nodes || l.length,
                      apiEdgeCount: i.total_edges || o.edges.length,
                      structuralNodeCount: l.length,
                      renderedEdgeCount: g.length,
                      smartFilterApplied: !1,
                      isTruncated: v,
                      loadedAt: Date.now(),
                    },
                  });
                } catch (t) {
                  (console.error('Failed to load graph data:', t),
                    e({
                      isLoading: !1,
                      error: t.message || 'Failed to load graph data',
                      graphLoadMetrics: null,
                    }));
                }
              },
              hydrateGraphSubset: function (t) {
                let n = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : [];
                return e((e) => {
                  let r = new Map(e.nodes.map((e) => [e.id, e]));
                  for (let e of t) {
                    let t = m(e),
                      n = r.get(t.id);
                    if (n) r.set(t.id, { ...n, ...t, position: n.position });
                    else {
                      let e = (function (e) {
                        var t;
                        if (p(e.x) && p(e.y)) return { x: e.x, y: e.y };
                        let n = h(e.kind);
                        if (0 === n) return { x: 0, y: 0 };
                        let r = null !== (t = c[n]) && void 0 !== t ? t : 550,
                          o = s(''.concat(e.id, ':angle')) * Math.PI * 2,
                          a = (s(''.concat(e.id, ':radius-jitter')) - 0.5) * (0.15 * r),
                          i = r + a;
                        return { x: Math.cos(o) * i, y: Math.sin(o) * i };
                      })({ id: t.id, kind: t.kind || t.type });
                      ((t.position = e), r.set(t.id, t));
                    }
                  }
                  let o = Array.from(r.values()),
                    a = new Set(o.map((e) => e.id)),
                    i = new Map(e.edges.map((e) => [e.id, e]));
                  for (let e of n) {
                    let t = y(e);
                    a.has(t.source) && a.has(t.target) && i.set(t.id, t);
                  }
                  return { nodes: o, edges: Array.from(i.values()) };
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
              updateNode: (t, n) =>
                e((e) => ({ nodes: e.nodes.map((e) => (e.id === t ? { ...e, ...n } : e)) })),
              deleteNode: (t) =>
                e((e) => ({
                  nodes: e.nodes.filter((e) => e.id !== t),
                  edges: e.edges.filter((e) => e.source !== t && e.target !== t),
                  selectedNodeIds: new Set(Array.from(e.selectedNodeIds).filter((e) => e !== t)),
                })),
              deleteEdge: (t) => e((e) => ({ edges: e.edges.filter((e) => e.id !== t) })),
              setSelectedNode: (t) => e({ selectedNode: t }),
              selectNode: function (t) {
                let n = arguments.length > 1 && void 0 !== arguments[1] && arguments[1];
                return e((e) => {
                  let r = new Set(n ? e.selectedNodeIds : []);
                  return (
                    r.add(t),
                    {
                      selectedNodeIds: r,
                      selectedNode: n ? e.selectedNode : e.nodes.find((e) => e.id === t) || null,
                    }
                  );
                });
              },
              deselectNode: (t) =>
                e((e) => {
                  var n;
                  let r = new Set(e.selectedNodeIds);
                  return (
                    r.delete(t),
                    {
                      selectedNodeIds: r,
                      selectedNode:
                        (null === (n = e.selectedNode) || void 0 === n ? void 0 : n.id) === t
                          ? null
                          : e.selectedNode,
                    }
                  );
                }),
              clearSelection: () => e({ selectedNodeIds: new Set(), selectedNode: null }),
              selectAll: () => e((e) => ({ selectedNodeIds: new Set(e.nodes.map((e) => e.id)) })),
              setHoveredNode: (t) => e({ hoveredNodeId: t }),
              openDetailPanel: (t) => e({ detailPanelNode: t, evidenceDetail: null }),
              closeDetailPanel: () => e({ detailPanelNode: null, evidenceDetail: null }),
              openEvidenceDetail: (t) => e({ evidenceDetail: t, detailPanelNode: null }),
              clearEvidenceDetail: () => e({ evidenceDetail: null }),
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
                let { nodes: n } = t();
                if (0 === n.length) return;
                let r = Math.min(...n.map((e) => e.position.x)) - 50,
                  o = Math.min(...n.map((e) => e.position.y)) - 50,
                  a = Math.max(...n.map((e) => e.position.x)) + 50,
                  i = Math.max(...n.map((e) => e.position.y)) + 50,
                  s = a - r,
                  c = i - o,
                  l = window.innerWidth,
                  u = window.innerHeight,
                  d = Math.min(l / s, u / c, 1);
                e({
                  viewport: { x: -r * d + (l - s * d) / 2, y: -o * d + (u - c * d) / 2, zoom: d },
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
                let { nodes: n, edges: r } = t(),
                  o = new Set(
                    r
                      .filter((t) => t.source === e || t.target === e)
                      .flatMap((e) => [e.source, e.target])
                  );
                return (o.delete(e), n.filter((e) => o.has(e.id)));
              },
              setCurrentAccountId: (t) => e({ currentAccountId: t }),
              reset: () => e(g),
            }),
            { name: 'KeimenonStore' }
          )
        );
      '1' === f.env.NEXT_PUBLIC_E2E_TEST_HOOKS && (window.__keimenonStore = v);
    },
  },
]);
