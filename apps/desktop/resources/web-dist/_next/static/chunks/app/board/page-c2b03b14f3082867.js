(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [745],
  {
    9850: function (e, t, n) {
      Promise.resolve().then(n.bind(n, 8098));
    },
    8098: function (e, t, n) {
      'use strict';
      (n.r(t),
        n.d(t, {
          default: function () {
            return h;
          },
        }));
      var r = n(7573),
        s = n(7653),
        i = n(1695),
        l = n(3627),
        o = n(757),
        a = n(4824),
        c = n(743),
        u = n(3291);
      function d() {
        let e = (0, i.useSearchParams)().get('id'),
          [t, n] = (0, s.useState)([]),
          [d, h] = (0, s.useState)([]),
          [f, m] = (0, s.useState)(!0),
          [p, x] = (0, s.useState)([]),
          [N, E] = (0, s.useState)({ width: 1200, height: 800 });
        async function _() {
          try {
            m(!0);
            let [e, t] = await Promise.all([
              fetch(''.concat(u.CT, '/api/v1/nodes?limit=1000')),
              fetch(''.concat(u.CT, '/api/v1/edges?limit=5000')),
            ]);
            if (!e.ok) throw Error('Failed to fetch nodes (status '.concat(e.status, ')'));
            if (!t.ok) throw Error('Failed to fetch edges (status '.concat(t.status, ')'));
            let r = await e.json(),
              s = await t.json(),
              i = r.nodes.map((e) => ({ id: e.id, kind: e.kind })),
              l = new Set(i.map((e) => e.id)),
              o = (s.edges || [])
                .map((e) => {
                  let t = e.from || e.source,
                    n = e.to || e.target;
                  return t && n
                    ? { id: e.id, kind: e.kind || 'CONTAINS', source: t, target: n }
                    : null;
                })
                .filter((e) => !!e)
                .filter((e) => l.has(String(e.source)) && l.has(String(e.target)));
            (n(i), h(o));
          } catch (e) {
            console.error('Failed to load board:', e);
          } finally {
            m(!1);
          }
        }
        return (
          (0, s.useEffect)(() => {
            _();
          }, [e]),
          (0, s.useEffect)(() => {
            let e = () => {
              let e = document.getElementById('keimenon-container');
              e && E({ width: e.clientWidth, height: e.clientHeight });
            };
            return (
              e(),
              window.addEventListener('resize', e),
              () => window.removeEventListener('resize', e)
            );
          }, []),
          (0, r.jsx)(l.qE, {
            header: (0, r.jsxs)('div', {
              className: 'h-full flex items-center justify-between px-6',
              children: [
                (0, r.jsxs)('div', {
                  className: 'flex items-center gap-3',
                  children: [
                    (0, r.jsx)(a.Z, { className: 'w-6 h-6 text-purple-500' }),
                    (0, r.jsxs)('h1', {
                      className: 'text-xl font-semibold',
                      children: ['Board: ', e || 'Main'],
                    }),
                  ],
                }),
                (0, r.jsxs)('div', {
                  className: 'flex items-center gap-4',
                  children: [
                    (0, r.jsxs)('div', {
                      className:
                        'flex items-center gap-2 px-3 py-1 bg-slate-800 rounded-lg text-sm',
                      children: [
                        (0, r.jsx)('span', { className: 'text-slate-400', children: 'Lens:' }),
                        (0, r.jsx)('span', { className: 'font-semibold', children: '2D' }),
                      ],
                    }),
                    (0, r.jsxs)('div', {
                      className:
                        'flex items-center gap-2 px-3 py-1 bg-slate-800 rounded-lg text-sm',
                      children: [
                        (0, r.jsx)(c.Z, { className: 'w-4 h-4 text-purple-500' }),
                        (0, r.jsxs)('span', {
                          children: [t.length, ' nodes - ', d.length, ' edges'],
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
            leftSidebar: (0, r.jsxs)('div', {
              className: 'space-y-4',
              children: [
                (0, r.jsxs)('div', {
                  children: [
                    (0, r.jsx)('h3', {
                      className: 'text-sm font-semibold mb-2 text-slate-400',
                      children: 'Groups',
                    }),
                    (0, r.jsx)('p', {
                      className: 'text-sm text-slate-500',
                      children: 'No groups yet',
                    }),
                  ],
                }),
                (0, r.jsxs)('div', {
                  children: [
                    (0, r.jsx)('h3', {
                      className: 'text-sm font-semibold mb-2 text-slate-400',
                      children: 'Filters',
                    }),
                    (0, r.jsxs)('div', {
                      className: 'space-y-2',
                      children: [
                        (0, r.jsxs)('label', {
                          className: 'flex items-center gap-2 text-sm',
                          children: [
                            (0, r.jsx)('input', { type: 'checkbox', defaultChecked: !0 }),
                            'Sources',
                          ],
                        }),
                        (0, r.jsxs)('label', {
                          className: 'flex items-center gap-2 text-sm',
                          children: [
                            (0, r.jsx)('input', { type: 'checkbox', defaultChecked: !0 }),
                            'Groups',
                          ],
                        }),
                        (0, r.jsxs)('label', {
                          className: 'flex items-center gap-2 text-sm',
                          children: [
                            (0, r.jsx)('input', { type: 'checkbox', defaultChecked: !0 }),
                            'Claims',
                          ],
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
            rightSidebar: (0, r.jsx)('div', {
              className: 'space-y-4',
              children: (0, r.jsxs)('div', {
                children: [
                  (0, r.jsxs)('h3', {
                    className: 'text-sm font-semibold mb-2 text-slate-400',
                    children: ['Selection (', p.length, ')'],
                  }),
                  0 === p.length
                    ? (0, r.jsx)('p', {
                        className: 'text-sm text-slate-500',
                        children: 'Click nodes to select them',
                      })
                    : (0, r.jsx)('div', {
                        className: 'space-y-2',
                        children: p.map((e) => {
                          let n = t.find((t) => t.id === e);
                          return (0, r.jsxs)(
                            'div',
                            {
                              className: 'p-2 bg-slate-800 rounded text-sm',
                              children: [
                                (0, r.jsx)('p', { className: 'font-mono text-xs', children: e }),
                                (0, r.jsx)('p', {
                                  className: 'text-slate-400 text-xs',
                                  children: (null == n ? void 0 : n.kind) || 'Unknown',
                                }),
                              ],
                            },
                            e
                          );
                        }),
                      }),
                ],
              }),
            }),
            children: (0, r.jsx)('div', {
              id: 'keimenon-container',
              className: 'w-full h-full',
              children: f
                ? (0, r.jsx)('div', {
                    className: 'flex items-center justify-center h-full',
                    children: (0, r.jsxs)('div', {
                      className: 'text-center space-y-4',
                      children: [
                        (0, r.jsx)('div', {
                          className:
                            'w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto',
                        }),
                        (0, r.jsx)('p', {
                          className: 'text-slate-400',
                          children: 'Loading board...',
                        }),
                      ],
                    }),
                  })
                : 0 === t.length
                  ? (0, r.jsx)('div', {
                      className: 'flex items-center justify-center h-full',
                      children: (0, r.jsxs)('div', {
                        className: 'text-center space-y-4 max-w-md',
                        children: [
                          (0, r.jsx)(a.Z, { className: 'w-16 h-16 text-slate-700 mx-auto' }),
                          (0, r.jsx)('h2', {
                            className: 'text-2xl font-semibold text-slate-300',
                            children: 'No nodes yet',
                          }),
                          (0, r.jsx)('p', {
                            className: 'text-slate-400',
                            children: 'Upload some files to get started',
                          }),
                          (0, r.jsx)('a', {
                            href: '/ingest',
                            className:
                              'inline-block px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold transition-colors',
                            children: 'Ingest Files',
                          }),
                        ],
                      }),
                    })
                  : (0, r.jsx)(o.s, {
                      nodes: t,
                      edges: d,
                      width: N.width,
                      height: N.height,
                      onNodeClick: (e) => {
                        console.log('Node clicked:', e);
                      },
                      onNodeDoubleClick: (e) => {
                        console.log('Node double-clicked:', e);
                      },
                      onSelectionChange: (e) => {
                        x(e);
                      },
                    }),
            }),
          })
        );
      }
      function h() {
        return (0, r.jsx)(s.Suspense, {
          fallback: (0, r.jsx)('div', { children: 'Loading...' }),
          children: (0, r.jsx)(d, {}),
        });
      }
    },
    3291: function (e, t, n) {
      'use strict';
      n.d(t, {
        Ar: function () {
          return u;
        },
        CT: function () {
          return o;
        },
        Ku: function () {
          return N;
        },
        LS: function () {
          return _;
        },
        M6: function () {
          return p;
        },
        OJ: function () {
          return c;
        },
        Qn: function () {
          return x;
        },
        X8: function () {
          return m;
        },
        nj: function () {
          return a;
        },
        oj: function () {
          return f;
        },
        pA: function () {
          return h;
        },
        yD: function () {
          return d;
        },
        zC: function () {
          return E;
        },
      });
      var r,
        s = n(4859);
      function i(e) {
        let t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : '';
        return (void 0 !== s && s.env && s.env[e]) || t;
      }
      i('INTERNAL_API_URL');
      let l =
          ((r = 'apiPort'),
          window.location ? new URLSearchParams(window.location.search).get(r) : null),
        o =
          (l ? 'http://127.0.0.1:'.concat(l) : null) ||
          i('NEXT_PUBLIC_API_URL', 'http://127.0.0.1:4001');
      (console.log('[Config] API_BASE_URL resolved to:', o),
        i('NEXT_PUBLIC_ENABLE_PRO_FEATURES'),
        i('NEXT_PUBLIC_ENABLE_BUSINESS_FEATURES'));
      let a = '1' === i('NEXT_PUBLIC_ENABLE_LEGACY_IMPORTS'),
        c = '1' === i('NEXT_PUBLIC_ENABLE_HYBRID_LOCAL_FIRST'),
        u = 'false' !== i('NEXT_PUBLIC_ENABLE_3D_RENDERER', 'true');
      i('NEXT_PUBLIC_USE_DIRECT_SSE');
      let d = '1' === i('NEXT_PUBLIC_DEBUG_IMPORT_SELECTOR'),
        h = 'true' === i('NEXT_PUBLIC_E2E_TESTING');
      (parseInt(i('NEXT_PUBLIC_JOB_POLL_INTERVAL_MS', '2000'), 10),
        parseInt(i('NEXT_PUBLIC_SSE_RECONNECT_TIMEOUT_MS', '5000'), 10),
        parseInt(i('NEXT_PUBLIC_MAX_JOB_WAIT_MS', '1500000'), 10));
      let f = i('NEXT_PUBLIC_SENTRY_DSN'),
        m = i('NEXT_PUBLIC_SENTRY_ENVIRONMENT', i('NODE_ENV', 'production')),
        p = parseFloat(i('NEXT_PUBLIC_SENTRY_SAMPLE_RATE', '1.0')),
        x = parseFloat(i('NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE', '0.1')),
        N = parseFloat(i('NEXT_PUBLIC_SENTRY_REPLAY_SESSION_SAMPLE_RATE', '0.1')),
        E = parseFloat(i('NEXT_PUBLIC_SENTRY_REPLAY_ERROR_SAMPLE_RATE', '1.0')),
        _ = 'false' !== i('NEXT_PUBLIC_SENTRY_SCRUB_PII', 'true');
      (i('NEXT_PUBLIC_AUTH_DOMAIN'), i('NEXT_PUBLIC_AUTH_CLIENT_ID'), i('NODE_ENV', 'production'));
    },
    2389: function (e, t, n) {
      'use strict';
      n.d(t, {
        Z: function () {
          return a;
        },
      });
      var r = n(7653);
      let s = (e) => e.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase(),
        i = function () {
          for (var e = arguments.length, t = Array(e), n = 0; n < e; n++) t[n] = arguments[n];
          return t.filter((e, t, n) => !!e && n.indexOf(e) === t).join(' ');
        };
      var l = {
        xmlns: 'http://www.w3.org/2000/svg',
        width: 24,
        height: 24,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      };
      let o = (0, r.forwardRef)((e, t) => {
          let {
            color: n = 'currentColor',
            size: s = 24,
            strokeWidth: o = 2,
            absoluteStrokeWidth: a,
            className: c = '',
            children: u,
            iconNode: d,
            ...h
          } = e;
          return (0, r.createElement)(
            'svg',
            {
              ref: t,
              ...l,
              width: s,
              height: s,
              stroke: n,
              strokeWidth: a ? (24 * Number(o)) / Number(s) : o,
              className: i('lucide', c),
              ...h,
            },
            [
              ...d.map((e) => {
                let [t, n] = e;
                return (0, r.createElement)(t, n);
              }),
              ...(Array.isArray(u) ? u : [u]),
            ]
          );
        }),
        a = (e, t) => {
          let n = (0, r.forwardRef)((n, l) => {
            let { className: a, ...c } = n;
            return (0, r.createElement)(o, {
              ref: l,
              iconNode: t,
              className: i('lucide-'.concat(s(e)), a),
              ...c,
            });
          });
          return ((n.displayName = ''.concat(e)), n);
        };
    },
    8410: function (e, t, n) {
      'use strict';
      n.d(t, {
        Z: function () {
          return r;
        },
      });
      let r = (0, n(2389).Z)('ChevronLeft', [['path', { d: 'm15 18-6-6 6-6', key: '1wnfg3' }]]);
    },
    2966: function (e, t, n) {
      'use strict';
      n.d(t, {
        Z: function () {
          return r;
        },
      });
      let r = (0, n(2389).Z)('ChevronRight', [['path', { d: 'm9 18 6-6-6-6', key: 'mthhwq' }]]);
    },
    4824: function (e, t, n) {
      'use strict';
      n.d(t, {
        Z: function () {
          return r;
        },
      });
      let r = (0, n(2389).Z)('Grid3x3', [
        ['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2', key: 'afitv7' }],
        ['path', { d: 'M3 9h18', key: '1pudct' }],
        ['path', { d: 'M3 15h18', key: '5xshup' }],
        ['path', { d: 'M9 3v18', key: 'fh3hqa' }],
        ['path', { d: 'M15 3v18', key: '14nvp0' }],
      ]);
    },
    743: function (e, t, n) {
      'use strict';
      n.d(t, {
        Z: function () {
          return r;
        },
      });
      let r = (0, n(2389).Z)('Zap', [
        [
          'path',
          {
            d: 'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z',
            key: '1xq2db',
          },
        ],
      ]);
    },
    1695: function (e, t, n) {
      'use strict';
      var r = n(1219);
      (n.o(r, 'useRouter') &&
        n.d(t, {
          useRouter: function () {
            return r.useRouter;
          },
        }),
        n.o(r, 'useSearchParams') &&
          n.d(t, {
            useSearchParams: function () {
              return r.useSearchParams;
            },
          }));
    },
    4859: function (e, t, n) {
      'use strict';
      var r, s;
      e.exports =
        (null == (r = n.g.process) ? void 0 : r.env) &&
        'object' == typeof (null == (s = n.g.process) ? void 0 : s.env)
          ? n.g.process
          : n(9566);
    },
    9566: function (e) {
      !(function () {
        var t = {
            229: function (e) {
              var t,
                n,
                r,
                s = (e.exports = {});
              function i() {
                throw Error('setTimeout has not been defined');
              }
              function l() {
                throw Error('clearTimeout has not been defined');
              }
              function o(e) {
                if (t === setTimeout) return setTimeout(e, 0);
                if ((t === i || !t) && setTimeout) return ((t = setTimeout), setTimeout(e, 0));
                try {
                  return t(e, 0);
                } catch (n) {
                  try {
                    return t.call(null, e, 0);
                  } catch (n) {
                    return t.call(this, e, 0);
                  }
                }
              }
              !(function () {
                try {
                  t = 'function' == typeof setTimeout ? setTimeout : i;
                } catch (e) {
                  t = i;
                }
                try {
                  n = 'function' == typeof clearTimeout ? clearTimeout : l;
                } catch (e) {
                  n = l;
                }
              })();
              var a = [],
                c = !1,
                u = -1;
              function d() {
                c && r && ((c = !1), r.length ? (a = r.concat(a)) : (u = -1), a.length && h());
              }
              function h() {
                if (!c) {
                  var e = o(d);
                  c = !0;
                  for (var t = a.length; t; ) {
                    for (r = a, a = []; ++u < t; ) r && r[u].run();
                    ((u = -1), (t = a.length));
                  }
                  ((r = null),
                    (c = !1),
                    (function (e) {
                      if (n === clearTimeout) return clearTimeout(e);
                      if ((n === l || !n) && clearTimeout)
                        return ((n = clearTimeout), clearTimeout(e));
                      try {
                        n(e);
                      } catch (t) {
                        try {
                          return n.call(null, e);
                        } catch (t) {
                          return n.call(this, e);
                        }
                      }
                    })(e));
                }
              }
              function f(e, t) {
                ((this.fun = e), (this.array = t));
              }
              function m() {}
              ((s.nextTick = function (e) {
                var t = Array(arguments.length - 1);
                if (arguments.length > 1)
                  for (var n = 1; n < arguments.length; n++) t[n - 1] = arguments[n];
                (a.push(new f(e, t)), 1 !== a.length || c || o(h));
              }),
                (f.prototype.run = function () {
                  this.fun.apply(null, this.array);
                }),
                (s.title = 'browser'),
                (s.browser = !0),
                (s.env = {}),
                (s.argv = []),
                (s.version = ''),
                (s.versions = {}),
                (s.on = m),
                (s.addListener = m),
                (s.once = m),
                (s.off = m),
                (s.removeListener = m),
                (s.removeAllListeners = m),
                (s.emit = m),
                (s.prependListener = m),
                (s.prependOnceListener = m),
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
          n = {};
        function r(e) {
          var s = n[e];
          if (void 0 !== s) return s.exports;
          var i = (n[e] = { exports: {} }),
            l = !0;
          try {
            (t[e](i, i.exports, r), (l = !1));
          } finally {
            l && delete n[e];
          }
          return i.exports;
        }
        r.ab = '//';
        var s = r(229);
        e.exports = s;
      })();
    },
    9289: function (e, t, n) {
      'use strict';
      n.d(t, {
        j: function () {
          return l;
        },
      });
      var r = n(607);
      let s = (e) => ('boolean' == typeof e ? `${e}` : 0 === e ? '0' : e),
        i = r.W,
        l = (e, t) => (n) => {
          var r;
          if ((null == t ? void 0 : t.variants) == null)
            return i(e, null == n ? void 0 : n.class, null == n ? void 0 : n.className);
          let { variants: l, defaultVariants: o } = t,
            a = Object.keys(l).map((e) => {
              let t = null == n ? void 0 : n[e],
                r = null == o ? void 0 : o[e];
              if (null === t) return null;
              let i = s(t) || s(r);
              return l[e][i];
            }),
            c =
              n &&
              Object.entries(n).reduce((e, t) => {
                let [n, r] = t;
                return (void 0 === r || (e[n] = r), e);
              }, {});
          return i(
            e,
            a,
            null == t
              ? void 0
              : null === (r = t.compoundVariants) || void 0 === r
                ? void 0
                : r.reduce((e, t) => {
                    let { class: n, className: r, ...s } = t;
                    return Object.entries(s).every((e) => {
                      let [t, n] = e;
                      return Array.isArray(n)
                        ? n.includes({ ...o, ...c }[t])
                        : { ...o, ...c }[t] === n;
                    })
                      ? [...e, n, r]
                      : e;
                  }, []),
            null == n ? void 0 : n.class,
            null == n ? void 0 : n.className
          );
        };
    },
    607: function (e, t, n) {
      'use strict';
      function r() {
        for (var e, t, n = 0, r = '', s = arguments.length; n < s; n++)
          (e = arguments[n]) &&
            (t = (function e(t) {
              var n,
                r,
                s = '';
              if ('string' == typeof t || 'number' == typeof t) s += t;
              else if ('object' == typeof t) {
                if (Array.isArray(t)) {
                  var i = t.length;
                  for (n = 0; n < i; n++) t[n] && (r = e(t[n])) && (s && (s += ' '), (s += r));
                } else for (r in t) t[r] && (s && (s += ' '), (s += r));
              }
              return s;
            })(e)) &&
            (r && (r += ' '), (r += t));
        return r;
      }
      (n.d(t, {
        W: function () {
          return r;
        },
      }),
        (t.Z = r));
    },
  },
  function (e) {
    (e.O(0, [627, 757, 293, 528, 744], function () {
      return e((e.s = 9850));
    }),
      (_N_E = e.O()));
  },
]);
