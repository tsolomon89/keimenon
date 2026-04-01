(!(function () {
  'use strict';
  var t = { value: () => {} };
  function n() {
    for (var t, n = 0, e = arguments.length, i = {}; n < e; ++n) {
      if (!(t = arguments[n] + '') || t in i || /[\s.]/.test(t)) throw Error('illegal type: ' + t);
      i[t] = [];
    }
    return new r(i);
  }
  function r(t) {
    this._ = t;
  }
  function e(n, r, e) {
    for (var i = 0, o = n.length; i < o; ++i)
      if (n[i].name === r) {
        ((n[i] = t), (n = n.slice(0, i).concat(n.slice(i + 1))));
        break;
      }
    return (null != e && n.push({ name: r, value: e }), n);
  }
  r.prototype = n.prototype = {
    constructor: r,
    on: function (t, n) {
      var r,
        i = this._,
        o = (t + '')
          .trim()
          .split(/^|\s+/)
          .map(function (t) {
            var n = '',
              r = t.indexOf('.');
            if ((r >= 0 && ((n = t.slice(r + 1)), (t = t.slice(0, r))), t && !i.hasOwnProperty(t)))
              throw Error('unknown type: ' + t);
            return { type: t, name: n };
          }),
        a = -1,
        u = o.length;
      if (arguments.length < 2) {
        for (; ++a < u; )
          if (
            (r = (t = o[a]).type) &&
            (r = (function (t, n) {
              for (var r, e = 0, i = t.length; e < i; ++e)
                if ((r = t[e]).name === n) return r.value;
            })(i[r], t.name))
          )
            return r;
        return;
      }
      if (null != n && 'function' != typeof n) throw Error('invalid callback: ' + n);
      for (; ++a < u; )
        if ((r = (t = o[a]).type)) i[r] = e(i[r], t.name, n);
        else if (null == n) for (r in i) i[r] = e(i[r], t.name, null);
      return this;
    },
    copy: function () {
      var t = {},
        n = this._;
      for (var e in n) t[e] = n[e].slice();
      return new r(t);
    },
    call: function (t, n) {
      if ((r = arguments.length - 2) > 0)
        for (var r, e, i = Array(r), o = 0; o < r; ++o) i[o] = arguments[o + 2];
      if (!this._.hasOwnProperty(t)) throw Error('unknown type: ' + t);
      for (e = this._[t], o = 0, r = e.length; o < r; ++o) e[o].value.apply(n, i);
    },
    apply: function (t, n, r) {
      if (!this._.hasOwnProperty(t)) throw Error('unknown type: ' + t);
      for (var e = this._[t], i = 0, o = e.length; i < o; ++i) e[i].value.apply(n, r);
    },
  };
  var i,
    o,
    a = 0,
    u = 0,
    l = 0,
    f = 0,
    s = 0,
    h = 0,
    c = 'object' == typeof performance && performance.now ? performance : Date,
    v =
      'object' == typeof window && window.requestAnimationFrame
        ? window.requestAnimationFrame.bind(window)
        : function (t) {
            setTimeout(t, 17);
          };
  function y() {
    return s || (v(x), (s = c.now() + h));
  }
  function x() {
    s = 0;
  }
  function d() {
    this._call = this._time = this._next = null;
  }
  function _(t, n, r) {
    var e = new d();
    return (e.restart(t, n, r), e);
  }
  function p() {
    ((s = (f = c.now()) + h), (a = u = 0));
    try {
      !(function () {
        (y(), ++a);
        for (var t, n = i; n; ) ((t = s - n._time) >= 0 && n._call.call(void 0, t), (n = n._next));
        --a;
      })();
    } finally {
      ((a = 0),
        (function () {
          for (var t, n, r = i, e = 1 / 0; r; )
            r._call
              ? (e > r._time && (e = r._time), (t = r), (r = r._next))
              : ((n = r._next), (r._next = null), (r = t ? (t._next = n) : (i = n)));
          ((o = t), w(e));
        })(),
        (s = 0));
    }
  }
  function g() {
    var t = c.now(),
      n = t - f;
    n > 1e3 && ((h -= n), (f = t));
  }
  function w(t) {
    !a &&
      (u && (u = clearTimeout(u)),
      t - s > 24
        ? (t < 1 / 0 && (u = setTimeout(p, t - c.now() - h)), l && (l = clearInterval(l)))
        : (l || ((f = c.now()), (l = setInterval(g, 1e3))), (a = 1), v(p)));
  }
  function m(t) {
    return t.x;
  }
  function N(t) {
    return t.y;
  }
  d.prototype = _.prototype = {
    constructor: d,
    restart: function (t, n, r) {
      if ('function' != typeof t) throw TypeError('callback is not a function');
      ((r = (null == r ? y() : +r) + (null == n ? 0 : +n)),
        this._next || o === this || (o ? (o._next = this) : (i = this), (o = this)),
        (this._call = t),
        (this._time = r),
        w());
    },
    stop: function () {
      this._call && ((this._call = null), (this._time = 1 / 0), w());
    },
  };
  var M = Math.PI * (3 - Math.sqrt(5));
  function k(t) {
    return function () {
      return t;
    };
  }
  function b(t) {
    return (t() - 0.5) * 1e-6;
  }
  function A(t) {
    return t.index;
  }
  function q(t, n) {
    var r = t.get(n);
    if (!r) throw Error('node not found: ' + n);
    return r;
  }
  function E(t, n, r, e) {
    if (isNaN(n) || isNaN(r)) return t;
    var i,
      o,
      a,
      u,
      l,
      f,
      s,
      h,
      c,
      v = t._root,
      y = { data: e },
      x = t._x0,
      d = t._y0,
      _ = t._x1,
      p = t._y1;
    if (!v) return ((t._root = y), t);
    for (; v.length; )
      if (
        ((f = n >= (o = (x + _) / 2)) ? (x = o) : (_ = o),
        (s = r >= (a = (d + p) / 2)) ? (d = a) : (p = a),
        (i = v),
        !(v = v[(h = (s << 1) | f)]))
      )
        return ((i[h] = y), t);
    if (((u = +t._x.call(null, v.data)), (l = +t._y.call(null, v.data)), n === u && r === l))
      return ((y.next = v), i ? (i[h] = y) : (t._root = y), t);
    do
      ((i = i ? (i[h] = [, , , ,]) : (t._root = [, , , ,])),
        (f = n >= (o = (x + _) / 2)) ? (x = o) : (_ = o),
        (s = r >= (a = (d + p) / 2)) ? (d = a) : (p = a));
    while ((h = (s << 1) | f) == (c = ((l >= a) << 1) | (u >= o)));
    return ((i[c] = v), (i[h] = y), t);
  }
  function T(t, n, r, e, i) {
    ((this.node = t), (this.x0 = n), (this.y0 = r), (this.x1 = e), (this.y1 = i));
  }
  function z(t) {
    return t[0];
  }
  function C(t) {
    return t[1];
  }
  function D(t, n, r) {
    var e = new P(null == n ? z : n, null == r ? C : r, NaN, NaN, NaN, NaN);
    return null == t ? e : e.addAll(t);
  }
  function P(t, n, r, e, i, o) {
    ((this._x = t),
      (this._y = n),
      (this._x0 = r),
      (this._y0 = e),
      (this._x1 = i),
      (this._y1 = o),
      (this._root = void 0));
  }
  function j(t) {
    for (var n = { data: t.data }, r = n; (t = t.next); ) r = r.next = { data: t.data };
    return n;
  }
  var O = (D.prototype = P.prototype);
  function I(t) {
    return t.x + t.vx;
  }
  function S(t) {
    return t.y + t.vy;
  }
  ((O.copy = function () {
    var t,
      n,
      r = new P(this._x, this._y, this._x0, this._y0, this._x1, this._y1),
      e = this._root;
    if (!e) return r;
    if (!e.length) return ((r._root = j(e)), r);
    for (t = [{ source: e, target: (r._root = [, , , ,]) }]; (e = t.pop()); )
      for (var i = 0; i < 4; ++i)
        (n = e.source[i]) &&
          (n.length
            ? t.push({ source: n, target: (e.target[i] = [, , , ,]) })
            : (e.target[i] = j(n)));
    return r;
  }),
    (O.add = function (t) {
      let n = +this._x.call(null, t),
        r = +this._y.call(null, t);
      return E(this.cover(n, r), n, r, t);
    }),
    (O.addAll = function (t) {
      var n,
        r,
        e,
        i,
        o = t.length,
        a = Array(o),
        u = Array(o),
        l = 1 / 0,
        f = 1 / 0,
        s = -1 / 0,
        h = -1 / 0;
      for (r = 0; r < o; ++r)
        !(isNaN((e = +this._x.call(null, (n = t[r])))) || isNaN((i = +this._y.call(null, n)))) &&
          ((a[r] = e),
          (u[r] = i),
          e < l && (l = e),
          e > s && (s = e),
          i < f && (f = i),
          i > h && (h = i));
      if (l > s || f > h) return this;
      for (this.cover(l, f).cover(s, h), r = 0; r < o; ++r) E(this, a[r], u[r], t[r]);
      return this;
    }),
    (O.cover = function (t, n) {
      if (isNaN((t = +t)) || isNaN((n = +n))) return this;
      var r = this._x0,
        e = this._y0,
        i = this._x1,
        o = this._y1;
      if (isNaN(r)) ((i = (r = Math.floor(t)) + 1), (o = (e = Math.floor(n)) + 1));
      else {
        for (var a, u, l = i - r || 1, f = this._root; r > t || t >= i || e > n || n >= o; )
          switch (
            ((u = ((n < e) << 1) | (t < r)), ((a = [, , , ,])[u] = f), (f = a), (l *= 2), u)
          ) {
            case 0:
              ((i = r + l), (o = e + l));
              break;
            case 1:
              ((r = i - l), (o = e + l));
              break;
            case 2:
              ((i = r + l), (e = o - l));
              break;
            case 3:
              ((r = i - l), (e = o - l));
          }
        this._root && this._root.length && (this._root = f);
      }
      return ((this._x0 = r), (this._y0 = e), (this._x1 = i), (this._y1 = o), this);
    }),
    (O.data = function () {
      var t = [];
      return (
        this.visit(function (n) {
          if (!n.length)
            do t.push(n.data);
            while ((n = n.next));
        }),
        t
      );
    }),
    (O.extent = function (t) {
      return arguments.length
        ? this.cover(+t[0][0], +t[0][1]).cover(+t[1][0], +t[1][1])
        : isNaN(this._x0)
          ? void 0
          : [
              [this._x0, this._y0],
              [this._x1, this._y1],
            ];
    }),
    (O.find = function (t, n, r) {
      var e,
        i,
        o,
        a,
        u,
        l,
        f,
        s = this._x0,
        h = this._y0,
        c = this._x1,
        v = this._y1,
        y = [],
        x = this._root;
      for (
        x && y.push(new T(x, s, h, c, v)),
          null == r ? (r = 1 / 0) : ((s = t - r), (h = n - r), (c = t + r), (v = n + r), (r *= r));
        (l = y.pop());
      )
        if (
          (x = l.node) &&
          !((i = l.x0) > c) &&
          !((o = l.y0) > v) &&
          !((a = l.x1) < s) &&
          !((u = l.y1) < h)
        ) {
          if (x.length) {
            var d = (i + a) / 2,
              _ = (o + u) / 2;
            (y.push(
              new T(x[3], d, _, a, u),
              new T(x[2], i, _, d, u),
              new T(x[1], d, o, a, _),
              new T(x[0], i, o, d, _)
            ),
              (f = ((n >= _) << 1) | (t >= d)) &&
                ((l = y[y.length - 1]),
                (y[y.length - 1] = y[y.length - 1 - f]),
                (y[y.length - 1 - f] = l)));
          } else {
            var p = t - +this._x.call(null, x.data),
              g = n - +this._y.call(null, x.data),
              w = p * p + g * g;
            if (w < r) {
              var m = Math.sqrt((r = w));
              ((s = t - m), (h = n - m), (c = t + m), (v = n + m), (e = x.data));
            }
          }
        }
      return e;
    }),
    (O.remove = function (t) {
      if (isNaN((o = +this._x.call(null, t))) || isNaN((a = +this._y.call(null, t)))) return this;
      var n,
        r,
        e,
        i,
        o,
        a,
        u,
        l,
        f,
        s,
        h,
        c,
        v = this._root,
        y = this._x0,
        x = this._y0,
        d = this._x1,
        _ = this._y1;
      if (!v) return this;
      if (v.length)
        for (;;) {
          if (
            ((f = o >= (u = (y + d) / 2)) ? (y = u) : (d = u),
            (s = a >= (l = (x + _) / 2)) ? (x = l) : (_ = l),
            (n = v),
            !(v = v[(h = (s << 1) | f)]))
          )
            return this;
          if (!v.length) break;
          (n[(h + 1) & 3] || n[(h + 2) & 3] || n[(h + 3) & 3]) && ((r = n), (c = h));
        }
      for (; v.data !== t; ) if (((e = v), !(v = v.next))) return this;
      return (
        ((i = v.next) && delete v.next, e)
          ? i
            ? (e.next = i)
            : delete e.next
          : n
            ? (i ? (n[h] = i) : delete n[h],
              (v = n[0] || n[1] || n[2] || n[3]) &&
                v === (n[3] || n[2] || n[1] || n[0]) &&
                !v.length &&
                (r ? (r[c] = v) : (this._root = v)))
            : (this._root = i),
        this
      );
    }),
    (O.removeAll = function (t) {
      for (var n = 0, r = t.length; n < r; ++n) this.remove(t[n]);
      return this;
    }),
    (O.root = function () {
      return this._root;
    }),
    (O.size = function () {
      var t = 0;
      return (
        this.visit(function (n) {
          if (!n.length)
            do ++t;
            while ((n = n.next));
        }),
        t
      );
    }),
    (O.visit = function (t) {
      var n,
        r,
        e,
        i,
        o,
        a,
        u = [],
        l = this._root;
      for (l && u.push(new T(l, this._x0, this._y0, this._x1, this._y1)); (n = u.pop()); )
        if (!t((l = n.node), (e = n.x0), (i = n.y0), (o = n.x1), (a = n.y1)) && l.length) {
          var f = (e + o) / 2,
            s = (i + a) / 2;
          ((r = l[3]) && u.push(new T(r, f, s, o, a)),
            (r = l[2]) && u.push(new T(r, e, s, f, a)),
            (r = l[1]) && u.push(new T(r, f, i, o, s)),
            (r = l[0]) && u.push(new T(r, e, i, f, s)));
        }
      return this;
    }),
    (O.visitAfter = function (t) {
      var n,
        r = [],
        e = [];
      for (
        this._root && r.push(new T(this._root, this._x0, this._y0, this._x1, this._y1));
        (n = r.pop());
      ) {
        var i = n.node;
        if (i.length) {
          var o,
            a = n.x0,
            u = n.y0,
            l = n.x1,
            f = n.y1,
            s = (a + l) / 2,
            h = (u + f) / 2;
          ((o = i[0]) && r.push(new T(o, a, u, s, h)),
            (o = i[1]) && r.push(new T(o, s, u, l, h)),
            (o = i[2]) && r.push(new T(o, a, h, s, f)),
            (o = i[3]) && r.push(new T(o, s, h, l, f)));
        }
        e.push(n);
      }
      for (; (n = e.pop()); ) t(n.node, n.x0, n.y0, n.x1, n.y1);
      return this;
    }),
    (O.x = function (t) {
      return arguments.length ? ((this._x = t), this) : this._x;
    }),
    (O.y = function (t) {
      return arguments.length ? ((this._y = t), this) : this._y;
    }));
  let F = null,
    V = [];
  self.onmessage = (t) => {
    let { type: r } = t.data;
    switch (r) {
      case 'init': {
        let { nodes: r, edges: e, config: i } = t.data,
          { width: o, height: a, strength: u = -300, distance: l = 100 } = i;
        (F && F.stop(), (V = r.map((t) => ({ ...t }))));
        let f = e.map((t) => ({ ...t }));
        ((F = (function (t) {
          let r;
          var e,
            i = 1,
            o = 0.001,
            a = 1 - Math.pow(0.001, 1 / 300),
            u = 0,
            l = 0.6,
            f = new Map(),
            s = _(v),
            h = n('tick', 'end'),
            c = ((r = 1), () => (r = (1664525 * r + 1013904223) % 4294967296) / 4294967296);
          function v() {
            (y(), h.call('tick', e), i < o && (s.stop(), h.call('end', e)));
          }
          function y(n) {
            var r,
              o,
              s = t.length;
            void 0 === n && (n = 1);
            for (var h = 0; h < n; ++h)
              for (
                i += (u - i) * a,
                  f.forEach(function (t) {
                    t(i);
                  }),
                  r = 0;
                r < s;
                ++r
              )
                (null == (o = t[r]).fx ? (o.x += o.vx *= l) : ((o.x = o.fx), (o.vx = 0)),
                  null == o.fy ? (o.y += o.vy *= l) : ((o.y = o.fy), (o.vy = 0)));
            return e;
          }
          function x() {
            for (var n, r = 0, e = t.length; r < e; ++r) {
              if (
                (((n = t[r]).index = r),
                null != n.fx && (n.x = n.fx),
                null != n.fy && (n.y = n.fy),
                isNaN(n.x) || isNaN(n.y))
              ) {
                var i = 10 * Math.sqrt(0.5 + r),
                  o = r * M;
                ((n.x = i * Math.cos(o)), (n.y = i * Math.sin(o)));
              }
              (isNaN(n.vx) || isNaN(n.vy)) && (n.vx = n.vy = 0);
            }
          }
          function d(n) {
            return (n.initialize && n.initialize(t, c), n);
          }
          return (
            null == t && (t = []),
            x(),
            (e = {
              tick: y,
              restart: function () {
                return (s.restart(v), e);
              },
              stop: function () {
                return (s.stop(), e);
              },
              nodes: function (n) {
                return arguments.length ? ((t = n), x(), f.forEach(d), e) : t;
              },
              alpha: function (t) {
                return arguments.length ? ((i = +t), e) : i;
              },
              alphaMin: function (t) {
                return arguments.length ? ((o = +t), e) : o;
              },
              alphaDecay: function (t) {
                return arguments.length ? ((a = +t), e) : +a;
              },
              alphaTarget: function (t) {
                return arguments.length ? ((u = +t), e) : u;
              },
              velocityDecay: function (t) {
                return arguments.length ? ((l = 1 - t), e) : 1 - l;
              },
              randomSource: function (t) {
                return arguments.length ? ((c = t), f.forEach(d), e) : c;
              },
              force: function (t, n) {
                return arguments.length > 1
                  ? (null == n ? f.delete(t) : f.set(t, d(n)), e)
                  : f.get(t);
              },
              find: function (n, r, e) {
                var i,
                  o,
                  a,
                  u,
                  l,
                  f = 0,
                  s = t.length;
                for (null == e ? (e = 1 / 0) : (e *= e), f = 0; f < s; ++f)
                  (a = (i = n - (u = t[f]).x) * i + (o = r - u.y) * o) < e && ((l = u), (e = a));
                return l;
              },
              on: function (t, n) {
                return arguments.length > 1 ? (h.on(t, n), e) : h.on(t);
              },
            })
          );
        })(V)
          .force(
            'link',
            (function (t) {
              var n,
                r,
                e,
                i,
                o,
                a,
                u = A,
                l = function (t) {
                  return 1 / Math.min(i[t.source.index], i[t.target.index]);
                },
                f = k(30),
                s = 1;
              function h(e) {
                for (var i = 0, u = t.length; i < s; ++i)
                  for (var l, f, h, c, v, y, x, d = 0; d < u; ++d)
                    ((f = (l = t[d]).source),
                      (y =
                        (((y = Math.sqrt(
                          (c = (h = l.target).x + h.vx - f.x - f.vx || b(a)) * c +
                            (v = h.y + h.vy - f.y - f.vy || b(a)) * v
                        )) -
                          r[d]) /
                          y) *
                        e *
                        n[d]),
                      (c *= y),
                      (v *= y),
                      (h.vx -= c * (x = o[d])),
                      (h.vy -= v * x),
                      (f.vx += c * (x = 1 - x)),
                      (f.vy += v * x));
              }
              function c() {
                if (e) {
                  var a,
                    l,
                    f = e.length,
                    s = t.length,
                    h = new Map(e.map((t, n) => [u(t, n, e), t]));
                  for (a = 0, i = Array(f); a < s; ++a)
                    (((l = t[a]).index = a),
                      'object' != typeof l.source && (l.source = q(h, l.source)),
                      'object' != typeof l.target && (l.target = q(h, l.target)),
                      (i[l.source.index] = (i[l.source.index] || 0) + 1),
                      (i[l.target.index] = (i[l.target.index] || 0) + 1));
                  for (a = 0, o = Array(s); a < s; ++a)
                    ((l = t[a]),
                      (o[a] = i[l.source.index] / (i[l.source.index] + i[l.target.index])));
                  ((n = Array(s)), v(), (r = Array(s)), y());
                }
              }
              function v() {
                if (e) for (var r = 0, i = t.length; r < i; ++r) n[r] = +l(t[r], r, t);
              }
              function y() {
                if (e) for (var n = 0, i = t.length; n < i; ++n) r[n] = +f(t[n], n, t);
              }
              return (
                null == t && (t = []),
                (h.initialize = function (t, n) {
                  ((e = t), (a = n), c());
                }),
                (h.links = function (n) {
                  return arguments.length ? ((t = n), c(), h) : t;
                }),
                (h.id = function (t) {
                  return arguments.length ? ((u = t), h) : u;
                }),
                (h.iterations = function (t) {
                  return arguments.length ? ((s = +t), h) : s;
                }),
                (h.strength = function (t) {
                  return arguments.length ? ((l = 'function' == typeof t ? t : k(+t)), v(), h) : l;
                }),
                (h.distance = function (t) {
                  return arguments.length ? ((f = 'function' == typeof t ? t : k(+t)), y(), h) : f;
                }),
                h
              );
            })(f)
              .id((t) => t.id)
              .distance(l)
          )
          .force(
            'charge',
            (function () {
              var t,
                n,
                r,
                e,
                i,
                o = k(-30),
                a = 1,
                u = 1 / 0,
                l = 0.81;
              function f(r) {
                var i,
                  o = t.length,
                  a = D(t, m, N).visitAfter(h);
                for (e = r, i = 0; i < o; ++i) ((n = t[i]), a.visit(c));
              }
              function s() {
                if (t) {
                  var n,
                    r,
                    e = t.length;
                  for (n = 0, i = Array(e); n < e; ++n) i[(r = t[n]).index] = +o(r, n, t);
                }
              }
              function h(t) {
                var n,
                  r,
                  e,
                  o,
                  a,
                  u = 0,
                  l = 0;
                if (t.length) {
                  for (e = o = a = 0; a < 4; ++a)
                    (n = t[a]) &&
                      (r = Math.abs(n.value)) &&
                      ((u += n.value), (l += r), (e += r * n.x), (o += r * n.y));
                  ((t.x = e / l), (t.y = o / l));
                } else {
                  (((n = t).x = n.data.x), (n.y = n.data.y));
                  do u += i[n.data.index];
                  while ((n = n.next));
                }
                t.value = u;
              }
              function c(t, o, f, s) {
                if (!t.value) return !0;
                var h = t.x - n.x,
                  c = t.y - n.y,
                  v = s - o,
                  y = h * h + c * c;
                if ((v * v) / l < y)
                  return (
                    y < u &&
                      (0 === h && (y += (h = b(r)) * h),
                      0 === c && (y += (c = b(r)) * c),
                      y < a && (y = Math.sqrt(a * y)),
                      (n.vx += (h * t.value * e) / y),
                      (n.vy += (c * t.value * e) / y)),
                    !0
                  );
                if (!t.length && !(y >= u)) {
                  (t.data !== n || t.next) &&
                    (0 === h && (y += (h = b(r)) * h),
                    0 === c && (y += (c = b(r)) * c),
                    y < a && (y = Math.sqrt(a * y)));
                  do
                    t.data !== n &&
                      ((v = (i[t.data.index] * e) / y), (n.vx += h * v), (n.vy += c * v));
                  while ((t = t.next));
                }
              }
              return (
                (f.initialize = function (n, e) {
                  ((t = n), (r = e), s());
                }),
                (f.strength = function (t) {
                  return arguments.length ? ((o = 'function' == typeof t ? t : k(+t)), s(), f) : o;
                }),
                (f.distanceMin = function (t) {
                  return arguments.length ? ((a = t * t), f) : Math.sqrt(a);
                }),
                (f.distanceMax = function (t) {
                  return arguments.length ? ((u = t * t), f) : Math.sqrt(u);
                }),
                (f.theta = function (t) {
                  return arguments.length ? ((l = t * t), f) : Math.sqrt(l);
                }),
                f
              );
            })().strength(u)
          )
          .force(
            'center',
            (function (t, n) {
              var r,
                e = 1;
              function i() {
                var i,
                  o,
                  a = r.length,
                  u = 0,
                  l = 0;
                for (i = 0; i < a; ++i) ((u += (o = r[i]).x), (l += o.y));
                for (u = (u / a - t) * e, l = (l / a - n) * e, i = 0; i < a; ++i)
                  ((o = r[i]), (o.x -= u), (o.y -= l));
              }
              return (
                null == t && (t = 0),
                null == n && (n = 0),
                (i.initialize = function (t) {
                  r = t;
                }),
                (i.x = function (n) {
                  return arguments.length ? ((t = +n), i) : t;
                }),
                (i.y = function (t) {
                  return arguments.length ? ((n = +t), i) : n;
                }),
                (i.strength = function (t) {
                  return arguments.length ? ((e = +t), i) : e;
                }),
                i
              );
            })(o / 2, a / 2)
          )
          .force(
            'collide',
            (function (t) {
              var n,
                r,
                e,
                i = 1,
                o = 1;
              function a() {
                for (var t, a, l, f, s, h, c, v = n.length, y = 0; y < o; ++y)
                  for (t = 0, a = D(n, I, S).visitAfter(u); t < v; ++t)
                    ((c = (h = r[(l = n[t]).index]) * h),
                      (f = l.x + l.vx),
                      (s = l.y + l.vy),
                      a.visit(x));
                function x(t, n, r, o, a) {
                  var u = t.data,
                    v = t.r,
                    y = h + v;
                  if (u) {
                    if (u.index > l.index) {
                      var x = f - u.x - u.vx,
                        d = s - u.y - u.vy,
                        _ = x * x + d * d;
                      _ < y * y &&
                        (0 === x && (_ += (x = b(e)) * x),
                        0 === d && (_ += (d = b(e)) * d),
                        (_ = ((y - (_ = Math.sqrt(_))) / _) * i),
                        (l.vx += (x *= _) * (y = (v *= v) / (c + v))),
                        (l.vy += (d *= _) * y),
                        (u.vx -= x * (y = 1 - y)),
                        (u.vy -= d * y));
                    }
                    return;
                  }
                  return n > f + y || o < f - y || r > s + y || a < s - y;
                }
              }
              function u(t) {
                if (t.data) return (t.r = r[t.data.index]);
                for (var n = (t.r = 0); n < 4; ++n) t[n] && t[n].r > t.r && (t.r = t[n].r);
              }
              function l() {
                if (n) {
                  var e,
                    i,
                    o = n.length;
                  for (e = 0, r = Array(o); e < o; ++e) r[(i = n[e]).index] = +t(i, e, n);
                }
              }
              return (
                'function' != typeof t && (t = k(null == t ? 1 : +t)),
                (a.initialize = function (t, r) {
                  ((n = t), (e = r), l());
                }),
                (a.iterations = function (t) {
                  return arguments.length ? ((o = +t), a) : o;
                }),
                (a.strength = function (t) {
                  return arguments.length ? ((i = +t), a) : i;
                }),
                (a.radius = function (n) {
                  return arguments.length ? ((t = 'function' == typeof n ? n : k(+n)), l(), a) : t;
                }),
                a
              );
            })().radius(
              (t) =>
                ({
                  ChatThread: 20,
                  Source: 15,
                  SourceDoc: 12,
                  Group: 18,
                  Folder: 18,
                  ObjectiveClaim: 14,
                  Constellation: 22,
                  Principal: 16,
                  ConversationThread: 14,
                  Topic: 14,
                  VerifiedSource: 14,
                  VerifiedClaim: 12,
                  CodeBlock: 12,
                  UserNode: 14,
                  Lexeme: 6,
                  Phrase: 8,
                })[t.kind] || 10
            )
          )
          .alphaDecay(0.05)
          .velocityDecay(0.6)).on('tick', () => {
          let t = V.map((t) => {
            var n, r;
            return {
              id: t.id,
              x: null !== (n = t.x) && void 0 !== n ? n : 0,
              y: null !== (r = t.y) && void 0 !== r ? r : 0,
            };
          });
          self.postMessage({ type: 'tick', nodes: t });
        }),
          F.on('end', () => {
            self.postMessage({ type: 'end' });
          }));
        break;
      }
      case 'stop':
        F && F.stop();
        break;
      case 'reheat':
        F && F.alpha(0.3).restart();
        break;
      case 'pin': {
        let { nodeId: n, x: r, y: e } = t.data,
          i = V.find((t) => t.id === n);
        (i && ((i.fx = r), (i.fy = e)), F && F.alphaTarget(0.3).restart());
        break;
      }
      case 'unpin': {
        let { nodeId: n } = t.data,
          r = V.find((t) => t.id === n);
        (r && ((r.fx = null), (r.fy = null)), F && F.alphaTarget(0));
      }
    }
  };
})(),
  (_N_E = {}));
