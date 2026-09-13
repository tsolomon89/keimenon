(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [174],
  {
    3342: function (e, t, n) {
      Promise.resolve().then(n.bind(n, 6665));
    },
    6665: function (e, t, n) {
      'use strict';
      (n.r(t),
        n.d(t, {
          default: function () {
            return s;
          },
        }));
      var r = n(7573),
        o = n(7653),
        i = n(1336),
        c = n(4100);
      function s() {
        let { nodes: e, edges: t } = (0, o.useMemo)(
            () =>
              (function (e, t) {
                let n = [],
                  r = [];
                n.push({ id: 'account_1', kind: 'AccountNode', mass: 10 });
                for (let e = 0; e < 5; e++)
                  (n.push({ id: 'principal_'.concat(e), kind: 'Principal', mass: 5 }),
                    r.push({
                      id: 'edge_p_'.concat(e),
                      kind: 'OWNED_BY',
                      source: 'principal_'.concat(e),
                      target: 'account_1',
                    }));
                for (let e = 0; e < 50; e++)
                  (n.push({ id: 'group_'.concat(e), kind: 'Group', mass: 3 }),
                    r.push({
                      id: 'edge_g_'.concat(e),
                      kind: 'OWNED_BY',
                      source: 'group_'.concat(e),
                      target: 'principal_'.concat(e % 5),
                    }));
                for (let e = 0; e < 9944; e++) {
                  let t = e % 10 == 0 ? 'Topic' : 'Source';
                  (n.push({ id: 'node_'.concat(e), kind: t, mass: 1 }),
                    r.push({
                      id: 'edge_n_'.concat(e),
                      kind: 'IN_GROUP',
                      source: 'node_'.concat(e),
                      target: 'group_'.concat(e % 50),
                    }));
                }
                for (let e = 0; e < 2e4 - n.length; e++) {
                  let t = 'node_'.concat(Math.floor(9944 * Math.random())),
                    n = 'node_'.concat(Math.floor(9944 * Math.random()));
                  r.push({
                    id: 'edge_rand_'.concat(e),
                    kind: 'SIMILAR_TO',
                    source: t,
                    target: n,
                    data: { strength: 0.5 },
                  });
                }
                return { nodes: n, edges: r };
              })(1e4, 0),
            []
          ),
          [n, s] = (0, o.useState)('3d'),
          [a, u] = (0, o.useState)({ width: 1024, height: 768 });
        return (
          (0, o.useEffect)(() => {
            let e = () => u({ width: window.innerWidth, height: window.innerHeight - 64 });
            return (
              e(),
              window.addEventListener('resize', e),
              () => window.removeEventListener('resize', e)
            );
          }, []),
          (0, r.jsxs)('div', {
            className: 'w-full h-screen bg-slate-950 flex flex-col',
            children: [
              (0, r.jsxs)('div', {
                className:
                  'h-16 p-4 border-b border-slate-800 bg-slate-900 flex justify-between items-center z-10 shrink-0',
                children: [
                  (0, r.jsxs)('div', {
                    children: [
                      (0, r.jsx)('h1', {
                        className: 'text-xl font-bold text-slate-100',
                        children: 'Graph Rendering Benchmark',
                      }),
                      (0, r.jsxs)('p', {
                        className: 'text-sm text-slate-400',
                        children: [
                          e.length.toLocaleString(),
                          ' Nodes, ',
                          t.length.toLocaleString(),
                          ' Edges',
                        ],
                      }),
                    ],
                  }),
                  (0, r.jsx)('div', {
                    className: 'flex gap-2',
                    children: ['2d', '3d', 'nd'].map((e) =>
                      (0, r.jsxs)(
                        'button',
                        {
                          className: 'px-4 py-2 rounded text-sm font-semibold uppercase '.concat(
                            n === e ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300'
                          ),
                          onClick: () => s(e),
                          children: [e, ' Lens'],
                        },
                        e
                      )
                    ),
                  }),
                ],
              }),
              (0, r.jsx)('div', {
                className: 'flex-1 relative overflow-hidden',
                children: (0, r.jsx)(i.A, {
                  nodes: e,
                  edges: t,
                  width: a.width,
                  height: a.height,
                  renderLens: n,
                  ndConfig: c.hD,
                  interactive: !0,
                  accountId: 'benchmark_account',
                  showBenchmark: !0,
                }),
              }),
            ],
          })
        );
      }
    },
    4859: function (e, t, n) {
      'use strict';
      var r, o;
      e.exports =
        (null == (r = n.g.process) ? void 0 : r.env) &&
        'object' == typeof (null == (o = n.g.process) ? void 0 : o.env)
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
                o = (e.exports = {});
              function i() {
                throw Error('setTimeout has not been defined');
              }
              function c() {
                throw Error('clearTimeout has not been defined');
              }
              function s(e) {
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
                  n = 'function' == typeof clearTimeout ? clearTimeout : c;
                } catch (e) {
                  n = c;
                }
              })();
              var a = [],
                u = !1,
                l = -1;
              function d() {
                u && r && ((u = !1), r.length ? (a = r.concat(a)) : (l = -1), a.length && h());
              }
              function h() {
                if (!u) {
                  var e = s(d);
                  u = !0;
                  for (var t = a.length; t; ) {
                    for (r = a, a = []; ++l < t; ) r && r[l].run();
                    ((l = -1), (t = a.length));
                  }
                  ((r = null),
                    (u = !1),
                    (function (e) {
                      if (n === clearTimeout) return clearTimeout(e);
                      if ((n === c || !n) && clearTimeout)
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
              function p() {}
              ((o.nextTick = function (e) {
                var t = Array(arguments.length - 1);
                if (arguments.length > 1)
                  for (var n = 1; n < arguments.length; n++) t[n - 1] = arguments[n];
                (a.push(new f(e, t)), 1 !== a.length || u || s(h));
              }),
                (f.prototype.run = function () {
                  this.fun.apply(null, this.array);
                }),
                (o.title = 'browser'),
                (o.browser = !0),
                (o.env = {}),
                (o.argv = []),
                (o.version = ''),
                (o.versions = {}),
                (o.on = p),
                (o.addListener = p),
                (o.once = p),
                (o.off = p),
                (o.removeListener = p),
                (o.removeAllListeners = p),
                (o.emit = p),
                (o.prependListener = p),
                (o.prependOnceListener = p),
                (o.listeners = function (e) {
                  return [];
                }),
                (o.binding = function (e) {
                  throw Error('process.binding is not supported');
                }),
                (o.cwd = function () {
                  return '/';
                }),
                (o.chdir = function (e) {
                  throw Error('process.chdir is not supported');
                }),
                (o.umask = function () {
                  return 0;
                }));
            },
          },
          n = {};
        function r(e) {
          var o = n[e];
          if (void 0 !== o) return o.exports;
          var i = (n[e] = { exports: {} }),
            c = !0;
          try {
            (t[e](i, i.exports, r), (c = !1));
          } finally {
            c && delete n[e];
          }
          return i.exports;
        }
        r.ab = '//';
        var o = r(229);
        e.exports = o;
      })();
    },
  },
  function (e) {
    (e.O(0, [124, 588, 336, 293, 528, 744], function () {
      return e((e.s = 3342));
    }),
      (_N_E = e.O()));
  },
]);
