(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [346],
  {
    9629: function (e, s, t) {
      Promise.resolve().then(t.bind(t, 6492));
    },
    6492: function (e, s, t) {
      'use strict';
      (t.r(s),
        t.d(s, {
          default: function () {
            return u;
          },
        }));
      var a = t(7573),
        l = t(7653),
        c = t(1695),
        n = t(8146),
        r = t(1883),
        d = t(2441),
        i = t(2100),
        x = t(5965),
        o = t(3989),
        m = t(4175),
        h = t(1493);
      function u() {
        let e = (0, c.useRouter)(),
          { user: s, isAuthenticated: t, isLoading: u } = (0, m.aC)(),
          [p, j] = (0, l.useState)(null),
          [N, b] = (0, l.useState)(!0),
          [f, g] = (0, l.useState)(null);
        return ((0, l.useEffect)(() => {
          u || t || e.push('/login');
        }, [t, u, e]),
        (0, l.useEffect)(() => {
          s &&
            (async () => {
              (b(!0), g(null));
              try {
                let e = await (0, h.rT)(s.accountId);
                j(e);
              } catch (e) {
                (console.error('Failed to load account stats:', e),
                  g(e.message || 'Failed to load account stats'));
              } finally {
                b(!1);
              }
            })();
        }, [s]),
        u || N)
          ? (0, a.jsx)('div', {
              className: 'min-h-screen bg-slate-900 flex items-center justify-center',
              children: (0, a.jsxs)('div', {
                className: 'text-center',
                children: [
                  (0, a.jsx)('div', {
                    className:
                      'animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4',
                  }),
                  (0, a.jsx)('p', { className: 'text-slate-400', children: 'Loading account...' }),
                ],
              }),
            })
          : (0, a.jsx)('div', {
              className: 'min-h-screen bg-slate-900',
              children: (0, a.jsxs)('div', {
                className: 'max-w-4xl mx-auto p-8',
                children: [
                  (0, a.jsxs)('div', {
                    className: 'mb-8',
                    children: [
                      (0, a.jsxs)(n.default, {
                        href: '/keimenon',
                        className:
                          'inline-flex items-center gap-2 text-slate-400 hover:text-white mb-4 transition-colors',
                        children: [(0, a.jsx)(r.Z, { className: 'w-4 h-4' }), 'Back to Keimenon'],
                      }),
                      (0, a.jsxs)('div', {
                        className: 'flex items-center gap-3',
                        children: [
                          (0, a.jsx)('div', {
                            className: 'p-3 bg-purple-600 rounded-lg',
                            children: (0, a.jsx)(d.Z, { className: 'w-6 h-6 text-white' }),
                          }),
                          (0, a.jsxs)('div', {
                            children: [
                              (0, a.jsx)('h1', {
                                className: 'text-3xl font-bold text-white',
                                children: 'Account Settings',
                              }),
                              (0, a.jsx)('p', {
                                className: 'text-slate-400 mt-1',
                                children: 'Manage your workspace account',
                              }),
                            ],
                          }),
                        ],
                      }),
                    ],
                  }),
                  f &&
                    (0, a.jsx)('div', {
                      className: 'mb-6 bg-red-900/20 border border-red-500/50 rounded-lg p-4',
                      children: (0, a.jsx)('p', { className: 'text-sm text-red-300', children: f }),
                    }),
                  s &&
                    (0, a.jsxs)('div', {
                      className: 'space-y-6',
                      children: [
                        (0, a.jsxs)('div', {
                          className: 'bg-slate-800/50 border border-slate-700 rounded-xl p-6',
                          children: [
                            (0, a.jsx)('h2', {
                              className: 'text-xl font-semibold text-white mb-4',
                              children: 'Account Details',
                            }),
                            (0, a.jsxs)('div', {
                              className: 'space-y-4',
                              children: [
                                (0, a.jsxs)('div', {
                                  children: [
                                    (0, a.jsx)('label', {
                                      className: 'text-sm text-slate-400',
                                      children: 'Account Type',
                                    }),
                                    (0, a.jsx)('div', {
                                      className: 'mt-1',
                                      children: (0, a.jsxs)('span', {
                                        className:
                                          'inline-flex items-center gap-2 px-3 py-1 rounded text-sm font-medium '.concat(
                                            'admin' === s.accountType
                                              ? 'bg-red-700 text-red-300'
                                              : 'bg-green-700 text-green-300'
                                          ),
                                        children: [
                                          'admin' === s.accountType &&
                                            (0, a.jsx)(i.Z, { className: 'w-4 h-4' }),
                                          s.accountType,
                                        ],
                                      }),
                                    }),
                                  ],
                                }),
                                (0, a.jsxs)('div', {
                                  children: [
                                    (0, a.jsx)('label', {
                                      className: 'text-sm text-slate-400',
                                      children: 'Plan Tier',
                                    }),
                                    (0, a.jsx)('div', {
                                      className: 'mt-1',
                                      children: (0, a.jsx)('span', {
                                        className:
                                          'inline-block px-3 py-1 rounded text-sm font-medium '.concat(
                                            ((e) => {
                                              let s = {
                                                free: 'bg-slate-700 text-slate-300',
                                                professional: 'bg-blue-700 text-blue-300',
                                                business: 'bg-purple-700 text-purple-300',
                                              };
                                              return s[e] || s.free;
                                            })(s.accountClass)
                                          ),
                                        children: s.accountClass,
                                      }),
                                    }),
                                  ],
                                }),
                                (0, a.jsxs)('div', {
                                  children: [
                                    (0, a.jsx)('label', {
                                      className: 'text-sm text-slate-400',
                                      children: 'Your Role',
                                    }),
                                    (0, a.jsxs)('div', {
                                      className: 'mt-1',
                                      children: [
                                        (0, a.jsx)('span', {
                                          className: 'text-white font-medium capitalize',
                                          children: s.permissionLevel,
                                        }),
                                        (0, a.jsxs)('span', {
                                          className: 'text-slate-400 text-sm ml-2',
                                          children: ['(Rank ', s.rank, '/4)'],
                                        }),
                                      ],
                                    }),
                                  ],
                                }),
                              ],
                            }),
                          ],
                        }),
                        p &&
                          (0, a.jsxs)('div', {
                            className: 'bg-slate-800/50 border border-slate-700 rounded-xl p-6',
                            children: [
                              (0, a.jsx)('h2', {
                                className: 'text-xl font-semibold text-white mb-4',
                                children: 'Usage Statistics',
                              }),
                              (0, a.jsxs)('div', {
                                className: 'grid grid-cols-1 md:grid-cols-3 gap-4',
                                children: [
                                  (0, a.jsxs)('div', {
                                    className: 'bg-slate-900/50 rounded-lg p-4',
                                    children: [
                                      (0, a.jsxs)('div', {
                                        className: 'flex items-center gap-3 mb-2',
                                        children: [
                                          (0, a.jsx)('div', {
                                            className: 'p-2 bg-blue-600/20 rounded',
                                            children: (0, a.jsx)(x.Z, {
                                              className: 'w-4 h-4 text-blue-400',
                                            }),
                                          }),
                                          (0, a.jsx)('span', {
                                            className: 'text-sm text-slate-400',
                                            children: 'Nodes',
                                          }),
                                        ],
                                      }),
                                      (0, a.jsx)('p', {
                                        className: 'text-2xl font-bold text-white',
                                        children: p.nodes.toLocaleString(),
                                      }),
                                    ],
                                  }),
                                  (0, a.jsxs)('div', {
                                    className: 'bg-slate-900/50 rounded-lg p-4',
                                    children: [
                                      (0, a.jsxs)('div', {
                                        className: 'flex items-center gap-3 mb-2',
                                        children: [
                                          (0, a.jsx)('div', {
                                            className: 'p-2 bg-purple-600/20 rounded',
                                            children: (0, a.jsx)(x.Z, {
                                              className: 'w-4 h-4 text-purple-400',
                                            }),
                                          }),
                                          (0, a.jsx)('span', {
                                            className: 'text-sm text-slate-400',
                                            children: 'Edges',
                                          }),
                                        ],
                                      }),
                                      (0, a.jsx)('p', {
                                        className: 'text-2xl font-bold text-white',
                                        children: p.edges.toLocaleString(),
                                      }),
                                    ],
                                  }),
                                  (0, a.jsxs)('div', {
                                    className: 'bg-slate-900/50 rounded-lg p-4',
                                    children: [
                                      (0, a.jsxs)('div', {
                                        className: 'flex items-center gap-3 mb-2',
                                        children: [
                                          (0, a.jsx)('div', {
                                            className: 'p-2 bg-green-600/20 rounded',
                                            children: (0, a.jsx)(o.Z, {
                                              className: 'w-4 h-4 text-green-400',
                                            }),
                                          }),
                                          (0, a.jsx)('span', {
                                            className: 'text-sm text-slate-400',
                                            children: 'Users',
                                          }),
                                        ],
                                      }),
                                      (0, a.jsx)('p', {
                                        className: 'text-2xl font-bold text-white',
                                        children: p.users.toLocaleString(),
                                      }),
                                    ],
                                  }),
                                ],
                              }),
                            ],
                          }),
                        (0, a.jsxs)('div', {
                          className: 'bg-slate-800/50 border border-slate-700 rounded-xl p-6',
                          children: [
                            (0, a.jsx)('h2', {
                              className: 'text-xl font-semibold text-white mb-4',
                              children: 'Quick Actions',
                            }),
                            (0, a.jsx)('div', {
                              className: 'space-y-3',
                              children: (0, a.jsxs)(n.default, {
                                href: '/users',
                                className:
                                  'flex items-center justify-between p-4 bg-slate-900/50 hover:bg-slate-900 rounded-lg transition-colors group',
                                children: [
                                  (0, a.jsxs)('div', {
                                    className: 'flex items-center gap-3',
                                    children: [
                                      (0, a.jsx)(o.Z, {
                                        className: 'w-5 h-5 text-slate-400 group-hover:text-white',
                                      }),
                                      (0, a.jsxs)('div', {
                                        children: [
                                          (0, a.jsx)('p', {
                                            className: 'text-white font-medium',
                                            children: 'Manage Users',
                                          }),
                                          (0, a.jsx)('p', {
                                            className: 'text-sm text-slate-400',
                                            children: 'Add, edit, or remove users',
                                          }),
                                        ],
                                      }),
                                    ],
                                  }),
                                  (0, a.jsx)(r.Z, {
                                    className:
                                      'w-5 h-5 text-slate-400 group-hover:text-white rotate-180',
                                  }),
                                ],
                              }),
                            }),
                          ],
                        }),
                      ],
                    }),
                ],
              }),
            });
      }
    },
    1883: function (e, s, t) {
      'use strict';
      t.d(s, {
        Z: function () {
          return a;
        },
      });
      let a = (0, t(2389).Z)('ArrowLeft', [
        ['path', { d: 'm12 19-7-7 7-7', key: '1l729n' }],
        ['path', { d: 'M19 12H5', key: 'x3x0zl' }],
      ]);
    },
    2441: function (e, s, t) {
      'use strict';
      t.d(s, {
        Z: function () {
          return a;
        },
      });
      let a = (0, t(2389).Z)('Building2', [
        ['path', { d: 'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z', key: '1b4qmf' }],
        ['path', { d: 'M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2', key: 'i71pzd' }],
        ['path', { d: 'M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2', key: '10jefs' }],
        ['path', { d: 'M10 6h4', key: '1itunk' }],
        ['path', { d: 'M10 10h4', key: 'tcdvrf' }],
        ['path', { d: 'M10 14h4', key: 'kelpxr' }],
        ['path', { d: 'M10 18h4', key: '1ulq68' }],
      ]);
    },
    2100: function (e, s, t) {
      'use strict';
      t.d(s, {
        Z: function () {
          return a;
        },
      });
      let a = (0, t(2389).Z)('Crown', [
        [
          'path',
          {
            d: 'M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z',
            key: '1vdc57',
          },
        ],
        ['path', { d: 'M5 21h14', key: '11awu3' }],
      ]);
    },
    5965: function (e, s, t) {
      'use strict';
      t.d(s, {
        Z: function () {
          return a;
        },
      });
      let a = (0, t(2389).Z)('Database', [
        ['ellipse', { cx: '12', cy: '5', rx: '9', ry: '3', key: 'msslwz' }],
        ['path', { d: 'M3 5V19A9 3 0 0 0 21 19V5', key: '1wlel7' }],
        ['path', { d: 'M3 12A9 3 0 0 0 21 12', key: 'mv7ke4' }],
      ]);
    },
    3989: function (e, s, t) {
      'use strict';
      t.d(s, {
        Z: function () {
          return a;
        },
      });
      let a = (0, t(2389).Z)('Users', [
        ['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', key: '1yyitq' }],
        ['circle', { cx: '9', cy: '7', r: '4', key: 'nufk8' }],
        ['path', { d: 'M22 21v-2a4 4 0 0 0-3-3.87', key: 'kshegd' }],
        ['path', { d: 'M16 3.13a4 4 0 0 1 0 7.75', key: '1da9ce' }],
      ]);
    },
  },
  function (e) {
    (e.O(0, [898, 642, 711, 630, 293, 528, 744], function () {
      return e((e.s = 9629));
    }),
      (_N_E = e.O()));
  },
]);
