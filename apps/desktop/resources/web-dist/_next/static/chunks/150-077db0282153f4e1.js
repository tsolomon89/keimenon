'use strict';
(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [150],
  {
    7250: function (e, t, r) {
      r.d(t, {
        B: function () {
          return o;
        },
        OperatingProvider: function () {
          return i;
        },
      });
      var l = r(7573),
        a = r(7653),
        s = r(4175);
      let n = (0, a.createContext)(void 0);
      function i(e) {
        let { children: t } = e,
          { user: r } = (0, s.aC)(),
          [i, o] = (0, a.useState)({
            mode: 'native',
            accountId: (null == r ? void 0 : r.accountId) || '',
          }),
          [d, c] = (0, a.useState)(0),
          u = (0, a.useCallback)(
            (e, t, l) => {
              if (!r) {
                console.error('Cannot switch account: not authenticated');
                return;
              }
              if ('admin' !== r.accountType) {
                console.error('Cannot switch account: user is not admin');
                return;
              }
              ('nested' !== t ||
                (null == l ? void 0 : l.serviceMode) ||
                console.warn('Nested mode requires service mode enabled on target account'),
                console.log('Switching to operating mode:', {
                  mode: t,
                  accountId: e,
                  accountName: null == l ? void 0 : l.accountName,
                }),
                o({
                  mode: t,
                  accountId: e,
                  accountType: null == l ? void 0 : l.accountType,
                  accountName: null == l ? void 0 : l.accountName,
                  serviceMode: null == l ? void 0 : l.serviceMode,
                  parentAccountId: null == l ? void 0 : l.parentAccountId,
                }),
                c((e) => e + 1),
                (window.__operatingAccount = e),
                (window.__operatingMode = t));
            },
            [r]
          ),
          m = (0, a.useCallback)(() => {
            r &&
              (console.log('Exiting operating mode, returning to native'),
              o({ mode: 'native', accountId: r.accountId }),
              c((e) => e + 1),
              delete window.__operatingAccount,
              delete window.__operatingMode);
          }, [r]),
          x = (0, a.useCallback)(() => {
            let e = {};
            return (
              'native' !== i.mode &&
                i.accountId !== (null == r ? void 0 : r.accountId) &&
                ((e['X-Operating-Account'] = i.accountId), (e['X-Operating-Mode'] = i.mode)),
              e
            );
          }, [i, r]),
          h = 'native' !== i.mode && i.accountId !== (null == r ? void 0 : r.accountId);
        return (0, l.jsx)(n.Provider, {
          value: {
            operating: i,
            switchAccount: u,
            exitOperatingMode: m,
            getOperatingHeaders: x,
            isOperatingMode: h,
            operatingContextVersion: d,
          },
          children: t,
        });
      }
      function o() {
        let e = (0, a.useContext)(n);
        if (void 0 === e) throw Error('useOperating must be used within an OperatingProvider');
        return e;
      }
    },
    6326: function (e, t, r) {
      r.d(t, {
        ShellProvider: function () {
          return i;
        },
        St: function () {
          return o;
        },
      });
      var l = r(7573),
        a = r(7653),
        s = r(4175);
      let n = (0, a.createContext)(void 0);
      function i(e) {
        let { children: t } = e,
          { user: r } = (0, s.aC)(),
          [i, o] = (0, a.useState)(
            (null == r ? void 0 : r.accountType) === 'admin' ? 'admin' : 'client'
          ),
          [d, c] = (0, a.useState)('keimenon'),
          u = (0, a.useRef)(null);
        (0, a.useEffect)(() => {
          if (!r) {
            ((u.current = null), o('client'), c('keimenon'));
            return;
          }
          let e = ''.concat(r.accountId, ':').concat(r.accountType);
          if (u.current !== e) {
            let t = 'admin' === r.accountType ? 'admin' : 'client',
              l = 'admin' === r.accountType ? 'dashboard' : 'keimenon';
            (o(t),
              c(l),
              (u.current = e),
              console.log('Shell locked to account type:', {
                shellMode: t,
                accountType: r.accountType,
              }));
            return;
          }
        }, [r, d]);
        let m = (0, a.useCallback)(() => !0, [r]),
          x = (0, a.useCallback)(() => (null == r ? void 0 : r.accountType) === 'admin', [r]),
          h = (0, a.useCallback)(
            (e) => {
              console.warn(
                'setShellMode() called but ShellMode is locked to account type.',
                'ShellMode cannot be manually changed. Ignoring request.',
                { requestedMode: e, currentMode: i }
              );
            },
            [i]
          ),
          p = (0, a.useCallback)(
            (e) => {
              (c(e), console.log('Keimenon mode changed:', e));
            },
            [null == r ? void 0 : r.accountType]
          );
        return (0, l.jsx)(n.Provider, {
          value: {
            shellMode: i,
            keimenonMode: d,
            setShellMode: h,
            setKeimenonMode: p,
            canAccessPortal: m,
            isAdminShell: x,
          },
          children: t,
        });
      }
      function o() {
        let e = (0, a.useContext)(n);
        if (void 0 === e) throw Error('useShell must be used within a ShellProvider');
        return e;
      }
    },
    7833: function (e, t, r) {
      r.d(t, {
        O: function () {
          return i;
        },
        UIVersionProvider: function () {
          return n;
        },
      });
      var l = r(7573),
        a = r(7653);
      let s = (0, a.createContext)(void 0);
      function n(e) {
        let { children: t } = e,
          [r, n] = (0, a.useState)('legacy'),
          i = (0, a.useCallback)((e) => {
            (n(e), console.log('UI version changed:', e));
          }, []),
          o = (0, a.useCallback)(() => {
            n((e) => {
              let t = 'legacy' === e ? 'primitives' : 'legacy';
              return (console.log('UI version toggled:', e, '→', t), t);
            });
          }, []),
          d = (0, a.useCallback)(() => 'primitives' === r, [r]),
          c = (0, a.useCallback)(() => 'legacy' === r, [r]);
        return (0, l.jsx)(s.Provider, {
          value: {
            uiVersion: r,
            setUIVersion: i,
            toggleUIVersion: o,
            isPrimitivesMode: d,
            isLegacyMode: c,
          },
          children: t,
        });
      }
      function i() {
        let e = (0, a.useContext)(s);
        if (void 0 === e) throw Error('useUIVersion must be used within a UIVersionProvider');
        return e;
      }
    },
    5955: function (e, t, r) {
      r.d(t, {
        p: function () {
          return s;
        },
      });
      var l = r(7653);
      let a = 0;
      function s() {
        let [e, t] = (0, l.useState)([]),
          r = (0, l.useCallback)((e, r, l, s) => {
            let n = 'toast-'.concat(++a),
              i = { id: n, type: e, message: r, description: l, duration: null != s ? s : 5e3 };
            return (t((e) => [...e, i]), n);
          }, []),
          s = (0, l.useCallback)((e) => {
            t((t) => t.filter((t) => t.id !== e));
          }, []),
          n = (0, l.useCallback)((e, t, l) => r('success', e, t, l), [r]);
        return {
          toasts: e,
          success: n,
          error: (0, l.useCallback)((e, t, l) => r('error', e, t, l), [r]),
          info: (0, l.useCallback)((e, t, l) => r('info', e, t, l), [r]),
          warning: (0, l.useCallback)((e, t, l) => r('warning', e, t, l), [r]),
          removeToast: s,
        };
      }
    },
    1919: function (e, t, r) {
      r.d(t, {
        $Q: function () {
          return P;
        },
        zx: function () {
          return d;
        },
        aV: function () {
          return I;
        },
        i4: function () {
          return D;
        },
        xv: function () {
          return p;
        },
        n9: function () {
          return L;
        },
        Ix: function () {
          return v;
        },
        AE: function () {
          return V;
        },
        cn: function () {
          return i;
        },
      });
      var l = r(7573),
        a = r(7653),
        s = r(9289),
        n = r(607);
      function i() {
        for (var e = arguments.length, t = Array(e), r = 0; r < e; r++) t[r] = arguments[r];
        return (0, n.W)(t);
      }
      let o = (0, s.j)(
          'inline-flex items-center justify-center rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
          {
            variants: {
              variant: {
                default: 'bg-purple-600 text-white hover:bg-purple-700',
                secondary: 'bg-slate-700 text-white hover:bg-slate-600',
                outline: 'border border-slate-600 bg-transparent hover:bg-slate-800',
                ghost: 'hover:bg-slate-800 hover:text-white',
                danger: 'bg-red-600 text-white hover:bg-red-700',
                warning: 'bg-yellow-600 text-white hover:bg-yellow-700',
              },
              size: {
                default: 'h-10 px-4 py-2',
                sm: 'h-8 px-3 text-sm',
                lg: 'h-12 px-6',
                icon: 'h-10 w-10',
              },
            },
            defaultVariants: { variant: 'default', size: 'default' },
          }
        ),
        d = a.forwardRef((e, t) => {
          let { className: r, variant: a, size: s, as: n, ...d } = e;
          return (0, l.jsx)(n || 'button', {
            className: i(o({ variant: a, size: s, className: r })),
            ref: t,
            ...d,
          });
        });
      ((d.displayName = 'Button'),
        (a.forwardRef((e, t) => {
          let { className: r, as: a, ...s } = e;
          return (0, l.jsx)(a || 'div', {
            ref: t,
            className: i(
              'rounded-lg border border-slate-700 bg-slate-900/50 backdrop-blur-sm text-slate-100 shadow-sm',
              r
            ),
            ...s,
          });
        }).displayName = 'Card'),
        (a.forwardRef((e, t) => {
          let { className: r, as: a, ...s } = e;
          return (0, l.jsx)(a || 'div', {
            ref: t,
            className: i('flex flex-col space-y-1.5 p-6', r),
            ...s,
          });
        }).displayName = 'CardHeader'),
        (a.forwardRef((e, t) => {
          let { className: r, as: a, ...s } = e;
          return (0, l.jsx)(a || 'h3', {
            ref: t,
            className: i('text-lg font-semibold leading-none tracking-tight', r),
            ...s,
          });
        }).displayName = 'CardTitle'),
        (a.forwardRef((e, t) => {
          let { className: r, as: a, ...s } = e;
          return (0, l.jsx)(a || 'div', { ref: t, className: i('p-6 pt-0', r), ...s });
        }).displayName = 'CardContent'),
        (a.forwardRef((e, t) => {
          let { className: r, as: a, ...s } = e;
          return (0, l.jsx)(a || 'div', {
            ref: t,
            className: i('flex items-center p-6 pt-0', r),
            ...s,
          });
        }).displayName = 'CardFooter'));
      let c = (0, s.j)(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2',
        {
          variants: {
            variant: {
              default: 'border-transparent bg-purple-600 text-white',
              secondary: 'border-transparent bg-slate-700 text-slate-100',
              outline: 'text-slate-100 border-slate-600',
              success: 'border-transparent bg-green-600 text-white',
              warning: 'border-transparent bg-yellow-600 text-white',
              danger: 'border-transparent bg-red-600 text-white',
            },
          },
          defaultVariants: { variant: 'default' },
        }
      );
      a.forwardRef((e, t) => {
        let { className: r, variant: a, as: s, ...n } = e;
        return (0, l.jsx)(s || 'div', { className: i(c({ variant: a }), r), ref: t, ...n });
      }).displayName = 'Badge';
      let u = {
          title: 'text-lg font-semibold',
          subtitle: 'text-sm',
          label: 'text-xs font-semibold uppercase',
          value: 'text-sm',
          hint: 'text-xs',
          badge: 'text-xs font-medium',
        },
        m = {
          normal: 'text-white',
          muted: 'text-slate-400',
          emphasized: 'text-purple-300',
          error: 'text-red-300',
          success: 'text-green-300',
        },
        x = {
          label: { normal: 'text-slate-400', muted: 'text-slate-500' },
          hint: { normal: 'text-slate-400', muted: 'text-slate-500' },
          badge: { normal: 'text-slate-300' },
        },
        h = { title: 'h3', subtitle: 'p', label: 'label', value: 'span', hint: 'p', badge: 'span' },
        p = a.forwardRef((e, t) => {
          var r;
          let {
              role: a,
              children: s,
              surface: n = 'viewer',
              mode: i = 'normal',
              className: o = '',
              as: d,
              ...c
            } = e,
            p = u[a] || '',
            b = (null === (r = x[a]) || void 0 === r ? void 0 : r[i]) || m[i] || m.normal,
            f = ''.concat(p, ' ').concat(b, ' ').concat(o).trim(),
            g = d || h[a] || 'span';
          return (0, l.jsx)(g, { className: f, ref: t, ...c, children: s });
        });
      p.displayName = 'Text';
      let b = a.forwardRef((e, t) => {
        let {
          id: r,
          type: s,
          message: n,
          description: i,
          duration: o = 5e3,
          onClose: c,
          className: u = '',
          as: m,
          ...x
        } = e;
        a.useEffect(() => {
          if (o > 0) {
            let e = setTimeout(() => {
              c(r);
            }, o);
            return () => clearTimeout(e);
          }
        }, [r, o, c]);
        let h = {
            success: (0, l.jsx)('svg', {
              className: 'w-5 h-5',
              fill: 'currentColor',
              viewBox: '0 0 20 20',
              children: (0, l.jsx)('path', {
                fillRule: 'evenodd',
                d: 'M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z',
                clipRule: 'evenodd',
              }),
            }),
            error: (0, l.jsx)('svg', {
              className: 'w-5 h-5',
              fill: 'currentColor',
              viewBox: '0 0 20 20',
              children: (0, l.jsx)('path', {
                fillRule: 'evenodd',
                d: 'M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z',
                clipRule: 'evenodd',
              }),
            }),
            info: (0, l.jsx)('svg', {
              className: 'w-5 h-5',
              fill: 'currentColor',
              viewBox: '0 0 20 20',
              children: (0, l.jsx)('path', {
                fillRule: 'evenodd',
                d: 'M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z',
                clipRule: 'evenodd',
              }),
            }),
            warning: (0, l.jsx)('svg', {
              className: 'w-5 h-5',
              fill: 'currentColor',
              viewBox: '0 0 20 20',
              children: (0, l.jsx)('path', {
                fillRule: 'evenodd',
                d: 'M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z',
                clipRule: 'evenodd',
              }),
            }),
          },
          b = {
            success: 'bg-green-500 text-white',
            error: 'bg-red-500 text-white',
            info: 'bg-blue-500 text-white',
            warning: 'bg-yellow-500 text-white',
          };
        return (0, l.jsxs)(m || 'div', {
          ref: t,
          className: '\n          '
            .concat(
              b[s] || b.info,
              '\n          max-w-sm w-full shadow-lg rounded-lg pointer-events-auto\n          ring-1 ring-black ring-opacity-5 overflow-hidden\n          animate-slide-in-right '
            )
            .concat(u, '\n        ')
            .trim(),
          ...x,
          children: [
            (0, l.jsx)('div', {
              className: 'p-4',
              children: (0, l.jsxs)('div', {
                className: 'flex items-start',
                children: [
                  (0, l.jsx)('div', { className: 'flex-shrink-0', children: h[s] || h.info }),
                  (0, l.jsxs)('div', {
                    className: 'ml-3 w-0 flex-1 pt-0.5',
                    children: [
                      (0, l.jsx)(p, {
                        role: 'value',
                        className: 'font-medium text-white',
                        children: n,
                      }),
                      i &&
                        (0, l.jsx)(p, {
                          role: 'hint',
                          className: 'mt-1 opacity-90 text-white',
                          children: i,
                        }),
                    ],
                  }),
                  (0, l.jsx)('div', {
                    className: 'ml-4 flex-shrink-0 flex',
                    children: (0, l.jsxs)(d, {
                      variant: 'ghost',
                      size: 'sm',
                      onClick: () => c(r),
                      className: 'h-6 w-6 p-0 text-white hover:bg-black/20',
                      children: [
                        (0, l.jsx)('span', { className: 'sr-only', children: 'Close' }),
                        (0, l.jsx)('svg', {
                          className: 'h-5 w-5',
                          viewBox: '0 0 20 20',
                          fill: 'currentColor',
                          children: (0, l.jsx)('path', {
                            fillRule: 'evenodd',
                            d: 'M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z',
                            clipRule: 'evenodd',
                          }),
                        }),
                      ],
                    }),
                  }),
                ],
              }),
            }),
            o > 0 &&
              (0, l.jsx)('div', {
                className: 'h-1 bg-black bg-opacity-20',
                children: (0, l.jsx)('div', {
                  className: 'h-full bg-white bg-opacity-40 animate-progress-bar',
                  style: { animationDuration: ''.concat(o, 'ms') },
                }),
              }),
          ],
        });
      });
      b.displayName = 'Toast';
      let f = a.forwardRef((e, t) => {
        let { size: r = 'md', className: a = '', as: s, ...n } = e,
          i = { sm: 'w-4 h-4 border-2', md: 'w-8 h-8 border-3', lg: 'w-12 h-12 border-4' };
        return (0, l.jsx)(s || 'div', {
          ref: t,
          className: '\n          '
            .concat(
              i[r] || i.md,
              '\n          border-purple-600 border-t-transparent\n          rounded-full animate-spin '
            )
            .concat(a, '\n        ')
            .trim(),
          ...n,
        });
      });
      f.displayName = 'SpinnerLoader';
      let g = a.forwardRef((e, t) => {
        let { progress: r, className: a = '', as: s, ...n } = e;
        return (0, l.jsx)(s || 'div', {
          className: 'w-full bg-slate-800 rounded-full h-2 overflow-hidden '.concat(a).trim(),
          ref: t,
          ...n,
          children: (0, l.jsx)('div', {
            className: 'h-full bg-purple-600 transition-all duration-300 ease-out',
            style: { width: ''.concat(Math.min(100, Math.max(0, r)), '%') },
          }),
        });
      });
      function v(e) {
        let { toasts: t, onClose: r } = e;
        return (0, l.jsx)('div', {
          'aria-live': 'assertive',
          className:
            'fixed inset-0 flex items-end px-4 py-6 pointer-events-none sm:p-6 sm:items-start z-50',
          children: (0, l.jsx)('div', {
            className: 'w-full flex flex-col items-end space-y-4 sm:items-end',
            children: t.map((e) => (0, l.jsx)(b, { ...e, onClose: r }, e.id)),
          }),
        });
      }
      ((g.displayName = 'ProgressBar'),
        (a.forwardRef((e, t) => {
          let { className: r = '', as: a, ...s } = e;
          return (0, l.jsx)(a || 'div', {
            className: 'animate-pulse bg-slate-800 rounded '.concat(r).trim(),
            ref: t,
            ...s,
            children: (0, l.jsx)('div', {
              className:
                'h-full w-full bg-gradient-to-r from-transparent via-slate-700 to-transparent animate-shimmer',
            }),
          });
        }).displayName = 'SkeletonLoader'),
        (a.forwardRef((e, t) => {
          let { className: r = '', as: a, ...s } = e;
          return (0, l.jsxs)(a || 'div', {
            className: 'flex items-center space-x-1 '.concat(r).trim(),
            ref: t,
            ...s,
            children: [
              (0, l.jsx)('div', { className: 'w-2 h-2 bg-purple-600 rounded-full animate-pulse' }),
              (0, l.jsx)('div', {
                className: 'w-2 h-2 bg-purple-600 rounded-full animate-pulse delay-75',
              }),
              (0, l.jsx)('div', {
                className: 'w-2 h-2 bg-purple-600 rounded-full animate-pulse delay-150',
              }),
            ],
          });
        }).displayName = 'PulsingDot'),
        (a.forwardRef((e, t) => {
          let { message: r, progress: a, showProgress: s, className: n = '', as: i, ...o } = e;
          return (0, l.jsx)(i || 'div', {
            className:
              'absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 '
                .concat(n)
                .trim(),
            ref: t,
            ...o,
            children: (0, l.jsxs)('div', {
              className: 'text-center space-y-4 max-w-sm w-full px-4',
              children: [
                (0, l.jsx)(f, { size: 'lg', className: 'mx-auto' }),
                r && (0, l.jsx)('p', { className: 'text-sm font-medium text-white', children: r }),
                s &&
                  void 0 !== a &&
                  (0, l.jsxs)('div', {
                    className: 'space-y-1',
                    children: [
                      (0, l.jsx)(g, { progress: a }),
                      (0, l.jsxs)('p', {
                        className: 'text-xs text-slate-400',
                        children: [Math.round(a), '%'],
                      }),
                    ],
                  }),
              ],
            }),
          });
        }).displayName = 'LoadingOverlay'));
      let j = a.forwardRef((e, t) => {
        let {
            label: r,
            hint: a,
            error: s,
            disabled: n,
            mode: i = 'edit',
            as: o,
            type: d,
            value: c,
            onChange: u,
            placeholder: m,
            pattern: x,
            min: h,
            max: b,
            step: f,
            unit: g,
            options: v,
            allowCustom: j,
            className: M,
            ...z
          } = e,
          I = o || 'div',
          T = {
            label: r,
            hint: a,
            error: s,
            disabled: n,
            mode: i,
            type: d,
            value: c,
            onChange: u,
            placeholder: m,
            pattern: x,
            min: h,
            max: b,
            step: f,
            unit: g,
            options: v,
            allowCustom: j,
          };
        return 'read' === i
          ? (0, l.jsxs)(I, {
              className: 'space-y-1 '.concat(M || '').trim(),
              ref: t,
              ...z,
              children: [
                r && (0, l.jsx)(p, { role: 'label', children: r }),
                (0, l.jsx)('div', {
                  className: 'text-sm text-white',
                  children: (function (e) {
                    let { type: t, value: r, unit: a } = e;
                    if (null == r)
                      return (0, l.jsx)('span', {
                        className: 'text-slate-500 italic',
                        children: 'Not set',
                      });
                    switch (t) {
                      case 'boolean':
                        return r ? 'Enabled' : 'Disabled';
                      case 'color':
                        return (0, l.jsxs)('div', {
                          className: 'flex items-center space-x-2',
                          children: [
                            (0, l.jsx)('div', {
                              className: 'w-4 h-4 rounded border border-slate-600',
                              style: { backgroundColor: r },
                            }),
                            (0, l.jsx)('span', { children: r }),
                          ],
                        });
                      case 'multiselect':
                        return Array.isArray(r) ? r.join(', ') : String(r);
                      case 'json':
                        return (0, l.jsx)('pre', {
                          className: 'font-mono text-xs bg-slate-900 p-2 rounded',
                          children: JSON.stringify(r, null, 2),
                        });
                      default:
                        return ''.concat(r).concat(a ? ' '.concat(a) : '');
                    }
                  })(T),
                }),
                a && (0, l.jsx)(p, { role: 'hint', mode: 'muted', children: a }),
              ],
            })
          : (0, l.jsxs)(I, {
              className: 'space-y-2 '.concat(M || '').trim(),
              ref: t,
              ...z,
              children: [
                r && (0, l.jsx)(p, { role: 'label', children: r }),
                (function (e) {
                  let { type: t, ...r } = e;
                  switch (t) {
                    case 'boolean':
                      return (0, l.jsx)(N, { ...r });
                    case 'string':
                      return (0, l.jsx)(w, { ...r });
                    case 'number':
                      return (0, l.jsx)(y, { ...r });
                    case 'select':
                      return (0, l.jsx)(C, { ...r });
                    case 'multiselect':
                      return (0, l.jsx)(k, { ...r });
                    case 'color':
                      return (0, l.jsx)(S, { ...r });
                    case 'slider':
                      return (0, l.jsx)(R, { ...r });
                    case 'json':
                      return (0, l.jsx)(A, { ...r });
                    default:
                      return null;
                  }
                })(T),
                s && (0, l.jsx)(p, { role: 'hint', mode: 'error', children: s }),
                !s && a && (0, l.jsx)(p, { role: 'hint', mode: 'muted', children: a }),
              ],
            });
      });
      function N(e) {
        let { value: t, onChange: r, disabled: a } = e;
        return (0, l.jsxs)('label', {
          className: 'flex items-center space-x-3 cursor-pointer',
          children: [
            (0, l.jsx)('input', {
              type: 'checkbox',
              checked: t,
              onChange: (e) => (null == r ? void 0 : r(e.target.checked)),
              disabled: a,
              className:
                'w-4 h-4 rounded border-slate-700 bg-slate-900/50 text-purple-600 focus:ring-purple-500 disabled:opacity-50',
            }),
            (0, l.jsx)(p, { role: 'value', children: t ? 'Enabled' : 'Disabled' }),
          ],
        });
      }
      function w(e) {
        let { value: t, onChange: r, placeholder: a, pattern: s, disabled: n } = e;
        return (0, l.jsx)('input', {
          type: 'text',
          value: t || '',
          onChange: (e) => (null == r ? void 0 : r(e.target.value)),
          placeholder: a,
          pattern: s,
          disabled: n,
          className:
            'w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50',
        });
      }
      function y(e) {
        let { value: t, onChange: r, min: a, max: s, step: n, placeholder: i, disabled: o } = e;
        return (0, l.jsx)('input', {
          type: 'number',
          value: null != t ? t : '',
          onChange: (e) =>
            null == r ? void 0 : r('' === e.target.value ? void 0 : Number(e.target.value)),
          min: a,
          max: s,
          step: n,
          placeholder: i,
          disabled: o,
          className:
            'w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50',
        });
      }
      function C(e) {
        let { value: t, onChange: r, options: a = [], disabled: s } = e;
        return (0, l.jsx)('select', {
          value: t,
          onChange: (e) => (null == r ? void 0 : r(e.target.value)),
          disabled: s,
          className:
            'w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50',
          children: a.map((e) =>
            (0, l.jsx)(
              'option',
              { value: e.value, className: 'bg-slate-900', children: e.label },
              e.value
            )
          ),
        });
      }
      function k(e) {
        let { value: t = [], onChange: r, options: a = [], disabled: s } = e,
          n = (e) => {
            let l = Array.isArray(t) ? t : [],
              a = l.includes(e) ? l.filter((t) => t !== e) : [...l, e];
            null == r || r(a);
          };
        return (0, l.jsx)('div', {
          className: 'space-y-2',
          children: a.map((e) =>
            (0, l.jsxs)(
              'label',
              {
                className: 'flex items-center space-x-2 cursor-pointer',
                children: [
                  (0, l.jsx)('input', {
                    type: 'checkbox',
                    checked: Array.isArray(t) && t.includes(e.value),
                    onChange: () => n(e.value),
                    disabled: s,
                    className:
                      'w-4 h-4 rounded border-slate-700 bg-slate-900/50 text-purple-600 focus:ring-purple-500 disabled:opacity-50',
                  }),
                  (0, l.jsx)('span', { className: 'text-sm text-slate-300', children: e.label }),
                ],
              },
              e.value
            )
          ),
        });
      }
      function S(e) {
        let { value: t, onChange: r, disabled: a } = e;
        return (0, l.jsxs)('div', {
          className: 'flex items-center space-x-3',
          children: [
            (0, l.jsx)('input', {
              type: 'color',
              value: t || '#000000',
              onChange: (e) => (null == r ? void 0 : r(e.target.value)),
              disabled: a,
              className:
                'w-10 h-10 rounded border border-slate-700 bg-slate-900/50 cursor-pointer disabled:opacity-50',
            }),
            (0, l.jsx)('input', {
              type: 'text',
              value: t || '',
              onChange: (e) => (null == r ? void 0 : r(e.target.value)),
              placeholder: '#000000',
              disabled: a,
              className:
                'w-32 px-3 py-2 bg-slate-900/50 border border-slate-700 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50',
            }),
          ],
        });
      }
      function R(e) {
        let {
          value: t,
          onChange: r,
          min: a = 0,
          max: s = 100,
          step: n = 1,
          unit: i,
          disabled: o,
        } = e;
        return (0, l.jsxs)('div', {
          className: 'space-y-2',
          children: [
            (0, l.jsxs)('div', {
              className: 'flex justify-between items-center text-xs',
              children: [
                (0, l.jsxs)(p, { role: 'value', mode: 'muted', children: [t, i] }),
                (0, l.jsxs)(p, { role: 'hint', children: [a, i, ' - ', s, i] }),
              ],
            }),
            (0, l.jsx)('input', {
              type: 'range',
              value: t,
              onChange: (e) => (null == r ? void 0 : r(Number(e.target.value))),
              disabled: o,
              min: a,
              max: s,
              step: n,
              className:
                'w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50',
              style: { accentColor: 'rgb(147, 51, 234)' },
            }),
          ],
        });
      }
      function A(e) {
        let { value: t, onChange: r, disabled: s } = e,
          [n, i] = a.useState(JSON.stringify(t, null, 2)),
          [o, d] = a.useState(null),
          c = (e) => {
            i(e);
            try {
              let t = JSON.parse(e);
              (d(null), null == r || r(t));
            } catch (e) {
              d(e.message);
            }
          };
        return (0, l.jsxs)('div', {
          className: 'space-y-2',
          children: [
            (0, l.jsx)('textarea', {
              value: n,
              onChange: (e) => c(e.target.value),
              disabled: s,
              rows: 6,
              className:
                'w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50',
            }),
            o && (0, l.jsxs)(p, { role: 'hint', mode: 'error', children: ['Invalid JSON: ', o] }),
          ],
        });
      }
      j.displayName = 'Field';
      let M = {
          vertical: 'flex flex-col',
          'grid-2': 'grid grid-cols-1 md:grid-cols-2',
          'grid-3': 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
          'grid-4': 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
        },
        z = { sm: 'gap-2', md: 'gap-4', lg: 'gap-6' },
        I = a.forwardRef((e, t) => {
          let {
            items: r,
            renderItem: a,
            layout: s = 'vertical',
            emptyState: n,
            loading: o = !1,
            loadingMessage: c = 'Loading...',
            gap: u = 'md',
            className: m = '',
            keyExtractor: x,
            as: h,
            ...b
          } = e;
          if (o)
            return (0, l.jsx)('div', {
              className: 'p-8 text-center',
              children: (0, l.jsx)(p, { role: 'hint', mode: 'muted', children: c }),
            });
          if (!r || 0 === r.length)
            return n
              ? (0, l.jsxs)('div', {
                  className: 'p-8 text-center border border-dashed border-slate-800 rounded-lg',
                  children: [
                    n.icon &&
                      (0, l.jsx)('div', {
                        className: 'mb-2 flex justify-center',
                        children: n.icon,
                      }),
                    (0, l.jsx)(p, {
                      role: 'hint',
                      mode: 'muted',
                      className: 'mb-4',
                      children: n.message,
                    }),
                    n.action &&
                      (0, l.jsx)(d, {
                        size: 'sm',
                        variant: 'default',
                        onClick: n.action.onClick,
                        children: n.action.label,
                      }),
                  ],
                })
              : null;
          let f = M[s] || M.vertical,
            g = z[u] || z.md;
          return (0, l.jsx)(h || 'div', {
            className: i(f, g, m),
            ref: t,
            ...b,
            children: r.map((e, t) => {
              let r = x ? x(e, t) : t;
              return (0, l.jsx)('div', { children: a(e, t) }, r);
            }),
          });
        });
      I.displayName = 'List';
      let T = {
          purple: {
            bg: 'bg-purple-600/10',
            border: 'border-purple-500/30',
            icon: 'text-purple-400',
            text: 'text-purple-300',
          },
          green: {
            bg: 'bg-green-600/10',
            border: 'border-green-500/30',
            icon: 'text-green-400',
            text: 'text-green-300',
          },
          orange: {
            bg: 'bg-orange-600/10',
            border: 'border-orange-500/30',
            icon: 'text-orange-400',
            text: 'text-orange-300',
          },
          blue: {
            bg: 'bg-blue-600/10',
            border: 'border-blue-500/30',
            icon: 'text-blue-400',
            text: 'text-blue-300',
          },
          slate: {
            bg: 'bg-slate-600/10',
            border: 'border-slate-500/30',
            icon: 'text-slate-400',
            text: 'text-slate-300',
          },
        },
        L = a.forwardRef((e, t) => {
          let {
              title: r,
              subtitle: a,
              icon: s,
              iconColor: n = 'slate',
              badges: o = [],
              selected: d = !1,
              onClick: c,
              onDoubleClick: u,
              className: m = '',
              as: x,
              ...h
            } = e,
            b = T[n] || T.slate,
            f = i(
              'p-4 rounded-lg border backdrop-blur-sm cursor-pointer transition-all duration-200',
              b.bg,
              b.border,
              d
                ? 'ring-2 ring-purple-500 shadow-lg shadow-purple-500/20'
                : 'hover:shadow-md hover:border-opacity-60',
              m
            );
          return (0, l.jsxs)(x || 'div', {
            className: f,
            onClick: c,
            onDoubleClick: u,
            ref: t,
            ...h,
            children: [
              (0, l.jsx)('div', {
                className: 'flex items-start justify-between mb-3',
                children:
                  s &&
                  (0, l.jsx)('div', {
                    className: 'p-2 '.concat(b.bg, ' rounded-lg ').concat(b.icon),
                    children: (0, l.jsx)(s, { className: 'w-5 h-5' }),
                  }),
              }),
              (0, l.jsx)(p, { role: 'title', className: 'text-sm mb-1 line-clamp-2', children: r }),
              a &&
                (0, l.jsx)(p, {
                  role: 'subtitle',
                  mode: 'muted',
                  className: 'line-clamp-1',
                  children: a,
                }),
              o.length > 0 &&
                (0, l.jsx)('div', {
                  className: 'flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-700/50',
                  children: o.slice(0, 3).map((e, t) => {
                    let r = e.color ? T[e.color] : T.slate;
                    return (0, l.jsx)(
                      'span',
                      {
                        className: 'px-2 py-1 '.concat(r.bg, ' rounded text-xs ').concat(r.text),
                        children: e.label,
                      },
                      t
                    );
                  }),
                }),
              d &&
                (0, l.jsx)('div', {
                  className:
                    'absolute top-2 right-2 w-2 h-2 bg-purple-500 rounded-full animate-pulse',
                }),
            ],
          });
        });
      L.displayName = 'Tile';
      var E = r(8410),
        _ = r(2966);
      let O = {
          left: { container: 'flex-shrink-0', border: 'border-r border-slate-800' },
          right: { container: 'flex-shrink-0', border: 'border-l border-slate-800' },
          top: { container: '', border: 'border-b border-slate-800' },
          bottom: { container: '', border: 'border-t border-slate-800' },
        },
        P = a.forwardRef((e, t) => {
          let {
              mode: r,
              position: s = 'navigation' === r ? 'left' : 'inspector' === r ? 'right' : 'top',
              title: n,
              children: o,
              defaultCollapsed: d = !1,
              collapsible: c = !0,
              width: u = 'toolbar' === r ? 'auto' : '320px',
              className: m = '',
              headerActions: x,
              as: h,
              ...b
            } = e,
            [f, g] = (0, a.useState)(d),
            v = h || 'aside',
            { container: j, border: N } = O[s];
          return 'toolbar' === r
            ? (0, l.jsxs)(v, {
                className: i('flex items-center gap-2 px-4 py-2 bg-slate-950/50', N, m),
                ref: t,
                ...b,
                children: [
                  n && (0, l.jsx)(p, { role: 'label', className: 'mr-2', children: n }),
                  (0, l.jsx)('div', { className: 'flex items-center gap-2 flex-1', children: o }),
                  x,
                ],
              })
            : (0, l.jsxs)(v, {
                className: i(
                  'bg-slate-950/50 transition-all duration-300 overflow-hidden',
                  j,
                  N,
                  m
                ),
                style: { width: f ? '0px' : u },
                ref: t,
                ...b,
                children: [
                  !f &&
                    (0, l.jsxs)(l.Fragment, {
                      children: [
                        (n || x || c) &&
                          (0, l.jsxs)('div', {
                            className:
                              'flex items-center justify-between px-4 py-3 border-b border-slate-800',
                            children: [
                              n &&
                                (0, l.jsx)(p, {
                                  role: 'title',
                                  className: 'text-base',
                                  children: n,
                                }),
                              (0, l.jsxs)('div', {
                                className: 'flex items-center gap-2',
                                children: [
                                  x,
                                  c &&
                                    (0, l.jsx)('button', {
                                      onClick: () => g(!0),
                                      className: 'p-1 hover:bg-slate-800 rounded transition-colors',
                                      title: 'Collapse sidebar',
                                      children:
                                        'left' === s
                                          ? (0, l.jsx)(E.Z, { className: 'w-4 h-4 text-slate-400' })
                                          : (0, l.jsx)(_.Z, {
                                              className: 'w-4 h-4 text-slate-400',
                                            }),
                                    }),
                                ],
                              }),
                            ],
                          }),
                        (0, l.jsx)('div', { className: 'h-full overflow-y-auto', children: o }),
                      ],
                    }),
                  f &&
                    c &&
                    (0, l.jsx)('button', {
                      onClick: () => g(!1),
                      className:
                        'absolute top-1/2 -translate-y-1/2 p-2 bg-slate-800 hover:bg-slate-700 rounded transition-colors',
                      style: { ['left' === s ? 'right' : 'left']: '-12px' },
                      title: 'Expand sidebar',
                      children:
                        'left' === s
                          ? (0, l.jsx)(_.Z, { className: 'w-4 h-4 text-slate-400' })
                          : (0, l.jsx)(E.Z, { className: 'w-4 h-4 text-slate-400' }),
                    }),
                ],
              });
        });
      P.displayName = 'Bar';
      let B = {
          default: 'bg-slate-800 border-slate-700',
          subtle: 'bg-slate-800/50 border-slate-700',
          info: 'bg-blue-600/10 border-blue-500/30',
          success: 'bg-green-600/10 border-green-500/30',
          warning: 'bg-yellow-600/10 border-yellow-500/30',
          error: 'bg-red-600/10 border-red-500/30',
        },
        D = a.forwardRef((e, t) => {
          let {
              title: r,
              subtitle: a,
              variant: s = 'default',
              children: n,
              className: o = '',
              onClick: d,
              hoverable: c = !1,
              headerActions: u,
              as: m,
              ...x
            } = e,
            h = i(
              'border rounded-lg p-6',
              B[s] || B.default,
              c || d ? 'hover:border-slate-600 transition-colors cursor-pointer' : '',
              o
            );
          return (0, l.jsxs)(m || 'div', {
            className: h,
            onClick: d,
            ref: t,
            ...x,
            children: [
              (r || a || u) &&
                (0, l.jsxs)('div', {
                  className: 'mb-4',
                  children: [
                    (r || u) &&
                      (0, l.jsxs)('div', {
                        className: 'flex items-start justify-between mb-1',
                        children: [
                          r && (0, l.jsx)(p, { role: 'title', children: r }),
                          u &&
                            (0, l.jsx)('div', {
                              className: 'flex items-center gap-2',
                              children: u,
                            }),
                        ],
                      }),
                    a && (0, l.jsx)(p, { role: 'hint', mode: 'muted', children: a }),
                  ],
                }),
              (0, l.jsx)('div', { children: n }),
            ],
          });
        });
      function V(e) {
        let { mode: t, data: r, loading: a = !1, error: s, className: n = '' } = e;
        return a
          ? (0, l.jsx)('div', {
              className: i('flex-1 flex items-center justify-center p-12', n),
              children: (0, l.jsxs)('div', {
                className: 'text-center',
                children: [
                  (0, l.jsx)('div', {
                    className:
                      'inline-block w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-4',
                  }),
                  (0, l.jsx)(p, { role: 'hint', mode: 'muted', children: 'Loading...' }),
                ],
              }),
            })
          : s
            ? (0, l.jsx)('div', {
                className: i('flex-1 flex items-center justify-center p-12', n),
                children: (0, l.jsxs)(D, {
                  variant: 'error',
                  className: 'max-w-md',
                  children: [
                    (0, l.jsx)(p, { role: 'title', mode: 'error', children: 'Error' }),
                    (0, l.jsx)(p, { role: 'hint', className: 'mt-2', children: s }),
                  ],
                }),
              })
            : r
              ? (0, l.jsx)('div', {
                  className: i('flex-1 overflow-auto', n),
                  children: (0, l.jsx)('div', {
                    className: 'p-6',
                    children: (function (e, t) {
                      switch (e) {
                        case 'keimenon':
                          return (0, l.jsxs)(D, {
                            variant: 'info',
                            className: 'max-w-4xl mx-auto',
                            children: [
                              (0, l.jsx)(p, { role: 'title', children: 'Keimenon View' }),
                              (0, l.jsx)(p, {
                                role: 'hint',
                                mode: 'muted',
                                className: 'mt-2',
                                children: 'Graph keimenon visualization will be integrated here.',
                              }),
                              (0, l.jsx)(p, {
                                role: 'hint',
                                mode: 'muted',
                                className: 'mt-4',
                                children:
                                  'For now, this delegates to the existing KeimenonViewport component.',
                              }),
                            ],
                          });
                        case 'dashboard':
                          return Array.isArray(t)
                            ? (0, l.jsxs)('div', {
                                className: 'max-w-7xl mx-auto space-y-8',
                                children: [
                                  (0, l.jsxs)('div', {
                                    children: [
                                      (0, l.jsx)(p, {
                                        role: 'title',
                                        className: 'text-2xl',
                                        children: 'Dashboard',
                                      }),
                                      (0, l.jsx)(p, {
                                        role: 'hint',
                                        mode: 'muted',
                                        className: 'mt-1',
                                        children: 'System overview and metrics',
                                      }),
                                    ],
                                  }),
                                  (0, l.jsx)(I, {
                                    items: t,
                                    layout: 'grid-3',
                                    gap: 'lg',
                                    renderItem: (e) =>
                                      (0, l.jsx)(D, {
                                        variant: 'default',
                                        children: (0, l.jsxs)('div', {
                                          className: 'space-y-3',
                                          children: [
                                            (0, l.jsx)(p, { role: 'label', children: e.title }),
                                            (0, l.jsx)(p, {
                                              role: 'title',
                                              className: 'text-3xl',
                                              children: e.value,
                                            }),
                                            e.subtitle &&
                                              (0, l.jsx)(p, {
                                                role: 'hint',
                                                mode: 'muted',
                                                children: e.subtitle,
                                              }),
                                          ],
                                        }),
                                      }),
                                  }),
                                ],
                              })
                            : (0, l.jsx)(p, {
                                role: 'hint',
                                mode: 'error',
                                children: 'Dashboard mode expects an array of metrics',
                              });
                        case 'settings':
                          return 'object' != typeof t || Array.isArray(t)
                            ? (0, l.jsx)(p, {
                                role: 'hint',
                                mode: 'error',
                                children: 'Settings mode expects an object',
                              })
                            : (0, l.jsxs)('div', {
                                className: 'max-w-4xl mx-auto space-y-6',
                                children: [
                                  (0, l.jsxs)('div', {
                                    children: [
                                      (0, l.jsx)(p, {
                                        role: 'title',
                                        className: 'text-2xl',
                                        children: 'Settings',
                                      }),
                                      (0, l.jsx)(p, {
                                        role: 'hint',
                                        mode: 'muted',
                                        className: 'mt-1',
                                        children: 'Configure your preferences',
                                      }),
                                    ],
                                  }),
                                  Object.entries(t).map((e) => {
                                    let [t, r] = e;
                                    return (0, l.jsx)(D, { title: t, children: J(r) }, t);
                                  }),
                                ],
                              });
                        case 'detail':
                          return U(t);
                        case 'list':
                          return F(t);
                        default:
                          return Array.isArray(t)
                            ? F(t)
                            : 'object' == typeof t
                              ? U(t)
                              : (0, l.jsx)(p, { role: 'value', children: String(t) });
                      }
                    })(t, r),
                  }),
                })
              : (0, l.jsx)('div', {
                  className: i('flex-1 flex items-center justify-center p-12', n),
                  children: (0, l.jsx)(p, {
                    role: 'hint',
                    mode: 'muted',
                    children: 'No data available',
                  }),
                });
      }
      function U(e) {
        var t;
        let r = e.data || e;
        return (0, l.jsx)('div', {
          className: 'max-w-2xl mx-auto',
          children: (0, l.jsx)(D, {
            title: e.type ? ''.concat(e.type, ' Details') : 'Details',
            headerActions:
              null === (t = e._actions) || void 0 === t
                ? void 0
                : t.map((e) =>
                    (0, l.jsx)(
                      d,
                      { onClick: e.handler, size: 'sm', variant: 'default', children: e.label },
                      e.id
                    )
                  ),
            children: J(r),
          }),
        });
      }
      function F(e) {
        return Array.isArray(e)
          ? (0, l.jsx)('div', {
              className: 'max-w-6xl mx-auto',
              children: (0, l.jsx)(I, {
                items: e,
                renderItem: (e) => (0, l.jsx)(D, { children: J(e) }),
                emptyState: { message: 'No items to display' },
              }),
            })
          : (0, l.jsx)(p, { role: 'hint', mode: 'error', children: 'List mode expects an array' });
      }
      function J(e) {
        return 'object' != typeof e || null === e
          ? (0, l.jsx)(p, { role: 'value', children: String(e) })
          : (0, l.jsx)('div', {
              className: 'space-y-4',
              children: Object.entries(e).map((e) => {
                let [t, r] = e;
                return t.startsWith('_')
                  ? null
                  : 'boolean' == typeof r
                    ? (0, l.jsx)(j, { type: 'boolean', label: t, value: r, mode: 'read' }, t)
                    : 'number' == typeof r
                      ? (0, l.jsx)(j, { type: 'number', label: t, value: r, mode: 'read' }, t)
                      : 'string' == typeof r
                        ? (0, l.jsx)(j, { type: 'string', label: t, value: r, mode: 'read' }, t)
                        : Array.isArray(r)
                          ? (0, l.jsxs)(
                              'div',
                              {
                                children: [
                                  (0, l.jsx)(p, { role: 'label', className: 'mb-2', children: t }),
                                  (0, l.jsx)('div', {
                                    className: 'pl-4',
                                    children:
                                      0 === r.length
                                        ? (0, l.jsx)(p, {
                                            role: 'hint',
                                            mode: 'muted',
                                            children: 'Empty',
                                          })
                                        : (0, l.jsx)(p, { role: 'value', children: r.join(', ') }),
                                  }),
                                ],
                              },
                              t
                            )
                          : 'object' == typeof r
                            ? (0, l.jsxs)(
                                'div',
                                {
                                  children: [
                                    (0, l.jsx)(p, {
                                      role: 'label',
                                      className: 'mb-2',
                                      children: t,
                                    }),
                                    (0, l.jsx)('div', { className: 'pl-4', children: J(r) }),
                                  ],
                                },
                                t
                              )
                            : null;
              }),
            });
      }
      D.displayName = 'PrimitiveCard';
    },
  },
]);
