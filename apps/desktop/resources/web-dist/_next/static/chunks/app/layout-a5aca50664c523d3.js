(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [185],
  {
    569: function (e, t, n) {
      (Promise.resolve().then(n.t.bind(n, 2625, 23)),
        Promise.resolve().then(n.bind(n, 7324)),
        Promise.resolve().then(n.bind(n, 176)),
        Promise.resolve().then(n.bind(n, 521)),
        Promise.resolve().then(n.bind(n, 7070)),
        Promise.resolve().then(n.bind(n, 7250)),
        Promise.resolve().then(n.bind(n, 6326)),
        Promise.resolve().then(n.bind(n, 7833)),
        Promise.resolve().then(n.t.bind(n, 8514, 23)));
    },
    7324: function (e, t, n) {
      'use strict';
      n.d(t, {
        TokenExpirationListener: function () {
          return a;
        },
      });
      var r = n(7573),
        o = n(7653),
        i = n(5955),
        l = n(3627);
      function a() {
        let { toasts: e, error: t, removeToast: n } = (0, i.p)(),
          a = (0, o.useRef)(t);
        return ((a.current = t),
        (0, o.useEffect)(() => {
          function e(e) {
            var t;
            (console.log(
              '\uD83D\uDD14 Token expiration detected, showing notification:',
              (null === (t = e.detail) || void 0 === t ? void 0 : t.reason) ||
                'Your session has expired'
            ),
              a.current(
                'Session Expired',
                'You will be redirected to the login page. Please log in again.',
                3e3
              ));
          }
          return (
            window.addEventListener('auth:token-expired', e),
            () => {
              window.removeEventListener('auth:token-expired', e);
            }
          );
        }, []),
        0 === e.length)
          ? null
          : (0, r.jsx)(l.Ix, { toasts: e, onClose: n });
      }
    },
    176: function (e, t, n) {
      'use strict';
      n.d(t, {
        ErrorBoundary: function () {
          return a;
        },
      });
      var r = n(7573),
        o = n(7653),
        i = n(54),
        l = n(1482);
      class a extends o.Component {
        static getDerivedStateFromError(e) {
          return { hasError: !0, error: e, errorInfo: null };
        }
        componentDidCatch(e, t) {
          (l.I.capture(
            e,
            {
              domain: 'ui',
              operation: 'react.componentError',
              metadata: { componentStack: t.componentStack, digest: t.digest },
            },
            'error'
          ),
            this.setState({ errorInfo: t }),
            this.props.onError && this.props.onError(e, t));
        }
        render() {
          if (this.state.hasError) {
            var e;
            return this.props.fallback
              ? this.props.fallback
              : (0, r.jsx)('div', {
                  className: 'min-h-screen flex items-center justify-center bg-slate-900 p-6',
                  children: (0, r.jsx)('div', {
                    className: 'max-w-lg w-full',
                    children: (0, r.jsx)('div', {
                      className: 'bg-red-600/10 border border-red-500/30 rounded-xl p-6',
                      children: (0, r.jsxs)('div', {
                        className: 'flex items-start gap-4',
                        children: [
                          (0, r.jsx)('div', {
                            className: 'flex-shrink-0 p-3 bg-red-600/20 rounded-lg',
                            children: (0, r.jsx)(i.Z, { className: 'w-8 h-8 text-red-400' }),
                          }),
                          (0, r.jsxs)('div', {
                            className: 'flex-1',
                            children: [
                              (0, r.jsx)('h2', {
                                className: 'text-xl font-bold text-red-300 mb-2',
                                children: 'Something went wrong',
                              }),
                              (0, r.jsx)('p', {
                                className: 'text-sm text-red-300/80 mb-4',
                                children:
                                  (null === (e = this.state.error) || void 0 === e
                                    ? void 0
                                    : e.message) || 'An unexpected error occurred',
                              }),
                              !1,
                              (0, r.jsxs)('div', {
                                className: 'flex gap-3',
                                children: [
                                  (0, r.jsx)('button', {
                                    onClick: this.handleReset,
                                    className:
                                      'px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors',
                                    children: 'Try Again',
                                  }),
                                  (0, r.jsx)('button', {
                                    onClick: () => window.location.reload(),
                                    className:
                                      'px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors',
                                    children: 'Reload Page',
                                  }),
                                ],
                              }),
                              (0, r.jsx)('p', {
                                className: 'text-xs text-slate-500 mt-4',
                                children: 'Press ` (backtick) to view error details in the console',
                              }),
                            ],
                          }),
                        ],
                      }),
                    }),
                  }),
                });
          }
          return this.props.children;
        }
        constructor(e) {
          (super(e),
            (this.handleReset = () => {
              this.setState({ hasError: !1, error: null, errorInfo: null });
            }),
            (this.state = { hasError: !1, error: null, errorInfo: null }));
        }
      }
    },
    521: function (e, t, n) {
      'use strict';
      n.d(t, {
        SentryProvider: function () {
          return l;
        },
      });
      var r = n(7573),
        o = n(7653),
        i = n(8155);
      function l(e) {
        let { children: t } = e;
        return (
          (0, o.useEffect)(() => {
            (0, i.j6)();
          }, []),
          (0, r.jsx)(r.Fragment, { children: t })
        );
      }
    },
    7250: function (e, t, n) {
      'use strict';
      n.d(t, {
        B: function () {
          return s;
        },
        OperatingProvider: function () {
          return a;
        },
      });
      var r = n(7573),
        o = n(7653),
        i = n(7070);
      let l = (0, o.createContext)(void 0);
      function a(e) {
        let { children: t } = e,
          { user: n } = (0, i.aC)(),
          [a, s] = (0, o.useState)({
            mode: 'native',
            accountId: (null == n ? void 0 : n.accountId) || '',
          }),
          [c, u] = (0, o.useState)(0),
          d = (0, o.useCallback)(
            (e, t, r) => {
              if (!n) {
                console.error('Cannot switch account: not authenticated');
                return;
              }
              if ('admin' !== n.accountType) {
                console.error('Cannot switch account: user is not admin');
                return;
              }
              ('nested' !== t ||
                (null == r ? void 0 : r.serviceMode) ||
                console.warn('Nested mode requires service mode enabled on target account'),
                console.log('Switching to operating mode:', {
                  mode: t,
                  accountId: e,
                  accountName: null == r ? void 0 : r.accountName,
                }),
                s({
                  mode: t,
                  accountId: e,
                  accountType: null == r ? void 0 : r.accountType,
                  accountName: null == r ? void 0 : r.accountName,
                  serviceMode: null == r ? void 0 : r.serviceMode,
                  parentAccountId: null == r ? void 0 : r.parentAccountId,
                }),
                u((e) => e + 1),
                (window.__operatingAccount = e),
                (window.__operatingMode = t));
            },
            [n]
          ),
          f = (0, o.useCallback)(() => {
            n &&
              (console.log('Exiting operating mode, returning to native'),
              s({ mode: 'native', accountId: n.accountId }),
              u((e) => e + 1),
              delete window.__operatingAccount,
              delete window.__operatingMode);
          }, [n]),
          h = (0, o.useCallback)(() => {
            let e = {};
            return (
              'native' !== a.mode &&
                a.accountId !== (null == n ? void 0 : n.accountId) &&
                ((e['X-Operating-Account'] = a.accountId), (e['X-Operating-Mode'] = a.mode)),
              e
            );
          }, [a, n]),
          v = 'native' !== a.mode && a.accountId !== (null == n ? void 0 : n.accountId);
        return (0, r.jsx)(l.Provider, {
          value: {
            operating: a,
            switchAccount: d,
            exitOperatingMode: f,
            getOperatingHeaders: h,
            isOperatingMode: v,
            operatingContextVersion: c,
          },
          children: t,
        });
      }
      function s() {
        let e = (0, o.useContext)(l);
        if (void 0 === e) throw Error('useOperating must be used within an OperatingProvider');
        return e;
      }
    },
    6326: function (e, t, n) {
      'use strict';
      n.d(t, {
        ShellProvider: function () {
          return a;
        },
        St: function () {
          return s;
        },
      });
      var r = n(7573),
        o = n(7653),
        i = n(7070);
      let l = (0, o.createContext)(void 0);
      function a(e) {
        let { children: t } = e,
          { user: n } = (0, i.aC)(),
          [a, s] = (0, o.useState)(
            (null == n ? void 0 : n.accountType) === 'admin' ? 'admin' : 'client'
          ),
          [c, u] = (0, o.useState)('keimenon'),
          d = (0, o.useRef)(!1);
        (0, o.useEffect)(() => {
          if (n && !d.current) {
            let e = 'admin' === n.accountType ? 'admin' : 'client',
              t = 'admin' === n.accountType ? 'dashboard' : 'keimenon';
            (s(e),
              u(t),
              (d.current = !0),
              console.log('Shell locked to account type:', {
                shellMode: e,
                accountType: n.accountType,
              }));
          }
        }, [n]);
        let f = (0, o.useCallback)(() => !0, [n]),
          h = (0, o.useCallback)(() => (null == n ? void 0 : n.accountType) === 'admin', [n]),
          v = (0, o.useCallback)(
            (e) => {
              console.warn(
                'setShellMode() called but ShellMode is locked to account type.',
                'ShellMode cannot be manually changed. Ignoring request.',
                { requestedMode: e, currentMode: a }
              );
            },
            [a]
          ),
          m = (0, o.useCallback)((e) => {
            (u(e), console.log('Keimenon mode changed:', e));
          }, []);
        return (0, r.jsx)(l.Provider, {
          value: {
            shellMode: a,
            keimenonMode: c,
            setShellMode: v,
            setKeimenonMode: m,
            canAccessPortal: f,
            isAdminShell: h,
          },
          children: t,
        });
      }
      function s() {
        let e = (0, o.useContext)(l);
        if (void 0 === e) throw Error('useShell must be used within a ShellProvider');
        return e;
      }
    },
    7833: function (e, t, n) {
      'use strict';
      n.d(t, {
        O: function () {
          return a;
        },
        UIVersionProvider: function () {
          return l;
        },
      });
      var r = n(7573),
        o = n(7653);
      let i = (0, o.createContext)(void 0);
      function l(e) {
        let { children: t } = e,
          [n, l] = (0, o.useState)('legacy'),
          a = (0, o.useCallback)((e) => {
            (l(e), console.log('UI version changed:', e));
          }, []),
          s = (0, o.useCallback)(() => {
            l((e) => {
              let t = 'legacy' === e ? 'primitives' : 'legacy';
              return (console.log('UI version toggled:', e, '→', t), t);
            });
          }, []),
          c = (0, o.useCallback)(() => 'primitives' === n, [n]),
          u = (0, o.useCallback)(() => 'legacy' === n, [n]);
        return (0, r.jsx)(i.Provider, {
          value: {
            uiVersion: n,
            setUIVersion: a,
            toggleUIVersion: s,
            isPrimitivesMode: c,
            isLegacyMode: u,
          },
          children: t,
        });
      }
      function a() {
        let e = (0, o.useContext)(i);
        if (void 0 === e) throw Error('useUIVersion must be used within a UIVersionProvider');
        return e;
      }
    },
    5955: function (e, t, n) {
      'use strict';
      n.d(t, {
        p: function () {
          return i;
        },
      });
      var r = n(7653);
      let o = 0;
      function i() {
        let [e, t] = (0, r.useState)([]),
          n = (0, r.useCallback)((e, n, r, i) => {
            let l = 'toast-'.concat(++o),
              a = { id: l, type: e, message: n, description: r, duration: null != i ? i : 5e3 };
            return (t((e) => [...e, a]), l);
          }, []),
          i = (0, r.useCallback)((e) => {
            t((t) => t.filter((t) => t.id !== e));
          }, []),
          l = (0, r.useCallback)((e, t, r) => n('success', e, t, r), [n]);
        return {
          toasts: e,
          success: l,
          error: (0, r.useCallback)((e, t, r) => n('error', e, t, r), [n]),
          info: (0, r.useCallback)((e, t, r) => n('info', e, t, r), [n]),
          warning: (0, r.useCallback)((e, t, r) => n('warning', e, t, r), [n]),
          removeToast: i,
        };
      }
    },
    2389: function (e, t, n) {
      'use strict';
      n.d(t, {
        Z: function () {
          return s;
        },
      });
      var r = n(7653);
      let o = (e) => e.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase(),
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
      let a = (0, r.forwardRef)((e, t) => {
          let {
            color: n = 'currentColor',
            size: o = 24,
            strokeWidth: a = 2,
            absoluteStrokeWidth: s,
            className: c = '',
            children: u,
            iconNode: d,
            ...f
          } = e;
          return (0, r.createElement)(
            'svg',
            {
              ref: t,
              ...l,
              width: o,
              height: o,
              stroke: n,
              strokeWidth: s ? (24 * Number(a)) / Number(o) : a,
              className: i('lucide', c),
              ...f,
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
        s = (e, t) => {
          let n = (0, r.forwardRef)((n, l) => {
            let { className: s, ...c } = n;
            return (0, r.createElement)(a, {
              ref: l,
              iconNode: t,
              className: i('lucide-'.concat(o(e)), s),
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
    54: function (e, t, n) {
      'use strict';
      n.d(t, {
        Z: function () {
          return r;
        },
      });
      let r = (0, n(2389).Z)('TriangleAlert', [
        [
          'path',
          {
            d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3',
            key: 'wmoenq',
          },
        ],
        ['path', { d: 'M12 9v4', key: 'juzpu7' }],
        ['path', { d: 'M12 17h.01', key: 'p32p05' }],
      ]);
    },
    2625: function () {},
    8514: function (e) {
      e.exports = {
        style: { fontFamily: "'__Inter_f367f3', '__Inter_Fallback_f367f3'", fontStyle: 'normal' },
        className: '__className_f367f3',
      };
    },
    9289: function (e, t, n) {
      'use strict';
      n.d(t, {
        j: function () {
          return l;
        },
      });
      var r = n(607);
      let o = (e) => ('boolean' == typeof e ? `${e}` : 0 === e ? '0' : e),
        i = r.W,
        l = (e, t) => (n) => {
          var r;
          if ((null == t ? void 0 : t.variants) == null)
            return i(e, null == n ? void 0 : n.class, null == n ? void 0 : n.className);
          let { variants: l, defaultVariants: a } = t,
            s = Object.keys(l).map((e) => {
              let t = null == n ? void 0 : n[e],
                r = null == a ? void 0 : a[e];
              if (null === t) return null;
              let i = o(t) || o(r);
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
            s,
            null == t
              ? void 0
              : null === (r = t.compoundVariants) || void 0 === r
                ? void 0
                : r.reduce((e, t) => {
                    let { class: n, className: r, ...o } = t;
                    return Object.entries(o).every((e) => {
                      let [t, n] = e;
                      return Array.isArray(n)
                        ? n.includes({ ...a, ...c }[t])
                        : { ...a, ...c }[t] === n;
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
        for (var e, t, n = 0, r = '', o = arguments.length; n < o; n++)
          (e = arguments[n]) &&
            (t = (function e(t) {
              var n,
                r,
                o = '';
              if ('string' == typeof t || 'number' == typeof t) o += t;
              else if ('object' == typeof t) {
                if (Array.isArray(t)) {
                  var i = t.length;
                  for (n = 0; n < i; n++) t[n] && (r = e(t[n])) && (o && (o += ' '), (o += r));
                } else for (r in t) t[r] && (o && (o += ' '), (o += r));
              }
              return o;
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
    (e.O(0, [342, 44, 898, 195, 444, 627, 293, 528, 744], function () {
      return e((e.s = 569));
    }),
      (_N_E = e.O()));
  },
]);
