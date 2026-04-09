(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [626],
  {
    3106: function (e, t, s) {
      Promise.resolve().then(s.bind(s, 9430));
    },
    9430: function (e, t, s) {
      'use strict';
      (s.r(t),
        s.d(t, {
          default: function () {
            return k;
          },
        }));
      var a = s(7573),
        l = s(7653),
        r = s(1695),
        n = s(8146),
        c = s(6085),
        i = s(5555),
        o = s(609),
        d = s(3029),
        u = s(4175);
      let m = { admin: '\uD83D\uDEE1️', client: '\uD83D\uDCBC' },
        x = {
          free: { label: 'Free', color: 'bg-gray-100 text-gray-800' },
          professional: { label: 'Pro', color: 'bg-blue-100 text-blue-800' },
          business: { label: 'Business', color: 'bg-purple-100 text-purple-800' },
        },
        h = { junior: 'Junior', senior: 'Senior', leader: 'Team Leader', admin: 'Administrator' };
      function p(e) {
        let { accounts: t, tempToken: s, onSelect: r, onCancel: n } = e,
          [c, i] = (0, l.useState)(null),
          [o, d] = (0, l.useState)(''),
          [u, p] = (0, l.useState)(!1),
          [b, f] = (0, l.useState)(!1),
          [y, g] = (0, l.useState)(null),
          j = [...t].sort((e, t) =>
            e.last_accessed && t.last_accessed
              ? t.last_accessed - e.last_accessed
              : e.last_accessed
                ? -1
                : t.last_accessed
                  ? 1
                  : e.accountName.localeCompare(t.accountName)
          ),
          v = (e) => {
            (i(e.accountId), g(null), p(!1));
          },
          w = async () => {
            if (!c) {
              g('Please select an account');
              return;
            }
            (f(!0), g(null));
            try {
              await r(c, u ? o : void 0);
            } catch (e) {
              (g(e.message || 'Failed to select account'), f(!1));
            }
          };
        return (0, a.jsx)('div', {
          className: 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50',
          children: (0, a.jsxs)('div', {
            className:
              'bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col',
            children: [
              (0, a.jsxs)('div', {
                className: 'px-6 py-4 border-b border-gray-200',
                children: [
                  (0, a.jsx)('h2', {
                    className: 'text-2xl font-semibold text-gray-900',
                    children: 'Select Account',
                  }),
                  (0, a.jsx)('p', {
                    className: 'text-sm text-gray-600 mt-1',
                    children: "Choose which account you'd like to use",
                  }),
                ],
              }),
              (0, a.jsxs)('div', {
                className: 'flex-1 overflow-y-auto px-6 py-4',
                children: [
                  (0, a.jsx)('div', {
                    className: 'space-y-3',
                    children: j.map((e) => {
                      let t = c === e.accountId,
                        s = e.accountClass || 'free',
                        l = e.accountType || 'client',
                        r = e.status || 'active',
                        n = e.permission_level || 'junior',
                        i = x[s] || x.free,
                        o = m[l] || m.client,
                        d = h[n] || 'Member';
                      return (0, a.jsx)(
                        'button',
                        {
                          onClick: () => v(e),
                          className:
                            'w-full text-left p-4 rounded-lg border-2 transition-all '.concat(
                              t
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                            ),
                          children: (0, a.jsxs)('div', {
                            className: 'flex items-start justify-between',
                            children: [
                              (0, a.jsxs)('div', {
                                className: 'flex items-start space-x-3',
                                children: [
                                  (0, a.jsx)('div', { className: 'text-3xl mt-1', children: o }),
                                  (0, a.jsxs)('div', {
                                    className: 'flex-1',
                                    children: [
                                      (0, a.jsxs)('div', {
                                        className: 'flex items-center space-x-2',
                                        children: [
                                          (0, a.jsx)('h3', {
                                            className: 'font-semibold text-gray-900',
                                            children: e.accountName || 'Unnamed Account',
                                          }),
                                          (0, a.jsx)('span', {
                                            className:
                                              'px-2 py-0.5 text-xs font-medium rounded '.concat(
                                                i.color
                                              ),
                                            children: i.label,
                                          }),
                                        ],
                                      }),
                                      (0, a.jsxs)('p', {
                                        className: 'text-sm text-gray-600 mt-1',
                                        children: [
                                          d,
                                          e.last_accessed &&
                                            (0, a.jsxs)('span', {
                                              className: 'text-gray-400 ml-2',
                                              children: [
                                                '• Last used ',
                                                new Date(e.last_accessed).toLocaleDateString(),
                                              ],
                                            }),
                                        ],
                                      }),
                                      'active' !== r &&
                                        (0, a.jsx)('span', {
                                          className:
                                            'inline-block mt-2 px-2 py-0.5 text-xs font-medium rounded bg-yellow-100 text-yellow-800',
                                          children: r.toUpperCase(),
                                        }),
                                    ],
                                  }),
                                ],
                              }),
                              t &&
                                (0, a.jsx)('div', {
                                  className: 'text-blue-500',
                                  children: (0, a.jsx)('svg', {
                                    className: 'w-6 h-6',
                                    fill: 'currentColor',
                                    viewBox: '0 0 20 20',
                                    children: (0, a.jsx)('path', {
                                      fillRule: 'evenodd',
                                      d: 'M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z',
                                      clipRule: 'evenodd',
                                    }),
                                  }),
                                }),
                            ],
                          }),
                        },
                        e.accountId
                      );
                    }),
                  }),
                  u &&
                    (0, a.jsxs)('div', {
                      className: 'mt-4',
                      children: [
                        (0, a.jsx)('label', {
                          htmlFor: 'account-password',
                          className: 'block text-sm font-medium text-gray-700 mb-2',
                          children: 'Account Password',
                        }),
                        (0, a.jsx)('input', {
                          id: 'account-password',
                          type: 'password',
                          value: o,
                          onChange: (e) => d(e.target.value),
                          onKeyPress: (e) => {
                            'Enter' === e.key && c && w();
                          },
                          placeholder: 'Enter account password',
                          className:
                            'w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent',
                        }),
                      ],
                    }),
                  y &&
                    (0, a.jsx)('div', {
                      className: 'mt-4 p-3 bg-red-50 border border-red-200 rounded-lg',
                      children: (0, a.jsx)('p', { className: 'text-sm text-red-800', children: y }),
                    }),
                ],
              }),
              (0, a.jsxs)('div', {
                className: 'px-6 py-4 border-t border-gray-200 flex justify-between',
                children: [
                  n &&
                    (0, a.jsx)('button', {
                      onClick: n,
                      disabled: b,
                      className: 'px-4 py-2 text-gray-700 hover:text-gray-900 disabled:opacity-50',
                      children: 'Cancel',
                    }),
                  (0, a.jsx)('div', { className: 'flex-1' }),
                  (0, a.jsx)('button', {
                    onClick: w,
                    disabled: !c || b,
                    className:
                      'px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
                    children: b ? 'Loading...' : 'Continue',
                  }),
                ],
              }),
            ],
          }),
        });
      }
      var b = s(3291);
      async function f(e) {
        let t = await fetch(e, { method: 'GET', cache: 'no-store' }),
          s = null;
        try {
          s = await t.json();
        } catch (e) {
          s = null;
        }
        return { response: t, payload: s };
      }
      var y = s(9901);
      let g = (0, s(2389).Z)('ServerCrash', [
        [
          'path',
          {
            d: 'M6 10H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2',
            key: '4b9dqc',
          },
        ],
        [
          'path',
          {
            d: 'M6 14H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-2',
            key: '22nnkd',
          },
        ],
        ['path', { d: 'M6 6h.01', key: '1utrut' }],
        ['path', { d: 'M6 18h.01', key: 'uhywen' }],
        ['path', { d: 'm13 6-4 6h6l-4 6', key: '14hqih' }],
      ]);
      var j = s(5721),
        v = s(8623);
      function w(e) {
        let { state: t, onRetry: s } = e,
          l = Object.entries(t.checks)
            .filter((e) => {
              let [, t] = e;
              return !t;
            })
            .map((e) => {
              let [t] = e;
              return t;
            });
        return (0, a.jsx)('div', {
          className:
            'min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950',
          children: (0, a.jsxs)('div', {
            className:
              'w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900/70 p-8 shadow-2xl',
            children: [
              (0, a.jsxs)('div', {
                className: 'flex items-center justify-between',
                children: [
                  (0, a.jsxs)('div', {
                    children: [
                      (0, a.jsx)('p', {
                        className: 'text-xs uppercase tracking-widest text-slate-400',
                        children: 'Keimenon Startup',
                      }),
                      (0, a.jsx)('h1', {
                        className: 'mt-2 text-2xl font-semibold text-white',
                        children: 'Preparing backend services',
                      }),
                    ],
                  }),
                  'ready' === t.phase
                    ? (0, a.jsx)(y.Z, { className: 'h-8 w-8 text-emerald-400' })
                    : 'error' === t.phase
                      ? (0, a.jsx)(g, { className: 'h-8 w-8 text-red-400' })
                      : (0, a.jsx)(j.Z, { className: 'h-8 w-8 animate-spin text-blue-400' }),
                ],
              }),
              (0, a.jsxs)('div', {
                className:
                  'mt-6 grid gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300',
                children: [
                  (0, a.jsxs)('div', {
                    className: 'flex items-center justify-between',
                    children: [
                      (0, a.jsx)('span', { children: 'Readiness endpoint' }),
                      (0, a.jsx)('code', {
                        className: 'rounded bg-slate-800 px-2 py-1 text-xs',
                        children: t.endpoint,
                      }),
                    ],
                  }),
                  (0, a.jsxs)('div', {
                    className: 'flex items-center justify-between',
                    children: [
                      (0, a.jsx)('span', { children: 'Elapsed' }),
                      (0, a.jsx)('span', {
                        className: 'font-medium text-white',
                        children: (function (e) {
                          let t = Math.max(0, Math.floor(e / 1e3)),
                            s = Math.floor(t / 60),
                            a = t % 60;
                          return 0 === s ? ''.concat(a, 's') : ''.concat(s, 'm ').concat(a, 's');
                        })(t.elapsedMs),
                      }),
                    ],
                  }),
                  (0, a.jsxs)('div', {
                    className: 'flex items-center justify-between',
                    children: [
                      (0, a.jsx)('span', { children: 'Checks performed' }),
                      (0, a.jsx)('span', {
                        className: 'font-medium text-white',
                        children: t.attempts,
                      }),
                    ],
                  }),
                ],
              }),
              l.length > 0 &&
                (0, a.jsxs)('div', {
                  className: 'mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4',
                  children: [
                    (0, a.jsx)('p', {
                      className: 'text-sm font-medium text-amber-300',
                      children: 'Waiting on readiness checks',
                    }),
                    (0, a.jsx)('p', {
                      className: 'mt-2 text-sm text-amber-100',
                      children: l.join(', '),
                    }),
                  ],
                }),
              t.issues.length > 0 &&
                (0, a.jsxs)('div', {
                  className: 'mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4',
                  children: [
                    (0, a.jsx)('p', {
                      className: 'text-sm font-medium text-red-300',
                      children: 'Backend issues',
                    }),
                    (0, a.jsx)('ul', {
                      className: 'mt-2 list-disc space-y-1 pl-5 text-sm text-red-100',
                      children: t.issues
                        .slice(0, 5)
                        .map((e) => (0, a.jsx)('li', { children: e }, e)),
                    }),
                  ],
                }),
              t.lastError &&
                (0, a.jsxs)('div', {
                  className:
                    'mt-4 rounded-xl border border-red-600/30 bg-red-600/10 p-4 text-sm text-red-100',
                  children: [
                    (0, a.jsx)('p', {
                      className: 'font-medium text-red-300',
                      children: 'Connection error',
                    }),
                    (0, a.jsx)('p', { className: 'mt-1', children: t.lastError }),
                  ],
                }),
              (0, a.jsxs)('div', {
                className: 'mt-6 flex items-center justify-between',
                children: [
                  (0, a.jsx)('p', {
                    className: 'text-sm text-slate-400',
                    children: 'Login will open automatically once backend services are healthy.',
                  }),
                  (0, a.jsxs)('button', {
                    type: 'button',
                    onClick: s,
                    className:
                      'inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700',
                    children: [(0, a.jsx)(v.Z, { className: 'h-4 w-4' }), 'Retry now'],
                  }),
                ],
              }),
            ],
          }),
        });
      }
      function N() {
        let e = (0, r.useRouter)(),
          t = (0, r.useSearchParams)(),
          { login: s, selectAccount: m, isAuthenticated: x, isLoading: h } = (0, u.aC)(),
          [y, g] = (0, l.useState)(!1),
          [j, v] = (0, l.useState)(!1),
          [N, k] = (0, l.useState)(null),
          [C, S] = (0, l.useState)(''),
          [E, Z] = (0, l.useState)(''),
          [M, P] = (0, l.useState)(!1),
          [D, L] = (0, l.useState)([]),
          [A, _] = (0, l.useState)(null),
          R = (0, l.useMemo)(() => {
            let e = new URLSearchParams(),
              s = t.get('apiPort'),
              a = t.get('dev');
            return (s && e.set('apiPort', s), a && e.set('dev', a), e.toString());
          }, [t]),
          T = (function () {
            let e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : {},
              { enabled: t = !0, pollMs: s = 2e3 } = e,
              a = ''.concat(b.CT, '/ready'),
              r = ''.concat(b.CT, '/health/modules'),
              n = (0, l.useRef)(!0),
              c = (0, l.useRef)(Date.now()),
              i = (0, l.useRef)(0),
              [o, d] = (0, l.useState)({
                phase: t ? 'checking' : 'ready',
                endpoint: a,
                attempts: 0,
                elapsedMs: 0,
                checks: {},
                issues: [],
                lastError: null,
              }),
              u = (0, l.useCallback)((e) => {
                n.current && d((t) => ({ ...t, ...e }));
              }, []),
              m = (0, l.useCallback)(async () => {
                let e = i.current + 1;
                i.current = e;
                let t = Date.now() - c.current;
                try {
                  let s = await f(a),
                    l = s.payload || {},
                    n = l.checks || {},
                    c = s.response.ok && !0 === l.ready,
                    i = [];
                  (c ||
                    (i = (((await f(r)).payload || {}).issues || [])
                      .map((e) => {
                        let t = e.module || 'unknown',
                          s = e.issue || 'unknown issue';
                        return ''.concat(t, ': ').concat(s);
                      })
                      .filter(Boolean)),
                    u({
                      phase: c ? 'ready' : 'checking',
                      endpoint: a,
                      attempts: e,
                      elapsedMs: t,
                      checks: n,
                      issues: i,
                      lastError: null,
                    }));
                } catch (s) {
                  u({
                    phase: 'error',
                    endpoint: a,
                    attempts: e,
                    elapsedMs: t,
                    checks: {},
                    issues: [],
                    lastError:
                      (null == s ? void 0 : s.message) ||
                      'Unable to reach backend readiness endpoint',
                  });
                }
              }, [a, r, u]);
            ((0, l.useEffect)(
              () => (
                (n.current = !0),
                (c.current = Date.now()),
                () => {
                  n.current = !1;
                }
              ),
              []
            ),
              (0, l.useEffect)(() => {
                if (!t) {
                  ((i.current = 0),
                    u({
                      phase: 'ready',
                      endpoint: a,
                      attempts: 0,
                      elapsedMs: 0,
                      checks: {},
                      issues: [],
                      lastError: null,
                    }));
                  return;
                }
                let e = async () => {
                  await m();
                };
                ((i.current = 0), e());
                let l = window.setInterval(e, s);
                return () => {
                  window.clearInterval(l);
                };
              }, [t, a, s, m, u]));
            let x = (0, l.useCallback)(async () => {
              await m();
            }, [m]);
            return (0, l.useMemo)(() => ({ ...o, retry: x }), [x, o]);
          })({ enabled: !h && !x && !j });
        (0, l.useEffect)(() => {
          h || x || !(T.attempts > 0) || 'ready' !== T.phase || v(!0);
        }, [h, x, T.attempts, T.phase]);
        let F = 'expired' === t.get('reason');
        (0, l.useEffect)(() => {
          x && e.push(R ? '/keimenon?'.concat(R) : '/keimenon');
        }, [x, e, R]);
        let q = async (e) => {
            (e.preventDefault(), g(!0), k(null));
            try {
              let e = await s(C, E);
              if (e && e.requiresAccountSelection && e.availableAccounts && e.tempToken) {
                (L(e.availableAccounts), _(e.tempToken), P(!0), g(!1));
                return;
              }
            } catch (e) {
              (console.error('Login failed:', e),
                'Account is locked' === e.message
                  ? k('Account is locked due to too many failed attempts. Please try again later.')
                  : k(e.message || 'Login failed. Please check your credentials.'),
                g(!1));
            }
          },
          I = async (e, t) => {
            if (A) {
              (g(!0), k(null));
              try {
                await m(A, e, t);
              } catch (e) {
                (console.error('Account selection failed:', e),
                  k(e.message || 'Failed to select account'),
                  g(!1));
              }
            }
          };
        return h || x || j || 'ready' === T.phase
          ? (0, a.jsxs)('div', {
              className:
                'min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900',
              children: [
                (0, a.jsxs)('div', {
                  className: 'w-full max-w-md space-y-8 p-8',
                  children: [
                    (0, a.jsxs)('div', {
                      className: 'text-center',
                      children: [
                        (0, a.jsx)('div', {
                          className:
                            'inline-flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-purple-600',
                          children: (0, a.jsx)(c.Z, { className: 'w-8 h-8 text-white' }),
                        }),
                        (0, a.jsx)('h1', {
                          className: 'text-4xl font-bold text-white mb-2',
                          children: 'Keimenon',
                        }),
                        (0, a.jsx)('p', {
                          className: 'text-slate-400',
                          children: 'Sign in to your workspace',
                        }),
                      ],
                    }),
                    (0, a.jsxs)('form', {
                      onSubmit: q,
                      className: 'mt-8 space-y-6',
                      children: [
                        F &&
                          (0, a.jsxs)('div', {
                            className:
                              'bg-yellow-900/20 border border-yellow-500/50 rounded-lg p-4 flex items-start gap-3',
                            children: [
                              (0, a.jsx)(i.Z, {
                                className: 'w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5',
                              }),
                              (0, a.jsxs)('div', {
                                children: [
                                  (0, a.jsx)('p', {
                                    className: 'text-sm font-medium text-yellow-300',
                                    children: 'Session Expired',
                                  }),
                                  (0, a.jsx)('p', {
                                    className: 'text-sm text-yellow-400 mt-1',
                                    children:
                                      'Your session has expired. Please log in again to continue.',
                                  }),
                                ],
                              }),
                            ],
                          }),
                        N &&
                          (0, a.jsxs)('div', {
                            className:
                              'bg-red-900/20 border border-red-500/50 rounded-lg p-4 flex items-start gap-3',
                            children: [
                              (0, a.jsx)(o.Z, {
                                className: 'w-5 h-5 text-red-400 flex-shrink-0 mt-0.5',
                              }),
                              (0, a.jsxs)('div', {
                                children: [
                                  (0, a.jsx)('p', {
                                    className: 'text-sm font-medium text-red-300',
                                    children: 'Login Failed',
                                  }),
                                  (0, a.jsx)('p', {
                                    className: 'text-sm text-red-400 mt-1',
                                    children: N,
                                  }),
                                ],
                              }),
                            ],
                          }),
                        (0, a.jsxs)('div', {
                          className:
                            'bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 space-y-4',
                          children: [
                            (0, a.jsxs)('div', {
                              children: [
                                (0, a.jsx)('label', {
                                  htmlFor: 'email',
                                  className: 'block text-sm font-medium text-slate-300 mb-2',
                                  children: 'Email',
                                }),
                                (0, a.jsx)('input', {
                                  id: 'email',
                                  name: 'email',
                                  type: 'email',
                                  autoComplete: 'email',
                                  required: !0,
                                  value: C,
                                  onChange: (e) => S(e.target.value),
                                  disabled: y,
                                  className:
                                    'w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed',
                                  placeholder: 'name@example.com',
                                }),
                              ],
                            }),
                            (0, a.jsxs)('div', {
                              children: [
                                (0, a.jsx)('label', {
                                  htmlFor: 'password',
                                  className: 'block text-sm font-medium text-slate-300 mb-2',
                                  children: 'Password',
                                }),
                                (0, a.jsx)('input', {
                                  id: 'password',
                                  name: 'password',
                                  type: 'password',
                                  autoComplete: 'current-password',
                                  required: !0,
                                  value: E,
                                  onChange: (e) => Z(e.target.value),
                                  disabled: y,
                                  className:
                                    'w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed',
                                  placeholder: 'Enter your password',
                                }),
                              ],
                            }),
                          ],
                        }),
                        (0, a.jsx)('div', {
                          className: 'flex items-center justify-end',
                          children: (0, a.jsx)(n.default, {
                            href: '/forgot-password',
                            className:
                              'text-sm text-purple-300 hover:text-purple-200 transition-colors',
                            children: 'Forgot password?',
                          }),
                        }),
                        (0, a.jsx)('button', {
                          type: 'submit',
                          disabled: y,
                          className:
                            'w-full flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-all shadow-lg shadow-purple-500/30',
                          children: y
                            ? 'Signing in...'
                            : (0, a.jsxs)(a.Fragment, {
                                children: ['Sign In', (0, a.jsx)(d.Z, { className: 'w-5 h-5' })],
                              }),
                        }),
                        'true' === t.get('dev') &&
                          (0, a.jsxs)('div', {
                            className: 'pt-6 border-t border-slate-700 space-y-3',
                            children: [
                              (0, a.jsx)('p', {
                                className:
                                  'text-xs font-semibold text-slate-500 uppercase tracking-widest text-center',
                                children: 'Dev Controls',
                              }),
                              (0, a.jsxs)('div', {
                                className: 'grid grid-cols-2 gap-3',
                                children: [
                                  (0, a.jsx)('button', {
                                    type: 'button',
                                    onClick: async () => {
                                      try {
                                        let e = t.get('apiPort') || '4001',
                                          s = await fetch(
                                            'http://127.0.0.1:'.concat(e, '/api/v1/auth/dev/login'),
                                            {
                                              method: 'POST',
                                              headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({ email: 'dev@keimenon.local' }),
                                            }
                                          );
                                        (await s.json()).token &&
                                          (S('dev@keimenon.local'), Z('DevPass123!'));
                                      } catch (e) {
                                        console.error(e);
                                      }
                                      (S('dev@keimenon.local'), Z('DevPass123!'));
                                    },
                                    className:
                                      'flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition-colors border border-slate-600',
                                    children: 'Auto-fill Dev',
                                  }),
                                  (0, a.jsx)('button', {
                                    type: 'button',
                                    onClick: () => {
                                      window.electronAPI
                                        ? window.electronAPI.invoke('app:open-data-folder')
                                        : alert('Not in Electron environment');
                                    },
                                    className:
                                      'flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition-colors border border-slate-600',
                                    children: 'Open Data',
                                  }),
                                ],
                              }),
                            ],
                          }),
                      ],
                    }),
                    (0, a.jsx)('div', {
                      className: 'text-center text-sm text-slate-400',
                      children: (0, a.jsxs)('p', {
                        children: [
                          "Don't have an account?",
                          ' ',
                          (0, a.jsx)(n.default, {
                            href: '/register',
                            className:
                              'text-purple-400 hover:text-purple-300 font-medium transition-colors',
                            children: 'Create one here',
                          }),
                        ],
                      }),
                    }),
                  ],
                }),
                M &&
                  A &&
                  (0, a.jsx)(p, {
                    accounts: D,
                    tempToken: A,
                    onSelect: I,
                    onCancel: () => {
                      (P(!1), _(null), L([]));
                    },
                  }),
              ],
            })
          : (0, a.jsx)(w, { state: T, onRetry: T.retry });
      }
      function k() {
        return (0, a.jsx)(l.Suspense, {
          fallback: (0, a.jsx)('div', {
            className:
              'min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900',
            children: (0, a.jsx)('div', { className: 'text-white', children: 'Loading...' }),
          }),
          children: (0, a.jsx)(N, {}),
        });
      }
    },
    3029: function (e, t, s) {
      'use strict';
      s.d(t, {
        Z: function () {
          return a;
        },
      });
      let a = (0, s(2389).Z)('ArrowRight', [
        ['path', { d: 'M5 12h14', key: '1ays0h' }],
        ['path', { d: 'm12 5 7 7-7 7', key: 'xquz4c' }],
      ]);
    },
    609: function (e, t, s) {
      'use strict';
      s.d(t, {
        Z: function () {
          return a;
        },
      });
      let a = (0, s(2389).Z)('CircleAlert', [
        ['circle', { cx: '12', cy: '12', r: '10', key: '1mglay' }],
        ['line', { x1: '12', x2: '12', y1: '8', y2: '12', key: '1pkeuh' }],
        ['line', { x1: '12', x2: '12.01', y1: '16', y2: '16', key: '4dfq90' }],
      ]);
    },
    9901: function (e, t, s) {
      'use strict';
      s.d(t, {
        Z: function () {
          return a;
        },
      });
      let a = (0, s(2389).Z)('CircleCheck', [
        ['circle', { cx: '12', cy: '12', r: '10', key: '1mglay' }],
        ['path', { d: 'm9 12 2 2 4-4', key: 'dzmm74' }],
      ]);
    },
    5555: function (e, t, s) {
      'use strict';
      s.d(t, {
        Z: function () {
          return a;
        },
      });
      let a = (0, s(2389).Z)('Clock', [
        ['circle', { cx: '12', cy: '12', r: '10', key: '1mglay' }],
        ['polyline', { points: '12 6 12 12 16 14', key: '68esgv' }],
      ]);
    },
    5721: function (e, t, s) {
      'use strict';
      s.d(t, {
        Z: function () {
          return a;
        },
      });
      let a = (0, s(2389).Z)('LoaderCircle', [
        ['path', { d: 'M21 12a9 9 0 1 1-6.219-8.56', key: '13zald' }],
      ]);
    },
    6085: function (e, t, s) {
      'use strict';
      s.d(t, {
        Z: function () {
          return a;
        },
      });
      let a = (0, s(2389).Z)('Lock', [
        ['rect', { width: '18', height: '11', x: '3', y: '11', rx: '2', ry: '2', key: '1w4ew1' }],
        ['path', { d: 'M7 11V7a5 5 0 0 1 10 0v4', key: 'fwvmzm' }],
      ]);
    },
    8623: function (e, t, s) {
      'use strict';
      s.d(t, {
        Z: function () {
          return a;
        },
      });
      let a = (0, s(2389).Z)('RefreshCw', [
        ['path', { d: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', key: 'v9h5vc' }],
        ['path', { d: 'M21 3v5h-5', key: '1q7to0' }],
        ['path', { d: 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', key: '3uifl3' }],
        ['path', { d: 'M8 16H3v5', key: '1cv678' }],
      ]);
    },
  },
  function (e) {
    (e.O(0, [898, 642, 711, 630, 293, 528, 744], function () {
      return e((e.s = 3106));
    }),
      (_N_E = e.O()));
  },
]);
