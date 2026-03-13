(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [678],
  {
    4040: function (e, s, a) {
      Promise.resolve().then(a.bind(a, 8685));
    },
    8685: function (e, s, a) {
      'use strict';
      (a.r(s),
        a.d(s, {
          default: function () {
            return p;
          },
        }));
      var l = a(7573),
        r = a(7653),
        t = a(1695),
        n = a(8146),
        i = a(1883),
        d = a(4915),
        o = a(7070),
        c = a(1493),
        u = a(6666);
      function m() {
        let e = (0, t.useRouter)(),
          s = (0, t.useSearchParams)().get('id'),
          { user: a, isAuthenticated: m, isLoading: p } = (0, o.aC)(),
          [h, x] = (0, r.useState)(null),
          [b, f] = (0, r.useState)(!0),
          [v, g] = (0, r.useState)(!1),
          [w, j] = (0, r.useState)(null);
        ((0, r.useEffect)(() => {
          p || m || e.push('/login');
        }, [m, p, e]),
          (0, r.useEffect)(() => {
            a &&
              s &&
              (async () => {
                (f(!0), j(null));
                try {
                  if (!s) return;
                  let e = await (0, c.PR)(s);
                  x(e.user);
                } catch (e) {
                  (console.error('Failed to load user:', e), j(e.message || 'Failed to load user'));
                } finally {
                  f(!1);
                }
              })();
          }, [a, s]));
        let N = async (a) => {
          if (s) {
            g(!0);
            try {
              (await (0, c.Nq)(s, a), e.push('/users'));
            } catch (e) {
              throw (console.error('Failed to update user:', e), e);
            } finally {
              g(!1);
            }
          }
        };
        if (p || b)
          return (0, l.jsx)('div', {
            className: 'min-h-screen bg-slate-900 flex items-center justify-center',
            children: (0, l.jsxs)('div', {
              className: 'text-center',
              children: [
                (0, l.jsx)('div', {
                  className:
                    'animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4',
                }),
                (0, l.jsx)('p', { className: 'text-slate-400', children: 'Loading user...' }),
              ],
            }),
          });
        if (w || !h)
          return (0, l.jsx)('div', {
            className: 'min-h-screen bg-slate-900 p-8',
            children: (0, l.jsx)('div', {
              className: 'max-w-2xl mx-auto',
              children: (0, l.jsxs)('div', {
                className: 'bg-red-900/20 border border-red-500/50 rounded-lg p-6 text-center',
                children: [
                  (0, l.jsx)('p', {
                    className: 'text-red-300 mb-4',
                    children: w || 'User not found',
                  }),
                  (0, l.jsx)(n.default, {
                    href: '/users',
                    className:
                      'inline-block px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors',
                    children: 'Back to Users',
                  }),
                ],
              }),
            }),
          });
        let y =
            (null == a ? void 0 : a.permissionLevel) === 'admin' ||
            (null == a ? void 0 : a.userId) === s,
          _ = (null == a ? void 0 : a.userId) === s;
        return (0, l.jsx)('div', {
          className: 'min-h-screen bg-slate-900',
          children: (0, l.jsxs)('div', {
            className: 'max-w-2xl mx-auto p-8',
            children: [
              (0, l.jsxs)('div', {
                className: 'mb-8',
                children: [
                  (0, l.jsxs)(n.default, {
                    href: '/users',
                    className:
                      'inline-flex items-center gap-2 text-slate-400 hover:text-white mb-4 transition-colors',
                    children: [(0, l.jsx)(i.Z, { className: 'w-4 h-4' }), 'Back to Users'],
                  }),
                  (0, l.jsxs)('div', {
                    className: 'flex items-center gap-3',
                    children: [
                      (0, l.jsx)('div', {
                        className: 'p-3 bg-purple-600 rounded-lg',
                        children: (0, l.jsx)(d.Z, { className: 'w-6 h-6 text-white' }),
                      }),
                      (0, l.jsxs)('div', {
                        children: [
                          (0, l.jsxs)('h1', {
                            className: 'text-3xl font-bold text-white',
                            children: ['Edit User ', _ && '(You)'],
                          }),
                          (0, l.jsx)('p', {
                            className: 'text-slate-400 mt-1',
                            children: 'Update user account details',
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
              !y &&
                (0, l.jsx)('div', {
                  className: 'mb-6 bg-red-900/20 border border-red-500/50 rounded-lg p-4',
                  children: (0, l.jsx)('p', {
                    className: 'text-sm text-red-300',
                    children: "You don't have permission to edit this user.",
                  }),
                }),
              _ &&
                (null == a ? void 0 : a.permissionLevel) !== 'admin' &&
                (0, l.jsx)('div', {
                  className: 'mb-6 bg-blue-900/20 border border-blue-500/50 rounded-lg p-4',
                  children: (0, l.jsx)('p', {
                    className: 'text-sm text-blue-300',
                    children:
                      'You can only edit your name and password. Contact an admin to change other settings.',
                  }),
                }),
              y &&
                (0, l.jsx)(u.H, {
                  mode: 'edit',
                  initialData: {
                    name: h.name,
                    email: h.email,
                    permission_level: h.permission_level,
                    user_class: h.user_class,
                    is_active: h.is_active,
                  },
                  onSubmit: N,
                  onCancel: () => {
                    e.push('/users');
                  },
                  isLoading: v,
                }),
            ],
          }),
        });
      }
      function p() {
        return (0, l.jsx)(r.Suspense, {
          fallback: (0, l.jsx)('div', { children: 'Loading...' }),
          children: (0, l.jsx)(m, {}),
        });
      }
    },
    6666: function (e, s, a) {
      'use strict';
      a.d(s, {
        H: function () {
          return i;
        },
      });
      var l = a(7573),
        r = a(7653),
        t = a(6991),
        n = a(269);
      function i(e) {
        var s;
        let { mode: a, initialData: i, onSubmit: d, onCancel: o, isLoading: c } = e,
          [u, m] = (0, r.useState)({
            name: (null == i ? void 0 : i.name) || '',
            email: (null == i ? void 0 : i.email) || '',
            password: '',
            confirmPassword: '',
            permission_level: (null == i ? void 0 : i.permission_level) || 'junior',
            user_class: (null == i ? void 0 : i.user_class) || 'person',
            is_active: null === (s = null == i ? void 0 : i.is_active) || void 0 === s || s,
          }),
          [p, h] = (0, r.useState)(null),
          x = async (e) => {
            if ((e.preventDefault(), h(null), 'create' === a && !u.password)) {
              h('Password is required for new users');
              return;
            }
            if (u.password && u.password !== u.confirmPassword) {
              h('Passwords do not match');
              return;
            }
            if (u.password && u.password.length < 6) {
              h('Password must be at least 6 characters long');
              return;
            }
            try {
              await d({
                name: u.name,
                email: u.email,
                password: u.password || void 0,
                permission_level: u.permission_level,
                user_class: u.user_class,
                is_active: u.is_active,
              });
            } catch (e) {
              h(e.message || 'Failed to save user');
            }
          },
          b = (e) => {
            let { name: s, value: a, type: l } = e.target;
            m({ ...u, [s]: 'checkbox' === l ? e.target.checked : a });
          };
        return (0, l.jsxs)('form', {
          onSubmit: x,
          className: 'space-y-6',
          children: [
            p &&
              (0, l.jsx)('div', {
                className: 'bg-red-900/20 border border-red-500/50 rounded-lg p-4',
                children: (0, l.jsx)('p', { className: 'text-sm text-red-300', children: p }),
              }),
            (0, l.jsxs)('div', {
              className: 'bg-slate-800/50 border border-slate-700 rounded-xl p-6 space-y-4',
              children: [
                (0, l.jsxs)('div', {
                  children: [
                    (0, l.jsx)('label', {
                      htmlFor: 'name',
                      className: 'block text-sm font-medium text-slate-300 mb-2',
                      children: 'Full Name',
                    }),
                    (0, l.jsx)('input', {
                      id: 'name',
                      name: 'name',
                      type: 'text',
                      required: !0,
                      value: u.name,
                      onChange: b,
                      disabled: c,
                      className:
                        'w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed',
                      placeholder: 'John Doe',
                    }),
                  ],
                }),
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
                      required: !0,
                      value: u.email,
                      onChange: b,
                      disabled: c || 'edit' === a,
                      className:
                        'w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed',
                      placeholder: 'user@example.com',
                    }),
                    'edit' === a &&
                      (0, l.jsx)('p', {
                        className: 'text-xs text-slate-500 mt-1',
                        children: 'Email cannot be changed',
                      }),
                  ],
                }),
                (0, l.jsxs)('div', {
                  children: [
                    (0, l.jsxs)('label', {
                      htmlFor: 'password',
                      className: 'block text-sm font-medium text-slate-300 mb-2',
                      children: ['Password ', 'edit' === a && '(leave blank to keep unchanged)'],
                    }),
                    (0, l.jsx)('input', {
                      id: 'password',
                      name: 'password',
                      type: 'password',
                      required: 'create' === a,
                      value: u.password,
                      onChange: b,
                      disabled: c,
                      className:
                        'w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed',
                      placeholder:
                        'create' === a ? 'Minimum 6 characters' : 'Leave blank to keep current',
                    }),
                  ],
                }),
                ('create' === a || u.password) &&
                  (0, l.jsxs)('div', {
                    children: [
                      (0, l.jsx)('label', {
                        htmlFor: 'confirmPassword',
                        className: 'block text-sm font-medium text-slate-300 mb-2',
                        children: 'Confirm Password',
                      }),
                      (0, l.jsx)('input', {
                        id: 'confirmPassword',
                        name: 'confirmPassword',
                        type: 'password',
                        required: 'create' === a || !!u.password,
                        value: u.confirmPassword,
                        onChange: b,
                        disabled: c,
                        className:
                          'w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed',
                        placeholder: 'Re-enter password',
                      }),
                    ],
                  }),
                (0, l.jsxs)('div', {
                  children: [
                    (0, l.jsx)('label', {
                      htmlFor: 'permission_level',
                      className: 'block text-sm font-medium text-slate-300 mb-2',
                      children: 'Permission Level',
                    }),
                    (0, l.jsxs)('select', {
                      id: 'permission_level',
                      name: 'permission_level',
                      value: u.permission_level,
                      onChange: b,
                      disabled: c,
                      className:
                        'w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed',
                      children: [
                        (0, l.jsx)('option', {
                          value: 'junior',
                          children: 'Junior - Basic access',
                        }),
                        (0, l.jsx)('option', {
                          value: 'senior',
                          children: 'Senior - Enhanced access',
                        }),
                        (0, l.jsx)('option', {
                          value: 'leader',
                          children: 'Leader - Team management',
                        }),
                        (0, l.jsx)('option', { value: 'admin', children: 'Admin - Full control' }),
                      ],
                    }),
                  ],
                }),
                (0, l.jsxs)('div', {
                  children: [
                    (0, l.jsx)('label', {
                      htmlFor: 'user_class',
                      className: 'block text-sm font-medium text-slate-300 mb-2',
                      children: 'User Type',
                    }),
                    (0, l.jsxs)('select', {
                      id: 'user_class',
                      name: 'user_class',
                      value: u.user_class,
                      onChange: b,
                      disabled: c,
                      className:
                        'w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed',
                      children: [
                        (0, l.jsx)('option', { value: 'person', children: 'Person - Human user' }),
                        (0, l.jsx)('option', {
                          value: 'agent',
                          children: 'Agent - Automated/AI user',
                        }),
                      ],
                    }),
                  ],
                }),
                'edit' === a &&
                  (0, l.jsxs)('div', {
                    className: 'flex items-center gap-3',
                    children: [
                      (0, l.jsx)('input', {
                        id: 'is_active',
                        name: 'is_active',
                        type: 'checkbox',
                        checked: u.is_active,
                        onChange: b,
                        disabled: c,
                        className:
                          'w-4 h-4 rounded border-slate-700 bg-slate-900/50 text-purple-600 focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed',
                      }),
                      (0, l.jsx)('label', {
                        htmlFor: 'is_active',
                        className: 'text-sm text-slate-300',
                        children: 'User is active (can log in)',
                      }),
                    ],
                  }),
              ],
            }),
            (0, l.jsxs)('div', {
              className: 'flex items-center gap-3',
              children: [
                (0, l.jsxs)('button', {
                  type: 'submit',
                  disabled: c,
                  className:
                    'flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-all',
                  children: [
                    (0, l.jsx)(t.Z, { className: 'w-4 h-4' }),
                    c ? 'Saving...' : 'create' === a ? 'Create User' : 'Save Changes',
                  ],
                }),
                (0, l.jsx)('button', {
                  type: 'button',
                  onClick: o,
                  disabled: c,
                  className:
                    'px-6 py-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-all',
                  children: (0, l.jsx)(n.Z, { className: 'w-4 h-4' }),
                }),
              ],
            }),
          ],
        });
      }
    },
    1883: function (e, s, a) {
      'use strict';
      a.d(s, {
        Z: function () {
          return l;
        },
      });
      let l = (0, a(2389).Z)('ArrowLeft', [
        ['path', { d: 'm12 19-7-7 7-7', key: '1l729n' }],
        ['path', { d: 'M19 12H5', key: 'x3x0zl' }],
      ]);
    },
    6991: function (e, s, a) {
      'use strict';
      a.d(s, {
        Z: function () {
          return l;
        },
      });
      let l = (0, a(2389).Z)('Save', [
        [
          'path',
          {
            d: 'M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
            key: '1c8476',
          },
        ],
        ['path', { d: 'M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7', key: '1ydtos' }],
        ['path', { d: 'M7 3v4a1 1 0 0 0 1 1h7', key: 't51u73' }],
      ]);
    },
    4915: function (e, s, a) {
      'use strict';
      a.d(s, {
        Z: function () {
          return l;
        },
      });
      let l = (0, a(2389).Z)('SquarePen', [
        [
          'path',
          { d: 'M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7', key: '1m0v6g' },
        ],
        ['path', { d: 'M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z', key: '1lpok0' }],
      ]);
    },
    269: function (e, s, a) {
      'use strict';
      a.d(s, {
        Z: function () {
          return l;
        },
      });
      let l = (0, a(2389).Z)('X', [
        ['path', { d: 'M18 6 6 18', key: '1bl5f8' }],
        ['path', { d: 'm6 6 12 12', key: 'd8bk6v' }],
      ]);
    },
  },
  function (e) {
    (e.O(0, [44, 898, 195, 711, 444, 293, 528, 744], function () {
      return e((e.s = 4040));
    }),
      (_N_E = e.O()));
  },
]);
