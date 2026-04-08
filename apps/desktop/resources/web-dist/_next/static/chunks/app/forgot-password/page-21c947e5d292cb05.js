(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [781],
  {
    854: function (e, t, r) {
      Promise.resolve().then(r.bind(r, 2109));
    },
    2109: function (e, t, r) {
      'use strict';
      (r.r(t),
        r.d(t, {
          default: function () {
            return p;
          },
        }));
      var n = r(7573),
        s = r(7653),
        o = r(1695),
        a = r(8146),
        l = r(3447),
        i = r(609),
        c = r(9901),
        u = r(1883),
        d = r(3291);
      function m() {
        let e = (0, o.useRouter)(),
          t = (0, o.useSearchParams)(),
          r = (0, s.useMemo)(() => (t.get('token') || '').trim(), [t]),
          m = r.length > 0,
          [p, f] = (0, s.useState)(''),
          [h, x] = (0, s.useState)(''),
          [_, E] = (0, s.useState)(''),
          [w, N] = (0, s.useState)(!1),
          [g, b] = (0, s.useState)(null),
          [T, y] = (0, s.useState)(null),
          v = async (t) => {
            if ((t.preventDefault(), N(!0), b(null), y(null), m && h !== _)) {
              (N(!1), b('Passwords do not match.'));
              return;
            }
            try {
              let t = m
                  ? '/api/v1/auth/reset-password/confirm'
                  : '/api/v1/auth/reset-password/request',
                n = m ? { token: r, newPassword: h } : { email: p },
                s = await fetch(''.concat(d.CT).concat(t), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(n),
                }),
                o = await s.json();
              if (!s.ok)
                throw Error(o.error || 'Unable to process password reset request right now.');
              m
                ? (y(o.message || 'Password reset complete. Redirecting to login...'),
                  x(''),
                  E(''),
                  setTimeout(() => {
                    e.push('/login');
                  }, 1200))
                : (y(
                    o.message ||
                      'If an account exists with this email, reset instructions were sent.'
                  ),
                  f(''));
            } catch (e) {
              (console.error('Forgot password error:', e), b(e.message || 'Something went wrong.'));
            } finally {
              N(!1);
            }
          };
        return (0, n.jsx)('div', {
          className:
            'min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-950 to-purple-900',
          children: (0, n.jsxs)('div', {
            className: 'w-full max-w-md space-y-8 p-8',
            children: [
              (0, n.jsxs)('div', {
                className: 'text-center',
                children: [
                  (0, n.jsx)('div', {
                    className:
                      'inline-flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-purple-600',
                    children: (0, n.jsx)(l.Z, { className: 'w-8 h-8 text-white' }),
                  }),
                  (0, n.jsx)('h1', {
                    className: 'text-3xl font-bold text-white mb-2',
                    children: m ? 'Set New Password' : 'Forgot Password',
                  }),
                  (0, n.jsx)('p', {
                    className: 'text-slate-400 text-sm max-w-sm mx-auto',
                    children: m
                      ? 'Enter a new password for your account.'
                      : 'Enter your email and we will send password reset instructions if an account exists.',
                  }),
                ],
              }),
              g &&
                (0, n.jsxs)('div', {
                  className:
                    'bg-red-900/20 border border-red-500/50 rounded-lg p-4 flex items-start gap-3',
                  children: [
                    (0, n.jsx)(i.Z, { className: 'w-5 h-5 text-red-400 flex-shrink-0 mt-0.5' }),
                    (0, n.jsxs)('div', {
                      children: [
                        (0, n.jsx)('p', {
                          className: 'text-sm font-medium text-red-300',
                          children: 'Reset failed',
                        }),
                        (0, n.jsx)('p', { className: 'text-sm text-red-400 mt-1', children: g }),
                      ],
                    }),
                  ],
                }),
              T &&
                (0, n.jsxs)('div', {
                  className:
                    'bg-emerald-900/20 border border-emerald-500/50 rounded-lg p-4 flex items-start gap-3',
                  children: [
                    (0, n.jsx)(c.Z, { className: 'w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5' }),
                    (0, n.jsxs)('div', {
                      children: [
                        (0, n.jsx)('p', {
                          className: 'text-sm font-medium text-emerald-200',
                          children: 'Request accepted',
                        }),
                        (0, n.jsx)('p', {
                          className: 'text-sm text-emerald-300 mt-1',
                          children: T,
                        }),
                      ],
                    }),
                  ],
                }),
              (0, n.jsxs)('form', {
                onSubmit: v,
                className: 'mt-6 space-y-5',
                children: [
                  (0, n.jsxs)('div', {
                    className:
                      'bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 space-y-4',
                    children: [
                      !m &&
                        (0, n.jsxs)('div', {
                          children: [
                            (0, n.jsx)('label', {
                              htmlFor: 'email',
                              className: 'block text-sm font-medium text-slate-300 mb-2',
                              children: 'Email address',
                            }),
                            (0, n.jsx)('input', {
                              id: 'email',
                              name: 'email',
                              type: 'email',
                              autoComplete: 'email',
                              required: !0,
                              value: p,
                              onChange: (e) => f(e.target.value),
                              disabled: w,
                              className:
                                'w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed',
                              placeholder: 'name@example.com',
                            }),
                          ],
                        }),
                      m &&
                        (0, n.jsxs)(n.Fragment, {
                          children: [
                            (0, n.jsxs)('div', {
                              children: [
                                (0, n.jsx)('label', {
                                  htmlFor: 'newPassword',
                                  className: 'block text-sm font-medium text-slate-300 mb-2',
                                  children: 'New password',
                                }),
                                (0, n.jsx)('input', {
                                  id: 'newPassword',
                                  name: 'newPassword',
                                  type: 'password',
                                  autoComplete: 'new-password',
                                  required: !0,
                                  value: h,
                                  onChange: (e) => x(e.target.value),
                                  disabled: w,
                                  className:
                                    'w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed',
                                  placeholder: 'Enter a strong password',
                                }),
                              ],
                            }),
                            (0, n.jsxs)('div', {
                              children: [
                                (0, n.jsx)('label', {
                                  htmlFor: 'confirmPassword',
                                  className: 'block text-sm font-medium text-slate-300 mb-2',
                                  children: 'Confirm password',
                                }),
                                (0, n.jsx)('input', {
                                  id: 'confirmPassword',
                                  name: 'confirmPassword',
                                  type: 'password',
                                  autoComplete: 'new-password',
                                  required: !0,
                                  value: _,
                                  onChange: (e) => E(e.target.value),
                                  disabled: w,
                                  className:
                                    'w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed',
                                  placeholder: 'Repeat your new password',
                                }),
                              ],
                            }),
                          ],
                        }),
                    ],
                  }),
                  (0, n.jsx)('button', {
                    type: 'submit',
                    disabled: w,
                    className:
                      'w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-all shadow-lg shadow-purple-500/30',
                    children: w
                      ? 'Submitting...'
                      : m
                        ? 'Reset password'
                        : 'Send reset instructions',
                  }),
                ],
              }),
              (0, n.jsx)('div', {
                className: 'flex items-center justify-between text-sm text-slate-400',
                children: (0, n.jsxs)(a.default, {
                  href: '/login',
                  className:
                    'inline-flex items-center gap-2 text-purple-300 hover:text-purple-200 transition-colors',
                  children: [(0, n.jsx)(u.Z, { className: 'w-4 h-4' }), 'Back to login'],
                }),
              }),
            ],
          }),
        });
      }
      function p() {
        return (0, n.jsx)(s.Suspense, {
          fallback: (0, n.jsx)('div', {
            className:
              'min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-950 to-purple-900',
            children: (0, n.jsx)('div', { className: 'text-white', children: 'Loading...' }),
          }),
          children: (0, n.jsx)(m, {}),
        });
      }
    },
    3291: function (e, t, r) {
      'use strict';
      r.d(t, {
        Ar: function () {
          return d;
        },
        CT: function () {
          return i;
        },
        Ku: function () {
          return E;
        },
        LS: function () {
          return N;
        },
        M6: function () {
          return x;
        },
        OJ: function () {
          return u;
        },
        Qn: function () {
          return _;
        },
        X8: function () {
          return h;
        },
        nj: function () {
          return c;
        },
        oj: function () {
          return f;
        },
        pA: function () {
          return p;
        },
        yD: function () {
          return m;
        },
        zC: function () {
          return w;
        },
      });
      var n = r(4859);
      function s(e) {
        let t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : '';
        return (void 0 !== n && n.env && n.env[e]) || t;
      }
      s('INTERNAL_API_URL');
      let o = { apiPort: 'keimenon.startup.apiPort', dev: 'keimenon.startup.dev' };
      function a(e) {
        let t = window.location ? new URLSearchParams(window.location.search).get(e) : null;
        if (t && t.trim().length > 0) {
          try {
            window.sessionStorage.setItem(o[e], t);
          } catch (e) {}
          return t;
        }
        try {
          let t = window.sessionStorage.getItem(o[e]);
          if (t && t.trim().length > 0) return t;
        } catch (e) {}
        return null;
      }
      let l = a('apiPort'),
        i =
          (l ? 'http://127.0.0.1:'.concat(l) : null) ||
          s('NEXT_PUBLIC_API_URL', 'http://127.0.0.1:4001');
      (console.log('[Config] API_BASE_URL resolved to:', i),
        s('NEXT_PUBLIC_ENABLE_PRO_FEATURES'),
        s('NEXT_PUBLIC_ENABLE_BUSINESS_FEATURES'));
      let c = '1' === s('NEXT_PUBLIC_ENABLE_LEGACY_IMPORTS'),
        u = '1' === s('NEXT_PUBLIC_ENABLE_HYBRID_LOCAL_FIRST'),
        d = 'false' !== s('NEXT_PUBLIC_ENABLE_3D_RENDERER', 'true');
      s('NEXT_PUBLIC_USE_DIRECT_SSE');
      let m = '1' === s('NEXT_PUBLIC_DEBUG_IMPORT_SELECTOR');
      a('dev');
      let p = 'true' === s('NEXT_PUBLIC_E2E_TESTING');
      (parseInt(s('NEXT_PUBLIC_JOB_POLL_INTERVAL_MS', '2000'), 10),
        parseInt(s('NEXT_PUBLIC_SSE_RECONNECT_TIMEOUT_MS', '5000'), 10),
        parseInt(s('NEXT_PUBLIC_MAX_JOB_WAIT_MS', '1500000'), 10));
      let f = s('NEXT_PUBLIC_SENTRY_DSN'),
        h = s('NEXT_PUBLIC_SENTRY_ENVIRONMENT', s('NODE_ENV', 'production')),
        x = parseFloat(s('NEXT_PUBLIC_SENTRY_SAMPLE_RATE', '1.0')),
        _ = parseFloat(s('NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE', '0.1')),
        E = parseFloat(s('NEXT_PUBLIC_SENTRY_REPLAY_SESSION_SAMPLE_RATE', '0.1')),
        w = parseFloat(s('NEXT_PUBLIC_SENTRY_REPLAY_ERROR_SAMPLE_RATE', '1.0')),
        N = 'false' !== s('NEXT_PUBLIC_SENTRY_SCRUB_PII', 'true');
      (s('NEXT_PUBLIC_AUTH_DOMAIN'), s('NEXT_PUBLIC_AUTH_CLIENT_ID'), s('NODE_ENV', 'production'));
    },
    1883: function (e, t, r) {
      'use strict';
      r.d(t, {
        Z: function () {
          return n;
        },
      });
      let n = (0, r(2389).Z)('ArrowLeft', [
        ['path', { d: 'm12 19-7-7 7-7', key: '1l729n' }],
        ['path', { d: 'M19 12H5', key: 'x3x0zl' }],
      ]);
    },
    609: function (e, t, r) {
      'use strict';
      r.d(t, {
        Z: function () {
          return n;
        },
      });
      let n = (0, r(2389).Z)('CircleAlert', [
        ['circle', { cx: '12', cy: '12', r: '10', key: '1mglay' }],
        ['line', { x1: '12', x2: '12', y1: '8', y2: '12', key: '1pkeuh' }],
        ['line', { x1: '12', x2: '12.01', y1: '16', y2: '16', key: '4dfq90' }],
      ]);
    },
    9901: function (e, t, r) {
      'use strict';
      r.d(t, {
        Z: function () {
          return n;
        },
      });
      let n = (0, r(2389).Z)('CircleCheck', [
        ['circle', { cx: '12', cy: '12', r: '10', key: '1mglay' }],
        ['path', { d: 'm9 12 2 2 4-4', key: 'dzmm74' }],
      ]);
    },
    3447: function (e, t, r) {
      'use strict';
      r.d(t, {
        Z: function () {
          return n;
        },
      });
      let n = (0, r(2389).Z)('Key', [
        ['circle', { cx: '7.5', cy: '15.5', r: '5.5', key: 'yqb3hr' }],
        ['path', { d: 'm21 2-9.6 9.6', key: '1j0ho8' }],
        ['path', { d: 'm15.5 7.5 3 3L22 7l-3-3', key: '1rn1fs' }],
      ]);
    },
    1695: function (e, t, r) {
      'use strict';
      var n = r(1219);
      (r.o(n, 'useRouter') &&
        r.d(t, {
          useRouter: function () {
            return n.useRouter;
          },
        }),
        r.o(n, 'useSearchParams') &&
          r.d(t, {
            useSearchParams: function () {
              return n.useSearchParams;
            },
          }));
    },
    4859: function (e, t, r) {
      'use strict';
      var n, s;
      e.exports =
        (null == (n = r.g.process) ? void 0 : n.env) &&
        'object' == typeof (null == (s = r.g.process) ? void 0 : s.env)
          ? r.g.process
          : r(9566);
    },
    9566: function (e) {
      !(function () {
        var t = {
            229: function (e) {
              var t,
                r,
                n,
                s = (e.exports = {});
              function o() {
                throw Error('setTimeout has not been defined');
              }
              function a() {
                throw Error('clearTimeout has not been defined');
              }
              function l(e) {
                if (t === setTimeout) return setTimeout(e, 0);
                if ((t === o || !t) && setTimeout) return ((t = setTimeout), setTimeout(e, 0));
                try {
                  return t(e, 0);
                } catch (r) {
                  try {
                    return t.call(null, e, 0);
                  } catch (r) {
                    return t.call(this, e, 0);
                  }
                }
              }
              !(function () {
                try {
                  t = 'function' == typeof setTimeout ? setTimeout : o;
                } catch (e) {
                  t = o;
                }
                try {
                  r = 'function' == typeof clearTimeout ? clearTimeout : a;
                } catch (e) {
                  r = a;
                }
              })();
              var i = [],
                c = !1,
                u = -1;
              function d() {
                c && n && ((c = !1), n.length ? (i = n.concat(i)) : (u = -1), i.length && m());
              }
              function m() {
                if (!c) {
                  var e = l(d);
                  c = !0;
                  for (var t = i.length; t; ) {
                    for (n = i, i = []; ++u < t; ) n && n[u].run();
                    ((u = -1), (t = i.length));
                  }
                  ((n = null),
                    (c = !1),
                    (function (e) {
                      if (r === clearTimeout) return clearTimeout(e);
                      if ((r === a || !r) && clearTimeout)
                        return ((r = clearTimeout), clearTimeout(e));
                      try {
                        r(e);
                      } catch (t) {
                        try {
                          return r.call(null, e);
                        } catch (t) {
                          return r.call(this, e);
                        }
                      }
                    })(e));
                }
              }
              function p(e, t) {
                ((this.fun = e), (this.array = t));
              }
              function f() {}
              ((s.nextTick = function (e) {
                var t = Array(arguments.length - 1);
                if (arguments.length > 1)
                  for (var r = 1; r < arguments.length; r++) t[r - 1] = arguments[r];
                (i.push(new p(e, t)), 1 !== i.length || c || l(m));
              }),
                (p.prototype.run = function () {
                  this.fun.apply(null, this.array);
                }),
                (s.title = 'browser'),
                (s.browser = !0),
                (s.env = {}),
                (s.argv = []),
                (s.version = ''),
                (s.versions = {}),
                (s.on = f),
                (s.addListener = f),
                (s.once = f),
                (s.off = f),
                (s.removeListener = f),
                (s.removeAllListeners = f),
                (s.emit = f),
                (s.prependListener = f),
                (s.prependOnceListener = f),
                (s.listeners = function (e) {
                  return [];
                }),
                (s.binding = function (e) {
                  throw Error('process.binding is not supported');
                }),
                (s.cwd = function () {
                  return '/';
                }),
                (s.chdir = function (e) {
                  throw Error('process.chdir is not supported');
                }),
                (s.umask = function () {
                  return 0;
                }));
            },
          },
          r = {};
        function n(e) {
          var s = r[e];
          if (void 0 !== s) return s.exports;
          var o = (r[e] = { exports: {} }),
            a = !0;
          try {
            (t[e](o, o.exports, n), (a = !1));
          } finally {
            a && delete r[e];
          }
          return o.exports;
        }
        n.ab = '//';
        var s = n(229);
        e.exports = s;
      })();
    },
  },
  function (e) {
    (e.O(0, [711, 293, 528, 744], function () {
      return e((e.s = 854));
    }),
      (_N_E = e.O()));
  },
]);
