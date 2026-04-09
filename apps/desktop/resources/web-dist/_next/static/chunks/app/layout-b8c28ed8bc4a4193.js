(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [185],
  {
    569: function (e, r, t) {
      (Promise.resolve().then(t.t.bind(t, 2625, 23)),
        Promise.resolve().then(t.bind(t, 7324)),
        Promise.resolve().then(t.bind(t, 176)),
        Promise.resolve().then(t.bind(t, 521)),
        Promise.resolve().then(t.bind(t, 4175)),
        Promise.resolve().then(t.bind(t, 7250)),
        Promise.resolve().then(t.bind(t, 6326)),
        Promise.resolve().then(t.bind(t, 7833)),
        Promise.resolve().then(t.t.bind(t, 8514, 23)));
    },
    7324: function (e, r, t) {
      'use strict';
      t.d(r, {
        TokenExpirationListener: function () {
          return l;
        },
      });
      var n = t(7573),
        o = t(7653),
        s = t(5955),
        i = t(3627);
      function l() {
        let { toasts: e, error: r, removeToast: t } = (0, s.p)(),
          l = (0, o.useRef)(r);
        return ((l.current = r),
        (0, o.useEffect)(() => {
          function e(e) {
            var r;
            (console.log(
              '\uD83D\uDD14 Token expiration detected, showing notification:',
              (null === (r = e.detail) || void 0 === r ? void 0 : r.reason) ||
                'Your session has expired'
            ),
              l.current(
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
          : (0, n.jsx)(i.Ix, { toasts: e, onClose: t });
      }
    },
    176: function (e, r, t) {
      'use strict';
      t.d(r, {
        ErrorBoundary: function () {
          return l;
        },
      });
      var n = t(7573),
        o = t(7653),
        s = t(54),
        i = t(1482);
      class l extends o.Component {
        static getDerivedStateFromError(e) {
          return { hasError: !0, error: e, errorInfo: null };
        }
        componentDidCatch(e, r) {
          (i.I.capture(
            e,
            {
              domain: 'ui',
              operation: 'react.componentError',
              metadata: { componentStack: r.componentStack, digest: r.digest },
            },
            'error'
          ),
            this.setState({ errorInfo: r }),
            this.props.onError && this.props.onError(e, r));
        }
        render() {
          if (this.state.hasError) {
            var e;
            return this.props.fallback
              ? this.props.fallback
              : (0, n.jsx)('div', {
                  className: 'min-h-screen flex items-center justify-center bg-slate-900 p-6',
                  children: (0, n.jsx)('div', {
                    className: 'max-w-lg w-full',
                    children: (0, n.jsx)('div', {
                      className: 'bg-red-600/10 border border-red-500/30 rounded-xl p-6',
                      children: (0, n.jsxs)('div', {
                        className: 'flex items-start gap-4',
                        children: [
                          (0, n.jsx)('div', {
                            className: 'flex-shrink-0 p-3 bg-red-600/20 rounded-lg',
                            children: (0, n.jsx)(s.Z, { className: 'w-8 h-8 text-red-400' }),
                          }),
                          (0, n.jsxs)('div', {
                            className: 'flex-1',
                            children: [
                              (0, n.jsx)('h2', {
                                className: 'text-xl font-bold text-red-300 mb-2',
                                children: 'Something went wrong',
                              }),
                              (0, n.jsx)('p', {
                                className: 'text-sm text-red-300/80 mb-4',
                                children:
                                  (null === (e = this.state.error) || void 0 === e
                                    ? void 0
                                    : e.message) || 'An unexpected error occurred',
                              }),
                              !1,
                              (0, n.jsxs)('div', {
                                className: 'flex gap-3',
                                children: [
                                  (0, n.jsx)('button', {
                                    onClick: this.handleReset,
                                    className:
                                      'px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors',
                                    children: 'Try Again',
                                  }),
                                  (0, n.jsx)('button', {
                                    onClick: () => window.location.reload(),
                                    className:
                                      'px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors',
                                    children: 'Reload Page',
                                  }),
                                ],
                              }),
                              (0, n.jsx)('p', {
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
    521: function (e, r, t) {
      'use strict';
      t.d(r, {
        SentryProvider: function () {
          return i;
        },
      });
      var n = t(7573),
        o = t(7653),
        s = t(8155);
      function i(e) {
        let { children: r } = e;
        return (
          (0, o.useEffect)(() => {
            (0, s.j6)();
          }, []),
          (0, n.jsx)(n.Fragment, { children: r })
        );
      }
    },
    2389: function (e, r, t) {
      'use strict';
      t.d(r, {
        Z: function () {
          return a;
        },
      });
      var n = t(7653);
      let o = (e) => e.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase(),
        s = function () {
          for (var e = arguments.length, r = Array(e), t = 0; t < e; t++) r[t] = arguments[t];
          return r.filter((e, r, t) => !!e && t.indexOf(e) === r).join(' ');
        };
      var i = {
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
      let l = (0, n.forwardRef)((e, r) => {
          let {
            color: t = 'currentColor',
            size: o = 24,
            strokeWidth: l = 2,
            absoluteStrokeWidth: a,
            className: c = '',
            children: u,
            iconNode: d,
            ...h
          } = e;
          return (0, n.createElement)(
            'svg',
            {
              ref: r,
              ...i,
              width: o,
              height: o,
              stroke: t,
              strokeWidth: a ? (24 * Number(l)) / Number(o) : l,
              className: s('lucide', c),
              ...h,
            },
            [
              ...d.map((e) => {
                let [r, t] = e;
                return (0, n.createElement)(r, t);
              }),
              ...(Array.isArray(u) ? u : [u]),
            ]
          );
        }),
        a = (e, r) => {
          let t = (0, n.forwardRef)((t, i) => {
            let { className: a, ...c } = t;
            return (0, n.createElement)(l, {
              ref: i,
              iconNode: r,
              className: s('lucide-'.concat(o(e)), a),
              ...c,
            });
          });
          return ((t.displayName = ''.concat(e)), t);
        };
    },
    8410: function (e, r, t) {
      'use strict';
      t.d(r, {
        Z: function () {
          return n;
        },
      });
      let n = (0, t(2389).Z)('ChevronLeft', [['path', { d: 'm15 18-6-6 6-6', key: '1wnfg3' }]]);
    },
    2966: function (e, r, t) {
      'use strict';
      t.d(r, {
        Z: function () {
          return n;
        },
      });
      let n = (0, t(2389).Z)('ChevronRight', [['path', { d: 'm9 18 6-6-6-6', key: 'mthhwq' }]]);
    },
    54: function (e, r, t) {
      'use strict';
      t.d(r, {
        Z: function () {
          return n;
        },
      });
      let n = (0, t(2389).Z)('TriangleAlert', [
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
    9289: function (e, r, t) {
      'use strict';
      t.d(r, {
        j: function () {
          return i;
        },
      });
      var n = t(607);
      let o = (e) => ('boolean' == typeof e ? `${e}` : 0 === e ? '0' : e),
        s = n.W,
        i = (e, r) => (t) => {
          var n;
          if ((null == r ? void 0 : r.variants) == null)
            return s(e, null == t ? void 0 : t.class, null == t ? void 0 : t.className);
          let { variants: i, defaultVariants: l } = r,
            a = Object.keys(i).map((e) => {
              let r = null == t ? void 0 : t[e],
                n = null == l ? void 0 : l[e];
              if (null === r) return null;
              let s = o(r) || o(n);
              return i[e][s];
            }),
            c =
              t &&
              Object.entries(t).reduce((e, r) => {
                let [t, n] = r;
                return (void 0 === n || (e[t] = n), e);
              }, {});
          return s(
            e,
            a,
            null == r
              ? void 0
              : null === (n = r.compoundVariants) || void 0 === n
                ? void 0
                : n.reduce((e, r) => {
                    let { class: t, className: n, ...o } = r;
                    return Object.entries(o).every((e) => {
                      let [r, t] = e;
                      return Array.isArray(t)
                        ? t.includes({ ...l, ...c }[r])
                        : { ...l, ...c }[r] === t;
                    })
                      ? [...e, t, n]
                      : e;
                  }, []),
            null == t ? void 0 : t.class,
            null == t ? void 0 : t.className
          );
        };
    },
    607: function (e, r, t) {
      'use strict';
      function n() {
        for (var e, r, t = 0, n = '', o = arguments.length; t < o; t++)
          (e = arguments[t]) &&
            (r = (function e(r) {
              var t,
                n,
                o = '';
              if ('string' == typeof r || 'number' == typeof r) o += r;
              else if ('object' == typeof r) {
                if (Array.isArray(r)) {
                  var s = r.length;
                  for (t = 0; t < s; t++) r[t] && (n = e(r[t])) && (o && (o += ' '), (o += n));
                } else for (n in r) r[n] && (o && (o += ' '), (o += n));
              }
              return o;
            })(e)) &&
            (n && (n += ' '), (n += r));
        return n;
      }
      (t.d(r, {
        W: function () {
          return n;
        },
      }),
        (r.Z = n));
    },
  },
  function (e) {
    (e.O(0, [342, 898, 642, 630, 184, 293, 528, 744], function () {
      return e((e.s = 569));
    }),
      (_N_E = e.O()));
  },
]);
