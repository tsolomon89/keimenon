'use strict';
(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [184],
  {
    7250: function (e, t, l) {
      l.d(t, {
        B: function () {
          return o;
        },
        OperatingProvider: function () {
          return i;
        },
      });
      var r = l(7573),
        n = l(7653),
        a = l(4175);
      let s = (0, n.createContext)(void 0);
      function i(e) {
        let { children: t } = e,
          { user: l } = (0, a.aC)(),
          [i, o] = (0, n.useState)({
            mode: 'native',
            accountId: (null == l ? void 0 : l.accountId) || '',
          }),
          [c, d] = (0, n.useState)(0),
          u = (0, n.useCallback)(
            (e, t, r) => {
              if (!l) {
                console.error('Cannot switch account: not authenticated');
                return;
              }
              if ('admin' !== l.accountType) {
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
                o({
                  mode: t,
                  accountId: e,
                  accountType: null == r ? void 0 : r.accountType,
                  accountName: null == r ? void 0 : r.accountName,
                  serviceMode: null == r ? void 0 : r.serviceMode,
                  parentAccountId: null == r ? void 0 : r.parentAccountId,
                }),
                d((e) => e + 1),
                (window.__operatingAccount = e),
                (window.__operatingMode = t));
            },
            [l]
          ),
          x = (0, n.useCallback)(() => {
            l &&
              (console.log('Exiting operating mode, returning to native'),
              o({ mode: 'native', accountId: l.accountId }),
              d((e) => e + 1),
              delete window.__operatingAccount,
              delete window.__operatingMode);
          }, [l]),
          m = (0, n.useCallback)(() => {
            let e = {};
            return (
              'native' !== i.mode &&
                i.accountId !== (null == l ? void 0 : l.accountId) &&
                ((e['X-Operating-Account'] = i.accountId), (e['X-Operating-Mode'] = i.mode)),
              e
            );
          }, [i, l]),
          h = 'native' !== i.mode && i.accountId !== (null == l ? void 0 : l.accountId);
        return (0, r.jsx)(s.Provider, {
          value: {
            operating: i,
            switchAccount: u,
            exitOperatingMode: x,
            getOperatingHeaders: m,
            isOperatingMode: h,
            operatingContextVersion: c,
          },
          children: t,
        });
      }
      function o() {
        let e = (0, n.useContext)(s);
        if (void 0 === e) throw Error('useOperating must be used within an OperatingProvider');
        return e;
      }
    },
    6326: function (e, t, l) {
      l.d(t, {
        ShellProvider: function () {
          return i;
        },
        St: function () {
          return o;
        },
      });
      var r = l(7573),
        n = l(7653),
        a = l(4175);
      let s = (0, n.createContext)(void 0);
      function i(e) {
        let { children: t } = e,
          { user: l } = (0, a.aC)(),
          [i, o] = (0, n.useState)(
            (null == l ? void 0 : l.accountType) === 'admin' ? 'admin' : 'client'
          ),
          [c, d] = (0, n.useState)('keimenon'),
          u = (0, n.useRef)(null);
        (0, n.useEffect)(() => {
          if (!l) {
            ((u.current = null), o('client'), d('keimenon'));
            return;
          }
          let e = ''.concat(l.accountId, ':').concat(l.accountType);
          if (u.current !== e) {
            let t = 'admin' === l.accountType ? 'admin' : 'client',
              r = 'admin' === l.accountType ? 'dashboard' : 'keimenon';
            (o(t),
              d(r),
              (u.current = e),
              console.log('Shell locked to account type:', {
                shellMode: t,
                accountType: l.accountType,
              }));
            return;
          }
          'admin' !== l.accountType && 'dashboard' === c && d('keimenon');
        }, [l, c]);
        let x = (0, n.useCallback)(() => !0, [l]),
          m = (0, n.useCallback)(() => (null == l ? void 0 : l.accountType) === 'admin', [l]),
          h = (0, n.useCallback)(
            (e) => {
              console.warn(
                'setShellMode() called but ShellMode is locked to account type.',
                'ShellMode cannot be manually changed. Ignoring request.',
                { requestedMode: e, currentMode: i }
              );
            },
            [i]
          ),
          p = (0, n.useCallback)(
            (e) => {
              let t =
                'dashboard' === e && (null == l ? void 0 : l.accountType) !== 'admin'
                  ? 'keimenon'
                  : e;
              ('dashboard' === e &&
                (null == l ? void 0 : l.accountType) !== 'admin' &&
                console.warn(
                  'Dashboard mode is restricted to admin accounts. Falling back to keimenon mode.'
                ),
                d(t),
                console.log('Keimenon mode changed:', t));
            },
            [null == l ? void 0 : l.accountType]
          );
        return (0, r.jsx)(s.Provider, {
          value: {
            shellMode: i,
            keimenonMode: c,
            setShellMode: h,
            setKeimenonMode: p,
            canAccessPortal: x,
            isAdminShell: m,
          },
          children: t,
        });
      }
      function o() {
        let e = (0, n.useContext)(s);
        if (void 0 === e) throw Error('useShell must be used within a ShellProvider');
        return e;
      }
    },
    7833: function (e, t, l) {
      l.d(t, {
        O: function () {
          return i;
        },
        UIVersionProvider: function () {
          return s;
        },
      });
      var r = l(7573),
        n = l(7653);
      let a = (0, n.createContext)(void 0);
      function s(e) {
        let { children: t } = e,
          [l, s] = (0, n.useState)('legacy'),
          i = (0, n.useCallback)((e) => {
            (s(e), console.log('UI version changed:', e));
          }, []),
          o = (0, n.useCallback)(() => {
            s((e) => {
              let t = 'legacy' === e ? 'primitives' : 'legacy';
              return (console.log('UI version toggled:', e, '→', t), t);
            });
          }, []),
          c = (0, n.useCallback)(() => 'primitives' === l, [l]),
          d = (0, n.useCallback)(() => 'legacy' === l, [l]);
        return (0, r.jsx)(a.Provider, {
          value: {
            uiVersion: l,
            setUIVersion: i,
            toggleUIVersion: o,
            isPrimitivesMode: c,
            isLegacyMode: d,
          },
          children: t,
        });
      }
      function i() {
        let e = (0, n.useContext)(a);
        if (void 0 === e) throw Error('useUIVersion must be used within a UIVersionProvider');
        return e;
      }
    },
    5955: function (e, t, l) {
      l.d(t, {
        p: function () {
          return a;
        },
      });
      var r = l(7653);
      let n = 0;
      function a() {
        let [e, t] = (0, r.useState)([]),
          l = (0, r.useCallback)((e, l, r, a) => {
            let s = 'toast-'.concat(++n),
              i = { id: s, type: e, message: l, description: r, duration: null != a ? a : 5e3 };
            return (t((e) => [...e, i]), s);
          }, []),
          a = (0, r.useCallback)((e) => {
            t((t) => t.filter((t) => t.id !== e));
          }, []),
          s = (0, r.useCallback)((e, t, r) => l('success', e, t, r), [l]);
        return {
          toasts: e,
          success: s,
          error: (0, r.useCallback)((e, t, r) => l('error', e, t, r), [l]),
          info: (0, r.useCallback)((e, t, r) => l('info', e, t, r), [l]),
          warning: (0, r.useCallback)((e, t, r) => l('warning', e, t, r), [l]),
          removeToast: a,
        };
      }
    },
    3627: function (e, t, l) {
      l.d(t, {
        $Q: function () {
          return E;
        },
        zx: function () {
          return c;
        },
        aV: function () {
          return I;
        },
        i4: function () {
          return L;
        },
        xv: function () {
          return m;
        },
        n9: function () {
          return A;
        },
        Ix: function () {
          return p;
        },
        AE: function () {
          return O;
        },
        cn: function () {
          return i;
        },
      });
      var r = l(7573),
        n = l(7653),
        a = l(9289),
        s = l(607);
      function i() {
        for (var e = arguments.length, t = Array(e), l = 0; l < e; l++) t[l] = arguments[l];
        return (0, s.W)(t);
      }
      let o = (0, a.j)(
          'inline-flex items-center justify-center rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
          {
            variants: {
              variant: {
                default: 'bg-purple-600 text-white hover:bg-purple-700',
                secondary: 'bg-slate-700 text-white hover:bg-slate-600',
                outline: 'border border-slate-600 bg-transparent hover:bg-slate-800',
                ghost: 'hover:bg-slate-800 hover:text-white',
                danger: 'bg-red-600 text-white hover:bg-red-700',
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
        c = n.forwardRef((e, t) => {
          let { className: l, variant: n, size: a, ...s } = e;
          return (0, r.jsx)('button', {
            className: i(o({ variant: n, size: a, className: l })),
            ref: t,
            ...s,
          });
        });
      ((c.displayName = 'Button'),
        (n.forwardRef((e, t) => {
          let { className: l, ...n } = e;
          return (0, r.jsx)('div', {
            ref: t,
            className: i(
              'rounded-lg border border-slate-700 bg-slate-900/50 backdrop-blur-sm text-slate-100 shadow-sm',
              l
            ),
            ...n,
          });
        }).displayName = 'Card'),
        (n.forwardRef((e, t) => {
          let { className: l, ...n } = e;
          return (0, r.jsx)('div', {
            ref: t,
            className: i('flex flex-col space-y-1.5 p-6', l),
            ...n,
          });
        }).displayName = 'CardHeader'),
        (n.forwardRef((e, t) => {
          let { className: l, ...n } = e;
          return (0, r.jsx)('h3', {
            ref: t,
            className: i('text-lg font-semibold leading-none tracking-tight', l),
            ...n,
          });
        }).displayName = 'CardTitle'),
        (n.forwardRef((e, t) => {
          let { className: l, ...n } = e;
          return (0, r.jsx)('div', { ref: t, className: i('p-6 pt-0', l), ...n });
        }).displayName = 'CardContent'),
        (n.forwardRef((e, t) => {
          let { className: l, ...n } = e;
          return (0, r.jsx)('div', { ref: t, className: i('flex items-center p-6 pt-0', l), ...n });
        }).displayName = 'CardFooter'),
        (0, a.j)(
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
        ));
      let d = {
          title: 'text-lg font-semibold',
          subtitle: 'text-sm',
          label: 'text-xs font-semibold uppercase',
          value: 'text-sm',
          hint: 'text-xs',
          badge: 'text-xs font-medium',
        },
        u = {
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
        };
      function m(e) {
        var t;
        let {
            role: l,
            children: n,
            surface: a = 'viewer',
            mode: s = 'normal',
            className: i = '',
            as: o,
          } = e,
          c = d[l],
          m = (null === (t = x[l]) || void 0 === t ? void 0 : t[s]) || u[s],
          h = ''.concat(c, ' ').concat(m, ' ').concat(i).trim();
        return (0, r.jsx)(
          o ||
            { title: 'h3', subtitle: 'p', label: 'label', value: 'span', hint: 'p', badge: 'span' }[
              l
            ] ||
            'span',
          { className: h, children: n }
        );
      }
      function h(e) {
        let { id: t, type: l, message: a, description: s, duration: i = 5e3, onClose: o } = e;
        n.useEffect(() => {
          if (i > 0) {
            let e = setTimeout(() => {
              o(t);
            }, i);
            return () => clearTimeout(e);
          }
        }, [t, i, o]);
        let c = {
          success: (0, r.jsx)('svg', {
            className: 'w-5 h-5',
            fill: 'currentColor',
            viewBox: '0 0 20 20',
            children: (0, r.jsx)('path', {
              fillRule: 'evenodd',
              d: 'M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z',
              clipRule: 'evenodd',
            }),
          }),
          error: (0, r.jsx)('svg', {
            className: 'w-5 h-5',
            fill: 'currentColor',
            viewBox: '0 0 20 20',
            children: (0, r.jsx)('path', {
              fillRule: 'evenodd',
              d: 'M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z',
              clipRule: 'evenodd',
            }),
          }),
          info: (0, r.jsx)('svg', {
            className: 'w-5 h-5',
            fill: 'currentColor',
            viewBox: '0 0 20 20',
            children: (0, r.jsx)('path', {
              fillRule: 'evenodd',
              d: 'M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z',
              clipRule: 'evenodd',
            }),
          }),
          warning: (0, r.jsx)('svg', {
            className: 'w-5 h-5',
            fill: 'currentColor',
            viewBox: '0 0 20 20',
            children: (0, r.jsx)('path', {
              fillRule: 'evenodd',
              d: 'M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z',
              clipRule: 'evenodd',
            }),
          }),
        };
        return (0, r.jsxs)('div', {
          className: '\n        '.concat(
            {
              success: 'bg-green-500 text-white',
              error: 'bg-red-500 text-white',
              info: 'bg-blue-500 text-white',
              warning: 'bg-yellow-500 text-white',
            }[l],
            '\n        max-w-sm w-full shadow-lg rounded-lg pointer-events-auto\n        ring-1 ring-black ring-opacity-5 overflow-hidden\n        animate-slide-in-right\n      '
          ),
          children: [
            (0, r.jsx)('div', {
              className: 'p-4',
              children: (0, r.jsxs)('div', {
                className: 'flex items-start',
                children: [
                  (0, r.jsx)('div', { className: 'flex-shrink-0', children: c[l] }),
                  (0, r.jsxs)('div', {
                    className: 'ml-3 w-0 flex-1 pt-0.5',
                    children: [
                      (0, r.jsx)('p', { className: 'text-sm font-medium', children: a }),
                      s && (0, r.jsx)('p', { className: 'mt-1 text-sm opacity-90', children: s }),
                    ],
                  }),
                  (0, r.jsx)('div', {
                    className: 'ml-4 flex-shrink-0 flex',
                    children: (0, r.jsxs)('button', {
                      onClick: () => o(t),
                      className:
                        'inline-flex text-white hover:opacity-75 focus:outline-none transition-opacity',
                      children: [
                        (0, r.jsx)('span', { className: 'sr-only', children: 'Close' }),
                        (0, r.jsx)('svg', {
                          className: 'h-5 w-5',
                          viewBox: '0 0 20 20',
                          fill: 'currentColor',
                          children: (0, r.jsx)('path', {
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
            i > 0 &&
              (0, r.jsx)('div', {
                className: 'h-1 bg-black bg-opacity-20',
                children: (0, r.jsx)('div', {
                  className: 'h-full bg-white bg-opacity-40 animate-progress-bar',
                  style: { animationDuration: ''.concat(i, 'ms') },
                }),
              }),
          ],
        });
      }
      function p(e) {
        let { toasts: t, onClose: l } = e;
        return (0, r.jsx)('div', {
          'aria-live': 'assertive',
          className:
            'fixed inset-0 flex items-end px-4 py-6 pointer-events-none sm:p-6 sm:items-start z-50',
          children: (0, r.jsx)('div', {
            className: 'w-full flex flex-col items-end space-y-4 sm:items-end',
            children: t.map((e) => (0, r.jsx)(h, { ...e, onClose: l }, e.id)),
          }),
        });
      }
      function b(e) {
        let { label: t, hint: l, error: n, disabled: a, mode: s = 'edit' } = e;
        return 'read' === s
          ? (0, r.jsxs)('div', {
              className: 'space-y-1',
              children: [
                t && (0, r.jsx)(m, { role: 'label', children: t }),
                (0, r.jsx)('div', {
                  className: 'text-sm text-white',
                  children: (function (e) {
                    switch (e.type) {
                      case 'boolean':
                        return e.value ? 'Enabled' : 'Disabled';
                      case 'string':
                        return e.value || '—';
                      case 'number':
                      case 'slider':
                        return ''.concat(e.value).concat(e.unit || '');
                      case 'select':
                        let t = e.options.find((t) => t.value === e.value);
                        return (null == t ? void 0 : t.label) || e.value;
                      case 'multiselect':
                        return e.value.length > 0 ? e.value.join(', ') : '—';
                      case 'color':
                        return (0, r.jsxs)('div', {
                          className: 'flex items-center gap-2',
                          children: [
                            (0, r.jsx)('div', {
                              className: 'w-6 h-6 rounded border border-slate-700',
                              style: { backgroundColor: e.value },
                            }),
                            (0, r.jsx)('span', { children: e.value }),
                          ],
                        });
                      case 'json':
                        return (0, r.jsx)('pre', {
                          className: 'text-xs font-mono text-slate-300',
                          children: JSON.stringify(e.value, null, 2),
                        });
                      default:
                        return '—';
                    }
                  })(e),
                }),
                l && (0, r.jsx)(m, { role: 'hint', mode: 'muted', children: l }),
              ],
            })
          : (0, r.jsxs)('div', {
              className: 'space-y-2',
              children: [
                t && (0, r.jsx)(m, { role: 'label', children: t }),
                (function (e) {
                  switch (e.type) {
                    case 'boolean':
                      return (0, r.jsx)(g, { ...e });
                    case 'string':
                      return (0, r.jsx)(f, { ...e });
                    case 'number':
                      return (0, r.jsx)(v, { ...e });
                    case 'select':
                      return (0, r.jsx)(j, { ...e });
                    case 'multiselect':
                      return (0, r.jsx)(y, { ...e });
                    case 'color':
                      return (0, r.jsx)(N, { ...e });
                    case 'slider':
                      return (0, r.jsx)(w, { ...e });
                    case 'json':
                      return (0, r.jsx)(C, { ...e });
                    default:
                      return null;
                  }
                })(e),
                n && (0, r.jsx)(m, { role: 'hint', mode: 'error', children: n }),
                !n && l && (0, r.jsx)(m, { role: 'hint', mode: 'muted', children: l }),
              ],
            });
      }
      function g(e) {
        let { value: t, onChange: l, disabled: n } = e;
        return (0, r.jsxs)('label', {
          className: 'flex items-center gap-3 cursor-pointer',
          children: [
            (0, r.jsx)('input', {
              type: 'checkbox',
              checked: t,
              onChange: (e) => (null == l ? void 0 : l(e.target.checked)),
              disabled: n,
              className:
                'w-4 h-4 rounded bg-slate-700 border-slate-600 text-purple-600 focus:ring-purple-500 disabled:opacity-50 cursor-pointer',
            }),
            (0, r.jsx)(m, { role: 'value', mode: 'muted', children: t ? 'Enabled' : 'Disabled' }),
          ],
        });
      }
      function f(e) {
        let { value: t, onChange: l, disabled: n, placeholder: a, pattern: s } = e;
        return (0, r.jsx)('input', {
          type: 'text',
          value: t,
          onChange: (e) => (null == l ? void 0 : l(e.target.value)),
          disabled: n,
          placeholder: a,
          pattern: s,
          className:
            'w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50',
        });
      }
      function v(e) {
        let { value: t, onChange: l, disabled: n, min: a, max: s, step: i, unit: o } = e;
        return (0, r.jsxs)('div', {
          className: 'flex items-center gap-2',
          children: [
            (0, r.jsx)('input', {
              type: 'number',
              value: t,
              onChange: (e) => (null == l ? void 0 : l(Number(e.target.value))),
              disabled: n,
              min: a,
              max: s,
              step: i,
              className:
                'flex-1 px-3 py-2 bg-slate-900/50 border border-slate-700 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50',
            }),
            o && (0, r.jsx)(m, { role: 'value', mode: 'muted', children: o }),
          ],
        });
      }
      function j(e) {
        let { value: t, onChange: l, disabled: n, options: a } = e;
        return (0, r.jsx)('select', {
          value: t,
          onChange: (e) => (null == l ? void 0 : l(e.target.value)),
          disabled: n,
          className:
            'w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50',
          children: a.map((e) =>
            (0, r.jsx)('option', { value: e.value, children: e.label }, e.value)
          ),
        });
      }
      function y(e) {
        let { value: t, onChange: l, disabled: n, options: a } = e,
          s = (e) => {
            let r = t.includes(e) ? t.filter((t) => t !== e) : [...t, e];
            null == l || l(r);
          };
        return (0, r.jsx)('div', {
          className: 'space-y-2',
          children: a.map((e) =>
            (0, r.jsxs)(
              'label',
              {
                className: 'flex items-center gap-3 cursor-pointer',
                children: [
                  (0, r.jsx)('input', {
                    type: 'checkbox',
                    checked: t.includes(e.value),
                    onChange: () => s(e.value),
                    disabled: n,
                    className:
                      'w-4 h-4 rounded bg-slate-700 border-slate-600 text-purple-600 focus:ring-purple-500 disabled:opacity-50 cursor-pointer',
                  }),
                  (0, r.jsx)(m, { role: 'value', mode: 'muted', children: e.label }),
                ],
              },
              e.value
            )
          ),
        });
      }
      function N(e) {
        let { value: t, onChange: l, disabled: n } = e;
        return (0, r.jsxs)('div', {
          className: 'flex items-center gap-3',
          children: [
            (0, r.jsx)('input', {
              type: 'color',
              value: t,
              onChange: (e) => (null == l ? void 0 : l(e.target.value)),
              disabled: n,
              className:
                'w-12 h-10 rounded border border-slate-700 bg-slate-900/50 cursor-pointer disabled:opacity-50',
            }),
            (0, r.jsx)('input', {
              type: 'text',
              value: t,
              onChange: (e) => (null == l ? void 0 : l(e.target.value)),
              disabled: n,
              pattern: '^#[0-9A-Fa-f]{6}$',
              placeholder: '#000000',
              className:
                'flex-1 px-3 py-2 bg-slate-900/50 border border-slate-700 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50',
            }),
          ],
        });
      }
      function w(e) {
        let { value: t, onChange: l, disabled: n, min: a, max: s, step: i, unit: o } = e;
        return (0, r.jsxs)('div', {
          className: 'space-y-2',
          children: [
            (0, r.jsxs)('div', {
              className: 'flex items-center justify-between text-sm',
              children: [
                (0, r.jsxs)(m, { role: 'value', mode: 'muted', children: [t, o] }),
                (0, r.jsxs)(m, { role: 'hint', children: [a, o, ' - ', s, o] }),
              ],
            }),
            (0, r.jsx)('input', {
              type: 'range',
              value: t,
              onChange: (e) => (null == l ? void 0 : l(Number(e.target.value))),
              disabled: n,
              min: a,
              max: s,
              step: i,
              className:
                'w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50',
              style: { accentColor: 'rgb(147, 51, 234)' },
            }),
          ],
        });
      }
      function C(e) {
        let { value: t, onChange: l, disabled: a } = e,
          [s, i] = n.useState(JSON.stringify(t, null, 2)),
          [o, c] = n.useState(null),
          d = (e) => {
            i(e);
            try {
              let t = JSON.parse(e);
              (c(null), null == l || l(t));
            } catch (e) {
              c(e.message);
            }
          };
        return (0, r.jsxs)('div', {
          className: 'space-y-2',
          children: [
            (0, r.jsx)('textarea', {
              value: s,
              onChange: (e) => d(e.target.value),
              disabled: a,
              rows: 6,
              className:
                'w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50',
            }),
            o && (0, r.jsxs)(m, { role: 'hint', mode: 'error', children: ['Invalid JSON: ', o] }),
          ],
        });
      }
      let k = {
          vertical: 'flex flex-col',
          'grid-2': 'grid grid-cols-1 md:grid-cols-2',
          'grid-3': 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
          'grid-4': 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
        },
        S = { sm: 'gap-2', md: 'gap-4', lg: 'gap-6' };
      function I(e) {
        let {
            items: t,
            renderItem: l,
            layout: n = 'vertical',
            emptyState: a,
            loading: s = !1,
            loadingMessage: o = 'Loading...',
            gap: c = 'md',
            className: d = '',
            keyExtractor: u,
          } = e,
          x = k[n],
          m = S[c];
        return (0, r.jsx)('div', {
          className: i(x, m, d),
          children: t.map((e, t) => {
            let n = u ? u(e, t) : t;
            return (0, r.jsx)('div', { children: l(e, t) }, n);
          }),
        });
      }
      let M = {
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
      };
      function A(e) {
        let {
            title: t,
            subtitle: l,
            icon: n,
            iconColor: a = 'slate',
            badges: s = [],
            selected: o = !1,
            onClick: c,
            onDoubleClick: d,
            className: u = '',
          } = e,
          x = M[a],
          h = i(
            'p-4 rounded-lg border backdrop-blur-sm cursor-pointer transition-all duration-200',
            x.bg,
            x.border,
            o
              ? 'ring-2 ring-purple-500 shadow-lg shadow-purple-500/20'
              : 'hover:shadow-md hover:border-opacity-60',
            u
          );
        return (0, r.jsxs)('div', {
          className: h,
          onClick: c,
          onDoubleClick: d,
          children: [
            (0, r.jsx)('div', {
              className: 'flex items-start justify-between mb-3',
              children:
                n &&
                (0, r.jsx)('div', {
                  className: 'p-2 '.concat(x.bg, ' rounded-lg ').concat(x.icon),
                  children: (0, r.jsx)(n, { className: 'w-5 h-5' }),
                }),
            }),
            (0, r.jsx)('h3', {
              className: 'text-sm font-semibold text-white mb-1 line-clamp-2',
              children: t,
            }),
            l &&
              (0, r.jsx)(m, {
                role: 'subtitle',
                mode: 'muted',
                className: 'line-clamp-1',
                children: l,
              }),
            s.length > 0 &&
              (0, r.jsx)('div', {
                className: 'flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-700/50',
                children: s.slice(0, 3).map((e, t) => {
                  let l = e.color ? M[e.color] : M.slate;
                  return (0, r.jsx)(
                    'span',
                    {
                      className: 'px-2 py-1 '.concat(l.bg, ' rounded text-xs ').concat(l.text),
                      children: e.label,
                    },
                    t
                  );
                }),
              }),
            o &&
              (0, r.jsx)('div', {
                className:
                  'absolute top-2 right-2 w-2 h-2 bg-purple-500 rounded-full animate-pulse',
              }),
          ],
        });
      }
      var z = l(8410),
        R = l(2966);
      let T = {
        left: { container: 'flex-shrink-0', border: 'border-r border-slate-800' },
        right: { container: 'flex-shrink-0', border: 'border-l border-slate-800' },
        top: { container: '', border: 'border-b border-slate-800' },
        bottom: { container: '', border: 'border-t border-slate-800' },
      };
      function E(e) {
        let {
            mode: t,
            position: l = 'navigation' === t ? 'left' : 'inspector' === t ? 'right' : 'top',
            title: a,
            children: s,
            defaultCollapsed: o = !1,
            collapsible: c = !0,
            width: d = 'toolbar' === t ? 'auto' : '320px',
            className: u = '',
            headerActions: x,
          } = e,
          [h, p] = (0, n.useState)(o),
          { container: b, border: g } = T[l];
        return 'toolbar' === t
          ? (0, r.jsxs)('div', {
              className: i('flex items-center gap-2 px-4 py-2 bg-slate-950/50', g, u),
              children: [
                a && (0, r.jsx)(m, { role: 'label', className: 'mr-2', children: a }),
                (0, r.jsx)('div', { className: 'flex items-center gap-2 flex-1', children: s }),
                x,
              ],
            })
          : (0, r.jsxs)('div', {
              className: i('bg-slate-950/50 transition-all duration-300 overflow-hidden', b, g, u),
              style: { width: h ? '0px' : d },
              children: [
                !h &&
                  (0, r.jsxs)(r.Fragment, {
                    children: [
                      (a || x || c) &&
                        (0, r.jsxs)('div', {
                          className:
                            'flex items-center justify-between px-4 py-3 border-b border-slate-800',
                          children: [
                            a &&
                              (0, r.jsx)(m, { role: 'title', className: 'text-base', children: a }),
                            (0, r.jsxs)('div', {
                              className: 'flex items-center gap-2',
                              children: [
                                x,
                                c &&
                                  (0, r.jsx)('button', {
                                    onClick: () => p(!0),
                                    className: 'p-1 hover:bg-slate-800 rounded transition-colors',
                                    title: 'Collapse sidebar',
                                    children:
                                      'left' === l
                                        ? (0, r.jsx)(z.Z, { className: 'w-4 h-4 text-slate-400' })
                                        : (0, r.jsx)(R.Z, { className: 'w-4 h-4 text-slate-400' }),
                                  }),
                              ],
                            }),
                          ],
                        }),
                      (0, r.jsx)('div', { className: 'h-full overflow-y-auto', children: s }),
                    ],
                  }),
                h &&
                  c &&
                  (0, r.jsx)('button', {
                    onClick: () => p(!1),
                    className:
                      'absolute top-1/2 -translate-y-1/2 p-2 bg-slate-800 hover:bg-slate-700 rounded transition-colors',
                    style: { ['left' === l ? 'right' : 'left']: '-12px' },
                    title: 'Expand sidebar',
                    children:
                      'left' === l
                        ? (0, r.jsx)(R.Z, { className: 'w-4 h-4 text-slate-400' })
                        : (0, r.jsx)(z.Z, { className: 'w-4 h-4 text-slate-400' }),
                  }),
              ],
            });
      }
      let _ = {
        default: 'bg-slate-800 border-slate-700',
        subtle: 'bg-slate-800/50 border-slate-700',
        info: 'bg-blue-600/10 border-blue-500/30',
        success: 'bg-green-600/10 border-green-500/30',
        warning: 'bg-yellow-600/10 border-yellow-500/30',
        error: 'bg-red-600/10 border-red-500/30',
      };
      function L(e) {
        let {
            title: t,
            subtitle: l,
            variant: n = 'default',
            children: a,
            className: s = '',
            onClick: o,
            hoverable: c = !1,
            headerActions: d,
          } = e,
          u = i(
            'border rounded-lg p-6',
            _[n],
            c || o ? 'hover:border-slate-600 transition-colors cursor-pointer' : '',
            s
          );
        return (0, r.jsxs)('div', {
          className: u,
          onClick: o,
          children: [
            (t || l || d) &&
              (0, r.jsxs)('div', {
                className: 'mb-4',
                children: [
                  (t || d) &&
                    (0, r.jsxs)('div', {
                      className: 'flex items-start justify-between mb-1',
                      children: [
                        t && (0, r.jsx)(m, { role: 'title', children: t }),
                        d &&
                          (0, r.jsx)('div', { className: 'flex items-center gap-2', children: d }),
                      ],
                    }),
                  l && (0, r.jsx)(m, { role: 'hint', mode: 'muted', children: l }),
                ],
              }),
            (0, r.jsx)('div', { children: a }),
          ],
        });
      }
      function O(e) {
        let { mode: t, data: l, loading: n = !1, error: a, className: s = '' } = e;
        return n
          ? (0, r.jsx)('div', {
              className: i('flex-1 flex items-center justify-center p-12', s),
              children: (0, r.jsxs)('div', {
                className: 'text-center',
                children: [
                  (0, r.jsx)('div', {
                    className:
                      'inline-block w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-4',
                  }),
                  (0, r.jsx)(m, { role: 'hint', mode: 'muted', children: 'Loading...' }),
                ],
              }),
            })
          : a
            ? (0, r.jsx)('div', {
                className: i('flex-1 flex items-center justify-center p-12', s),
                children: (0, r.jsxs)(L, {
                  variant: 'error',
                  className: 'max-w-md',
                  children: [
                    (0, r.jsx)(m, { role: 'title', mode: 'error', children: 'Error' }),
                    (0, r.jsx)(m, { role: 'hint', className: 'mt-2', children: a }),
                  ],
                }),
              })
            : l
              ? (0, r.jsx)('div', {
                  className: i('flex-1 overflow-auto', s),
                  children: (0, r.jsx)('div', {
                    className: 'p-6',
                    children: (function (e, t) {
                      switch (e) {
                        case 'keimenon':
                          return (0, r.jsxs)(L, {
                            variant: 'info',
                            className: 'max-w-4xl mx-auto',
                            children: [
                              (0, r.jsx)(m, { role: 'title', children: 'Keimenon View' }),
                              (0, r.jsx)(m, {
                                role: 'hint',
                                mode: 'muted',
                                className: 'mt-2',
                                children: 'Graph keimenon visualization will be integrated here.',
                              }),
                              (0, r.jsx)(m, {
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
                            ? (0, r.jsxs)('div', {
                                className: 'max-w-7xl mx-auto space-y-8',
                                children: [
                                  (0, r.jsxs)('div', {
                                    children: [
                                      (0, r.jsx)(m, {
                                        role: 'title',
                                        className: 'text-2xl',
                                        children: 'Dashboard',
                                      }),
                                      (0, r.jsx)(m, {
                                        role: 'hint',
                                        mode: 'muted',
                                        className: 'mt-1',
                                        children: 'System overview and metrics',
                                      }),
                                    ],
                                  }),
                                  (0, r.jsx)(I, {
                                    items: t,
                                    layout: 'grid-3',
                                    gap: 'lg',
                                    renderItem: (e) =>
                                      (0, r.jsx)(L, {
                                        variant: 'default',
                                        children: (0, r.jsxs)('div', {
                                          className: 'space-y-3',
                                          children: [
                                            (0, r.jsx)(m, { role: 'label', children: e.title }),
                                            (0, r.jsx)(m, {
                                              role: 'title',
                                              className: 'text-3xl',
                                              children: e.value,
                                            }),
                                            e.subtitle &&
                                              (0, r.jsx)(m, {
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
                            : (0, r.jsx)(m, {
                                role: 'hint',
                                mode: 'error',
                                children: 'Dashboard mode expects an array of metrics',
                              });
                        case 'settings':
                          return 'object' != typeof t || Array.isArray(t)
                            ? (0, r.jsx)(m, {
                                role: 'hint',
                                mode: 'error',
                                children: 'Settings mode expects an object',
                              })
                            : (0, r.jsxs)('div', {
                                className: 'max-w-4xl mx-auto space-y-6',
                                children: [
                                  (0, r.jsxs)('div', {
                                    children: [
                                      (0, r.jsx)(m, {
                                        role: 'title',
                                        className: 'text-2xl',
                                        children: 'Settings',
                                      }),
                                      (0, r.jsx)(m, {
                                        role: 'hint',
                                        mode: 'muted',
                                        className: 'mt-1',
                                        children: 'Configure your preferences',
                                      }),
                                    ],
                                  }),
                                  Object.entries(t).map((e) => {
                                    let [t, l] = e;
                                    return (0, r.jsx)(L, { title: t, children: V(l) }, t);
                                  }),
                                ],
                              });
                        case 'detail':
                          return D(t);
                        case 'list':
                          return P(t);
                        default:
                          return Array.isArray(t)
                            ? P(t)
                            : 'object' == typeof t
                              ? D(t)
                              : (0, r.jsx)(m, { role: 'value', children: String(t) });
                      }
                    })(t, l),
                  }),
                })
              : (0, r.jsx)('div', {
                  className: i('flex-1 flex items-center justify-center p-12', s),
                  children: (0, r.jsx)(m, {
                    role: 'hint',
                    mode: 'muted',
                    children: 'No data available',
                  }),
                });
      }
      function D(e) {
        var t;
        let l = e.data || e;
        return (0, r.jsx)('div', {
          className: 'max-w-2xl mx-auto',
          children: (0, r.jsx)(L, {
            title: e.type ? ''.concat(e.type, ' Details') : 'Details',
            headerActions:
              null === (t = e._actions) || void 0 === t
                ? void 0
                : t.map((e) =>
                    (0, r.jsx)(
                      'button',
                      {
                        onClick: e.handler,
                        className:
                          'px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm transition-colors',
                        children: e.label,
                      },
                      e.id
                    )
                  ),
            children: V(l),
          }),
        });
      }
      function P(e) {
        return Array.isArray(e)
          ? (0, r.jsx)('div', {
              className: 'max-w-6xl mx-auto',
              children: (0, r.jsx)(I, {
                items: e,
                renderItem: (e) => (0, r.jsx)(L, { children: V(e) }),
                emptyState: { message: 'No items to display' },
              }),
            })
          : (0, r.jsx)(m, { role: 'hint', mode: 'error', children: 'List mode expects an array' });
      }
      function V(e) {
        return 'object' != typeof e || null === e
          ? (0, r.jsx)(m, { role: 'value', children: String(e) })
          : (0, r.jsx)('div', {
              className: 'space-y-4',
              children: Object.entries(e).map((e) => {
                let [t, l] = e;
                return t.startsWith('_')
                  ? null
                  : 'boolean' == typeof l
                    ? (0, r.jsx)(b, { type: 'boolean', label: t, value: l, mode: 'read' }, t)
                    : 'number' == typeof l
                      ? (0, r.jsx)(b, { type: 'number', label: t, value: l, mode: 'read' }, t)
                      : 'string' == typeof l
                        ? (0, r.jsx)(b, { type: 'string', label: t, value: l, mode: 'read' }, t)
                        : Array.isArray(l)
                          ? (0, r.jsxs)(
                              'div',
                              {
                                children: [
                                  (0, r.jsx)(m, { role: 'label', className: 'mb-2', children: t }),
                                  (0, r.jsx)('div', {
                                    className: 'pl-4',
                                    children:
                                      0 === l.length
                                        ? (0, r.jsx)(m, {
                                            role: 'hint',
                                            mode: 'muted',
                                            children: 'Empty',
                                          })
                                        : (0, r.jsx)(m, { role: 'value', children: l.join(', ') }),
                                  }),
                                ],
                              },
                              t
                            )
                          : 'object' == typeof l
                            ? (0, r.jsxs)(
                                'div',
                                {
                                  children: [
                                    (0, r.jsx)(m, {
                                      role: 'label',
                                      className: 'mb-2',
                                      children: t,
                                    }),
                                    (0, r.jsx)('div', { className: 'pl-4', children: V(l) }),
                                  ],
                                },
                                t
                              )
                            : null;
              }),
            });
      }
    },
  },
]);
