(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [11],
  {
    638: function (e, s, a) {
      Promise.resolve().then(a.bind(a, 6088));
    },
    6088: function (e, s, a) {
      'use strict';
      (a.r(s),
        a.d(s, {
          default: function () {
            return h;
          },
        }));
      var t = a(7573),
        r = a(7653),
        l = a(1695),
        o = a(8146),
        n = a(4099),
        i = a(609),
        d = a(844),
        c = a(8333),
        u = a(3029),
        m = a(7070);
      let p = /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        x = (e) => {
          if (e.length < 12) return !1;
          let s = /[A-Z]/.test(e),
            a = /[a-z]/.test(e),
            t = /[0-9]/.test(e),
            r = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(e);
          return s && a && t && r;
        };
      function h() {
        let e = (0, l.useRouter)(),
          { register: s, isAuthenticated: a } = (0, m.aC)(),
          [h, f] = (0, r.useState)(!1),
          [w, b] = (0, r.useState)(null),
          [y, g] = (0, r.useState)({ email: '', password: '', confirmPassword: '' }),
          [j, N] = (0, r.useState)({
            name: '',
            email: '',
            password: '',
            confirmPassword: '',
            accountClass: 'free',
          }),
          [v, k] = (0, r.useState)(!1),
          [P, C] = (0, r.useState)(!1),
          [Z, S] = (0, r.useState)(!1);
        (0, r.useEffect)(() => {
          a && e.push('/keimenon');
        }, [a, e]);
        let F = (e) => (e ? (p.test(e) ? '' : 'Please enter a valid email address') : ''),
          q = (e) =>
            e
              ? e.length < 12
                ? 'Password is too short - at least '.concat(12, ' characters required')
                : x(e)
                  ? ''
                  : 'Password must contain uppercase, lowercase, numbers, and special characters (!@#$%^&* etc.)'
              : '',
          A = (e, s) => (s && e !== s ? 'Passwords do not match' : ''),
          E = async (e) => {
            (e.preventDefault(), f(!0), b(null), S(!0));
            let a = F(j.email),
              t = q(j.password),
              r = A(j.password, j.confirmPassword);
            if (a || t || r) {
              (g({ email: a, password: t, confirmPassword: r }), f(!1));
              return;
            }
            try {
              let e = Date.now();
              await s(j.email, j.password, j.name, j.accountClass);
              let a = Date.now() - e,
                t = Math.max(0, 300 - a);
              t > 0 && (await new Promise((e) => setTimeout(e, t)));
            } catch (e) {
              (console.error('Registration failed:', e),
                b(e.message || 'Registration failed. Please try again.'),
                f(!1));
            }
          },
          M = (e) => {
            let { name: s, value: a } = e.target;
            if ((N({ ...j, [s]: a }), Z)) {
              if ('email' === s) g({ ...y, email: F(a) });
              else if ('password' === s) {
                let e = q(a),
                  s = A(a, j.confirmPassword);
                g({ ...y, password: e, confirmPassword: s });
              } else 'confirmPassword' === s && g({ ...y, confirmPassword: A(j.password, a) });
            } else
              ('email' === s || 'password' === s || 'confirmPassword' === s) &&
                g({ ...y, [s]: '' });
          },
          _ = (e) => {
            let { name: s, value: a } = e.target;
            'email' === s
              ? g({ ...y, email: F(a) })
              : 'password' === s
                ? g({ ...y, password: q(a) })
                : 'confirmPassword' === s && g({ ...y, confirmPassword: A(j.password, a) });
          };
        return (0, t.jsx)('div', {
          className:
            'min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900',
          children: (0, t.jsxs)('div', {
            className: 'w-full max-w-md space-y-8 p-8',
            children: [
              (0, t.jsxs)('div', {
                className: 'text-center',
                children: [
                  (0, t.jsx)('div', {
                    className:
                      'inline-flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-purple-600',
                    children: (0, t.jsx)(n.Z, { className: 'w-8 h-8 text-white' }),
                  }),
                  (0, t.jsx)('h1', {
                    className: 'text-4xl font-bold text-white mb-2',
                    children: 'Keimenon',
                  }),
                  (0, t.jsx)('p', {
                    className: 'text-slate-400',
                    children: 'Create your workspace account',
                  }),
                ],
              }),
              (0, t.jsxs)('form', {
                onSubmit: E,
                className: 'mt-8 space-y-6',
                children: [
                  w &&
                    (0, t.jsxs)('div', {
                      className:
                        'bg-red-900/20 border border-red-500/50 rounded-lg p-4 flex items-start gap-3',
                      children: [
                        (0, t.jsx)(i.Z, { className: 'w-5 h-5 text-red-400 flex-shrink-0 mt-0.5' }),
                        (0, t.jsxs)('p', {
                          className: 'text-sm text-red-400',
                          children: [
                            (0, t.jsx)('span', {
                              className: 'font-medium text-red-300',
                              children: 'Registration Failed:',
                            }),
                            ' ',
                            w,
                          ],
                        }),
                      ],
                    }),
                  (0, t.jsxs)('div', {
                    className:
                      'bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 space-y-4',
                    children: [
                      (0, t.jsxs)('div', {
                        children: [
                          (0, t.jsx)('label', {
                            htmlFor: 'name',
                            className: 'block text-sm font-medium text-slate-300 mb-2',
                            children: 'Full Name',
                          }),
                          (0, t.jsx)('input', {
                            id: 'name',
                            name: 'name',
                            type: 'text',
                            required: !0,
                            value: j.name,
                            onChange: M,
                            disabled: h,
                            className:
                              'w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed',
                            placeholder: 'John Doe',
                          }),
                        ],
                      }),
                      (0, t.jsxs)('div', {
                        children: [
                          (0, t.jsx)('label', {
                            htmlFor: 'email',
                            className: 'block text-sm font-medium text-slate-300 mb-2',
                            children: 'Email',
                          }),
                          (0, t.jsx)('input', {
                            id: 'email',
                            name: 'email',
                            type: 'email',
                            autoComplete: 'email',
                            required: !0,
                            value: j.email,
                            onChange: M,
                            onBlur: _,
                            disabled: h,
                            className:
                              'w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed',
                            placeholder: 'you@example.com',
                          }),
                          y.email &&
                            (0, t.jsx)('p', {
                              className: 'mt-1 text-sm text-red-400',
                              children: y.email,
                            }),
                        ],
                      }),
                      (0, t.jsxs)('div', {
                        children: [
                          (0, t.jsx)('label', {
                            htmlFor: 'password',
                            className: 'block text-sm font-medium text-slate-300 mb-2',
                            children: 'Password',
                          }),
                          (0, t.jsxs)('div', {
                            className: 'relative',
                            children: [
                              (0, t.jsx)('input', {
                                id: 'password',
                                name: 'password',
                                type: v ? 'text' : 'password',
                                autoComplete: 'new-password',
                                required: !0,
                                value: j.password,
                                onChange: M,
                                onBlur: _,
                                disabled: h,
                                className:
                                  'w-full px-4 py-3 pr-12 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed',
                                placeholder:
                                  '12+ chars, uppercase, lowercase, numbers, special chars',
                              }),
                              (0, t.jsx)('button', {
                                type: 'button',
                                onClick: () => k(!v),
                                className:
                                  'absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300 transition-colors',
                                'aria-label': v ? 'Hide password' : 'Show password',
                                children: v
                                  ? (0, t.jsx)(d.Z, { className: 'w-5 h-5' })
                                  : (0, t.jsx)(c.Z, { className: 'w-5 h-5' }),
                              }),
                            ],
                          }),
                          y.password &&
                            (0, t.jsx)('p', {
                              className: 'mt-1 text-sm text-red-400',
                              children: y.password,
                            }),
                        ],
                      }),
                      (0, t.jsxs)('div', {
                        children: [
                          (0, t.jsx)('label', {
                            htmlFor: 'confirmPassword',
                            className: 'block text-sm font-medium text-slate-300 mb-2',
                            children: 'Confirm Password',
                          }),
                          (0, t.jsxs)('div', {
                            className: 'relative',
                            children: [
                              (0, t.jsx)('input', {
                                id: 'confirmPassword',
                                name: 'confirmPassword',
                                type: P ? 'text' : 'password',
                                autoComplete: 'new-password',
                                required: !0,
                                value: j.confirmPassword,
                                onChange: M,
                                onBlur: _,
                                disabled: h,
                                className:
                                  'w-full px-4 py-3 pr-12 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed',
                                placeholder: 'Re-enter password',
                              }),
                              (0, t.jsx)('button', {
                                type: 'button',
                                onClick: () => C(!P),
                                className:
                                  'absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300 transition-colors',
                                'aria-label': P ? 'Hide password' : 'Show password',
                                children: P
                                  ? (0, t.jsx)(d.Z, { className: 'w-5 h-5' })
                                  : (0, t.jsx)(c.Z, { className: 'w-5 h-5' }),
                              }),
                            ],
                          }),
                          y.confirmPassword &&
                            (0, t.jsx)('p', {
                              className: 'mt-1 text-sm text-red-400',
                              children: y.confirmPassword,
                            }),
                        ],
                      }),
                      (0, t.jsxs)('div', {
                        children: [
                          (0, t.jsx)('label', {
                            htmlFor: 'accountClass',
                            className: 'block text-sm font-medium text-slate-300 mb-2',
                            children: 'Account Tier',
                          }),
                          (0, t.jsxs)('select', {
                            id: 'accountClass',
                            name: 'accountClass',
                            value: j.accountClass,
                            onChange: M,
                            disabled: h,
                            className:
                              'w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed',
                            children: [
                              (0, t.jsx)('option', {
                                value: 'free',
                                children: 'Free - Personal use',
                              }),
                              (0, t.jsx)('option', {
                                value: 'professional',
                                children: 'Professional - Pro features',
                              }),
                              (0, t.jsx)('option', {
                                value: 'business',
                                children: 'Business - Full access',
                              }),
                            ],
                          }),
                        ],
                      }),
                    ],
                  }),
                  (0, t.jsx)('button', {
                    type: 'submit',
                    disabled: h,
                    className:
                      'w-full flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-all shadow-lg shadow-purple-500/30',
                    children: h
                      ? 'Creating account...'
                      : (0, t.jsxs)(t.Fragment, {
                          children: ['Create Account', (0, t.jsx)(u.Z, { className: 'w-5 h-5' })],
                        }),
                  }),
                ],
              }),
              (0, t.jsx)('div', {
                className: 'text-center text-sm text-slate-400',
                children: (0, t.jsxs)('p', {
                  children: [
                    'Already have an account?',
                    ' ',
                    (0, t.jsx)(o.default, {
                      href: '/login',
                      className:
                        'text-purple-400 hover:text-purple-300 font-medium transition-colors',
                      children: 'Sign in here',
                    }),
                  ],
                }),
              }),
            ],
          }),
        });
      }
    },
    3029: function (e, s, a) {
      'use strict';
      a.d(s, {
        Z: function () {
          return t;
        },
      });
      let t = (0, a(2389).Z)('ArrowRight', [
        ['path', { d: 'M5 12h14', key: '1ays0h' }],
        ['path', { d: 'm12 5 7 7-7 7', key: 'xquz4c' }],
      ]);
    },
    609: function (e, s, a) {
      'use strict';
      a.d(s, {
        Z: function () {
          return t;
        },
      });
      let t = (0, a(2389).Z)('CircleAlert', [
        ['circle', { cx: '12', cy: '12', r: '10', key: '1mglay' }],
        ['line', { x1: '12', x2: '12', y1: '8', y2: '12', key: '1pkeuh' }],
        ['line', { x1: '12', x2: '12.01', y1: '16', y2: '16', key: '4dfq90' }],
      ]);
    },
    844: function (e, s, a) {
      'use strict';
      a.d(s, {
        Z: function () {
          return t;
        },
      });
      let t = (0, a(2389).Z)('EyeOff', [
        ['path', { d: 'M9.88 9.88a3 3 0 1 0 4.24 4.24', key: '1jxqfv' }],
        [
          'path',
          {
            d: 'M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68',
            key: '9wicm4',
          },
        ],
        [
          'path',
          {
            d: 'M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61',
            key: '1jreej',
          },
        ],
        ['line', { x1: '2', x2: '22', y1: '2', y2: '22', key: 'a6p6uj' }],
      ]);
    },
    8333: function (e, s, a) {
      'use strict';
      a.d(s, {
        Z: function () {
          return t;
        },
      });
      let t = (0, a(2389).Z)('Eye', [
        ['path', { d: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z', key: 'rwhkz3' }],
        ['circle', { cx: '12', cy: '12', r: '3', key: '1v7zrd' }],
      ]);
    },
    4099: function (e, s, a) {
      'use strict';
      a.d(s, {
        Z: function () {
          return t;
        },
      });
      let t = (0, a(2389).Z)('UserPlus', [
        ['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', key: '1yyitq' }],
        ['circle', { cx: '9', cy: '7', r: '4', key: 'nufk8' }],
        ['line', { x1: '19', x2: '19', y1: '8', y2: '14', key: '1bvyxn' }],
        ['line', { x1: '22', x2: '16', y1: '11', y2: '11', key: '1shjgl' }],
      ]);
    },
  },
  function (e) {
    (e.O(0, [44, 898, 195, 711, 444, 293, 528, 744], function () {
      return e((e.s = 638));
    }),
      (_N_E = e.O()));
  },
]);
