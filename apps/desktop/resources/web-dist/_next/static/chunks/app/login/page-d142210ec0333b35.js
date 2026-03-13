(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [626],
  {
    3106: function (e, t, s) {
      Promise.resolve().then(s.bind(s, 180));
    },
    180: function (e, t, s) {
      'use strict';
      (s.r(t),
        s.d(t, {
          default: function () {
            return f;
          },
        }));
      var l = s(7573),
        a = s(7653),
        r = s(1695),
        n = s(8146),
        c = s(6085),
        o = s(5555),
        i = s(609),
        d = s(3029),
        u = s(7070);
      let x = { admin: '\uD83D\uDEE1️', client: '\uD83D\uDCBC' },
        m = {
          free: { label: 'Free', color: 'bg-gray-100 text-gray-800' },
          professional: { label: 'Pro', color: 'bg-blue-100 text-blue-800' },
          business: { label: 'Business', color: 'bg-purple-100 text-purple-800' },
        },
        p = { junior: 'Junior', senior: 'Senior', leader: 'Team Leader', admin: 'Administrator' };
      function h(e) {
        let { accounts: t, tempToken: s, onSelect: r, onCancel: n } = e,
          [c, o] = (0, a.useState)(null),
          [i, d] = (0, a.useState)(''),
          [u, h] = (0, a.useState)(!1),
          [b, f] = (0, a.useState)(!1),
          [g, y] = (0, a.useState)(null),
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
            (o(e.accountId), y(null), h(!1));
          },
          w = async () => {
            if (!c) {
              y('Please select an account');
              return;
            }
            (f(!0), y(null));
            try {
              await r(c, u ? i : void 0);
            } catch (e) {
              (y(e.message || 'Failed to select account'), f(!1));
            }
          };
        return (0, l.jsx)('div', {
          className: 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50',
          children: (0, l.jsxs)('div', {
            className:
              'bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col',
            children: [
              (0, l.jsxs)('div', {
                className: 'px-6 py-4 border-b border-gray-200',
                children: [
                  (0, l.jsx)('h2', {
                    className: 'text-2xl font-semibold text-gray-900',
                    children: 'Select Account',
                  }),
                  (0, l.jsx)('p', {
                    className: 'text-sm text-gray-600 mt-1',
                    children: "Choose which account you'd like to use",
                  }),
                ],
              }),
              (0, l.jsxs)('div', {
                className: 'flex-1 overflow-y-auto px-6 py-4',
                children: [
                  (0, l.jsx)('div', {
                    className: 'space-y-3',
                    children: j.map((e) => {
                      let t = c === e.accountId,
                        s = e.accountClass || 'free',
                        a = e.accountType || 'client',
                        r = e.status || 'active',
                        n = e.permission_level || 'junior',
                        o = m[s] || m.free,
                        i = x[a] || x.client,
                        d = p[n] || 'Member';
                      return (0, l.jsx)(
                        'button',
                        {
                          onClick: () => v(e),
                          className:
                            'w-full text-left p-4 rounded-lg border-2 transition-all '.concat(
                              t
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                            ),
                          children: (0, l.jsxs)('div', {
                            className: 'flex items-start justify-between',
                            children: [
                              (0, l.jsxs)('div', {
                                className: 'flex items-start space-x-3',
                                children: [
                                  (0, l.jsx)('div', { className: 'text-3xl mt-1', children: i }),
                                  (0, l.jsxs)('div', {
                                    className: 'flex-1',
                                    children: [
                                      (0, l.jsxs)('div', {
                                        className: 'flex items-center space-x-2',
                                        children: [
                                          (0, l.jsx)('h3', {
                                            className: 'font-semibold text-gray-900',
                                            children: e.accountName || 'Unnamed Account',
                                          }),
                                          (0, l.jsx)('span', {
                                            className:
                                              'px-2 py-0.5 text-xs font-medium rounded '.concat(
                                                o.color
                                              ),
                                            children: o.label,
                                          }),
                                        ],
                                      }),
                                      (0, l.jsxs)('p', {
                                        className: 'text-sm text-gray-600 mt-1',
                                        children: [
                                          d,
                                          e.last_accessed &&
                                            (0, l.jsxs)('span', {
                                              className: 'text-gray-400 ml-2',
                                              children: [
                                                '• Last used ',
                                                new Date(e.last_accessed).toLocaleDateString(),
                                              ],
                                            }),
                                        ],
                                      }),
                                      'active' !== r &&
                                        (0, l.jsx)('span', {
                                          className:
                                            'inline-block mt-2 px-2 py-0.5 text-xs font-medium rounded bg-yellow-100 text-yellow-800',
                                          children: r.toUpperCase(),
                                        }),
                                    ],
                                  }),
                                ],
                              }),
                              t &&
                                (0, l.jsx)('div', {
                                  className: 'text-blue-500',
                                  children: (0, l.jsx)('svg', {
                                    className: 'w-6 h-6',
                                    fill: 'currentColor',
                                    viewBox: '0 0 20 20',
                                    children: (0, l.jsx)('path', {
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
                    (0, l.jsxs)('div', {
                      className: 'mt-4',
                      children: [
                        (0, l.jsx)('label', {
                          htmlFor: 'account-password',
                          className: 'block text-sm font-medium text-gray-700 mb-2',
                          children: 'Account Password',
                        }),
                        (0, l.jsx)('input', {
                          id: 'account-password',
                          type: 'password',
                          value: i,
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
                  g &&
                    (0, l.jsx)('div', {
                      className: 'mt-4 p-3 bg-red-50 border border-red-200 rounded-lg',
                      children: (0, l.jsx)('p', { className: 'text-sm text-red-800', children: g }),
                    }),
                ],
              }),
              (0, l.jsxs)('div', {
                className: 'px-6 py-4 border-t border-gray-200 flex justify-between',
                children: [
                  n &&
                    (0, l.jsx)('button', {
                      onClick: n,
                      disabled: b,
                      className: 'px-4 py-2 text-gray-700 hover:text-gray-900 disabled:opacity-50',
                      children: 'Cancel',
                    }),
                  (0, l.jsx)('div', { className: 'flex-1' }),
                  (0, l.jsx)('button', {
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
      function b() {
        let e = (0, r.useRouter)(),
          t = (0, r.useSearchParams)(),
          { login: s, selectAccount: x, isAuthenticated: m, isLoading: p } = (0, u.aC)(),
          [b, f] = (0, a.useState)(!1),
          [g, y] = (0, a.useState)(null),
          [j, v] = (0, a.useState)(''),
          [w, N] = (0, a.useState)(''),
          [k, C] = (0, a.useState)(!1),
          [S, D] = (0, a.useState)([]),
          [P, A] = (0, a.useState)(null),
          _ = 'expired' === t.get('reason');
        (0, a.useEffect)(() => {
          m && e.push('/keimenon');
        }, [m, e]);
        let E = async (e) => {
            (e.preventDefault(), f(!0), y(null));
            try {
              let e = await s(j, w);
              if (e && e.requiresAccountSelection && e.availableAccounts && e.tempToken) {
                (D(e.availableAccounts), A(e.tempToken), C(!0), f(!1));
                return;
              }
            } catch (e) {
              (console.error('Login failed:', e),
                'Account is locked' === e.message
                  ? y('Account is locked due to too many failed attempts. Please try again later.')
                  : y(e.message || 'Login failed. Please check your credentials.'),
                f(!1));
            }
          },
          Z = async (e, t) => {
            if (P) {
              (f(!0), y(null));
              try {
                await x(P, e, t);
              } catch (e) {
                (console.error('Account selection failed:', e),
                  y(e.message || 'Failed to select account'),
                  f(!1));
              }
            }
          };
        return (0, l.jsxs)('div', {
          className:
            'min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900',
          children: [
            (0, l.jsxs)('div', {
              className: 'w-full max-w-md space-y-8 p-8',
              children: [
                (0, l.jsxs)('div', {
                  className: 'text-center',
                  children: [
                    (0, l.jsx)('div', {
                      className:
                        'inline-flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-purple-600',
                      children: (0, l.jsx)(c.Z, { className: 'w-8 h-8 text-white' }),
                    }),
                    (0, l.jsx)('h1', {
                      className: 'text-4xl font-bold text-white mb-2',
                      children: 'Keimenon',
                    }),
                    (0, l.jsx)('p', {
                      className: 'text-slate-400',
                      children: 'Sign in to your workspace',
                    }),
                  ],
                }),
                (0, l.jsxs)('form', {
                  onSubmit: E,
                  className: 'mt-8 space-y-6',
                  children: [
                    _ &&
                      (0, l.jsxs)('div', {
                        className:
                          'bg-yellow-900/20 border border-yellow-500/50 rounded-lg p-4 flex items-start gap-3',
                        children: [
                          (0, l.jsx)(o.Z, {
                            className: 'w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5',
                          }),
                          (0, l.jsxs)('div', {
                            children: [
                              (0, l.jsx)('p', {
                                className: 'text-sm font-medium text-yellow-300',
                                children: 'Session Expired',
                              }),
                              (0, l.jsx)('p', {
                                className: 'text-sm text-yellow-400 mt-1',
                                children:
                                  'Your session has expired. Please log in again to continue.',
                              }),
                            ],
                          }),
                        ],
                      }),
                    g &&
                      (0, l.jsxs)('div', {
                        className:
                          'bg-red-900/20 border border-red-500/50 rounded-lg p-4 flex items-start gap-3',
                        children: [
                          (0, l.jsx)(i.Z, {
                            className: 'w-5 h-5 text-red-400 flex-shrink-0 mt-0.5',
                          }),
                          (0, l.jsxs)('div', {
                            children: [
                              (0, l.jsx)('p', {
                                className: 'text-sm font-medium text-red-300',
                                children: 'Login Failed',
                              }),
                              (0, l.jsx)('p', {
                                className: 'text-sm text-red-400 mt-1',
                                children: g,
                              }),
                            ],
                          }),
                        ],
                      }),
                    (0, l.jsxs)('div', {
                      className:
                        'bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 space-y-4',
                      children: [
                        (0, l.jsxs)('div', {
                          children: [
                            (0, l.jsx)('label', {
                              htmlFor: 'email',
                              className: 'block text-sm font-medium text-slate-300 mb-2',
                              children: 'Email',
                            }),
                            (0, l.jsx)('input', {
                              id: 'email',
                              name: 'email',
                              type: 'email',
                              autoComplete: 'email',
                              required: !0,
                              value: j,
                              onChange: (e) => v(e.target.value),
                              disabled: b,
                              className:
                                'w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed',
                              placeholder: 'name@example.com',
                            }),
                          ],
                        }),
                        (0, l.jsxs)('div', {
                          children: [
                            (0, l.jsx)('label', {
                              htmlFor: 'password',
                              className: 'block text-sm font-medium text-slate-300 mb-2',
                              children: 'Password',
                            }),
                            (0, l.jsx)('input', {
                              id: 'password',
                              name: 'password',
                              type: 'password',
                              autoComplete: 'current-password',
                              required: !0,
                              value: w,
                              onChange: (e) => N(e.target.value),
                              disabled: b,
                              className:
                                'w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed',
                              placeholder: 'Enter your password',
                            }),
                          ],
                        }),
                      ],
                    }),
                    (0, l.jsx)('div', {
                      className: 'flex items-center justify-end',
                      children: (0, l.jsx)(n.default, {
                        href: '/forgot-password',
                        className:
                          'text-sm text-purple-300 hover:text-purple-200 transition-colors',
                        children: 'Forgot password?',
                      }),
                    }),
                    (0, l.jsx)('button', {
                      type: 'submit',
                      disabled: b,
                      className:
                        'w-full flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-all shadow-lg shadow-purple-500/30',
                      children: b
                        ? 'Signing in...'
                        : (0, l.jsxs)(l.Fragment, {
                            children: ['Sign In', (0, l.jsx)(d.Z, { className: 'w-5 h-5' })],
                          }),
                    }),
                    'true' === t.get('dev') &&
                      (0, l.jsxs)('div', {
                        className: 'pt-6 border-t border-slate-700 space-y-3',
                        children: [
                          (0, l.jsx)('p', {
                            className:
                              'text-xs font-semibold text-slate-500 uppercase tracking-widest text-center',
                            children: 'Dev Controls',
                          }),
                          (0, l.jsxs)('div', {
                            className: 'grid grid-cols-2 gap-3',
                            children: [
                              (0, l.jsx)('button', {
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
                                      (v('dev@keimenon.local'), N('DevPass123!'));
                                  } catch (e) {
                                    console.error(e);
                                  }
                                  (v('dev@keimenon.local'), N('DevPass123!'));
                                },
                                className:
                                  'flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition-colors border border-slate-600',
                                children: '\uD83D\uDE80 Auto-Fill Dev',
                              }),
                              (0, l.jsx)('button', {
                                type: 'button',
                                onClick: () => {
                                  window.electronAPI
                                    ? window.electronAPI.invoke('app:open-data-folder')
                                    : alert('Not in Electron environment');
                                },
                                className:
                                  'flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition-colors border border-slate-600',
                                children: '\uD83D\uDCC2 Open Data',
                              }),
                            ],
                          }),
                        ],
                      }),
                  ],
                }),
                (0, l.jsx)('div', {
                  className: 'text-center text-sm text-slate-400',
                  children: (0, l.jsxs)('p', {
                    children: [
                      "Don't have an account?",
                      ' ',
                      (0, l.jsx)(n.default, {
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
            k &&
              P &&
              (0, l.jsx)(h, {
                accounts: S,
                tempToken: P,
                onSelect: Z,
                onCancel: () => {
                  (C(!1), A(null), D([]));
                },
              }),
          ],
        });
      }
      function f() {
        return (0, l.jsx)(a.Suspense, {
          fallback: (0, l.jsx)('div', {
            className:
              'min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900',
            children: (0, l.jsx)('div', { className: 'text-white', children: 'Loading...' }),
          }),
          children: (0, l.jsx)(b, {}),
        });
      }
    },
    3029: function (e, t, s) {
      'use strict';
      s.d(t, {
        Z: function () {
          return l;
        },
      });
      let l = (0, s(2389).Z)('ArrowRight', [
        ['path', { d: 'M5 12h14', key: '1ays0h' }],
        ['path', { d: 'm12 5 7 7-7 7', key: 'xquz4c' }],
      ]);
    },
    609: function (e, t, s) {
      'use strict';
      s.d(t, {
        Z: function () {
          return l;
        },
      });
      let l = (0, s(2389).Z)('CircleAlert', [
        ['circle', { cx: '12', cy: '12', r: '10', key: '1mglay' }],
        ['line', { x1: '12', x2: '12', y1: '8', y2: '12', key: '1pkeuh' }],
        ['line', { x1: '12', x2: '12.01', y1: '16', y2: '16', key: '4dfq90' }],
      ]);
    },
    5555: function (e, t, s) {
      'use strict';
      s.d(t, {
        Z: function () {
          return l;
        },
      });
      let l = (0, s(2389).Z)('Clock', [
        ['circle', { cx: '12', cy: '12', r: '10', key: '1mglay' }],
        ['polyline', { points: '12 6 12 12 16 14', key: '68esgv' }],
      ]);
    },
    6085: function (e, t, s) {
      'use strict';
      s.d(t, {
        Z: function () {
          return l;
        },
      });
      let l = (0, s(2389).Z)('Lock', [
        ['rect', { width: '18', height: '11', x: '3', y: '11', rx: '2', ry: '2', key: '1w4ew1' }],
        ['path', { d: 'M7 11V7a5 5 0 0 1 10 0v4', key: 'fwvmzm' }],
      ]);
    },
  },
  function (e) {
    (e.O(0, [44, 898, 195, 711, 444, 293, 528, 744], function () {
      return e((e.s = 3106));
    }),
      (_N_E = e.O()));
  },
]);
