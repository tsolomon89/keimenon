'use strict';
(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [630],
  {
    4175: function (e, t, r) {
      r.d(t, {
        AuthProvider: function () {
          return y;
        },
        LP: function () {
          return T;
        },
        aC: function () {
          return v;
        },
      });
      var o = r(7573),
        n = r(7653),
        a = r(1695),
        i = r(4374),
        s = r(2844);
      let c = [
        '__operatingAccount',
        '__operatingMode',
        '__cachedNodes',
        '__cachedEdges',
        '__cachedGroups',
        '__cachedBoards',
      ];
      var l = r(3291);
      let u = (0, n.createContext)(void 0),
        d = 'keimenon_token',
        p = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      function h() {
        let e = {};
        return (window.__TEST_DB_PATH__ && (e['X-Test-DB-Path'] = window.__TEST_DB_PATH__), e);
      }
      function f(e) {
        try {
          let t = e.split('.')[1],
            r = atob(t);
          return JSON.parse(r);
        } catch (e) {
          return (console.error('Failed to decode JWT:', e), null);
        }
      }
      function w(e) {
        let t = f(e);
        if (!t || !t.exp) return !0;
        let r = Math.floor(Date.now() / 1e3);
        return t.exp < r;
      }
      function m(e) {
        let t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {},
          r = new URLSearchParams(window.location.search),
          o = new URLSearchParams();
        for (let e of ['apiPort', 'dev']) {
          let t = r.get(e);
          t && o.set(e, t);
        }
        for (let [e, r] of Object.entries(t)) r && o.set(e, r);
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
          [r, y] = (0, n.useState)(null),
          [v, T] = (0, n.useState)(!0),
          E = (0, a.useRouter)();
        ((0, n.useEffect)(() => {
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
              let r = (t) => {
                e || (y(t), T(!1));
              };
              try {
                let e = localStorage.getItem(d);
                if ((console.log('[AuthContext] Init check. Token present:', !!e), !e)) {
                  r(null);
                  return;
                }
                if (w(e)) {
                  (console.log('[AuthContext] Token expired on startup, clearing storage'),
                    await t(),
                    r(null));
                  return;
                }
                try {
                  let o = await fetch(''.concat(l.CT, '/api/v1/auth/verify'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...h() },
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
                      r(null));
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
                  (await t(), r(null));
                  return;
                }
                r(o);
              } catch (e) {
                (console.error('[AuthContext] initializeAuth failed:', e), r(null));
              }
            })(),
            () => {
              e = !0;
            }
          );
        }, []),
          (0, n.useEffect)(() => {
            if (r && r.accountId) {
              let e = i.O.getState().currentAccountId;
              (e &&
                e !== r.accountId &&
                (console.log(
                  '\uD83D\uDD04 Account switched from '
                    .concat(e, ' to ')
                    .concat(r.accountId, ' - resetting keimenon store')
                ),
                i.O.getState().reset()),
                i.O.getState().setCurrentAccountId(r.accountId));
            }
          }, [null == r ? void 0 : r.accountId]));
        let _ = (0, n.useCallback)(
            async (e, t) => {
              T(!0);
              try {
                let r = await fetch(''.concat(l.CT, '/api/v1/auth/login'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...h() },
                  body: JSON.stringify({ email: e, password: t }),
                });
                if (!r.ok) {
                  let e = await r.json();
                  throw Error(e.error || 'Login failed');
                }
                let o = await r.json();
                if (o.requiresAccountSelection)
                  return (
                    T(!1),
                    {
                      requiresAccountSelection: !0,
                      availableAccounts: o.availableAccounts,
                      tempToken: o.tempToken,
                    }
                  );
                let { token: n } = o;
                if (!n) throw Error('No token received from server');
                localStorage.setItem(d, n);
                let a = g(n);
                if (!a) throw Error('Failed to parse user from token');
                (y(a),
                  T(!1),
                  console.log('Login successful:', {
                    email: a.email,
                    accountId: a.accountId,
                    rank: a.rank,
                    accountType: a.accountType,
                  }),
                  E.push(m('/keimenon')));
              } catch (e) {
                throw (T(!1), console.error('Login error:', e), e);
              }
            },
            [E]
          ),
          S = (0, n.useCallback)(
            async function (e, t, r) {
              let o = arguments.length > 3 && void 0 !== arguments[3] ? arguments[3] : 'free',
                n = r.trim();
              if (n.length < 2 || n.length > 120)
                throw Error('Name must be between 2 and 120 characters');
              if (!p.test(e)) throw Error('Please provide a valid email address');
              if (t.length < 8) throw Error('Password must be at least 8 characters');
              if (!/[a-zA-Z]/.test(t) || !/[0-9]/.test(t))
                throw Error('Password must include both letters and numbers');
              if (!['free', 'professional', 'business'].includes(o))
                throw Error('Invalid account class');
              T(!0);
              try {
                let r = await fetch(''.concat(l.CT, '/api/v1/auth/register'), {
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
                if (!r.ok) {
                  let e = await r.json();
                  throw Error(e.error || 'Registration failed. Please try again.');
                }
                let { token: a } = await r.json();
                if (!a) throw Error('No token received from server');
                localStorage.setItem(d, a);
                let i = g(a);
                if (!i) throw Error('Failed to parse user from token');
                (y(i),
                  T(!1),
                  console.log('Registration successful:', {
                    email: i.email,
                    accountType: i.accountType,
                    accountClass: i.accountClass,
                  }),
                  E.push(m('/keimenon')));
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
            [E]
          ),
          C = (0, n.useCallback)(
            async (e, t, r) => {
              T(!0);
              try {
                let o = await fetch(''.concat(l.CT, '/api/v1/auth/select-account'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ tempToken: e, accountId: t, accountPassword: r }),
                });
                if (!o.ok) {
                  let e = await o.json();
                  throw Error(e.error || 'Account selection failed');
                }
                let { token: n } = await o.json();
                if (!n) throw Error('No token received from server');
                localStorage.setItem(d, n);
                let a = g(n);
                if (!a) throw Error('Failed to parse user from token');
                (y(a),
                  T(!1),
                  console.log('Account selected:', { accountId: a.accountId, email: a.email }),
                  E.push(m('/keimenon')));
              } catch (e) {
                throw (T(!1), console.error('Account selection error:', e), e);
              }
            },
            [E]
          ),
          k = (0, n.useCallback)(async (e, t) => {
            T(!0);
            try {
              let r = localStorage.getItem(d);
              if (!r) throw Error('Not authenticated');
              console.log(
                '\uD83E\uDDF9 Clearing account-scoped runtime state before account switch...'
              );
              let o = (function () {
                let e =
                  arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : '__SENSITIVE__';
                for (let e of (i.O.getState().reset(), c)) delete window[e];
                let t = [];
                if (window.sessionStorage) {
                  let r = [];
                  for (let e = 0; e < window.sessionStorage.length; e += 1) {
                    let t = window.sessionStorage.key(e);
                    t && r.push(t);
                  }
                  for (let o of r)
                    (e.length > 0 && o.startsWith(e)) ||
                      (window.sessionStorage.removeItem(o), t.push(o));
                }
                return { clearedSessionKeys: t };
              })();
              console.log(
                '\uD83E\uDDF9 Cleared '.concat(o.clearedSessionKeys.length, ' sessionStorage items')
              );
              let n = await fetch(''.concat(l.CT, '/api/v1/auth/switch-account'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer '.concat(r) },
                body: JSON.stringify({ accountId: e, accountPassword: t }),
              });
              if (!n.ok) {
                let e = await n.json();
                throw Error(e.error || 'Account switch failed');
              }
              let a = (await n.json()).token;
              if (!a) throw Error('No token received from server');
              localStorage.setItem(d, a);
              let u = g(a);
              if (!u) throw Error('Failed to parse user from token');
              (y(u),
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
          I = (0, n.useCallback)(() => {
            (localStorage.removeItem(d),
              y(null),
              i.O.getState().reset(),
              E.push(m('/login')),
              console.log('Logged out'));
          }, [E]),
          N = (0, n.useCallback)(async () => {
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
              let r = await t.json();
              if (!(null == r ? void 0 : r.token) || 'string' != typeof r.token) return !1;
              localStorage.setItem(d, r.token);
              let o = g(r.token);
              return (o && y(o), !0);
            } catch (e) {
              return !1;
            }
          }, []);
        (0, n.useEffect)(() => {
          if (!r) return;
          let e = setInterval(async () => {
            let e = localStorage.getItem(d);
            if (!e) return;
            let t = f(e);
            if (!(null == t ? void 0 : t.exp)) return;
            let r = Math.floor(Date.now() / 1e3);
            t.exp - r <= 120 && !(await N()) && w(e) && I();
          }, 3e4);
          return () => clearInterval(e);
        }, [r, N, I]);
        let A = (0, n.useCallback)(() => {
          let e = localStorage.getItem(d);
          if (!e) {
            y(null);
            return;
          }
          if (w(e)) {
            N().then((e) => {
              e || I();
            });
            return;
          }
          let t = g(e);
          t ? y(t) : I();
        }, [I, N]);
        return (0, o.jsx)(u.Provider, {
          value: {
            user: r,
            isAuthenticated: !!r,
            isLoading: v,
            login: _,
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
        let e = (0, n.useContext)(u);
        if (void 0 === e) throw Error('useAuth must be used within an AuthProvider');
        return e;
      }
      function T() {
        return localStorage.getItem(d);
      }
    },
    1493: function (e, t, r) {
      r.d(t, {
        $P: function () {
          return ee;
        },
        $Q: function () {
          return S;
        },
        Bk: function () {
          return B;
        },
        E0: function () {
          return v;
        },
        EZ: function () {
          return _;
        },
        FE: function () {
          return x;
        },
        IU: function () {
          return R;
        },
        In: function () {
          return L;
        },
        J$: function () {
          return V;
        },
        Jl: function () {
          return E;
        },
        NT: function () {
          return k;
        },
        Ni: function () {
          return N;
        },
        Nm: function () {
          return O;
        },
        Nq: function () {
          return $;
        },
        PR: function () {
          return Y;
        },
        PZ: function () {
          return H;
        },
        SK: function () {
          return er;
        },
        T1: function () {
          return X;
        },
        T8: function () {
          return F;
        },
        TE: function () {
          return W;
        },
        U0: function () {
          return A;
        },
        UU: function () {
          return T;
        },
        W8: function () {
          return M;
        },
        W9: function () {
          return w;
        },
        Zd: function () {
          return z;
        },
        Zo: function () {
          return b;
        },
        _A: function () {
          return P;
        },
        ax: function () {
          return u;
        },
        d: function () {
          return f;
        },
        e_: function () {
          return et;
        },
        h8: function () {
          return Q;
        },
        hi: function () {
          return h;
        },
        lq: function () {
          return m;
        },
        oI: function () {
          return g;
        },
        qF: function () {
          return y;
        },
        qp: function () {
          return I;
        },
        r4: function () {
          return K;
        },
        rT: function () {
          return J;
        },
        tN: function () {
          return G;
        },
        tl: function () {
          return D;
        },
        tz: function () {
          return C;
        },
        u1: function () {
          return j;
        },
        v$: function () {
          return U;
        },
        w3: function () {
          return q;
        },
        wv: function () {
          return Z;
        },
        x1: function () {
          return eo;
        },
      });
      var o = r(2844),
        n = r(4175),
        a = r(3291);
      let i = ''.concat(a.CT, '/api/v1/auth/refresh'),
        s = null;
      function c() {
        let e = {},
          t = (0, n.LP)();
        t && (e.Authorization = 'Bearer '.concat(t));
        {
          let t = window.__operatingAccount,
            r = window.__operatingMode;
          t && r && 'native' !== r && ((e['X-Operating-Account'] = t), (e['X-Operating-Mode'] = r));
        }
        return e;
      }
      async function l(e, t) {
        let r = String(e),
          o = t,
          a = (0, n.LP)();
        if (
          a &&
          (function (e) {
            let t = (function (e) {
              try {
                let t = e.split('.')[1],
                  r = atob(t);
                return JSON.parse(r);
              } catch (e) {
                return (console.error('Failed to decode JWT:', e), null);
              }
            })(e);
            if (!t || !t.exp) return !0;
            let r = Math.floor(Date.now() / 1e3);
            return t.exp - 30 < r;
          })(a) &&
          !r.includes('/api/v1/auth/refresh')
        ) {
          let e = await d();
          e && (o = p(t, e));
        }
        let i = await fetch(e, o);
        if ((401 === i.status || 403 === i.status) && !r.includes('/api/v1/auth/refresh')) {
          let r = await d();
          if (r && (i = await fetch(e, p(t, r))).ok) return i;
          let o = (await i.json().catch(() => ({}))).error || 'Authentication failed';
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
                    for (let r of ['apiPort', 'dev']) {
                      let o = e.get(r);
                      o && t.set(r, o);
                    }
                    window.location.href = '/login?'.concat(t.toString());
                  }, 1e3));
              }
            })(o),
            Error(o)
          );
        }
        return i;
      }
      async function u(e, t) {
        let r = new Headers(c());
        return (
          (null == t ? void 0 : t.headers) &&
            new Headers(t.headers).forEach((e, t) => {
              r.set(t, e);
            }),
          l(e, { ...t, headers: r })
        );
      }
      async function d() {
        return (
          s ||
          (s = (async () => {
            let e = (0, n.LP)();
            if (!e) return null;
            try {
              let t = await fetch(i, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer '.concat(e) },
                body: JSON.stringify({ token: e }),
              });
              if (!t.ok) return null;
              let r = await t.json(),
                o = 'string' == typeof (null == r ? void 0 : r.token) ? r.token : null;
              if (!o) return null;
              return (localStorage.setItem('keimenon_token', o), o);
            } catch (e) {
              return null;
            } finally {
              s = null;
            }
          })())
        );
      }
      function p(e, t) {
        let r = new Headers((null == e ? void 0 : e.headers) || {});
        return (r.set('Authorization', 'Bearer '.concat(t)), { ...e, headers: r });
      }
      let h = {
        get: async (e) => {
          let t = await l(''.concat(a.CT, '/api/v1').concat(e));
          if (!t.ok) throw Error(t.statusText);
          return { data: await t.json() };
        },
        post: async (e, t) => {
          let r = await l(''.concat(a.CT, '/api/v1').concat(e), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...c() },
            body: JSON.stringify(t),
          });
          if (!r.ok) throw Error(r.statusText);
          return { data: await r.json() };
        },
        put: async (e, t) => {
          let r = await l(''.concat(a.CT, '/api/v1').concat(e), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...c() },
            body: JSON.stringify(t),
          });
          if (!r.ok) throw Error(r.statusText);
          return { data: await r.json() };
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
          return (e.ok || (await (0, o.zG)({ response: e })), await e.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function w(e) {
        try {
          let t = await l(''.concat(a.CT, '/api/v1/import/presets'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...c() },
            body: JSON.stringify(e),
          });
          return (t.ok || (await (0, o.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function m(e, t) {
        try {
          let r = await l(''.concat(a.CT, '/api/v1/import/presets/').concat(e), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...c() },
            body: JSON.stringify(t),
          });
          return (r.ok || (await (0, o.zG)({ response: r })), await r.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function g(e) {
        try {
          let t = await l(''.concat(a.CT, '/api/v1/import/presets/').concat(e), {
            method: 'DELETE',
            headers: c(),
          });
          return (t.ok || (await (0, o.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function y() {
        let e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : '24h',
          t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : 12;
        try {
          let r = new URLSearchParams({ window: e, buckets: String(t) }),
            n = await l(''.concat(a.CT, '/api/v1/import/stats/series?').concat(r.toString()), {
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
          let e = await l(''.concat(a.CT, '/api/v1/me/features'), { method: 'GET', headers: c() });
          return (e.ok || (await (0, o.zG)({ response: e })), await e.json());
        } catch (e) {
          throw await (0, o.zG)(e);
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
      async function E(e) {
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
      async function _(e) {
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
          var r, o, n, a, i, s, c;
          if (e.size > 10485760) {
            let r = e.slice(0, 5242880);
            ((t = await r.text()),
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
              (null === (r = l[0]) || void 0 === r ? void 0 : r.chat_messages) &&
              (null === (o = l[0]) || void 0 === o ? void 0 : o.account))
          )
            return { platform: 'chatgpt', confidence: 0.95 };
          if (l.uuid && l.chat_messages && l.account)
            return { platform: 'chatgpt', confidence: 0.9 };
          if (
            Array.isArray(l) &&
            (null === (n = l[0]) || void 0 === n ? void 0 : n.chat_messages) &&
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
          r = 0,
          o = 0;
        for (let n of e)
          try {
            let e = await C(n);
            if (((t[e.platform] = (t[e.platform] || 0) + 1), n.size > 52428800)) {
              console.log(
                'Large file detected ('.concat(
                  (n.size / 1024 / 1024).toFixed(2),
                  'MB), using estimates'
                )
              );
              let e = Math.floor(n.size / 256e3);
              ((r += e), (o += 10 * e));
              continue;
            }
            let a = await n.text(),
              i = JSON.parse(a);
            Array.isArray(i)
              ? ((r += i.length),
                i.forEach((e) => {
                  e.mapping
                    ? (o += Object.keys(e.mapping).length)
                    : e.messages && (o += e.messages.length);
                }))
              : i.conversations &&
                ((r += i.conversations.length),
                (o += i.conversations.reduce((e, t) => {
                  var r;
                  return e + ((null === (r = t.messages) || void 0 === r ? void 0 : r.length) || 0);
                }, 0)));
          } catch (e) {
            (console.error('Error analyzing file:', n.name, e), (r += 1), (o += 10));
          }
        return {
          total_conversations: Math.max(r, 1),
          total_messages: Math.max(o, 10),
          platforms: t,
        };
      }
      async function I(e) {
        try {
          let t = await l(''.concat(a.CT, '/api/v1/content/message/').concat(e), { headers: c() });
          return (t.ok || (await (0, o.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function N(e) {
        try {
          let t = await l(''.concat(a.CT, '/api/v1/content/source/').concat(e), { headers: c() });
          return (t.ok || (await (0, o.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function A(e) {
        try {
          let t = await l(''.concat(a.CT, '/api/v1/content/code/').concat(e), { headers: c() });
          return (t.ok || (await (0, o.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function b(e) {
        try {
          let t = await l(''.concat(a.CT, '/api/v1/content/conversation/').concat(e), {
            headers: c(),
          });
          return (t.ok || (await (0, o.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function j(e) {
        try {
          var t, r, n;
          let i = await l(''.concat(a.CT, '/api/v1/nodes/').concat(e), { headers: c() });
          i.ok || (await (0, o.zG)({ response: i }));
          let s = await i.json();
          return {
            id: s.id,
            lemma:
              s.lemma || (null === (t = s.properties) || void 0 === t ? void 0 : t.lemma) || '',
            pos: s.pos || (null === (r = s.properties) || void 0 === r ? void 0 : r.pos),
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
      async function P(e) {
        try {
          var t, r, n, i, s;
          let u = await l(''.concat(a.CT, '/api/v1/nodes/').concat(e), { headers: c() });
          u.ok || (await (0, o.zG)({ response: u }));
          let d = await u.json();
          return {
            id: d.id,
            text: d.text || (null === (t = d.properties) || void 0 === t ? void 0 : t.text) || '',
            normalized_text:
              d.normalized_text ||
              (null === (r = d.properties) || void 0 === r ? void 0 : r.normalized_text) ||
              '',
            type:
              d.type || (null === (n = d.properties) || void 0 === n ? void 0 : n.type) || 'n-gram',
            entity_type:
              d.entity_type ||
              (null === (i = d.properties) || void 0 === i ? void 0 : i.entity_type),
            frequency:
              d.frequency ||
              (null === (s = d.properties) || void 0 === s ? void 0 : s.frequency) ||
              0,
            source: 'database',
          };
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function z(e) {
        try {
          var t, r, n, i;
          let s = await l(''.concat(a.CT, '/api/v1/nodes/').concat(e), { headers: c() });
          s.ok || (await (0, o.zG)({ response: s }));
          let u = await s.json();
          return {
            id: u.id,
            name: u.name || (null === (t = u.properties) || void 0 === t ? void 0 : t.name) || '',
            description:
              u.description ||
              (null === (r = u.properties) || void 0 === r ? void 0 : r.description),
            keywords:
              u.keywords ||
              (null === (n = u.properties) || void 0 === n ? void 0 : n.keywords) ||
              [],
            strength:
              u.strength ||
              (null === (i = u.properties) || void 0 === i ? void 0 : i.strength) ||
              0,
            source: 'database',
          };
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function O(e) {
        try {
          var t, r, n, i, s, u, d;
          let p = await l(''.concat(a.CT, '/api/v1/nodes/').concat(e), { headers: c() });
          p.ok || (await (0, o.zG)({ response: p }));
          let h = await p.json();
          return {
            id: h.id,
            url: h.url || (null === (t = h.properties) || void 0 === t ? void 0 : t.url) || '',
            title:
              h.title || (null === (r = h.properties) || void 0 === r ? void 0 : r.title) || '',
            publisher:
              h.publisher || (null === (n = h.properties) || void 0 === n ? void 0 : n.publisher),
            author: h.author || (null === (i = h.properties) || void 0 === i ? void 0 : i.author),
            published_at:
              h.published_at ||
              (null === (s = h.properties) || void 0 === s ? void 0 : s.published_at),
            accessed_at:
              h.accessed_at ||
              (null === (u = h.properties) || void 0 === u ? void 0 : u.accessed_at),
            trust_score:
              h.trust_score ||
              (null === (d = h.properties) || void 0 === d ? void 0 : d.trust_score) ||
              0,
            source: 'database',
          };
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function R(e) {
        try {
          var t, r, n, i, s;
          let u = await l(''.concat(a.CT, '/api/v1/nodes/').concat(e), { headers: c() });
          u.ok || (await (0, o.zG)({ response: u }));
          let d = await u.json();
          return {
            id: d.id,
            claim_text:
              d.claim_text ||
              (null === (t = d.properties) || void 0 === t ? void 0 : t.claim_text) ||
              '',
            source_id:
              d.source_id ||
              (null === (r = d.properties) || void 0 === r ? void 0 : r.source_id) ||
              '',
            evidence_excerpt:
              d.evidence_excerpt ||
              (null === (n = d.properties) || void 0 === n ? void 0 : n.evidence_excerpt),
            confidence:
              d.confidence ||
              (null === (i = d.properties) || void 0 === i ? void 0 : i.confidence) ||
              0,
            status:
              d.status ||
              (null === (s = d.properties) || void 0 === s ? void 0 : s.status) ||
              'proposed',
            source: 'database',
          };
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function L() {
        try {
          let e = await l(''.concat(a.CT, '/api/v1/content/stats'), { headers: c() });
          return (e.ok || (await (0, o.zG)({ response: e })), await e.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function G(e, t) {
        if (!t) throw Error('jobId is required to apply duplicate review decisions');
        try {
          let r = await l(''.concat(a.CT, '/api/v1/jobs/').concat(t, '/duplicate-review/apply'), {
            method: 'POST',
            headers: { ...c(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ decisions: e }),
          });
          return (r.ok || (await (0, o.zG)({ response: r })), await r.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function x(e) {
        if (!e) throw Error('jobId is required to fetch duplicate review status');
        try {
          let t = await l(''.concat(a.CT, '/api/v1/jobs/').concat(e, '/duplicate-review/status'), {
            method: 'GET',
            headers: c(),
          });
          return (t.ok || (await (0, o.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function D(e) {
        if (!e) throw Error('jobId is required to fetch duplicate review groups');
        try {
          let t = await l(''.concat(a.CT, '/api/v1/jobs/').concat(e, '/duplicate-review/groups'), {
            method: 'GET',
            headers: c(),
          });
          return (t.ok || (await (0, o.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function U(e) {
        try {
          var t;
          let r = new URLSearchParams();
          ((null == e ? void 0 : e.kind) && r.append('kind', e.kind),
            (null == e ? void 0 : e.limit) && r.append('limit', e.limit.toString()),
            (null == e ? void 0 : e.offset) && r.append('offset', e.offset.toString()),
            (null == e ? void 0 : e.search) && r.append('search', e.search));
          let n = ''.concat(a.CT, '/api/v1/nodes').concat(r.toString() ? '?'.concat(r) : ''),
            i = await u(n);
          i.ok || (await (0, o.zG)({ response: i }));
          let s = await i.json();
          return {
            nodes: s.nodes || [],
            total: s.total || (null === (t = s.nodes) || void 0 === t ? void 0 : t.length) || 0,
          };
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function M(e) {
        try {
          var t, r;
          let n = new URLSearchParams();
          ((null == e ? void 0 : e.kind) && n.append('kind', e.kind),
            (null == e ? void 0 : e.limit) && n.append('limit', e.limit.toString()),
            (null == e ? void 0 : e.offset) && n.append('offset', e.offset.toString()),
            (null == e ? void 0 : e.skip) !== void 0 && n.append('skip', e.skip.toString()),
            (null == e ? void 0 : e.cursor) && n.append('cursor', e.cursor),
            (null == e ? void 0 : e.sort) && n.append('sort', e.sort),
            (null == e ? void 0 : e.order) && n.append('order', e.order));
          let i = ''.concat(a.CT, '/api/v1/edges').concat(n.toString() ? '?'.concat(n) : ''),
            s = await u(i);
          s.ok || (await (0, o.zG)({ response: s }));
          let c = await s.json();
          return {
            edges: c.edges || [],
            total:
              c.total ||
              (null === (t = c.metadata) || void 0 === t ? void 0 : t.total) ||
              (null === (r = c.edges) || void 0 === r ? void 0 : r.length) ||
              0,
          };
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function B(e) {
        var t;
        let r = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {},
          n = await l(''.concat(a.CT, '/api/v1/nodes/').concat(e, '/sequester'), {
            method: 'POST',
            headers: { ...c(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ sequester: null === (t = r.sequester) || void 0 === t || t }),
          });
        return (n.ok || (await (0, o.zG)({ response: n })), n.json());
      }
      async function F() {
        try {
          let e = await l(''.concat(a.CT, '/api/v1/accounts'), { headers: c() });
          return (e.ok || (await (0, o.zG)({ response: e })), await e.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function J(e) {
        try {
          let t = await l(''.concat(a.CT, '/api/v1/accounts/').concat(e, '/stats'), {
            headers: c(),
          });
          return (t.ok || (await (0, o.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function q() {
        try {
          let e = await l(''.concat(a.CT, '/api/v1/analytics/overview'), { headers: c() });
          return (e.ok || (await (0, o.zG)({ response: e })), await e.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function X() {
        let e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : 'usage',
          t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : 10;
        try {
          let r = await u(
            ''
              .concat(a.CT, '/api/v1/analytics/top-accounts?metric=')
              .concat(e, '&limit=')
              .concat(t),
            {}
          );
          return (r.ok || (await (0, o.zG)({ response: r })), await r.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function V() {
        let e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : 50;
        try {
          let t = await u(
            ''.concat(a.CT, '/api/v1/analytics/recent-activity?limit=').concat(e),
            {}
          );
          return (t.ok || (await (0, o.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function H() {
        try {
          let e = await l(''.concat(a.CT, '/api/v1/analytics/alerts'), { headers: c() });
          return (e.ok || (await (0, o.zG)({ response: e })), await e.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function W(e) {
        try {
          let t = await l(''.concat(a.CT, '/api/v1/accounts/').concat(e, '/users'), {
            headers: c(),
          });
          return (t.ok || (await (0, o.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function Y(e) {
        try {
          let t = await l(''.concat(a.CT, '/api/v1/users/').concat(e), { headers: c() });
          return (t.ok || (await (0, o.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function K(e, t) {
        try {
          let r = await l(''.concat(a.CT, '/api/v1/accounts/').concat(e, '/users'), {
            method: 'POST',
            headers: { ...c(), 'Content-Type': 'application/json' },
            body: JSON.stringify(t),
          });
          return (r.ok || (await (0, o.zG)({ response: r })), await r.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function $(e, t) {
        try {
          let r = await l(''.concat(a.CT, '/api/v1/users/').concat(e), {
            method: 'PATCH',
            headers: { ...c(), 'Content-Type': 'application/json' },
            body: JSON.stringify(t),
          });
          return (r.ok || (await (0, o.zG)({ response: r })), await r.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function Q(e) {
        try {
          let t = await l(''.concat(a.CT, '/api/v1/users/').concat(e), {
            method: 'DELETE',
            headers: c(),
          });
          return (t.ok || (await (0, o.zG)({ response: t })), await t.json());
        } catch (e) {
          throw await (0, o.zG)(e);
        }
      }
      async function Z(e) {
        let t = await l(''.concat(a.CT, '/api/v1/settings?accountId=').concat(e), { headers: c() });
        return (t.ok || (await (0, o.zG)({ response: t })), t.json());
      }
      async function ee(e, t) {
        let r = await l(''.concat(a.CT, '/api/v1/ingest/url'), {
          method: 'POST',
          headers: { ...c(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: e, board_id: t }),
        });
        if (!r.ok) {
          let e = await r.json().catch(() => ({}));
          throw Error(e.error || e.message || 'Failed to ingest URL: '.concat(r.statusText));
        }
        return r.json();
      }
      async function et() {
        let e = await l(''.concat(a.CT, '/api/v1/system/reimport-status'), {
          method: 'GET',
          headers: c(),
        });
        if (!e.ok) throw await (0, o.zG)({ response: e });
        return e.json();
      }
      async function er() {
        let e = await l(''.concat(a.CT, '/api/v1/system/reimport-complete'), {
          method: 'POST',
          headers: { ...c(), 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (!e.ok) throw await (0, o.zG)({ response: e });
        return e.json();
      }
      let eo = {
        get: async (e, t) => {
          let r = await l(''.concat(a.CT).concat(e), {
            method: 'GET',
            headers: { ...c(), ...(null == t ? void 0 : t.headers) },
          });
          return (r.ok || (await (0, o.zG)({ response: r })), { data: await r.json() });
        },
        post: async (e, t, r) => {
          let n = t instanceof FormData,
            i = await l(''.concat(a.CT).concat(e), {
              method: 'POST',
              headers: {
                ...c(),
                ...(!n && { 'Content-Type': 'application/json' }),
                ...(null == r ? void 0 : r.headers),
              },
              body: n ? t : JSON.stringify(t),
            });
          return (i.ok || (await (0, o.zG)({ response: i })), { data: await i.json() });
        },
        patch: async (e, t, r) => {
          let n = await l(''.concat(a.CT).concat(e), {
            method: 'PATCH',
            headers: {
              ...c(),
              'Content-Type': 'application/json',
              ...(null == r ? void 0 : r.headers),
            },
            body: JSON.stringify(t),
          });
          return (n.ok || (await (0, o.zG)({ response: n })), { data: await n.json() });
        },
        delete: async (e, t) => {
          let r = await l(''.concat(a.CT).concat(e), {
            method: 'DELETE',
            headers: { ...c(), ...(null == t ? void 0 : t.headers) },
          });
          return (r.ok || (await (0, o.zG)({ response: r })), { data: await r.json() });
        },
      };
    },
    3291: function (e, t, r) {
      r.d(t, {
        Ar: function () {
          return d;
        },
        CT: function () {
          return c;
        },
        Ku: function () {
          return y;
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
          return g;
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
      var o = r(4859);
      function n(e) {
        let t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : '';
        return (void 0 !== o && o.env && o.env[e]) || t;
      }
      n('INTERNAL_API_URL');
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
          n('NEXT_PUBLIC_API_URL', 'http://127.0.0.1:4001');
      (console.log('[Config] API_BASE_URL resolved to:', c),
        n('NEXT_PUBLIC_ENABLE_PRO_FEATURES'),
        n('NEXT_PUBLIC_ENABLE_BUSINESS_FEATURES'));
      let l = '1' === n('NEXT_PUBLIC_ENABLE_LEGACY_IMPORTS'),
        u = '1' === n('NEXT_PUBLIC_ENABLE_HYBRID_LOCAL_FIRST'),
        d = 'false' !== n('NEXT_PUBLIC_ENABLE_3D_RENDERER', 'true');
      n('NEXT_PUBLIC_USE_DIRECT_SSE');
      let p = '1' === n('NEXT_PUBLIC_DEBUG_IMPORT_SELECTOR');
      i('dev');
      let h = 'true' === n('NEXT_PUBLIC_E2E_TESTING');
      (parseInt(n('NEXT_PUBLIC_JOB_POLL_INTERVAL_MS', '2000'), 10),
        parseInt(n('NEXT_PUBLIC_SSE_RECONNECT_TIMEOUT_MS', '5000'), 10),
        parseInt(n('NEXT_PUBLIC_MAX_JOB_WAIT_MS', '1500000'), 10));
      let f = n('NEXT_PUBLIC_SENTRY_DSN'),
        w = n('NEXT_PUBLIC_SENTRY_ENVIRONMENT', n('NODE_ENV', 'production')),
        m = parseFloat(n('NEXT_PUBLIC_SENTRY_SAMPLE_RATE', '1.0')),
        g = parseFloat(n('NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE', '0.1')),
        y = parseFloat(n('NEXT_PUBLIC_SENTRY_REPLAY_SESSION_SAMPLE_RATE', '0.1')),
        v = parseFloat(n('NEXT_PUBLIC_SENTRY_REPLAY_ERROR_SAMPLE_RATE', '1.0')),
        T = 'false' !== n('NEXT_PUBLIC_SENTRY_SCRUB_PII', 'true');
      (n('NEXT_PUBLIC_AUTH_DOMAIN'), n('NEXT_PUBLIC_AUTH_CLIENT_ID'), n('NODE_ENV', 'production'));
    },
    2844: function (e, t, r) {
      r.d(t, {
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
      var o = r(1482);
      class n extends Error {
        constructor(e, t, r = 500, o) {
          (super(e),
            (this.code = t),
            (this.statusCode = r),
            (this.details = o),
            (this.name = 'AppError'));
        }
      }
      class a extends n {
        constructor(e, t) {
          (super(e, 'VALIDATION_ERROR', 400, t), (this.name = 'ValidationError'));
        }
      }
      class i extends n {
        constructor(e, t) {
          (super(e, 'NETWORK_ERROR', 503, t), (this.name = 'NetworkError'));
        }
      }
      class s extends n {
        constructor(e, t) {
          (super(e, 'FILE_ERROR', 400, t), (this.name = 'FileError'));
        }
      }
      class c extends n {
        constructor(e, t) {
          (super(e, 'AUTH_ERROR', 401, t), (this.name = 'AuthError'));
        }
      }
      async function l(e) {
        let t;
        if ('TypeError' === e.name && e.message.includes('fetch'))
          throw (
            (t = new i('Unable to connect to server. Please check your connection.')),
            o.I.capture(
              t,
              { domain: 'api', operation: 'network.fetch', metadata: { originalError: e.message } },
              'error'
            ),
            t
          );
        if (e.response) {
          let r = e.response.status,
            l = await e.response.json().catch(() => ({})),
            u = l.error || {},
            d = u.message || l.message || 'An error occurred',
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
                return new n(d, 'NOT_FOUND', 404);
              case 413:
                return new s(d, { maxSize: '10MB' });
              case 500:
                return new n(d, 'SERVER_ERROR', 500);
              case 503:
                return new i(d);
              default:
                return new n(d, 'UNKNOWN_ERROR', e);
            }
          })(r);
          let f = r >= 500 ? 'error' : r >= 400 ? 'warn' : 'info';
          throw (
            o.I.capture(
              t,
              {
                domain: p,
                operation: h,
                metadata: { statusCode: r, backendError: u, url: e.response.url },
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
      function u(e, t) {
        o.I.info(e, { domain: t.domain || 'api', operation: t.operation, metadata: t.metadata });
      }
      function d(e, t, r) {
        o.I.info(e, { domain: 'import', operation: t, metadata: r });
      }
      function p(e, t, r) {
        o.I.info(e, { domain: 'jobs', operation: t, metadata: r });
      }
    },
    1103: function (e, t, r) {
      function o(e) {
        var t, r, o;
        let a = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : 24;
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
                            : ((r = e.principal_kind) &&
                                { human: 'User', agent: 'AI Assistant', contact: 'Contact' }[r]) ||
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
                                .replace(/^./, (e) => e.toUpperCase())).length <= a
          ? o
          : o.slice(0, a - 1) + '…';
      }
      function n(e) {
        return e.charAt(0).toUpperCase() + e.slice(1).toLowerCase();
      }
      r.d(t, {
        F: function () {
          return o;
        },
      });
    },
    1482: function (e, t, r) {
      r.d(t, {
        I: function () {
          return a;
        },
      });
      var o = r(8155);
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
          let r = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : 'error',
            n =
              'string' == typeof e
                ? 'error' === r || 'warn' === r
                  ? Error(e)
                  : { message: e, name: 'LogMessage' }
                : e,
            a = {
              id: this.generateId(),
              timestamp: Date.now(),
              domain: t.domain,
              operation: t.operation,
              message: n.message,
              stack: n.stack,
              severity: r,
              context: t,
              error: n,
              userMessage: this.getUserMessage(n, t),
            };
          return (
            this.errors.push(a),
            this.errors.length > this.maxErrors && this.errors.shift(),
            'error' === r && this.persistError(a),
            this.notifySubscribers(a),
            ('error' === r || 'warn' === r) &&
              o.O7(n, {
                tags: { domain: t.domain, operation: t.operation },
                extra: { ...t.metadata, severity: r },
                user: t.userId && t.accountId ? { id: t.userId, accountId: t.accountId } : void 0,
                level: 'error' === r ? 'error' : 'warning',
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
            r = [...this.errors];
          if (t) {
            if (t.domain) {
              let e = Array.isArray(t.domain) ? t.domain : [t.domain];
              r = r.filter((t) => e.includes(t.domain));
            }
            if (t.severity) {
              let e = Array.isArray(t.severity) ? t.severity : [t.severity];
              r = r.filter((t) => e.includes(t.severity));
            }
            if (t.search) {
              let e = t.search.toLowerCase();
              r = r.filter(
                (t) => t.message.toLowerCase().includes(e) || t.operation.toLowerCase().includes(e)
              );
            }
            (t.startTime && (r = r.filter((e) => e.timestamp >= t.startTime)),
              t.endTime && (r = r.filter((e) => e.timestamp <= t.endTime)));
          }
          return r.sort((e, t) => t.timestamp - e.timestamp).slice(0, e);
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
              r = localStorage.getItem(t),
              o = r ? JSON.parse(r) : [];
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
      let a = new n();
      ((window.errorCapture = a),
        console.log('%c[system] errorCapture.init', 'color: #3b82f6; font-weight: normal'),
        console.log({ message: 'ErrorCaptureService initialized', name: 'LogMessage' }),
        console.groupEnd());
    },
    8155: function (e, t, r) {
      r.d(t, {
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
      var o = r(89),
        n = r(1052),
        a = r(8885),
        i = r(3953),
        s = r(3291);
      function c() {
        return !!s.oj;
      }
      function l() {
        return 'true' === localStorage.getItem('sentry_consent');
      }
      function u(e) {
        (localStorage.setItem('sentry_consent', e ? 'true' : 'false'), !e && c() && o.xv());
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
          n.S({
            dsn: s.oj,
            environment: s.X8,
            sampleRate: s.M6,
            tracesSampleRate: s.Qn,
            integrations: [a.G({ maskAllText: !0, blockAllMedia: !0, maskAllInputs: !0 })],
            replaysSessionSampleRate: s.Ku,
            replaysOnErrorSampleRate: s.zC,
            beforeSend(e, t) {
              if (s.LS) {
                var r;
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
                  (null === (r = e.user) || void 0 === r ? void 0 : r.email) && delete e.user.email,
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
          i.$e((r) => {
            ((null == t ? void 0 : t.tags) &&
              Object.entries(t.tags).forEach((e) => {
                let [t, o] = e;
                r.setTag(t, o);
              }),
              (null == t ? void 0 : t.extra) &&
                Object.entries(t.extra).forEach((e) => {
                  let [t, o] = e;
                  r.setExtra(t, o);
                }),
              (null == t ? void 0 : t.user) &&
                r.setUser({ id: t.user.id, accountId: t.user.accountId, rank: t.user.rank }),
              (null == t ? void 0 : t.level) && r.setLevel(t.level),
              o.Tb(e));
          });
      }
    },
    4374: function (e, t, r) {
      r.d(t, {
        O: function () {
          return p;
        },
      });
      var o = r(7582),
        n = r(4452),
        a = r(1493),
        i = r(1103);
      let s = [300, 900, 2100],
        c = new Set([
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
      function l(e) {
        var t, r;
        let o = e.properties || {},
          n = 'object' == typeof o.contact_info && o.contact_info ? o.contact_info : void 0,
          a =
            'string' == typeof (null == n ? void 0 : n.source_platform)
              ? n.source_platform
              : 'string' == typeof o.platform
                ? o.platform
                : void 0,
          s = (0, i.F)({ id: e.id, kind: e.kind, ...o, platform: a });
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
            content: null === (r = e.properties) || void 0 === r ? void 0 : r.content,
            metadata: e.properties,
          },
        };
      }
      function u(e) {
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
      let d = {
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
          graphLoadMetrics: null,
        },
        p = (0, o.Ue)()(
          (0, n.mW)(
            (e, t) => ({
              ...d,
              setNodes: (t) => e({ nodes: t }),
              setEdges: (t) => e({ edges: t }),
              loadGraphData: async () => {
                e({ isLoading: !0, error: null });
                try {
                  let t = null,
                    r = null;
                  for (let e = 0; e <= s.length; e += 1)
                    try {
                      [t, r] = await Promise.all([
                        (0, a.v$)({ limit: 1e5 }),
                        (0, a.W8)({ limit: 2e5, sort: 'created_at', order: 'desc' }),
                      ]);
                      break;
                    } catch (t) {
                      if (
                        !(
                          e < s.length &&
                          (function (e) {
                            let t = null == e ? void 0 : e.statusCode,
                              r = ((null == e ? void 0 : e.message) || '').toLowerCase();
                            return (
                              (null == e ? void 0 : e.code) === 'NETWORK_ERROR' ||
                              429 === t ||
                              ('number' == typeof t && t >= 500) ||
                              r.includes('timeout') ||
                              r.includes('network') ||
                              r.includes('fetch')
                            );
                          })(t)
                        )
                      )
                        throw t;
                      await (function (e) {
                        return new Promise((t) => setTimeout(t, e));
                      })(s[e]);
                    }
                  if (!t || !r) throw Error('Failed to load graph data after retries');
                  let o = t.nodes.map(l),
                    n = o,
                    i = o.length > 5e3;
                  i &&
                    ((n = o.filter((e) => c.has(e.kind || e.type))),
                    console.info(
                      '[Keimenon] Smart filter: '
                        .concat(o.length, ' nodes → ')
                        .concat(n.length, ' structural nodes')
                    ));
                  let d = new Set(n.map((e) => e.id)),
                    p = r.edges.map(u).filter((e) => d.has(e.source) && d.has(e.target));
                  e({
                    nodes: n,
                    edges: p,
                    isLoading: !1,
                    error: null,
                    graphLoadMetrics: {
                      apiNodeCount: o.length,
                      apiEdgeCount: r.edges.length,
                      structuralNodeCount: n.length,
                      renderedEdgeCount: p.length,
                      smartFilterApplied: i,
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
                let r = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : [];
                return e((e) => {
                  let o = new Map(e.nodes.map((e) => [e.id, e]));
                  for (let e of t) {
                    let t = l(e),
                      r = o.get(t.id);
                    r ? o.set(t.id, { ...r, ...t, position: r.position }) : o.set(t.id, t);
                  }
                  let n = Array.from(o.values()),
                    a = new Set(n.map((e) => e.id)),
                    i = new Map(e.edges.map((e) => [e.id, e]));
                  for (let e of r) {
                    let t = u(e);
                    a.has(t.source) && a.has(t.target) && i.set(t.id, t);
                  }
                  return { nodes: n, edges: Array.from(i.values()) };
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
              updateNode: (t, r) =>
                e((e) => ({ nodes: e.nodes.map((e) => (e.id === t ? { ...e, ...r } : e)) })),
              deleteNode: (t) =>
                e((e) => ({
                  nodes: e.nodes.filter((e) => e.id !== t),
                  edges: e.edges.filter((e) => e.source !== t && e.target !== t),
                  selectedNodeIds: new Set(Array.from(e.selectedNodeIds).filter((e) => e !== t)),
                })),
              deleteEdge: (t) => e((e) => ({ edges: e.edges.filter((e) => e.id !== t) })),
              setSelectedNode: (t) => e({ selectedNode: t }),
              selectNode: function (t) {
                let r = arguments.length > 1 && void 0 !== arguments[1] && arguments[1];
                return e((e) => {
                  let o = new Set(r ? e.selectedNodeIds : []);
                  return (
                    o.add(t),
                    {
                      selectedNodeIds: o,
                      selectedNode: r ? e.selectedNode : e.nodes.find((e) => e.id === t) || null,
                    }
                  );
                });
              },
              deselectNode: (t) =>
                e((e) => {
                  var r;
                  let o = new Set(e.selectedNodeIds);
                  return (
                    o.delete(t),
                    {
                      selectedNodeIds: o,
                      selectedNode:
                        (null === (r = e.selectedNode) || void 0 === r ? void 0 : r.id) === t
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
                let { nodes: r } = t();
                if (0 === r.length) return;
                let o = Math.min(...r.map((e) => e.position.x)) - 50,
                  n = Math.min(...r.map((e) => e.position.y)) - 50,
                  a = Math.max(...r.map((e) => e.position.x)) + 50,
                  i = Math.max(...r.map((e) => e.position.y)) + 50,
                  s = a - o,
                  c = i - n,
                  l = window.innerWidth,
                  u = window.innerHeight,
                  d = Math.min(l / s, u / c, 1);
                e({
                  viewport: { x: -o * d + (l - s * d) / 2, y: -n * d + (u - c * d) / 2, zoom: d },
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
                let { nodes: r, edges: o } = t(),
                  n = new Set(
                    o
                      .filter((t) => t.source === e || t.target === e)
                      .flatMap((e) => [e.source, e.target])
                  );
                return (n.delete(e), r.filter((e) => n.has(e.id)));
              },
              setCurrentAccountId: (t) => e({ currentAccountId: t }),
              reset: () => e(d),
            }),
            { name: 'KeimenonStore' }
          )
        );
    },
  },
]);
