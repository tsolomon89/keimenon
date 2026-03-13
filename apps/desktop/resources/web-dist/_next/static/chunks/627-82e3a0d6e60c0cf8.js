'use strict';
(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [627],
  {
    3627: function (e, t, l) {
      l.d(t, {
        Ct: function () {
          return b;
        },
        $Q: function () {
          return F;
        },
        zx: function () {
          return d;
        },
        Zb: function () {
          return c;
        },
        aY: function () {
          return m;
        },
        Ol: function () {
          return u;
        },
        ll: function () {
          return x;
        },
        qE: function () {
          return $;
        },
        aV: function () {
          return M;
        },
        i4: function () {
          return J;
        },
        xv: function () {
          return v;
        },
        n9: function () {
          return B;
        },
        Ix: function () {
          return N;
        },
        AE: function () {
          return H;
        },
        cn: function () {
          return i;
        },
      });
      var r = l(7573),
        s = l(7653),
        a = l(9289),
        n = l(607);
      function i() {
        for (var e = arguments.length, t = Array(e), l = 0; l < e; l++) t[l] = arguments[l];
        return (0, n.W)(t);
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
        d = s.forwardRef((e, t) => {
          let { className: l, variant: s, size: a, ...n } = e;
          return (0, r.jsx)('button', {
            className: i(o({ variant: s, size: a, className: l })),
            ref: t,
            ...n,
          });
        });
      d.displayName = 'Button';
      let c = s.forwardRef((e, t) => {
        let { className: l, ...s } = e;
        return (0, r.jsx)('div', {
          ref: t,
          className: i(
            'rounded-lg border border-slate-700 bg-slate-900/50 backdrop-blur-sm text-slate-100 shadow-sm',
            l
          ),
          ...s,
        });
      });
      c.displayName = 'Card';
      let u = s.forwardRef((e, t) => {
        let { className: l, ...s } = e;
        return (0, r.jsx)('div', {
          ref: t,
          className: i('flex flex-col space-y-1.5 p-6', l),
          ...s,
        });
      });
      u.displayName = 'CardHeader';
      let x = s.forwardRef((e, t) => {
        let { className: l, ...s } = e;
        return (0, r.jsx)('h3', {
          ref: t,
          className: i('text-lg font-semibold leading-none tracking-tight', l),
          ...s,
        });
      });
      x.displayName = 'CardTitle';
      let m = s.forwardRef((e, t) => {
        let { className: l, ...s } = e;
        return (0, r.jsx)('div', { ref: t, className: i('p-6 pt-0', l), ...s });
      });
      ((m.displayName = 'CardContent'),
        (s.forwardRef((e, t) => {
          let { className: l, ...s } = e;
          return (0, r.jsx)('div', { ref: t, className: i('flex items-center p-6 pt-0', l), ...s });
        }).displayName = 'CardFooter'));
      let h = (0, a.j)(
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
      function b(e) {
        let { className: t, variant: l, ...s } = e;
        return (0, r.jsx)('div', { className: i(h({ variant: l }), t), ...s });
      }
      let p = {
          title: 'text-lg font-semibold',
          subtitle: 'text-sm',
          label: 'text-xs font-semibold uppercase',
          value: 'text-sm',
          hint: 'text-xs',
          badge: 'text-xs font-medium',
        },
        f = {
          normal: 'text-white',
          muted: 'text-slate-400',
          emphasized: 'text-purple-300',
          error: 'text-red-300',
          success: 'text-green-300',
        },
        g = {
          label: { normal: 'text-slate-400', muted: 'text-slate-500' },
          hint: { normal: 'text-slate-400', muted: 'text-slate-500' },
          badge: { normal: 'text-slate-300' },
        };
      function v(e) {
        var t;
        let {
            role: l,
            children: s,
            surface: a = 'viewer',
            mode: n = 'normal',
            className: i = '',
            as: o,
          } = e,
          d = p[l],
          c = (null === (t = g[l]) || void 0 === t ? void 0 : t[n]) || f[n],
          u = ''.concat(d, ' ').concat(c, ' ').concat(i).trim();
        return (0, r.jsx)(
          o ||
            { title: 'h3', subtitle: 'p', label: 'label', value: 'span', hint: 'p', badge: 'span' }[
              l
            ] ||
            'span',
          { className: u, children: s }
        );
      }
      function j(e) {
        let { id: t, type: l, message: a, description: n, duration: i = 5e3, onClose: o } = e;
        s.useEffect(() => {
          if (i > 0) {
            let e = setTimeout(() => {
              o(t);
            }, i);
            return () => clearTimeout(e);
          }
        }, [t, i, o]);
        let d = {
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
                  (0, r.jsx)('div', { className: 'flex-shrink-0', children: d[l] }),
                  (0, r.jsxs)('div', {
                    className: 'ml-3 w-0 flex-1 pt-0.5',
                    children: [
                      (0, r.jsx)('p', { className: 'text-sm font-medium', children: a }),
                      n && (0, r.jsx)('p', { className: 'mt-1 text-sm opacity-90', children: n }),
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
      function N(e) {
        let { toasts: t, onClose: l } = e;
        return (0, r.jsx)('div', {
          'aria-live': 'assertive',
          className:
            'fixed inset-0 flex items-end px-4 py-6 pointer-events-none sm:p-6 sm:items-start z-50',
          children: (0, r.jsx)('div', {
            className: 'w-full flex flex-col items-end space-y-4 sm:items-end',
            children: t.map((e) => (0, r.jsx)(j, { ...e, onClose: l }, e.id)),
          }),
        });
      }
      function y(e) {
        let { label: t, hint: l, error: s, disabled: a, mode: n = 'edit' } = e;
        return 'read' === n
          ? (0, r.jsxs)('div', {
              className: 'space-y-1',
              children: [
                t && (0, r.jsx)(v, { role: 'label', children: t }),
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
                l && (0, r.jsx)(v, { role: 'hint', mode: 'muted', children: l }),
              ],
            })
          : (0, r.jsxs)('div', {
              className: 'space-y-2',
              children: [
                t && (0, r.jsx)(v, { role: 'label', children: t }),
                (function (e) {
                  switch (e.type) {
                    case 'boolean':
                      return (0, r.jsx)(w, { ...e });
                    case 'string':
                      return (0, r.jsx)(C, { ...e });
                    case 'number':
                      return (0, r.jsx)(k, { ...e });
                    case 'select':
                      return (0, r.jsx)(z, { ...e });
                    case 'multiselect':
                      return (0, r.jsx)(R, { ...e });
                    case 'color':
                      return (0, r.jsx)(S, { ...e });
                    case 'slider':
                      return (0, r.jsx)(A, { ...e });
                    case 'json':
                      return (0, r.jsx)(L, { ...e });
                    default:
                      return null;
                  }
                })(e),
                s && (0, r.jsx)(v, { role: 'hint', mode: 'error', children: s }),
                !s && l && (0, r.jsx)(v, { role: 'hint', mode: 'muted', children: l }),
              ],
            });
      }
      function w(e) {
        let { value: t, onChange: l, disabled: s } = e;
        return (0, r.jsxs)('label', {
          className: 'flex items-center gap-3 cursor-pointer',
          children: [
            (0, r.jsx)('input', {
              type: 'checkbox',
              checked: t,
              onChange: (e) => (null == l ? void 0 : l(e.target.checked)),
              disabled: s,
              className:
                'w-4 h-4 rounded bg-slate-700 border-slate-600 text-purple-600 focus:ring-purple-500 disabled:opacity-50 cursor-pointer',
            }),
            (0, r.jsx)(v, { role: 'value', mode: 'muted', children: t ? 'Enabled' : 'Disabled' }),
          ],
        });
      }
      function C(e) {
        let { value: t, onChange: l, disabled: s, placeholder: a, pattern: n } = e;
        return (0, r.jsx)('input', {
          type: 'text',
          value: t,
          onChange: (e) => (null == l ? void 0 : l(e.target.value)),
          disabled: s,
          placeholder: a,
          pattern: n,
          className:
            'w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50',
        });
      }
      function k(e) {
        let { value: t, onChange: l, disabled: s, min: a, max: n, step: i, unit: o } = e;
        return (0, r.jsxs)('div', {
          className: 'flex items-center gap-2',
          children: [
            (0, r.jsx)('input', {
              type: 'number',
              value: t,
              onChange: (e) => (null == l ? void 0 : l(Number(e.target.value))),
              disabled: s,
              min: a,
              max: n,
              step: i,
              className:
                'flex-1 px-3 py-2 bg-slate-900/50 border border-slate-700 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50',
            }),
            o && (0, r.jsx)(v, { role: 'value', mode: 'muted', children: o }),
          ],
        });
      }
      function z(e) {
        let { value: t, onChange: l, disabled: s, options: a } = e;
        return (0, r.jsx)('select', {
          value: t,
          onChange: (e) => (null == l ? void 0 : l(e.target.value)),
          disabled: s,
          className:
            'w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50',
          children: a.map((e) =>
            (0, r.jsx)('option', { value: e.value, children: e.label }, e.value)
          ),
        });
      }
      function R(e) {
        let { value: t, onChange: l, disabled: s, options: a } = e,
          n = (e) => {
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
                    onChange: () => n(e.value),
                    disabled: s,
                    className:
                      'w-4 h-4 rounded bg-slate-700 border-slate-600 text-purple-600 focus:ring-purple-500 disabled:opacity-50 cursor-pointer',
                  }),
                  (0, r.jsx)(v, { role: 'value', mode: 'muted', children: e.label }),
                ],
              },
              e.value
            )
          ),
        });
      }
      function S(e) {
        let { value: t, onChange: l, disabled: s } = e;
        return (0, r.jsxs)('div', {
          className: 'flex items-center gap-3',
          children: [
            (0, r.jsx)('input', {
              type: 'color',
              value: t,
              onChange: (e) => (null == l ? void 0 : l(e.target.value)),
              disabled: s,
              className:
                'w-12 h-10 rounded border border-slate-700 bg-slate-900/50 cursor-pointer disabled:opacity-50',
            }),
            (0, r.jsx)('input', {
              type: 'text',
              value: t,
              onChange: (e) => (null == l ? void 0 : l(e.target.value)),
              disabled: s,
              pattern: '^#[0-9A-Fa-f]{6}$',
              placeholder: '#000000',
              className:
                'flex-1 px-3 py-2 bg-slate-900/50 border border-slate-700 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50',
            }),
          ],
        });
      }
      function A(e) {
        let { value: t, onChange: l, disabled: s, min: a, max: n, step: i, unit: o } = e;
        return (0, r.jsxs)('div', {
          className: 'space-y-2',
          children: [
            (0, r.jsxs)('div', {
              className: 'flex items-center justify-between text-sm',
              children: [
                (0, r.jsxs)(v, { role: 'value', mode: 'muted', children: [t, o] }),
                (0, r.jsxs)(v, { role: 'hint', children: [a, o, ' - ', n, o] }),
              ],
            }),
            (0, r.jsx)('input', {
              type: 'range',
              value: t,
              onChange: (e) => (null == l ? void 0 : l(Number(e.target.value))),
              disabled: s,
              min: a,
              max: n,
              step: i,
              className:
                'w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50',
              style: { accentColor: 'rgb(147, 51, 234)' },
            }),
          ],
        });
      }
      function L(e) {
        let { value: t, onChange: l, disabled: a } = e,
          [n, i] = s.useState(JSON.stringify(t, null, 2)),
          [o, d] = s.useState(null),
          c = (e) => {
            i(e);
            try {
              let t = JSON.parse(e);
              (d(null), null == l || l(t));
            } catch (e) {
              d(e.message);
            }
          };
        return (0, r.jsxs)('div', {
          className: 'space-y-2',
          children: [
            (0, r.jsx)('textarea', {
              value: n,
              onChange: (e) => c(e.target.value),
              disabled: a,
              rows: 6,
              className:
                'w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50',
            }),
            o && (0, r.jsxs)(v, { role: 'hint', mode: 'error', children: ['Invalid JSON: ', o] }),
          ],
        });
      }
      let E = {
          vertical: 'flex flex-col',
          'grid-2': 'grid grid-cols-1 md:grid-cols-2',
          'grid-3': 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
          'grid-4': 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
        },
        D = { sm: 'gap-2', md: 'gap-4', lg: 'gap-6' };
      function M(e) {
        let {
            items: t,
            renderItem: l,
            layout: s = 'vertical',
            emptyState: a,
            loading: n = !1,
            loadingMessage: o = 'Loading...',
            gap: d = 'md',
            className: c = '',
            keyExtractor: u,
          } = e,
          x = E[s],
          m = D[d];
        return (0, r.jsx)('div', {
          className: i(x, m, c),
          children: t.map((e, t) => {
            let s = u ? u(e, t) : t;
            return (0, r.jsx)('div', { children: l(e, t) }, s);
          }),
        });
      }
      let O = {
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
      function B(e) {
        let {
            title: t,
            subtitle: l,
            icon: s,
            iconColor: a = 'slate',
            badges: n = [],
            selected: o = !1,
            onClick: d,
            onDoubleClick: c,
            className: u = '',
          } = e,
          x = O[a],
          m = i(
            'p-4 rounded-lg border backdrop-blur-sm cursor-pointer transition-all duration-200',
            x.bg,
            x.border,
            o
              ? 'ring-2 ring-purple-500 shadow-lg shadow-purple-500/20'
              : 'hover:shadow-md hover:border-opacity-60',
            u
          );
        return (0, r.jsxs)('div', {
          className: m,
          onClick: d,
          onDoubleClick: c,
          children: [
            (0, r.jsx)('div', {
              className: 'flex items-start justify-between mb-3',
              children:
                s &&
                (0, r.jsx)('div', {
                  className: 'p-2 '.concat(x.bg, ' rounded-lg ').concat(x.icon),
                  children: (0, r.jsx)(s, { className: 'w-5 h-5' }),
                }),
            }),
            (0, r.jsx)('h3', {
              className: 'text-sm font-semibold text-white mb-1 line-clamp-2',
              children: t,
            }),
            l &&
              (0, r.jsx)(v, {
                role: 'subtitle',
                mode: 'muted',
                className: 'line-clamp-1',
                children: l,
              }),
            n.length > 0 &&
              (0, r.jsx)('div', {
                className: 'flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-700/50',
                children: n.slice(0, 3).map((e, t) => {
                  let l = e.color ? O[e.color] : O.slate;
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
      var V = l(8410),
        _ = l(2966);
      let Z = {
        left: { container: 'flex-shrink-0', border: 'border-r border-slate-800' },
        right: { container: 'flex-shrink-0', border: 'border-l border-slate-800' },
        top: { container: '', border: 'border-b border-slate-800' },
        bottom: { container: '', border: 'border-t border-slate-800' },
      };
      function F(e) {
        let {
            mode: t,
            position: l = 'navigation' === t ? 'left' : 'inspector' === t ? 'right' : 'top',
            title: a,
            children: n,
            defaultCollapsed: o = !1,
            collapsible: d = !0,
            width: c = 'toolbar' === t ? 'auto' : '320px',
            className: u = '',
            headerActions: x,
          } = e,
          [m, h] = (0, s.useState)(o),
          { container: b, border: p } = Z[l];
        return 'toolbar' === t
          ? (0, r.jsxs)('div', {
              className: i('flex items-center gap-2 px-4 py-2 bg-slate-950/50', p, u),
              children: [
                a && (0, r.jsx)(v, { role: 'label', className: 'mr-2', children: a }),
                (0, r.jsx)('div', { className: 'flex items-center gap-2 flex-1', children: n }),
                x,
              ],
            })
          : (0, r.jsxs)('div', {
              className: i('bg-slate-950/50 transition-all duration-300 overflow-hidden', b, p, u),
              style: { width: m ? '0px' : c },
              children: [
                !m &&
                  (0, r.jsxs)(r.Fragment, {
                    children: [
                      (a || x || d) &&
                        (0, r.jsxs)('div', {
                          className:
                            'flex items-center justify-between px-4 py-3 border-b border-slate-800',
                          children: [
                            a &&
                              (0, r.jsx)(v, { role: 'title', className: 'text-base', children: a }),
                            (0, r.jsxs)('div', {
                              className: 'flex items-center gap-2',
                              children: [
                                x,
                                d &&
                                  (0, r.jsx)('button', {
                                    onClick: () => h(!0),
                                    className: 'p-1 hover:bg-slate-800 rounded transition-colors',
                                    title: 'Collapse sidebar',
                                    children:
                                      'left' === l
                                        ? (0, r.jsx)(V.Z, { className: 'w-4 h-4 text-slate-400' })
                                        : (0, r.jsx)(_.Z, { className: 'w-4 h-4 text-slate-400' }),
                                  }),
                              ],
                            }),
                          ],
                        }),
                      (0, r.jsx)('div', { className: 'h-full overflow-y-auto', children: n }),
                    ],
                  }),
                m &&
                  d &&
                  (0, r.jsx)('button', {
                    onClick: () => h(!1),
                    className:
                      'absolute top-1/2 -translate-y-1/2 p-2 bg-slate-800 hover:bg-slate-700 rounded transition-colors',
                    style: { ['left' === l ? 'right' : 'left']: '-12px' },
                    title: 'Expand sidebar',
                    children:
                      'left' === l
                        ? (0, r.jsx)(_.Z, { className: 'w-4 h-4 text-slate-400' })
                        : (0, r.jsx)(V.Z, { className: 'w-4 h-4 text-slate-400' }),
                  }),
              ],
            });
      }
      let I = {
        default: 'bg-slate-800 border-slate-700',
        subtle: 'bg-slate-800/50 border-slate-700',
        info: 'bg-blue-600/10 border-blue-500/30',
        success: 'bg-green-600/10 border-green-500/30',
        warning: 'bg-yellow-600/10 border-yellow-500/30',
        error: 'bg-red-600/10 border-red-500/30',
      };
      function J(e) {
        let {
            title: t,
            subtitle: l,
            variant: s = 'default',
            children: a,
            className: n = '',
            onClick: o,
            hoverable: d = !1,
            headerActions: c,
          } = e,
          u = i(
            'border rounded-lg p-6',
            I[s],
            d || o ? 'hover:border-slate-600 transition-colors cursor-pointer' : '',
            n
          );
        return (0, r.jsxs)('div', {
          className: u,
          onClick: o,
          children: [
            (t || l || c) &&
              (0, r.jsxs)('div', {
                className: 'mb-4',
                children: [
                  (t || c) &&
                    (0, r.jsxs)('div', {
                      className: 'flex items-start justify-between mb-1',
                      children: [
                        t && (0, r.jsx)(v, { role: 'title', children: t }),
                        c &&
                          (0, r.jsx)('div', { className: 'flex items-center gap-2', children: c }),
                      ],
                    }),
                  l && (0, r.jsx)(v, { role: 'hint', mode: 'muted', children: l }),
                ],
              }),
            (0, r.jsx)('div', { children: a }),
          ],
        });
      }
      function H(e) {
        let { mode: t, data: l, loading: s = !1, error: a, className: n = '' } = e;
        return s
          ? (0, r.jsx)('div', {
              className: i('flex-1 flex items-center justify-center p-12', n),
              children: (0, r.jsxs)('div', {
                className: 'text-center',
                children: [
                  (0, r.jsx)('div', {
                    className:
                      'inline-block w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-4',
                  }),
                  (0, r.jsx)(v, { role: 'hint', mode: 'muted', children: 'Loading...' }),
                ],
              }),
            })
          : a
            ? (0, r.jsx)('div', {
                className: i('flex-1 flex items-center justify-center p-12', n),
                children: (0, r.jsxs)(J, {
                  variant: 'error',
                  className: 'max-w-md',
                  children: [
                    (0, r.jsx)(v, { role: 'title', mode: 'error', children: 'Error' }),
                    (0, r.jsx)(v, { role: 'hint', className: 'mt-2', children: a }),
                  ],
                }),
              })
            : l
              ? (0, r.jsx)('div', {
                  className: i('flex-1 overflow-auto', n),
                  children: (0, r.jsx)('div', {
                    className: 'p-6',
                    children: (function (e, t) {
                      switch (e) {
                        case 'keimenon':
                          return (0, r.jsxs)(J, {
                            variant: 'info',
                            className: 'max-w-4xl mx-auto',
                            children: [
                              (0, r.jsx)(v, { role: 'title', children: 'Keimenon View' }),
                              (0, r.jsx)(v, {
                                role: 'hint',
                                mode: 'muted',
                                className: 'mt-2',
                                children: 'Graph keimenon visualization will be integrated here.',
                              }),
                              (0, r.jsx)(v, {
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
                                      (0, r.jsx)(v, {
                                        role: 'title',
                                        className: 'text-2xl',
                                        children: 'Dashboard',
                                      }),
                                      (0, r.jsx)(v, {
                                        role: 'hint',
                                        mode: 'muted',
                                        className: 'mt-1',
                                        children: 'System overview and metrics',
                                      }),
                                    ],
                                  }),
                                  (0, r.jsx)(M, {
                                    items: t,
                                    layout: 'grid-3',
                                    gap: 'lg',
                                    renderItem: (e) =>
                                      (0, r.jsx)(J, {
                                        variant: 'default',
                                        children: (0, r.jsxs)('div', {
                                          className: 'space-y-3',
                                          children: [
                                            (0, r.jsx)(v, { role: 'label', children: e.title }),
                                            (0, r.jsx)(v, {
                                              role: 'title',
                                              className: 'text-3xl',
                                              children: e.value,
                                            }),
                                            e.subtitle &&
                                              (0, r.jsx)(v, {
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
                            : (0, r.jsx)(v, {
                                role: 'hint',
                                mode: 'error',
                                children: 'Dashboard mode expects an array of metrics',
                              });
                        case 'settings':
                          return 'object' != typeof t || Array.isArray(t)
                            ? (0, r.jsx)(v, {
                                role: 'hint',
                                mode: 'error',
                                children: 'Settings mode expects an object',
                              })
                            : (0, r.jsxs)('div', {
                                className: 'max-w-4xl mx-auto space-y-6',
                                children: [
                                  (0, r.jsxs)('div', {
                                    children: [
                                      (0, r.jsx)(v, {
                                        role: 'title',
                                        className: 'text-2xl',
                                        children: 'Settings',
                                      }),
                                      (0, r.jsx)(v, {
                                        role: 'hint',
                                        mode: 'muted',
                                        className: 'mt-1',
                                        children: 'Configure your preferences',
                                      }),
                                    ],
                                  }),
                                  Object.entries(t).map((e) => {
                                    let [t, l] = e;
                                    return (0, r.jsx)(J, { title: t, children: W(l) }, t);
                                  }),
                                ],
                              });
                        case 'detail':
                          return T(t);
                        case 'list':
                          return K(t);
                        default:
                          return Array.isArray(t)
                            ? K(t)
                            : 'object' == typeof t
                              ? T(t)
                              : (0, r.jsx)(v, { role: 'value', children: String(t) });
                      }
                    })(t, l),
                  }),
                })
              : (0, r.jsx)('div', {
                  className: i('flex-1 flex items-center justify-center p-12', n),
                  children: (0, r.jsx)(v, {
                    role: 'hint',
                    mode: 'muted',
                    children: 'No data available',
                  }),
                });
      }
      function T(e) {
        var t;
        let l = e.data || e;
        return (0, r.jsx)('div', {
          className: 'max-w-2xl mx-auto',
          children: (0, r.jsx)(J, {
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
            children: W(l),
          }),
        });
      }
      function K(e) {
        return Array.isArray(e)
          ? (0, r.jsx)('div', {
              className: 'max-w-6xl mx-auto',
              children: (0, r.jsx)(M, {
                items: e,
                renderItem: (e) => (0, r.jsx)(J, { children: W(e) }),
                emptyState: { message: 'No items to display' },
              }),
            })
          : (0, r.jsx)(v, { role: 'hint', mode: 'error', children: 'List mode expects an array' });
      }
      function W(e) {
        return 'object' != typeof e || null === e
          ? (0, r.jsx)(v, { role: 'value', children: String(e) })
          : (0, r.jsx)('div', {
              className: 'space-y-4',
              children: Object.entries(e).map((e) => {
                let [t, l] = e;
                return t.startsWith('_')
                  ? null
                  : 'boolean' == typeof l
                    ? (0, r.jsx)(y, { type: 'boolean', label: t, value: l, mode: 'read' }, t)
                    : 'number' == typeof l
                      ? (0, r.jsx)(y, { type: 'number', label: t, value: l, mode: 'read' }, t)
                      : 'string' == typeof l
                        ? (0, r.jsx)(y, { type: 'string', label: t, value: l, mode: 'read' }, t)
                        : Array.isArray(l)
                          ? (0, r.jsxs)(
                              'div',
                              {
                                children: [
                                  (0, r.jsx)(v, { role: 'label', className: 'mb-2', children: t }),
                                  (0, r.jsx)('div', {
                                    className: 'pl-4',
                                    children:
                                      0 === l.length
                                        ? (0, r.jsx)(v, {
                                            role: 'hint',
                                            mode: 'muted',
                                            children: 'Empty',
                                          })
                                        : (0, r.jsx)(v, { role: 'value', children: l.join(', ') }),
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
                                    (0, r.jsx)(v, {
                                      role: 'label',
                                      className: 'mb-2',
                                      children: t,
                                    }),
                                    (0, r.jsx)('div', { className: 'pl-4', children: W(l) }),
                                  ],
                                },
                                t
                              )
                            : null;
              }),
            });
      }
      function $(e) {
        let {
            header: t,
            leftSidebar: l,
            rightSidebar: a,
            footer: n,
            children: o,
            className: d,
          } = e,
          [c, u] = s.useState(!1),
          [x, m] = s.useState(!1),
          [h, b] = s.useState(!0);
        return (0, r.jsxs)('div', {
          className: i('h-screen flex flex-col bg-slate-950', d),
          children: [
            t &&
              (0, r.jsx)('header', {
                className: 'h-16 border-b border-slate-800 flex-shrink-0 z-50',
                children: t,
              }),
            (0, r.jsxs)('div', {
              className: 'flex-1 flex overflow-hidden',
              children: [
                l &&
                  (0, r.jsx)('aside', {
                    className: i(
                      'border-r border-slate-800 bg-slate-900 transition-all duration-300 flex-shrink-0',
                      c ? 'w-0' : 'w-64'
                    ),
                    children:
                      !c &&
                      (0, r.jsx)('div', { className: 'h-full overflow-y-auto p-4', children: l }),
                  }),
                (0, r.jsx)('main', { className: 'flex-1 overflow-hidden relative', children: o }),
                a &&
                  (0, r.jsx)('aside', {
                    className: i(
                      'border-l border-slate-800 bg-slate-900 transition-all duration-300 flex-shrink-0',
                      x ? 'w-0' : 'w-96'
                    ),
                    children:
                      !x &&
                      (0, r.jsx)('div', { className: 'h-full overflow-y-auto p-4', children: a }),
                  }),
              ],
            }),
            n &&
              (0, r.jsx)('footer', {
                className: i(
                  'border-t border-slate-800 bg-slate-900 transition-all duration-300 flex-shrink-0',
                  h ? 'h-8' : 'h-48'
                ),
                children: (0, r.jsx)('div', { className: 'h-full overflow-y-auto', children: n }),
              }),
          ],
        });
      }
    },
  },
]);
