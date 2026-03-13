'use strict';
(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [757],
  {
    757: function (e, t, r) {
      r.d(t, {
        s: function () {
          return C;
        },
      });
      var l = r(7573),
        a = r(7653);
      function n(e) {
        switch (e) {
          case 'Group':
            return 50;
          case 'Constellation':
            return 40;
          case 'Source':
            return 30;
          case 'ObjectiveClaim':
            return 25;
          default:
            return 20;
        }
      }
      var i = r(1103),
        o = r(429);
      let c = new Set([
          'AccountNode',
          'Principal',
          'UserNode',
          'AgentNode',
          'Group',
          'Folder',
          'Constellation',
          'ObjectiveClaim',
          'UnifiedDoc',
        ]),
        s = new Set([
          ...c,
          'Source',
          'SourceDoc',
          'ChatThread',
          'ConversationThread',
          'VerifiedSource',
          'VerifiedClaim',
        ]),
        u = new Set([...s, 'Topic', 'Phrase', 'Packet', 'CodeBlock', 'Lexeme', 'SourceSpan']),
        d = new Set([
          'the',
          'a',
          'an',
          'and',
          'or',
          'to',
          'of',
          'in',
          'is',
          'are',
          'for',
          'on',
          'with',
          'it',
          'this',
          'that',
        ]),
        g = { L0: 240, L1: 3200, L2: 14e3, L3: 6e4 },
        h = { L0: 1600, L1: 14e3, L2: 6e4, L3: 18e4 },
        f = { L0: 0.7, L1: 0.5, L2: 0.25, L3: 0 },
        m = { L0: 0.6, L1: 0.25, L2: 0.05, L3: 0 };
      function b(e) {
        return 'string' == typeof e ? e : e.id;
      }
      function y(e) {
        var t, r, l, a;
        for (let n of [
          e.mass,
          e.weightedMass,
          e.weighted_mass,
          e.strength,
          e.importance,
          null === (t = e.metadata) || void 0 === t ? void 0 : t.mass,
          null === (r = e.metadata) || void 0 === r ? void 0 : r.weightedMass,
          null === (l = e.metadata) || void 0 === l ? void 0 : l.weighted_mass,
          null === (a = e.metadata) || void 0 === a ? void 0 : a.strength,
        ]) {
          let e = Number(n);
          if (Number.isFinite(e) && e >= 0) return e;
        }
        return 1;
      }
      function v(e) {
        var t, r, l, a;
        for (let n of [
          e.strength,
          e.weight,
          null === (t = e.data) || void 0 === t ? void 0 : t.strength,
          null === (r = e.data) || void 0 === r ? void 0 : r.score,
          null === (l = e.data) || void 0 === l ? void 0 : l.similarity,
          null === (a = e.data) || void 0 === a ? void 0 : a.weight,
        ]) {
          let e = Number(n);
          if (Number.isFinite(e) && e >= 0) return e;
        }
        return 0.5;
      }
      class x {
        clear() {
          this.cells.clear();
        }
        insert(e) {
          if (void 0 === e.x || void 0 === e.y) return;
          let t = this.key(e.x, e.y),
            r = this.cells.get(t);
          (r || ((r = []), this.cells.set(t, r)), r.push(e));
        }
        key(e, t) {
          return ''
            .concat(Math.floor(e / this.cellSize), ',')
            .concat(Math.floor(t / this.cellSize));
        }
        query(e, t, r) {
          let l = [],
            a = Math.floor((e - r) / this.cellSize),
            n = Math.floor((e + r) / this.cellSize),
            i = Math.floor((t - r) / this.cellSize),
            o = Math.floor((t + r) / this.cellSize);
          for (let e = a; e <= n; e++)
            for (let t = i; t <= o; t++) {
              let r = this.cells.get(''.concat(e, ',').concat(t));
              if (r) for (let e of r) l.push(e);
            }
          return l;
        }
        constructor(e = 80) {
          ((this.cells = new Map()), (this.cellSize = e));
        }
      }
      function p(e, t, r) {
        var l, a;
        let n;
        if ('Principal' === e.kind) {
          let t = e.principal_kind;
          n =
            'human' === t
              ? 'rgba(236, 72, 153, 0.7)'
              : 'agent' === t
                ? 'rgba(139, 92, 246, 0.7)'
                : 'contact' === t
                  ? 'rgba(107, 114, 128, 0.6)'
                  : 'rgba(168, 85, 247, 0.6)';
        } else
          n =
            {
              Source: 'rgba(59, 130, 246, 0.6)',
              SourceDoc: 'rgba(20, 184, 166, 0.6)',
              Group: 'rgba(168, 85, 247, 0.6)',
              Folder: 'rgba(234, 179, 8, 0.6)',
              ObjectiveClaim: 'rgba(34, 197, 94, 0.6)',
              Constellation: 'rgba(249, 115, 22, 0.6)',
              UserNode: 'rgba(236, 72, 153, 0.6)',
              Lexeme: 'rgba(148, 163, 184, 0.4)',
              Phrase: 'rgba(251, 146, 60, 0.7)',
              Topic: 'rgba(239, 68, 68, 0.7)',
              VerifiedSource: 'rgba(16, 185, 129, 0.8)',
              VerifiedClaim: 'rgba(59, 130, 246, 0.8)',
              ConversationThread: 'rgba(147, 51, 234, 0.6)',
            }[e.kind] || 'rgba(100, 116, 139, 0.6)';
        return (
          ((null === (l = e.metadata) || void 0 === l ? void 0 : l.isDuplicate) ||
            (null === (a = e.metadata) || void 0 === a ? void 0 : a.status) === 'duplicate') &&
            (n = 'rgba(148, 163, 184, 0.3)'),
          t
            ? (n = n.replace('0.6', '1').replace('0.3', '0.8'))
            : r && (n = n.replace('0.6', '0.8').replace('0.3', '0.5')),
          n
        );
      }
      let C = (0, a.memo)(
        (0, a.forwardRef)((e, t) => {
          let {
              nodes: C,
              edges: M,
              width: S,
              height: N,
              onNodeClick: k,
              onNodeDoubleClick: w,
              onSelectionChange: E,
              onEdgeHover: L,
              onLodStats: R,
            } = e,
            _ = (0, a.useRef)(null),
            A = (0, a.useRef)(null),
            I = (0, a.useRef)(null),
            F = (0, a.useRef)(0),
            T = (0, a.useRef)(0),
            O = (0, a.useRef)(0),
            D = (0, a.useRef)(new Set()),
            P = (0, a.useRef)(new Set()),
            z = (0, a.useRef)({ x: 0, y: 0, scale: 1 }),
            B = (0, a.useRef)({
              isPanning: !1,
              panStartX: 0,
              panStartY: 0,
              selectedNodes: new Set(),
              hoveredNodeId: null,
              hoveredEdge: null,
              draggedNode: null,
              isSelecting: !1,
              selectionBox: null,
            }),
            U = (0, a.useRef)(new x(80)),
            X = (0, a.useRef)(!0),
            Y = (0, a.useRef)({
              onNodeClick: k,
              onNodeDoubleClick: w,
              onSelectionChange: E,
              onEdgeHover: L,
              onLodStats: R,
            });
          Y.current = {
            onNodeClick: k,
            onNodeDoubleClick: w,
            onSelectionChange: E,
            onEdgeHover: L,
            onLodStats: R,
          };
          let V = (0, a.useMemo)(() => {
              let e = new Map();
              return (
                C.forEach((t) => {
                  e.set(t.id, (0, i.F)(t));
                }),
                e
              );
            }, [C]),
            W = (0, a.useMemo)(() => (0, o.lf)(M), [M]),
            H = (0, a.useCallback)(() => {
              let e = U.current;
              e.clear();
              let t = D.current;
              for (let r of C) (!(t.size > 0) || t.has(r.id)) && e.insert(r);
            }, [C]),
            q = (0, a.useCallback)(() => {
              X.current = !0;
            }, []),
            G = (0, a.useCallback)(() => {
              T.current && (cancelAnimationFrame(T.current), (T.current = 0));
            }, []),
            j = (0, a.useCallback)(
              (e) => {
                let t = C.find((t) => t.id === e);
                return t && void 0 !== t.x && void 0 !== t.y ? t : null;
              },
              [C]
            ),
            K = (0, a.useCallback)(
              function (e, t) {
                let r =
                  arguments.length > 2 && void 0 !== arguments[2]
                    ? arguments[2]
                    : (e) => 1 - Math.pow(1 - e, 3);
                G();
                let l = { ...z.current },
                  a = performance.now(),
                  n = (i) => {
                    let o = Math.min(1, (i - a) / t),
                      c = r(o),
                      s = z.current;
                    ((s.x = l.x + (e.x - l.x) * c),
                      (s.y = l.y + (e.y - l.y) * c),
                      (s.scale = l.scale + (e.scale - l.scale) * c),
                      q(),
                      o < 1 ? (T.current = requestAnimationFrame(n)) : (T.current = 0));
                  };
                T.current = requestAnimationFrame(n);
              },
              [q, G]
            );
          (0, a.useImperativeHandle)(
            t,
            () => ({
              zoomIn: () => {
                G();
                let e = z.current;
                ((e.scale = Math.min(1.2 * e.scale, 5)), (O.current = 0), q());
              },
              zoomOut: () => {
                G();
                let e = z.current;
                ((e.scale = Math.max(e.scale / 1.2, 0.1)), (O.current = 0), q());
              },
              centerView: () => {
                if (0 === C.length) return;
                G();
                let e = 1 / 0,
                  t = 1 / 0,
                  r = -1 / 0,
                  l = -1 / 0;
                for (let i of C) {
                  var a, n;
                  let o = null !== (a = i.x) && void 0 !== a ? a : 0,
                    c = null !== (n = i.y) && void 0 !== n ? n : 0;
                  (o < e && (e = o), c < t && (t = c), o > r && (r = o), c > l && (l = c));
                }
                let i = Math.min(S / ((r += 100) - (e -= 100)), N / ((l += 100) - (t -= 100)), 1),
                  o = z.current;
                ((o.x = S / 2 - ((e + r) / 2) * i),
                  (o.y = N / 2 - ((t + l) / 2) * i),
                  (o.scale = i),
                  (O.current = 0),
                  q());
              },
              focusOnNode: function (e) {
                let t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : 1.6,
                  r = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : 220,
                  l = j(e);
                if (!l) return;
                let a = Math.max(0.1, Math.min(5, t));
                K({ x: S / 2 - l.x * a, y: N / 2 - l.y * a, scale: a }, r);
              },
              zoomToFitNodes: (e) => {
                let t = (e.length > 0 ? C.filter((t) => e.includes(t.id)) : C).filter(
                  (e) => void 0 !== e.x && void 0 !== e.y
                );
                if (0 === t.length) return;
                G();
                let r = 1 / 0,
                  l = 1 / 0,
                  a = -1 / 0,
                  n = -1 / 0;
                for (let e of t)
                  ((r = Math.min(r, e.x)),
                    (l = Math.min(l, e.y)),
                    (a = Math.max(a, e.x)),
                    (n = Math.max(n, e.y)));
                let i = Math.max(
                    0.1,
                    Math.min(
                      5,
                      Math.min(
                        S / Math.max((a += 80) - (r -= 80), 1),
                        N / Math.max((n += 80) - (l -= 80), 1)
                      )
                    )
                  ),
                  o = z.current;
                ((o.x = S / 2 - ((r + a) / 2) * i),
                  (o.y = N / 2 - ((l + n) / 2) * i),
                  (o.scale = i),
                  (O.current = 0),
                  q());
              },
              resetView: () => {
                G();
                let e = z.current;
                ((e.x = 0), (e.y = 0), (e.scale = 1), (O.current = 0), q());
              },
              optimizeView: () => {
                ((O.current = Math.min(3, O.current + 1)), q());
              },
            }),
            [K, j, C, q, G, S, N]
          );
          let Q = (0, a.useCallback)(() => {
            var e, t, r;
            let l = _.current;
            if (!l) return;
            I.current || (I.current = document.createElement('canvas'));
            let a = I.current;
            ((a.width = S), (a.height = N));
            let i = a.getContext('2d');
            if (!i) return;
            let o = z.current,
              x = B.current,
              k = Array.from(x.selectedNodes),
              w = 1 === k.length ? k[0] : null,
              E = (function (e) {
                var t;
                let r = (function (e) {
                    let t = !Number.isFinite(e) || e <= 0 ? 0.1 : e;
                    return t < 0.22 ? 'L0' : t < 0.55 ? 'L1' : t < 1.2 ? 'L2' : 'L3';
                  })(e.zoom),
                  l = Number.isFinite((t = e.optimizeLevel))
                    ? Math.max(0, Math.min(3, Math.floor(t)))
                    : 0,
                  a = e.focusNodeId || null,
                  n = !0 === e.includeConnectors,
                  i = Math.max(
                    Number.isFinite(e.minMass) ? Math.max(0, e.minMass) : 0,
                    m[r] + 0.08 * l
                  ),
                  o = (function (e, t) {
                    let r = g[e];
                    return 0 === t ? r : Math.max(60, Math.floor(r / (1 + 0.35 * t)));
                  })(r, l),
                  x = (function (e, t) {
                    let r = h[e];
                    return 0 === t ? r : Math.max(200, Math.floor(r / (1 + 0.4 * t)));
                  })(r, l),
                  p = e.nodes.filter((e) => {
                    var t;
                    return (
                      (t = e.kind),
                      'L0' === r ? c.has(t) : 'L1' === r ? s.has(t) : 'L2' !== r || u.has(t)
                    );
                  });
                if (
                  ((p = p.filter((e) => y(e) >= i)),
                  n ||
                    'L3' !== r ||
                    (p = p.filter((e) => {
                      if ('Lexeme' !== e.kind && 'Phrase' !== e.kind) return !0;
                      let t = (function (e) {
                        for (let t of [e.text, e.lemma, e.title, e.name, e.label])
                          if ('string' == typeof t && t.trim().length > 0)
                            return t.trim().toLowerCase();
                        return null;
                      })(e);
                      return !t || !d.has(t);
                    })),
                  a)
                ) {
                  let t = (function (e, t, r) {
                    let l = new Map();
                    for (let e of t) {
                      var a, n;
                      let t = b(e.source),
                        r = b(e.target);
                      (l.has(t) || l.set(t, new Set()),
                        l.has(r) || l.set(r, new Set()),
                        null === (a = l.get(t)) || void 0 === a || a.add(r),
                        null === (n = l.get(r)) || void 0 === n || n.add(t));
                    }
                    let i = new Set([e]),
                      o = new Set([e]);
                    for (let e = 0; e < 2; e += 1) {
                      let e = new Set();
                      for (let t of o) {
                        let r = l.get(t);
                        if (r) for (let t of r) i.has(t) || (i.add(t), e.add(t));
                      }
                      if (0 === (o = e).size) break;
                    }
                    return i;
                  })(a, e.edges, 0);
                  p = p.filter((e) => t.has(e.id));
                }
                p.length > o &&
                  (p = [...p]
                    .sort((e, t) => {
                      let r = y(t) - y(e);
                      return 0 !== r ? r : e.id.localeCompare(t.id);
                    })
                    .slice(0, o));
                let C = new Set(p.map((e) => e.id)),
                  M = f[r] + 0.05 * l,
                  S = e.edges.filter((e) => {
                    let t = b(e.source),
                      r = b(e.target);
                    return !!(C.has(t) && C.has(r)) && ((!!a && (t === a || r === a)) || v(e) >= M);
                  });
                S.length > x &&
                  (S = [...S]
                    .sort((e, t) => {
                      let r = v(t) - v(e);
                      return 0 !== r ? r : e.id.localeCompare(t.id);
                    })
                    .slice(0, x));
                let N = new Set(S.map((e) => e.id)),
                  k = (function (e) {
                    let t =
                        e.totalNodeCount >= 5e4
                          ? '50k'
                          : e.totalNodeCount >= 1e4
                            ? '10k'
                            : 'default',
                      r = Math.max(
                        50,
                        Math.floor(g[e.level] * ('50k' === t ? 1.35 : '10k' === t ? 1.15 : 1))
                      ),
                      l = Math.max(
                        200,
                        Math.floor(h[e.level] * ('50k' === t ? 1.4 : '10k' === t ? 1.2 : 1))
                      );
                    return {
                      datasetTier: t,
                      pass: e.visibleNodeCount <= r && e.visibleEdgeCount <= l,
                      nodeBudget: r,
                      edgeBudget: l,
                      visibleNodes: e.visibleNodeCount,
                      visibleEdges: e.visibleEdgeCount,
                    };
                  })({
                    level: r,
                    totalNodeCount: e.nodes.length,
                    visibleNodeCount: p.length,
                    visibleEdgeCount: S.length,
                  });
                return {
                  level: r,
                  visibleNodes: p,
                  visibleEdges: S,
                  visibleNodeIds: C,
                  visibleEdgeIds: N,
                  stats: {
                    level: r,
                    totalNodeCount: e.nodes.length,
                    totalEdgeCount: e.edges.length,
                    visibleNodeCount: p.length,
                    visibleEdgeCount: S.length,
                    hiddenNodeCount: Math.max(0, e.nodes.length - p.length),
                    hiddenEdgeCount: Math.max(0, e.edges.length - S.length),
                    focusNodeId: a,
                    gate: k,
                  },
                };
              })({
                nodes: C,
                edges: M,
                zoom: o.scale,
                focusNodeId: w,
                optimizeLevel: O.current,
                includeConnectors: !1,
              }),
              L = E.visibleNodes,
              R = E.visibleEdges;
            ((D.current = E.visibleNodeIds),
              (P.current = E.visibleEdgeIds),
              null === (e = (t = Y.current).onLodStats) || void 0 === e || e.call(t, E.stats),
              i.clearRect(0, 0, S, N),
              i.save(),
              i.translate(o.x, o.y),
              i.scale(o.scale, o.scale));
            let A = -o.x / o.scale - 100,
              F = -o.y / o.scale - 100,
              T = (S - o.x) / o.scale + 100,
              U = (N - o.y) / o.scale + 100;
            if (o.scale > 0.15) {
              let e = new Map();
              for (let t of R) {
                let l = t.source,
                  a = t.target;
                if (void 0 === l.x || void 0 === l.y || void 0 === a.x || void 0 === a.y) continue;
                let n = l.x,
                  i = l.y,
                  c = a.x,
                  s = a.y;
                if ((n < A && c < A) || (n > T && c > T) || (i < F && s < F) || (i > U && s > U))
                  continue;
                let u = (null === (r = x.hoveredEdge) || void 0 === r ? void 0 : r.id) === t.id,
                  d = W.get(t.id);
                if (!d) continue;
                let g = u ? d.highlightColor : d.color,
                  h = u ? d.lineWidth + 2 / o.scale : d.lineWidth / o.scale,
                  f = d.dashArray ? d.dashArray.join(',') : '',
                  m = ''.concat(g, '|').concat(h.toFixed(2), '|').concat(f),
                  b = e.get(m);
                (b || ((b = []), e.set(m, b)),
                  b.push({ edge: t, style: { ...d, color: g, lineWidth: h } }));
              }
              for (let [, t] of e) {
                let e = t[0].style;
                for (let { edge: r } of ((i.strokeStyle = e.color),
                (i.lineWidth = e.lineWidth),
                e.dashArray
                  ? i.setLineDash(e.dashArray.map((e) => e / o.scale))
                  : i.setLineDash([]),
                i.beginPath(),
                t)) {
                  let e = r.source,
                    t = r.target;
                  (i.moveTo(e.x, e.y), i.lineTo(t.x, t.y));
                }
                i.stroke();
              }
            }
            i.setLineDash([]);
            let X = o.scale > 0.3,
              H = o.scale > 0.08;
            for (let e of (X &&
              ((i.font = ''.concat(12 / o.scale, 'px Inter, system-ui, sans-serif')),
              (i.textAlign = 'center'),
              (i.textBaseline = 'top')),
            L)) {
              if (void 0 === e.x || void 0 === e.y || e.x < A || e.x > T || e.y < F || e.y > U)
                continue;
              let t = x.selectedNodes.has(e.id),
                r = x.hoveredNodeId === e.id,
                l = n(e.kind);
              if (H)
                (i.beginPath(),
                  i.arc(e.x, e.y, l, 0, 2 * Math.PI),
                  (i.fillStyle = p(e, t, r)),
                  i.fill(),
                  (i.strokeStyle = t
                    ? 'rgba(168, 85, 247, 1)'
                    : r
                      ? 'rgba(100, 116, 139, 0.8)'
                      : 'rgba(100, 116, 139, 0.3)'),
                  (i.lineWidth = (t ? 3 : 1) / o.scale),
                  i.stroke());
              else {
                i.fillStyle = p(e, t, r);
                let a = Math.max(2 / o.scale, 0.5 * l);
                i.fillRect(e.x - a / 2, e.y - a / 2, a, a);
              }
              if (X) {
                let t = V.get(e.id) || e.id.slice(0, 8),
                  r = o.scale > 1.5 ? 32 : o.scale > 0.8 ? 20 : 12,
                  a = t.length > r ? t.slice(0, r - 1) + '…' : t;
                ((i.fillStyle = 'rgba(255, 255, 255, 0.9)'),
                  i.fillText(a, e.x, e.y + l + 8 / o.scale));
              }
            }
            if ((i.restore(), x.selectionBox)) {
              let { startX: e, startY: t, endX: r, endY: l } = x.selectionBox,
                a = Math.min(e, r),
                n = Math.min(t, l),
                o = Math.abs(r - e),
                c = Math.abs(l - t);
              (i.save(),
                i.setLineDash([5, 5]),
                (i.strokeStyle = 'rgba(168, 85, 247, 0.8)'),
                i.strokeRect(a, n, o, c),
                (i.fillStyle = 'rgba(168, 85, 247, 0.1)'),
                i.fillRect(a, n, o, c),
                i.restore());
            }
            let q = l.getContext('2d');
            q && (q.clearRect(0, 0, S, N), q.drawImage(a, 0, 0));
          }, [C, M, S, N, V, W]);
          ((0, a.useEffect)(() => {
            let e = () => {
              (X.current && ((X.current = !1), Q()), (F.current = requestAnimationFrame(e)));
            };
            return ((F.current = requestAnimationFrame(e)), () => cancelAnimationFrame(F.current));
          }, [Q]),
            (0, a.useEffect)(() => () => G(), [G]),
            (0, a.useEffect)(() => {
              if (!C.length) return;
              A.current && A.current.terminate();
              let e = new Worker(r.tu(new URL(r.p + r.u(97), r.b)));
              A.current = e;
              let t = new Map();
              for (let e of C) t.set(e.id, e);
              return (
                (e.onmessage = (e) => {
                  let { type: r } = e.data;
                  if ('tick' === r) {
                    for (let r of e.data.nodes) {
                      let e = t.get(r.id);
                      e && ((e.x = r.x), (e.y = r.y));
                    }
                    (H(), q());
                  }
                }),
                e.postMessage({
                  type: 'init',
                  nodes: C.map((e) => ({
                    id: e.id,
                    kind: e.kind,
                    x: e.x,
                    y: e.y,
                    fx: e.fx,
                    fy: e.fy,
                  })),
                  edges: M.map((e) => ({
                    id: e.id,
                    source: 'string' == typeof e.source ? e.source : e.source.id,
                    target: 'string' == typeof e.target ? e.target : e.target.id,
                    kind: e.kind,
                  })),
                  config: { width: S, height: N },
                }),
                () => {
                  e.terminate();
                }
              );
            }, [C, M, S, N, H, q]));
          let $ = (0, a.useCallback)((e) => {
              let t = _.current.getBoundingClientRect(),
                r = z.current,
                l = e.clientX - t.left,
                a = e.clientY - t.top,
                n = (l - r.x) / r.scale,
                i = (a - r.y) / r.scale;
              return { x: l, y: a, graphX: n, graphY: i };
            }, []),
            Z = (0, a.useCallback)((e, t) => {
              let r = U.current.query(e, t, 50),
                l = D.current;
              for (let a = r.length - 1; a >= 0; a--) {
                let i = r[a];
                if ((l.size > 0 && !l.has(i.id)) || void 0 === i.x || void 0 === i.y) continue;
                let o = i.x - e,
                  c = i.y - t;
                if (o * o + c * c < n(i.kind) ** 2) return i;
              }
              return null;
            }, []),
            J = (0, a.useCallback)((e, t, r, l, a, n) => {
              let i = a - r,
                o = n - l,
                c = i * i + o * o;
              if (0 === c) return (e - r) ** 2 + (t - l) ** 2;
              let s = Math.max(0, Math.min(1, ((e - r) * i + (t - l) * o) / c));
              return (e - (r + s * i)) ** 2 + (t - (l + s * o)) ** 2;
            }, []),
            ee = (0, a.useCallback)(
              (e, t) => {
                let r = z.current,
                  l = (8 / r.scale) ** 2,
                  a = P.current;
                for (let n of M) {
                  if (a.size > 0 && !a.has(n.id)) continue;
                  let i = n.source,
                    o = n.target;
                  if (void 0 === i.x || void 0 === i.y || void 0 === o.x || void 0 === o.y)
                    continue;
                  let c = Math.min(i.x, o.x) - 8 / r.scale,
                    s = Math.max(i.x, o.x) + 8 / r.scale,
                    u = Math.min(i.y, o.y) - 8 / r.scale,
                    d = Math.max(i.y, o.y) + 8 / r.scale;
                  if (
                    !(e < c) &&
                    !(e > s) &&
                    !(t < u) &&
                    !(t > d) &&
                    J(e, t, i.x, i.y, o.x, o.y) < l
                  )
                    return n;
                }
                return null;
              },
              [M, J]
            ),
            et = (0, a.useCallback)(
              (e) => {
                var t, r, l, a, n, i, o, c, s;
                if (!_.current) return;
                G();
                let { x: u, y: d, graphX: g, graphY: h } = $(e),
                  f = B.current,
                  m = z.current,
                  b = Z(g, h);
                if (b) {
                  if (e.shiftKey) {
                    let e = new Set(f.selectedNodes);
                    (e.has(b.id) ? e.delete(b.id) : e.add(b.id),
                      (f.selectedNodes = e),
                      null === (l = (a = Y.current).onSelectionChange) ||
                        void 0 === l ||
                        l.call(a, Array.from(e)));
                  } else
                    (f.selectedNodes.has(b.id) ||
                      ((f.selectedNodes = new Set([b.id])),
                      null === (i = (o = Y.current).onSelectionChange) ||
                        void 0 === i ||
                        i.call(o, [b.id])),
                      (f.draggedNode = b),
                      (b.fx = b.x),
                      (b.fy = b.y),
                      null === (n = A.current) ||
                        void 0 === n ||
                        n.postMessage({ type: 'pin', nodeId: b.id, x: b.x, y: b.y }));
                  null === (t = (r = Y.current).onNodeClick) || void 0 === t || t.call(r, b);
                } else
                  e.shiftKey
                    ? ((f.isSelecting = !0),
                      (f.selectionBox = { startX: u, startY: d, endX: u, endY: d }))
                    : ((f.isPanning = !0),
                      (f.panStartX = e.clientX - m.x),
                      (f.panStartY = e.clientY - m.y),
                      (f.selectedNodes = new Set()),
                      null === (c = (s = Y.current).onSelectionChange) ||
                        void 0 === c ||
                        c.call(s, []));
                q();
              },
              [$, Z, q, G]
            ),
            er = (0, a.useRef)(null),
            el = (0, a.useRef)(0),
            ea = (0, a.useCallback)(() => {
              var e, t, r, l, a, n, i, o;
              let c = er.current;
              if (!c || !_.current) return;
              er.current = null;
              let { x: s, y: u, graphX: d, graphY: g } = $(c),
                h = B.current,
                f = z.current;
              if (h.draggedNode) {
                ((h.draggedNode.fx = d), (h.draggedNode.fy = g));
                return;
              }
              if (h.isPanning) {
                ((f.x = c.clientX - h.panStartX), (f.y = c.clientY - h.panStartY), q());
                return;
              }
              if (h.isSelecting && h.selectionBox) {
                ((h.selectionBox.endX = s), (h.selectionBox.endY = u), q());
                return;
              }
              let m = Z(d, g),
                b = !1;
              if (m)
                (h.hoveredNodeId !== m.id && ((h.hoveredNodeId = m.id), (b = !0)),
                  h.hoveredEdge &&
                    ((h.hoveredEdge = null),
                    null === (e = (t = Y.current).onEdgeHover) ||
                      void 0 === e ||
                      e.call(t, null, { x: 0, y: 0 }),
                    (b = !0)));
              else {
                null !== h.hoveredNodeId && ((h.hoveredNodeId = null), (b = !0));
                let e = ee(d, g);
                e !== h.hoveredEdge
                  ? ((h.hoveredEdge = e),
                    e
                      ? null === (r = (l = Y.current).onEdgeHover) ||
                        void 0 === r ||
                        r.call(l, e, { x: c.clientX, y: c.clientY })
                      : null === (a = (n = Y.current).onEdgeHover) ||
                        void 0 === a ||
                        a.call(n, null, { x: 0, y: 0 }),
                    (b = !0))
                  : e &&
                    h.hoveredEdge &&
                    (null === (i = (o = Y.current).onEdgeHover) ||
                      void 0 === i ||
                      i.call(o, e, { x: c.clientX, y: c.clientY }));
              }
              b && q();
            }, [$, Z, ee, q]),
            en = (0, a.useCallback)(
              (e) => {
                ((er.current = e),
                  el.current ||
                    (el.current = requestAnimationFrame(() => {
                      ((el.current = 0), ea());
                    })));
              },
              [ea]
            ),
            ei = (0, a.useCallback)(
              (e) => {
                var t, r, l;
                let a = B.current,
                  n = z.current;
                if (
                  (a.draggedNode &&
                    (null === (t = A.current) ||
                      void 0 === t ||
                      t.postMessage({ type: 'unpin', nodeId: a.draggedNode.id }),
                    (a.draggedNode = null)),
                  a.isSelecting && a.selectionBox)
                ) {
                  let { startX: e, startY: t, endX: i, endY: o } = a.selectionBox,
                    c = (Math.min(e, i) - n.x) / n.scale,
                    s = (Math.max(e, i) - n.x) / n.scale,
                    u = (Math.min(t, o) - n.y) / n.scale,
                    d = (Math.max(t, o) - n.y) / n.scale,
                    g = new Set();
                  for (let e of C)
                    void 0 !== e.x &&
                      void 0 !== e.y &&
                      e.x >= c &&
                      e.x <= s &&
                      e.y >= u &&
                      e.y <= d &&
                      g.add(e.id);
                  ((a.selectedNodes = g),
                    null === (r = (l = Y.current).onSelectionChange) ||
                      void 0 === r ||
                      r.call(l, Array.from(g)),
                    (a.selectionBox = null),
                    (a.isSelecting = !1));
                }
                ((a.isPanning = !1), q());
              },
              [C, q]
            ),
            eo = (0, a.useCallback)(
              (e) => {
                var t, r;
                let { graphX: l, graphY: a } = $(e),
                  n = Z(l, a);
                n &&
                  (null === (t = (r = Y.current).onNodeDoubleClick) ||
                    void 0 === t ||
                    t.call(r, n));
              },
              [$, Z]
            );
          (0, a.useEffect)(() => {
            let e = _.current;
            if (!e) return;
            let t = (t) => {
              (t.preventDefault(), G());
              let r = e.getBoundingClientRect(),
                l = t.clientX - r.left,
                a = t.clientY - r.top,
                n = t.deltaY > 0 ? 0.9 : 1.1,
                i = z.current,
                o = Math.max(0.1, Math.min(5, i.scale * n));
              ((i.x = l - (l - i.x) * (o / i.scale)),
                (i.y = a - (a - i.y) * (o / i.scale)),
                (i.scale = o),
                (O.current = 0),
                q());
            };
            return (
              e.addEventListener('wheel', t, { passive: !1 }),
              () => e.removeEventListener('wheel', t)
            );
          }, [q, G]);
          let ec = (0, a.useCallback)(() => {
            let e = B.current;
            return e.isPanning
              ? 'cursor-grabbing'
              : e.isSelecting
                ? 'cursor-crosshair'
                : e.draggedNode
                  ? 'cursor-grabbing'
                  : e.hoveredNodeId
                    ? 'cursor-pointer'
                    : 'cursor-grab';
          }, []);
          return (0, l.jsx)('canvas', {
            ref: _,
            width: S,
            height: N,
            onMouseDown: et,
            onMouseMove: en,
            onMouseUp: ei,
            onMouseLeave: ei,
            onDoubleClick: eo,
            className: 'bg-slate-950 '.concat(ec()),
          });
        })
      );
      C.displayName = 'Keimenon2D';
    },
    429: function (e, t, r) {
      r.d(t, {
        QI: function () {
          return n;
        },
        lf: function () {
          return o;
        },
      });
      let l = {
          CONTAINS: {
            color: 'rgba(59, 130, 246, 0.4)',
            highlightColor: 'rgba(59, 130, 246, 0.8)',
            label: 'Contains',
            category: 'structural',
          },
          HAS_MESSAGE: {
            color: 'rgba(59, 130, 246, 0.4)',
            highlightColor: 'rgba(59, 130, 246, 0.8)',
            label: 'Has Message',
            category: 'structural',
          },
          DERIVES_FROM: {
            color: 'rgba(168, 85, 247, 0.4)',
            highlightColor: 'rgba(168, 85, 247, 0.8)',
            label: 'Derives From',
            category: 'structural',
          },
          EXTRACTED_FROM: {
            color: 'rgba(168, 85, 247, 0.4)',
            highlightColor: 'rgba(168, 85, 247, 0.8)',
            label: 'Extracted From',
            category: 'structural',
          },
          COMPILED_FROM: {
            color: 'rgba(139, 92, 246, 0.4)',
            highlightColor: 'rgba(139, 92, 246, 0.8)',
            label: 'Compiled From',
            category: 'structural',
          },
          STITCHED_FROM: {
            color: 'rgba(139, 92, 246, 0.4)',
            highlightColor: 'rgba(139, 92, 246, 0.8)',
            label: 'Stitched From',
            category: 'structural',
          },
          NEAR_DUP: {
            color: 'rgba(251, 146, 60, 0.5)',
            highlightColor: 'rgba(251, 146, 60, 0.9)',
            label: 'Near Duplicate',
            category: 'similarity',
            dashArray: [4, 4],
          },
          EXACT_DUP: {
            color: 'rgba(239, 68, 68, 0.5)',
            highlightColor: 'rgba(239, 68, 68, 0.9)',
            label: 'Exact Duplicate',
            category: 'similarity',
          },
          EQUIVALENT_TO: {
            color: 'rgba(234, 179, 8, 0.5)',
            highlightColor: 'rgba(234, 179, 8, 0.9)',
            label: 'Equivalent To',
            category: 'similarity',
          },
          DUP_OF: {
            color: 'rgba(251, 146, 60, 0.5)',
            highlightColor: 'rgba(251, 146, 60, 0.9)',
            label: 'Duplicate Of',
            category: 'similarity',
          },
          SIMILAR_TO: {
            color: 'rgba(251, 191, 36, 0.5)',
            highlightColor: 'rgba(251, 191, 36, 0.9)',
            label: 'Similar To',
            category: 'similarity',
            dashArray: [6, 3],
          },
          CLUSTER_MEMBER: {
            color: 'rgba(245, 158, 11, 0.4)',
            highlightColor: 'rgba(245, 158, 11, 0.8)',
            label: 'Cluster Member',
            category: 'similarity',
            dashArray: [2, 2],
          },
          MENTIONS: {
            color: 'rgba(148, 163, 184, 0.35)',
            highlightColor: 'rgba(148, 163, 184, 0.75)',
            label: 'Mentions',
            category: 'semantic',
          },
          CO_OCCURS_WITH: {
            color: 'rgba(16, 185, 129, 0.45)',
            highlightColor: 'rgba(16, 185, 129, 0.85)',
            label: 'Co-occurs With',
            category: 'semantic',
          },
          BELONGS_TO_TOPIC: {
            color: 'rgba(236, 72, 153, 0.45)',
            highlightColor: 'rgba(236, 72, 153, 0.85)',
            label: 'Belongs To Topic',
            category: 'semantic',
          },
          ABOUT: {
            color: 'rgba(139, 92, 246, 0.45)',
            highlightColor: 'rgba(139, 92, 246, 0.85)',
            label: 'About',
            category: 'semantic',
          },
          IN_SCOPE_FOR: {
            color: 'rgba(6, 182, 212, 0.4)',
            highlightColor: 'rgba(6, 182, 212, 0.8)',
            label: 'In Scope For',
            category: 'semantic',
          },
          SUPPORTS: {
            color: 'rgba(34, 197, 94, 0.55)',
            highlightColor: 'rgba(34, 197, 94, 0.95)',
            label: 'Supports',
            category: 'verification',
          },
          REFUTES: {
            color: 'rgba(239, 68, 68, 0.55)',
            highlightColor: 'rgba(239, 68, 68, 0.95)',
            label: 'Refutes',
            category: 'verification',
          },
          VERIFIED_BY: {
            color: 'rgba(6, 182, 212, 0.45)',
            highlightColor: 'rgba(6, 182, 212, 0.85)',
            label: 'Verified By',
            category: 'verification',
          },
          SOURCED_FROM: {
            color: 'rgba(20, 184, 166, 0.45)',
            highlightColor: 'rgba(20, 184, 166, 0.85)',
            label: 'Sourced From',
            category: 'verification',
          },
        },
        a = {
          color: 'rgba(100, 116, 139, 0.3)',
          highlightColor: 'rgba(100, 116, 139, 0.6)',
          label: 'Related',
          category: 'structural',
        };
      function n(e) {
        return l[e] || a;
      }
      let i = new Map();
      function o(e) {
        let t = new Map();
        for (let a of e) {
          var r, l;
          let e = n(a.kind),
            o = (function (e, t) {
              let r = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : 2;
              if (!t) return r;
              if ('NEAR_DUP' === e && 'number' == typeof t.score) return r + 4 * t.score;
              if ('MENTIONS' === e && 'number' == typeof t.count)
                return Math.min(r + Math.log2(t.count + 1), 6);
              if ('CO_OCCURS_WITH' === e) {
                if ('number' == typeof t.pmi) return r + Math.min(Math.abs(t.pmi), 4);
                if ('number' == typeof t.count) return Math.min(r + Math.log2(t.count + 1), 6);
              }
              return 'number' == typeof t.weight
                ? r + 4 * t.weight
                : 'number' == typeof t.strength
                  ? r + 4 * t.strength
                  : 'number' == typeof t.similarity_score
                    ? r + 4 * t.similarity_score
                    : r;
            })(a.kind, a.data, 2),
            c =
              (a.kind,
              (l = a.data)
                ? 'number' == typeof l.score
                  ? 0.4 + 0.6 * l.score
                  : 'number' == typeof l.weight
                    ? 0.4 + 0.6 * l.weight
                    : 'number' == typeof l.strength
                      ? 0.4 + 0.6 * l.strength
                      : 'number' == typeof l.similarity_score
                        ? 0.4 + 0.6 * l.similarity_score
                        : 'number' == typeof l.confidence
                          ? 0.4 + 0.6 * l.confidence
                          : 1
                : 1),
            s = (function (e, t) {
              let r = (function (e) {
                var t;
                let r = i.get(e);
                if (r) return r;
                let l = e.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
                if (!l) return null;
                let a = {
                  r: l[1],
                  g: l[2],
                  b: l[3],
                  a: parseFloat(null !== (t = l[4]) && void 0 !== t ? t : '1'),
                };
                return (i.set(e, a), a);
              })(e);
              if (!r) return e;
              let l = Math.min(1, r.a * t);
              return 'rgba('
                .concat(r.r, ', ')
                .concat(r.g, ', ')
                .concat(r.b, ', ')
                .concat(l.toFixed(3), ')');
            })(e.color, c);
          t.set(a.id, {
            color: s,
            highlightColor: e.highlightColor,
            lineWidth: o,
            dashArray: null !== (r = e.dashArray) && void 0 !== r ? r : null,
          });
        }
        return t;
      }
    },
    1103: function (e, t, r) {
      function l(e) {
        var t, r, l;
        let n = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : 24;
        return (l = e.label
          ? e.label
          : e.title
            ? e.title
            : e.name
              ? e.name
              : 'Lexeme' === e.kind && e.lemma
                ? e.lemma
                : 'Phrase' === e.kind && (e.text || e.normalized_text)
                  ? e.text || e.normalized_text || ''
                  : 'VerifiedClaim' === e.kind && e.claim_text
                    ? e.claim_text
                    : 'Principal' === e.kind
                      ? e.display_name
                        ? e.display_name
                        : 'agent' === e.principal_kind && e.platform
                          ? {
                              chatgpt: 'ChatGPT',
                              claude: 'Claude',
                              gemini: 'Gemini',
                              unknown: 'AI Assistant',
                            }[(t = e.platform).toLowerCase()] || t
                          : 'human' === e.principal_kind && e.email
                            ? e.email
                            : ((r = e.principal_kind) &&
                                { human: 'User', agent: 'AI Assistant', contact: 'Contact' }[r]) ||
                              'Principal'
                      : 'ConversationThread' === e.kind
                        ? e.title
                          ? e.title
                          : e.purpose
                            ? ''.concat(a(e.purpose), ' thread')
                            : 'Conversation'
                        : e.role
                          ? ''.concat(a(e.role), ' message')
                          : e.language
                            ? ''.concat(e.language, ' code')
                            : e.kind
                                .replace(/([a-z])([A-Z])/g, '$1 $2')
                                .replace(/^./, (e) => e.toUpperCase())).length <= n
          ? l
          : l.slice(0, n - 1) + '…';
      }
      function a(e) {
        return e.charAt(0).toUpperCase() + e.slice(1).toLowerCase();
      }
      r.d(t, {
        F: function () {
          return l;
        },
      });
    },
  },
]);
