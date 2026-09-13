'use strict';
(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [336],
  {
    1336: function (e, t, n) {
      n.d(t, {
        A: function () {
          return eh;
        },
      });
      var r = n(7573),
        i = n(7653),
        l = n(612),
        o = n(2929),
        s = n(9821),
        a = n(8813);
      let u = new Set(['AccountNode', 'Principal', 'UserNode', 'AgentNode']),
        d = new Set(['Group', 'Folder']),
        c = new Set(['IN_GROUP', 'FOLDS_INTO_FOLDER', 'CONTAINS']),
        h = 'cluster:__orphans__';
      function f(e) {
        var t, n, r;
        for (let i of [
          e.mass,
          e.weightedMass,
          e.weighted_mass,
          e.strength,
          e.importance,
          null === (t = e.metadata) || void 0 === t ? void 0 : t.mass,
          null === (n = e.metadata) || void 0 === n ? void 0 : n.weightedMass,
          null === (r = e.metadata) || void 0 === r ? void 0 : r.weighted_mass,
        ]) {
          let e = Number(i);
          if (Number.isFinite(e) && e >= 0) return e;
        }
        return 1;
      }
      function g(e) {
        return 'string' == typeof e ? e : e.id;
      }
      function m(e) {
        return {
          id: e.id,
          kind: 'Constellation',
          label: e.label,
          name: e.label,
          mass: e.aggregateMass,
          text: ''.concat(e.memberCount, ' nodes'),
        };
      }
      function p(e) {
        return {
          id: e.id,
          kind: 'SIMILAR_TO',
          source: e.sourceClusterId,
          target: e.targetClusterId,
          data: { strength: Math.min(1, e.weight / 50), weight: e.weight },
        };
      }
      let v = new Set([
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
        b = new Set([
          ...v,
          'Source',
          'SourceDoc',
          'ChatThread',
          'ConversationThread',
          'VerifiedSource',
          'VerifiedClaim',
        ]),
        x = new Set([...b, 'Topic', 'Phrase', 'Packet', 'CodeBlock', 'Lexeme', 'SourceSpan']),
        C = new Set([
          'AccountNode',
          'Principal',
          'UserNode',
          'AgentNode',
          'Group',
          'Source',
          'SourceDoc',
          'ConversationThread',
          'ChatThread',
        ]),
        M = new Set([
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
        w = { L0: 240, L1: 3200, L2: 14e3, L3: 6e4 },
        y = { L0: 1600, L1: 14e3, L2: 6e4, L3: 18e4 },
        N = { L0: 0.7, L1: 0.5, L2: 0.25, L3: 0 },
        S = new Set([
          'OWNED_BY',
          'CREATED_BY',
          'IN_GROUP',
          'FOLDS_INTO_FOLDER',
          'CONTAINS',
          'HAS_MESSAGE',
        ]),
        _ = { L0: 0.6, L1: 0.25, L2: 0.05, L3: 0 };
      function I(e) {
        let t = !Number.isFinite(e) || e <= 0 ? 0.1 : e;
        return t < 0.22 ? 'L0' : t < 0.55 ? 'L1' : t < 1.2 ? 'L2' : 'L3';
      }
      function k(e) {
        return 'string' == typeof e ? e : e.id;
      }
      let E = new WeakMap();
      function A(e) {
        var t, n, r, i;
        let l = E.get(e);
        if (void 0 !== l) return l;
        let o = [
            e.mass,
            e.weightedMass,
            e.weighted_mass,
            e.strength,
            e.importance,
            null === (t = e.metadata) || void 0 === t ? void 0 : t.mass,
            null === (n = e.metadata) || void 0 === n ? void 0 : n.weightedMass,
            null === (r = e.metadata) || void 0 === r ? void 0 : r.weighted_mass,
            null === (i = e.metadata) || void 0 === i ? void 0 : i.strength,
          ],
          s = 1;
        for (let e of o) {
          let t = Number(e);
          if (Number.isFinite(t) && t >= 0) {
            s = t;
            break;
          }
        }
        return (E.set(e, s), s);
      }
      let L = new WeakMap();
      function j(e) {
        var t, n, r, i;
        let l = L.get(e);
        if (void 0 !== l) return l;
        let o = [
            e.strength,
            e.weight,
            null === (t = e.data) || void 0 === t ? void 0 : t.strength,
            null === (n = e.data) || void 0 === n ? void 0 : n.score,
            null === (r = e.data) || void 0 === r ? void 0 : r.similarity,
            null === (i = e.data) || void 0 === i ? void 0 : i.weight,
          ],
          s = 0.5;
        for (let e of o) {
          let t = Number(e);
          if (Number.isFinite(t) && t >= 0) {
            s = t;
            break;
          }
        }
        return (L.set(e, s), s);
      }
      function P(e) {
        return [...e].sort((e, t) => {
          let n = A(t) - A(e);
          return 0 !== n ? n : e.id < t.id ? -1 : e.id > t.id ? 1 : 0;
        });
      }
      function T(e) {
        let t = e.totalNodeCount >= 5e4 ? '50k' : e.totalNodeCount >= 1e4 ? '10k' : 'default',
          n = Math.max(50, Math.floor(w[e.level] * ('50k' === t ? 1.35 : '10k' === t ? 1.15 : 1))),
          r = Math.max(200, Math.floor(y[e.level] * ('50k' === t ? 1.4 : '10k' === t ? 1.2 : 1))),
          i = null;
        return (
          e.visibleNodeCount > n
            ? (i =
                e.mustKeepNodeCount >= e.visibleNodeCount || e.mustKeepNodeCount > n
                  ? 'intentional_anchors'
                  : 'lod_failure')
            : e.visibleEdgeCount > r && (i = 'lod_failure'),
          {
            datasetTier: t,
            pass:
              (e.visibleNodeCount <= n && e.visibleEdgeCount <= r) ||
              ('intentional_anchors' === i && e.visibleEdgeCount <= r),
            nodeBudget: n,
            edgeBudget: r,
            visibleNodes: e.visibleNodeCount,
            visibleEdges: e.visibleEdgeCount,
            overflowReason: i,
          }
        );
      }
      function F(e) {
        return ''.concat('keimenon:positions:').concat(e);
      }
      class O {
        get accountId() {
          return this._accountId;
        }
        get count() {
          return this._positions.size;
        }
        get persistent() {
          return this._storageAvailable;
        }
        load() {
          if (!this._storageAvailable) return;
          let e = (function (e) {
            try {
              return localStorage.getItem(e);
            } catch (e) {
              return null;
            }
          })(F(this._accountId));
          e &&
            (this._positions = (function (e) {
              try {
                let t = JSON.parse(e);
                if (!Array.isArray(t)) return new Map();
                let n = new Map();
                for (let e of t) {
                  if (
                    !Array.isArray(e) ||
                    2 !== e.length ||
                    'string' != typeof e[0] ||
                    !Array.isArray(e[1]) ||
                    3 !== e[1].length
                  )
                    continue;
                  let [t, r] = e,
                    [i, l, o] = r;
                  'number' == typeof i &&
                    'number' == typeof l &&
                    'number' == typeof o &&
                    Number.isFinite(i) &&
                    Number.isFinite(l) &&
                    Number.isFinite(o) &&
                    n.set(t, [i, l, o]);
                }
                return n;
              } catch (e) {
                return new Map();
              }
            })(e));
        }
        get(e) {
          return this._positions.get(e);
        }
        getAll() {
          return new Map(this._positions);
        }
        set(e, t) {
          (this._positions.set(e, t), this._scheduleSave());
        }
        setBatch(e) {
          for (let [t, n] of e) this._positions.set(t, n);
          this._scheduleSave();
        }
        delete(e) {
          let t = this._positions.delete(e);
          return (t && this._scheduleSave(), t);
        }
        has(e) {
          return this._positions.has(e);
        }
        clear() {
          (this._positions.clear(),
            this._cancelPendingSave(),
            (function (e) {
              try {
                localStorage.removeItem(e);
              } catch (e) {}
            })(F(this._accountId)),
            (this._persistedAt = null));
        }
        flush() {
          (this._cancelPendingSave(), this._persist());
        }
        snapshot() {
          return {
            accountId: this._accountId,
            positions: new Map(this._positions),
            count: this._positions.size,
            persistedAt: this._persistedAt,
          };
        }
        dispose() {
          this._cancelPendingSave();
        }
        _scheduleSave() {
          this._storageAvailable &&
            (this._cancelPendingSave(),
            (this._debounceTimer = setTimeout(() => {
              this._persist();
            }, 500)));
        }
        _cancelPendingSave() {
          null !== this._debounceTimer &&
            (clearTimeout(this._debounceTimer), (this._debounceTimer = null));
        }
        _persist() {
          if (!this._storageAvailable) return;
          let e = (function (e) {
            let t = [];
            for (let [n, r] of e.entries()) t.push([n, r]);
            return JSON.stringify(t.length > 5e3 ? t.slice(t.length - 5e3) : t);
          })(this._positions);
          (function (e, t) {
            try {
              return (localStorage.setItem(e, t), !0);
            } catch (e) {
              return !1;
            }
          })(F(this._accountId), e) && (this._persistedAt = Date.now());
        }
        constructor(e) {
          ((this._persistedAt = null),
            (this._debounceTimer = null),
            (this._accountId = e),
            (this._positions = new Map()),
            (this._storageAvailable = (function () {
              try {
                let e = '__keimenon_ls_test__';
                return (localStorage.setItem(e, '1'), localStorage.removeItem(e), !0);
              } catch (e) {
                return !1;
              }
            })()));
        }
      }
      let R = null;
      var D = n(1914);
      function z() {
        let { gl: e } = (0, l.D)(),
          [t, n] = (0, i.useState)({ fps: 0, drawCalls: 0, triangles: 0 }),
          o = (0, i.useRef)(0),
          s = (0, i.useRef)(performance.now());
        return (
          (0, l.F)(() => {
            o.current += 1;
            let t = performance.now();
            t >= s.current + 1e3 &&
              (n({
                fps: Math.round((1e3 * o.current) / (t - s.current)),
                drawCalls: e.info.render.calls,
                triangles: e.info.render.triangles,
              }),
              (o.current = 0),
              (s.current = t));
          }),
          (0, r.jsx)(D.V, {
            position: [-window.innerWidth / 2 + 20, window.innerHeight / 2 - 20, 0],
            zIndexRange: [100, 0],
            children: (0, r.jsxs)('div', {
              className:
                'bg-slate-900/90 border border-slate-700 text-slate-300 p-4 rounded shadow-lg font-mono text-xs w-64 pointer-events-none',
              children: [
                (0, r.jsx)('div', {
                  className: 'font-semibold text-slate-100 mb-3 border-b border-slate-700 pb-2',
                  children: 'Renderer Metrics',
                }),
                (0, r.jsxs)('div', {
                  className: 'grid grid-cols-2 gap-y-2',
                  children: [
                    (0, r.jsx)('span', { className: 'text-slate-400', children: 'FPS:' }),
                    (0, r.jsx)('span', {
                      className:
                        t.fps >= 55
                          ? 'text-emerald-400 font-bold'
                          : t.fps >= 30
                            ? 'text-amber-400 font-bold'
                            : 'text-rose-400 font-bold',
                      children: t.fps,
                    }),
                    (0, r.jsx)('span', { className: 'text-slate-400', children: 'Draw Calls:' }),
                    (0, r.jsx)('span', {
                      className:
                        t.drawCalls <= 100
                          ? 'text-emerald-400 font-bold'
                          : 'text-amber-400 font-bold',
                      children: t.drawCalls,
                    }),
                    (0, r.jsx)('span', { className: 'text-slate-400', children: 'Triangles:' }),
                    (0, r.jsx)('span', {
                      className: 'text-slate-200',
                      children: t.triangles.toLocaleString(),
                    }),
                  ],
                }),
              ],
            }),
          })
        );
      }
      var V = n(4100);
      function W(e) {
        return Number.isFinite(e) ? e : 0;
      }
      function G(e, t) {
        let n = e.x - t.x,
          r = e.y - t.y;
        return n * n + r * r;
      }
      function B(e) {
        return '2d' === e ? 900 : 980;
      }
      function K(e) {
        return 'string' == typeof e ? e : e.id;
      }
      function U(e) {
        if (0 === e.length) return [0, 0, 0];
        let t = e.reduce((e, t) => [e[0] + t[0], e[1] + t[1], e[2] + t[2]], [0, 0, 0]);
        return [t[0] / e.length, t[1] / e.length, t[2] / e.length];
      }
      function Y(e) {
        let { edgePositions: t } = e;
        return 0 === t.length
          ? null
          : (0, r.jsxs)('lineSegments', {
              children: [
                (0, r.jsx)('bufferGeometry', {
                  children: (0, r.jsx)('bufferAttribute', {
                    attach: 'attributes-position',
                    args: [t, 3],
                  }),
                }),
                (0, r.jsx)('lineBasicMaterial', {
                  color: '#64748b',
                  transparent: !0,
                  opacity: 0.35,
                }),
              ],
            });
      }
      let q = new a.Matrix4(),
        H = new a.Color(),
        X = new a.Vector3(),
        J = new a.Sphere(),
        Z = new a.Frustum(),
        Q = new a.Matrix4(),
        $ = new a.Color('#cbd5e1'),
        ee = new a.Color('#111827');
      function et(e) {
        let { radius: t, nodes: n, onNodeClick: o, onNodePointerDown: s, onNodeHover: a } = e,
          u = (0, i.useRef)(null),
          d = (0, i.useRef)(null),
          c = n.length,
          h = (0, i.useRef)(new Map()),
          f = (0, i.useMemo)(() => new Float32Array(c), [c]),
          g = (0, i.useCallback)((e) => {
            ((e.vertexShader =
              '\n      attribute float instanceOpacity;\n      varying float vInstanceOpacity;\n      '
                .concat(e.vertexShader, '\n    ')
                .replace(
                  '#include <begin_vertex>',
                  '\n      #include <begin_vertex>\n      vInstanceOpacity = instanceOpacity;\n      '
                )),
              (e.fragmentShader = '\n      varying float vInstanceOpacity;\n      '
                .concat(e.fragmentShader, '\n    ')
                .replace(
                  '#include <opaque_fragment>',
                  '\n      #include <opaque_fragment>\n      gl_FragColor.a *= vInstanceOpacity;\n      '
                )));
          }, []);
        (0, l.F)((e) => {
          let { camera: r } = e,
            i = u.current;
          if (!i || 0 === c) return;
          ((i.frustumCulled = !1),
            Q.multiplyMatrices(r.projectionMatrix, r.matrixWorldInverse),
            Z.setFromProjectionMatrix(Q),
            h.current.clear());
          let l = 0;
          for (let e = 0; e < c; e++) {
            let r = n[e];
            if (
              (X.set(r.position[0], r.position[1], r.position[2]),
              J.set(X, 1.5 * t),
              Z.intersectsSphere(J))
            ) {
              var o, s;
              let e = 1;
              (r.isSelected || r.isHovered ? (e = 1.25) : r.isGhosted && (e = 0.6),
                q.makeTranslation(r.position[0], r.position[1], r.position[2]),
                X.set(e, e, e),
                q.scale(X),
                i.setMatrixAt(l, q),
                (o = r.color),
                (s = r.isSelected || r.isHovered),
                H.set(o),
                s
                  ? ((H.r = Math.min(1, H.r + 0.45 * $.r)),
                    (H.g = Math.min(1, H.g + 0.45 * $.g)),
                    (H.b = Math.min(1, H.b + 0.45 * $.b)))
                  : ((H.r = Math.min(1, H.r + 0.15 * ee.r)),
                    (H.g = Math.min(1, H.g + 0.15 * ee.g)),
                    (H.b = Math.min(1, H.b + 0.15 * ee.b))),
                i.setColorAt(l, H),
                d.current && (d.current.array[l] = r.isGhosted ? 0.22 : 1),
                h.current.set(l, r.node.id),
                l++);
            }
          }
          ((i.count = l),
            l > 0 &&
              ((i.instanceMatrix.needsUpdate = !0),
              i.instanceColor && (i.instanceColor.needsUpdate = !0),
              d.current && (d.current.needsUpdate = !0)));
        });
        let m = (0, i.useCallback)((e) => {
            var t;
            let n = e.instanceId;
            return null == n ? null : null !== (t = h.current.get(n)) && void 0 !== t ? t : null;
          }, []),
          p = (0, i.useCallback)(
            (e) => {
              let t = m(e);
              t && (e.stopPropagation(), o(t, e.nativeEvent, !1));
            },
            [m, o]
          ),
          v = (0, i.useCallback)(
            (e) => {
              let t = m(e);
              t && (e.stopPropagation(), o(t, e.nativeEvent, !0));
            },
            [m, o]
          ),
          b = (0, i.useCallback)(
            (e) => {
              let t = m(e);
              t && (e.stopPropagation(), s(t, e.nativeEvent));
            },
            [m, s]
          ),
          x = (0, i.useCallback)(
            (e) => {
              let t = m(e);
              t && a && (e.stopPropagation(), a(t));
            },
            [m, a]
          ),
          C = (0, i.useCallback)(
            (e) => {
              a && a(null);
            },
            [a]
          );
        return 0 === c
          ? null
          : (0, r.jsxs)('instancedMesh', {
              ref: u,
              args: [void 0, void 0, c],
              onClick: p,
              onDoubleClick: v,
              onPointerDown: b,
              onPointerOver: x,
              onPointerOut: C,
              children: [
                (0, r.jsx)('sphereGeometry', {
                  args: [t, 16, 16],
                  children: (0, r.jsx)('instancedBufferAttribute', {
                    ref: d,
                    attach: 'attributes-instanceOpacity',
                    args: [f, 1],
                  }),
                }),
                (0, r.jsx)('meshStandardMaterial', {
                  vertexColors: !0,
                  transparent: !0,
                  metalness: 0.12,
                  roughness: 0.5,
                  onBeforeCompile: g,
                }),
              ],
            });
      }
      let en = function (e) {
          let { renderNodes: t, onNodeClick: n, onNodePointerDown: l, onNodeHover: o } = e,
            s = (0, i.useMemo)(() => {
              let e = new Map();
              for (let n of t) {
                let t = e.get(n.radius);
                t ? t.push(n) : e.set(n.radius, [n]);
              }
              return e;
            }, [t]);
          return (0, r.jsx)(r.Fragment, {
            children: Array.from(s.entries()).map((e) => {
              let [t, i] = e;
              return (0, r.jsx)(
                et,
                { radius: t, nodes: i, onNodeClick: n, onNodePointerDown: l, onNodeHover: o },
                t
              );
            }),
          });
        },
        er = new a.Raycaster(),
        ei = new a.Vector3(),
        el = new a.Vector3(),
        eo = new a.Plane(),
        es = new a.Vector3(),
        ea = new a.Vector2(),
        eu = new Set([
          'OWNED_BY',
          'CREATED_BY',
          'IN_GROUP',
          'FOLDS_INTO_FOLDER',
          'CONTAINS',
          'HAS_MESSAGE',
        ]);
      function ed(e, t) {
        if (!t) return !1;
        for (let n = 0; n < 16; n++) if (e.elements[n] !== t.elements[n]) return !1;
        return !0;
      }
      function ec(e) {
        let {
            renderLens: t,
            interactive: n,
            interactionLocked: o,
            edgePositions: u,
            renderNodes: d,
            renderEdges: c,
            onNodeClickInternal: h,
            onMissedClick: f,
            onZoomSample: g,
            registerController: m,
            positionById: p,
            onEdgePick: v,
            onMarqueeSessionChange: b,
            onMarqueeComplete: x,
            onDragSessionChange: C,
            onNodeDrag: M,
            onNodeHover: w,
          } = e,
          y = (0, i.useRef)(null),
          { camera: N, gl: S, size: _ } = (0, l.D)(),
          k = (0, i.useRef)([0, 0, 0]),
          E = (0, i.useRef)(B(t)),
          A = (0, i.useRef)(0),
          L = (0, i.useRef)(''),
          j = (0, i.useRef)(new Map()),
          P = (0, i.useRef)(null),
          T = (0, i.useRef)(null),
          F = (0, i.useRef)(0),
          O = (0, i.useRef)(null),
          R = (0, i.useRef)(null),
          D = (0, i.useRef)(0),
          z = (0, i.useRef)(null),
          V = (0, i.useRef)(0);
        (0, i.useEffect)(() => {
          V.current += 1;
        }, [d]);
        let K = (0, i.useRef)(0);
        ((0, i.useEffect)(() => {
          K.current += 1;
        }, [c]),
          (0, i.useEffect)(() => {
            let e = new Map();
            for (let t of d) e.set(t.node.id, t.position);
            j.current = e;
          }, [d]));
        let q = (0, i.useCallback)(
            (e, t) => {
              let n = S.domElement.getBoundingClientRect();
              return { x: e - n.left, y: t - n.top };
            },
            [S]
          ),
          H = (0, i.useCallback)(
            (e) => {
              let t = new a.Vector3(e[0], e[1], e[2]).project(N);
              return { x: (0.5 * t.x + 0.5) * _.width, y: (-(0.5 * t.y) + 0.5) * _.height };
            },
            [N, _.height, _.width]
          ),
          X = (0, i.useCallback)(() => {
            let e = k.current,
              t = E.current;
            (N.position.set(e[0], e[1], e[2] + t),
              y.current
                ? (y.current.target.set(e[0], e[1], e[2]), y.current.update())
                : N.lookAt(e[0], e[1], e[2]));
          }, [N]),
          J = (0, i.useCallback)(
            (e) => {
              let t = e.map((e) => p.get(e)).filter((e) => !!e);
              if (0 === t.length) return;
              let n = U(t),
                r = 0;
              for (let e of t) {
                let t = e[0] - n[0],
                  i = e[1] - n[1],
                  l = e[2] - n[2];
                r = Math.max(r, Math.sqrt(t * t + i * i + l * l));
              }
              ((k.current = n), (E.current = Math.max(160, 3.2 * r + 220)), X());
            },
            [X, p]
          ),
          Z = (0, i.useCallback)(
            (e, t) => {
              let r = performance.now();
              if (r - D.current < 24) return;
              if (((D.current = r), !n || P.current || T.current)) {
                R.current && ((R.current = null), v({ kind: 'none', screen: { x: e, y: t } }));
                return;
              }
              let i = q(e, t),
                l = [],
                o = z.current,
                s = o && ed(N.projectionMatrix, o.projectionMatrix),
                a = o && ed(N.matrixWorldInverse, o.matrixWorldInverse),
                u = o && o.renderEdgesVersion === K.current,
                d = o && o.renderNodesVersion === V.current,
                h = o && o.width === _.width && o.height === _.height;
              if (o && s && a && u && d && h) l = o.edges;
              else {
                for (let e of c) {
                  let t = j.current.get(e.sourceId),
                    n = j.current.get(e.targetId);
                  t &&
                    n &&
                    l.push({
                      edgeId: e.edge.id,
                      source: H(t),
                      target: H(n),
                      metadata: e.edge.data,
                    });
                }
                z.current = {
                  edges: l,
                  projectionMatrix: N.projectionMatrix.clone(),
                  matrixWorldInverse: N.matrixWorldInverse.clone(),
                  renderNodesVersion: V.current,
                  renderEdgesVersion: K.current,
                  width: _.width,
                  height: _.height,
                };
              }
              let f = {
                ...(function (e, t) {
                  let n = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : 10,
                    r = null,
                    i = Number.POSITIVE_INFINITY;
                  for (let n of t) {
                    let t = (function (e, t, n) {
                      let r = n.x - t.x,
                        i = n.y - t.y,
                        l = r * r + i * i;
                      if (l <= 1e-6) return G(e, t);
                      let o = Math.max(0, Math.min(1, ((e.x - t.x) * r + (e.y - t.y) * i) / l));
                      return G(e, { x: t.x + o * r, y: t.y + o * i });
                    })(e, n.source, n.target);
                    t < i && ((i = t), (r = n));
                  }
                  return !r || i > Math.max(1, n) * Math.max(1, n)
                    ? { kind: 'none', screen: { x: W(e.x), y: W(e.y) } }
                    : {
                        kind: 'edge',
                        edgeId: r.edgeId,
                        screen: { x: W(e.x), y: W(e.y) },
                        metadata: r.metadata,
                      };
                })(i, l, 10),
                screen: { x: e, y: t },
              };
              if ('edge' === f.kind) {
                if (R.current !== f.edgeId) {
                  var g;
                  ((R.current = null !== (g = f.edgeId) && void 0 !== g ? g : null), v(f));
                } else v(f);
              } else R.current && ((R.current = null), v(f));
            },
            [n, v, c, q, H, N, _.width, _.height]
          );
        ((0, i.useEffect)(() => {
          ((k.current = [0, 0, 0]), (E.current = B(t)), X());
        }, [X, t]),
          (0, i.useEffect)(() => {
            m({
              zoomIn: () => {
                ((E.current = Math.max(120, 0.82 * E.current)), X());
              },
              zoomOut: () => {
                ((E.current = Math.min(6400, 1.2 * E.current)), X());
              },
              centerView: () => {
                ((k.current = [0, 0, 0]), (E.current = B(t)), X());
              },
              setTargetById: function (e) {
                let t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : 1.6,
                  n = p.get(e);
                n && ((k.current = n), (E.current = Math.max(120, 640 / Math.max(0.4, t))), X());
              },
              zoomToFitNodes: J,
            });
          }, [X, p, m, t, J]),
          (0, i.useEffect)(() => {
            let e = (e) => {
                let t = P.current;
                if (t && t.pointerId === e.pointerId) {
                  let n = q(e.clientX, e.clientY),
                    r = n.x - t.lastScreen.x,
                    i = n.y - t.lastScreen.y;
                  ((F.current += Math.abs(r) + Math.abs(i)), (t.lastScreen = n));
                  let l = S.domElement.getBoundingClientRect();
                  if (
                    ((ea.x = ((e.clientX - l.left) / l.width) * 2 - 1),
                    (ea.y = -(((e.clientY - l.top) / l.height) * 2) + 1),
                    er.setFromCamera(ea, N),
                    N.getWorldDirection(ei),
                    ei.negate(),
                    el.set(t.startWorld[0], t.startWorld[1], t.startWorld[2]),
                    eo.setFromNormalAndCoplanarPoint(ei, el),
                    er.ray.intersectPlane(eo, es))
                  ) {
                    let e = [es.x, es.y, es.z];
                    ((t.currentWorld = e), M(t.nodeId, e), C({ ...t }));
                  }
                  return;
                }
                let n = T.current;
                if (n && n.active) {
                  ((n.current = q(e.clientX, e.clientY)), b({ ...n }));
                  return;
                }
                Z(e.clientX, e.clientY);
              },
              t = (e) => {
                let t = P.current;
                if (t && t.pointerId === e.pointerId) {
                  (F.current > 4 && (O.current = t.nodeId),
                    (P.current = null),
                    (F.current = 0),
                    C(null));
                  return;
                }
                let n = T.current;
                n &&
                  n.active &&
                  ((n.current = q(e.clientX, e.clientY)),
                  x(
                    (function (e, t) {
                      var n, r;
                      let i =
                          ((n = t.start),
                          (r = t.current),
                          {
                            left: Math.min(n.x, r.x),
                            right: Math.max(n.x, r.x),
                            top: Math.min(n.y, r.y),
                            bottom: Math.max(n.y, r.y),
                          }),
                        l = e
                          .filter(
                            (e) =>
                              e.point.x >= i.left &&
                              e.point.x <= i.right &&
                              e.point.y >= i.top &&
                              e.point.y <= i.bottom
                          )
                          .map((e) => e.nodeId);
                      return (l.sort((e, t) => e.localeCompare(t)), l);
                    })(
                      d
                        .map((e) => ({ nodeId: e.node.id, point: H(e.position) }))
                        .filter((e) => Number.isFinite(e.point.x) && Number.isFinite(e.point.y)),
                      n
                    ),
                    n.modifiers
                  ),
                  (T.current = null),
                  b(null));
              };
            return (
              window.addEventListener('pointermove', e),
              window.addEventListener('pointerup', t),
              () => {
                (window.removeEventListener('pointermove', e),
                  window.removeEventListener('pointerup', t));
              }
            );
          }, [N, Z, C, x, b, M, d, q, H]));
        let Q = (0, i.useCallback)(
            (e) => {
              if (!n || 0 !== e.button || P.current) return;
              let t = q(e.clientX, e.clientY),
                r = {
                  active: !0,
                  start: t,
                  current: t,
                  modifiers: { shift: e.shiftKey, ctrlOrMeta: e.ctrlKey || e.metaKey },
                };
              ((T.current = r), b(r));
            },
            [n, b, q]
          ),
          $ = (0, i.useCallback)(
            (e, r) => {
              if (!n || 0 !== r.button || r.altKey || r.shiftKey || r.ctrlKey || r.metaKey) return;
              let i = j.current.get(e);
              if (!i) return;
              let l = q(r.clientX, r.clientY),
                o = {
                  nodeId: e,
                  pointerId: r.pointerId,
                  lens: t,
                  startScreen: l,
                  lastScreen: l,
                  startWorld: [...i],
                  currentWorld: [...i],
                };
              ((F.current = 0), (P.current = o), C(o));
            },
            [n, C, t, q]
          ),
          ee = (0, i.useCallback)(
            (e, t, n) => {
              if (O.current === e) {
                O.current = null;
                return;
              }
              h(e, t, n);
            },
            [h]
          );
        return (
          (0, l.F)(() => {
            if (!y.current) return;
            let e = y.current.object.position.distanceTo(y.current.target);
            E.current = e;
            let t = Math.max(0.05, Math.min(6, 820 / Math.max(1, e))),
              n = I(t);
            n !== L.current && ((L.current = n), (A.current = t), g(t));
          }),
          (0, r.jsxs)(r.Fragment, {
            children: [
              (0, r.jsx)('ambientLight', { intensity: 0.45 }),
              (0, r.jsx)('pointLight', { position: [260, 220, 450], intensity: 0.65 }),
              (0, r.jsx)('pointLight', { position: [-260, -160, 260], intensity: 0.35 }),
              (0, r.jsx)(Y, { edgePositions: u }),
              (0, r.jsx)(en, {
                renderNodes: d,
                onNodeClick: ee,
                onNodePointerDown: $,
                onNodeHover: w,
              }),
              (0, r.jsx)(s.z, {
                ref: y,
                enablePan: n && !o,
                enableZoom: n && !o,
                enableRotate: n && !o && '2d' !== t,
                minPolarAngle: '2d' === t ? Math.PI / 2 : 0.2,
                maxPolarAngle: '2d' === t ? Math.PI / 2 : Math.PI - 0.2,
                zoomSpeed: 0.9,
                rotateSpeed: 0.55,
                panSpeed: 0.9,
                makeDefault: !0,
              }),
              (0, r.jsxs)('mesh', {
                position: [0, 0, -500],
                onPointerDown: (e) => Q(e.nativeEvent),
                onClick: (e) => {
                  (e.stopPropagation(), f());
                },
                children: [
                  (0, r.jsx)('planeGeometry', { args: [8e3, 8e3] }),
                  (0, r.jsx)('meshBasicMaterial', { transparent: !0, opacity: 0 }),
                ],
              }),
            ],
          })
        );
      }
      let eh = (0, i.forwardRef)((e, t) => {
        let {
            nodes: n,
            edges: l,
            width: s,
            height: a,
            renderLens: E,
            ndConfig: L = V.hD,
            focusModeEnabled: F = !1,
            includeConnectors: D = !1,
            pinnedNodeIds: W = [],
            interactive: G = !0,
            accountId: B,
            showBenchmark: Y = !1,
            onNodeClick: q,
            onNodeDoubleClick: H,
            onSelectionChange: X,
            onEdgeHover: J,
            onLodStats: Z,
            onPinnedNodeIdsChange: Q,
            onInteractionStateChange: $,
            onVisibilityDiagnostics: ee,
          } = e,
          [et, en] = (0, i.useState)(null),
          [er, ei] = (0, i.useState)([]),
          [el, eo] = (0, i.useState)(1),
          [es, ea] = (0, i.useState)(null),
          [ed, eh] = (0, i.useState)(null),
          [ef, eg] = (0, i.useState)(null),
          [em, ep] = (0, i.useState)(null),
          [ev, eb] = (0, i.useState)(new Map()),
          ex = (0, i.useRef)(null),
          eC = (0, i.useRef)(null);
        ((0, i.useEffect)(() => {
          if (!B) {
            eC.current = null;
            return;
          }
          let e =
            ((R && R.accountId === B) || (R && (R.flush(), R.dispose()), (R = new O(B)).load()), R);
          eC.current = e;
          let t = e.getAll();
          t.size > 0 && eb(t);
          let n = () => e.flush();
          return (
            window.addEventListener('beforeunload', n),
            () => {
              (window.removeEventListener('beforeunload', n), e.flush());
            }
          );
        }, [B]),
          (0, i.useEffect)(() => {
            en(
              (function () {
                try {
                  let e = document.createElement('canvas');
                  return !!(e.getContext('webgl2') || e.getContext('webgl'));
                } catch (e) {
                  return !1;
                }
              })()
            );
          }, []));
        let eM = (0, i.useMemo)(
            () =>
              n.map((e) => {
                var t, n;
                let r = (0, V.Bd)(e);
                return {
                  ...e,
                  x: null !== (t = e.x) && void 0 !== t ? t : r.x,
                  y: null !== (n = e.y) && void 0 !== n ? n : r.y,
                };
              }),
            [n]
          ),
          ew = (0, i.useMemo)(() => new Set(eM.map((e) => e.id)), [eM]),
          ey = (0, i.useMemo)(
            () =>
              l.filter((e) => {
                let t = K(e.source),
                  n = K(e.target);
                return ew.has(t) && ew.has(n);
              }),
            [l, ew]
          ),
          eN = (0, i.useMemo)(() => {
            let e = new Map();
            for (let t of ey) e.set(t.id, t);
            return e;
          }, [ey]),
          eS = 1 === er.length ? er[0] : null,
          e_ = (0, i.useMemo)(
            () =>
              (function (e) {
                var t;
                let n = I(e.zoom),
                  r = Number.isFinite((t = e.optimizeLevel))
                    ? Math.max(0, Math.min(3, Math.floor(t)))
                    : 0,
                  i = e.focusNodeId || null,
                  l = !0 === e.focusMode,
                  o = new Set((e.pinnedNodeIds || []).filter((e) => e.length > 0)),
                  s = !0 === e.includeConnectors,
                  a = Number.isFinite(e.minMass) ? Math.max(0, e.minMass) : 0,
                  E = !0 === e.enableClusters;
                if ('L0' === n && E && !l) {
                  let t = (function (e, t) {
                      var n;
                      if (0 === e.length)
                        return {
                          clusters: [],
                          clusterEdges: [],
                          passthrough: [],
                          nodeToCluster: new Map(),
                          stats: {
                            totalInputNodes: 0,
                            totalInputEdges: 0,
                            clusterCount: 0,
                            passthroughCount: 0,
                            interClusterEdgeCount: 0,
                            orphanClusterMemberCount: 0,
                          },
                        };
                      let r = new Map();
                      for (let t of e) r.set(t.id, t);
                      let i = [],
                        l = new Map(),
                        o = [];
                      for (let t of e)
                        u.has(t.kind) ? i.push(t) : d.has(t.kind) ? l.set(t.id, t) : o.push(t);
                      let s = new Map();
                      for (let e of t) {
                        if (!c.has(e.kind)) continue;
                        let t = g(e.source),
                          n = g(e.target);
                        'CONTAINS' === e.kind
                          ? l.has(t) && !s.has(n) && s.set(n, t)
                          : l.has(n) && !s.has(t) && s.set(t, n);
                      }
                      let a = new Map();
                      for (let e of l.keys()) a.set(e, []);
                      let m = [];
                      for (let e of o) {
                        let t = s.get(e.id);
                        t && a.has(t) ? a.get(t).push(e.id) : m.push(e);
                      }
                      let p = [];
                      for (let [e, t] of a.entries())
                        if (t.length < 2) {
                          for (let n of (p.push(e), t)) {
                            let e = r.get(n);
                            e && m.push(e);
                          }
                          let n = l.get(e);
                          n && m.push(n);
                        }
                      for (let e of p) (a.delete(e), l.delete(e));
                      let v = new Map();
                      for (let [e, t] of a.entries()) {
                        let n = 'cluster:'.concat(e);
                        for (let r of (v.set(e, n), t)) v.set(r, n);
                      }
                      if (m.length > 0) for (let e of m) v.set(e.id, h);
                      for (let e of i) v.set(e.id, 'passthrough:'.concat(e.id));
                      let b = [];
                      for (let [e, t] of a.entries()) {
                        let n = l.get(e),
                          i = [e, ...t],
                          o = i.reduce((e, t) => {
                            let n = r.get(t);
                            return e + (n ? f(n) : 0);
                          }, 0);
                        b.push({
                          id: 'cluster:'.concat(e),
                          anchorId: e,
                          label: n.label || n.title || n.name || n.text || n.kind,
                          memberIds: i,
                          memberCount: i.length,
                          aggregateMass: o,
                          interClusterEdgeCount: 0,
                          kind: 'ClusterSupernode',
                        });
                      }
                      if (m.length > 0) {
                        let e = m.reduce((e, t) => e + f(t), 0);
                        b.push({
                          id: h,
                          anchorId: '__orphans__',
                          label: 'Ungrouped ('.concat(m.length, ')'),
                          memberIds: m.map((e) => e.id),
                          memberCount: m.length,
                          aggregateMass: e,
                          interClusterEdgeCount: 0,
                          kind: 'ClusterSupernode',
                        });
                      }
                      b.sort((e, t) => {
                        let n = t.aggregateMass - e.aggregateMass;
                        return 0 !== n ? n : e.id.localeCompare(t.id);
                      });
                      let x = new Map();
                      for (let e of t) {
                        let t = g(e.source),
                          r = g(e.target),
                          i = v.get(t),
                          l = v.get(r);
                        if (
                          !i ||
                          !l ||
                          i === l ||
                          (i.startsWith('passthrough:') && l.startsWith('passthrough:'))
                        )
                          continue;
                        let o = i < l ? ''.concat(i, '|').concat(l) : ''.concat(l, '|').concat(i);
                        x.set(o, (null !== (n = x.get(o)) && void 0 !== n ? n : 0) + 1);
                      }
                      let C = [],
                        M = 0;
                      for (let [e, t] of x.entries()) {
                        let [n, r] = e.split('|');
                        C.push({
                          id: 'cluster_edge_'.concat(M++),
                          sourceClusterId: n,
                          targetClusterId: r,
                          weight: t,
                          kind: 'CLUSTER_LINK',
                        });
                      }
                      for (let e of (C.sort((e, t) => {
                        let n = t.weight - e.weight;
                        return 0 !== n ? n : e.id.localeCompare(t.id);
                      }),
                      C)) {
                        let t = b.find((t) => t.id === e.sourceClusterId),
                          n = b.find((t) => t.id === e.targetClusterId);
                        (t && (t.interClusterEdgeCount += 1), n && (n.interClusterEdgeCount += 1));
                      }
                      return {
                        clusters: b,
                        clusterEdges: C,
                        passthrough: i,
                        nodeToCluster: v,
                        stats: {
                          totalInputNodes: e.length,
                          totalInputEdges: t.length,
                          clusterCount: b.length,
                          passthroughCount: i.length,
                          interClusterEdgeCount: C.length,
                          orphanClusterMemberCount: m.length,
                        },
                      };
                    })(e.nodes, e.edges),
                    r = t.clusters.map(m),
                    s = t.passthrough,
                    a = [...s, ...r],
                    v = t.clusterEdges.map(p),
                    b = new Set(s.map((e) => e.id)),
                    x = e.edges.filter((e) => {
                      let t = k(e.source),
                        n = k(e.target);
                      return b.has(t) && b.has(n);
                    }),
                    C = new Map();
                  for (let e of t.clusters) C.set(e.anchorId, e.id);
                  let M = [];
                  for (let n of e.edges) {
                    let e = k(n.source),
                      r = k(n.target),
                      i = t.nodeToCluster.get(e),
                      l = t.nodeToCluster.get(r);
                    b.has(e) && l && !l.startsWith('passthrough:')
                      ? M.push({ ...n, id: 'ptc_'.concat(n.id), target: l })
                      : b.has(r) &&
                        i &&
                        !i.startsWith('passthrough:') &&
                        M.push({ ...n, id: 'ptc_'.concat(n.id), source: i });
                  }
                  let w = new Set(),
                    y = [
                      ...x,
                      ...v,
                      ...M.filter((e) => {
                        let t = ''.concat(k(e.source), '|').concat(k(e.target));
                        return !w.has(t) && (w.add(t), !0);
                      }),
                    ],
                    N = new Set(a.map((e) => e.id)),
                    S = new Set(y.map((e) => e.id)),
                    _ = T({
                      level: n,
                      totalNodeCount: e.nodes.length,
                      visibleNodeCount: a.length,
                      visibleEdgeCount: y.length,
                      mustKeepNodeCount: o.size,
                    });
                  return {
                    level: n,
                    visibleNodes: a,
                    visibleEdges: y,
                    visibleNodeIds: N,
                    visibleEdgeIds: S,
                    clusterPlan: t,
                    stats: {
                      level: n,
                      totalNodeCount: e.nodes.length,
                      totalEdgeCount: e.edges.length,
                      visibleNodeCount: a.length,
                      visibleEdgeCount: y.length,
                      hiddenNodeCount: Math.max(0, e.nodes.length - a.length),
                      hiddenEdgeCount: Math.max(0, e.edges.length - y.length),
                      focusNodeId: i,
                      focusMode: l,
                      pinnedNodeCount: o.size,
                      gate: _,
                      clusterStats: t.stats,
                    },
                  };
                }
                let L = Math.max(a, _[n] + 0.08 * r),
                  F = (function (e, t) {
                    let n = w[e];
                    return 0 === t ? n : Math.max(60, Math.floor(n / (1 + 0.35 * t)));
                  })(n, r),
                  O = (function (e, t) {
                    let n = y[e];
                    return 0 === t ? n : Math.max(200, Math.floor(n / (1 + 0.4 * t)));
                  })(n, r),
                  R = e.nodes.filter((e) => {
                    var t;
                    return (
                      (t = e.kind),
                      'L0' === n ? v.has(t) : 'L1' === n ? b.has(t) : 'L2' !== n || x.has(t)
                    );
                  });
                if (
                  ((R = R.filter((e) => A(e) >= L)),
                  s ||
                    'L3' !== n ||
                    (R = R.filter((e) => {
                      if ('Lexeme' !== e.kind && 'Phrase' !== e.kind) return !0;
                      let t = (function (e) {
                        for (let t of [e.text, e.lemma, e.title, e.name, e.label])
                          if ('string' == typeof t && t.trim().length > 0)
                            return t.trim().toLowerCase();
                        return null;
                      })(e);
                      return !t || !M.has(t);
                    })),
                  i && l)
                ) {
                  let t = (function (e, t, n) {
                    let r = new Map();
                    for (let e of t) {
                      var i, l;
                      let t = k(e.source),
                        n = k(e.target);
                      (r.has(t) || r.set(t, new Set()),
                        r.has(n) || r.set(n, new Set()),
                        null === (i = r.get(t)) || void 0 === i || i.add(n),
                        null === (l = r.get(n)) || void 0 === l || l.add(t));
                    }
                    let o = new Set([e]),
                      s = new Set([e]);
                    for (let e = 0; e < 2; e += 1) {
                      let e = new Set();
                      for (let t of s) {
                        let n = r.get(t);
                        if (n) for (let t of n) o.has(t) || (o.add(t), e.add(t));
                      }
                      if (0 === (s = e).size) break;
                    }
                    return o;
                  })(i, e.edges, 0);
                  R = R.filter((e) => t.has(e.id));
                }
                let D = new Set(o);
                i && D.add(i);
                let z = new Map();
                for (let t of e.nodes) (z.set(t.id, t), C.has(t.kind) && D.add(t.id));
                if (D.size > 0) {
                  let e = new Set(R.map((e) => e.id));
                  for (let t of D) {
                    if (e.has(t)) continue;
                    let n = z.get(t);
                    n && (R.push(n), e.add(t));
                  }
                }
                if (e.nodes.length > 0 && 0 === R.length) {
                  let t = e.nodes.filter((e) => C.has(e.kind));
                  R =
                    t.length > 0
                      ? P(t).slice(0, F)
                      : P(e.nodes).slice(0, Math.max(1, Math.min(F, 8)));
                }
                if (R.length > F) {
                  let e = R.filter((e) => D.has(e.id)),
                    t = R.filter((e) => !D.has(e.id)),
                    n = Math.max(0, F - e.length);
                  R = [...e, ...P(t).slice(0, n)];
                }
                let V = new Set(R.map((e) => e.id)),
                  W = N[n] + 0.05 * r,
                  G = e.edges.filter((e) => {
                    let t = k(e.source),
                      n = k(e.target);
                    return (
                      !!(V.has(t) && V.has(n)) &&
                      (!!((i && (t === i || n === i)) || o.has(t) || o.has(n)) || j(e) >= W)
                    );
                  });
                if (
                  (G.length > O &&
                    (G = [...G]
                      .sort((e, t) => {
                        let n = j(t) - j(e);
                        return 0 !== n ? n : e.id < t.id ? -1 : e.id > t.id ? 1 : 0;
                      })
                      .slice(0, O)),
                  R.length > 0 && 0 === G.length && e.edges.length > 0)
                ) {
                  let t = e.edges.filter((e) => {
                    let t = k(e.source),
                      n = k(e.target);
                    return V.has(t) && V.has(n);
                  });
                  t.length > 0 &&
                    (G = [...t]
                      .sort((e, t) => {
                        let n = S.has(e.kind) ? 1 : 0,
                          r = S.has(t.kind) ? 1 : 0;
                        if (n !== r) return r - n;
                        let i = j(t) - j(e);
                        return 0 !== i ? i : e.id < t.id ? -1 : e.id > t.id ? 1 : 0;
                      })
                      .slice(0, Math.min(O, 24)));
                }
                let B = new Set(G.map((e) => e.id)),
                  K = T({
                    level: n,
                    totalNodeCount: e.nodes.length,
                    visibleNodeCount: R.length,
                    visibleEdgeCount: G.length,
                    mustKeepNodeCount: D.size,
                  });
                return {
                  level: n,
                  visibleNodes: R,
                  visibleEdges: G,
                  visibleNodeIds: V,
                  visibleEdgeIds: B,
                  stats: {
                    level: n,
                    totalNodeCount: e.nodes.length,
                    totalEdgeCount: e.edges.length,
                    visibleNodeCount: R.length,
                    visibleEdgeCount: G.length,
                    hiddenNodeCount: Math.max(0, e.nodes.length - R.length),
                    hiddenEdgeCount: Math.max(0, e.edges.length - G.length),
                    focusNodeId: i,
                    focusMode: l,
                    pinnedNodeCount: o.size,
                    gate: K,
                  },
                };
              })({
                nodes: eM,
                edges: ey,
                zoom: el,
                focusNodeId: eS,
                focusMode: F,
                pinnedNodeIds: W,
                includeConnectors: D,
                enableClusters: !0,
              }),
            [eM, ey, el, eS, F, W, D]
          );
        (0, i.useEffect)(() => {
          null == Z || Z(e_.stats);
        }, [e_.stats, Z]);
        let eI = (0, i.useMemo)(() => {
            let e = new Map(),
              t = Math.max(3, L.dims);
            for (let n of e_.visibleNodes) e.set(n.id, (0, V.eP)(n, t));
            return e;
          }, [e_.visibleNodes, L.dims]),
          ek = (0, i.useMemo)(
            () =>
              eS && F
                ? (function (e, t) {
                    let n = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : 2,
                      r = new Set([e]),
                      i = new Set([e]);
                    for (let e = 0; e < n; e += 1) {
                      let e = new Set();
                      for (let n of t) {
                        let t = K(n.source),
                          l = K(n.target);
                        i.has(t) && !r.has(l) ? e.add(l) : i.has(l) && !r.has(t) && e.add(t);
                      }
                      if ((e.forEach((e) => r.add(e)), 0 === (i = e).size)) break;
                    }
                    return r;
                  })(eS, e_.visibleEdges, 2)
                : new Set(),
            [eS, F, e_.visibleEdges]
          ),
          eE = (0, i.useMemo)(() => new Set(W), [W]),
          eA = (0, i.useMemo)(() => new Set(er), [er]),
          eL = (0, i.useMemo)(() => e_.visibleNodes, [e_.visibleNodes]),
          ej = (0, i.useMemo)(() => new Set(eL.map((e) => e.id)), [eL]),
          eP = (0, i.useMemo)(
            () =>
              e_.visibleEdges.filter((e) => {
                let t = K(e.source),
                  n = K(e.target);
                return ej.has(t) && ej.has(n);
              }),
            [e_.visibleEdges, ej]
          ),
          eT = (0, i.useMemo)(() => {
            if (eL.length > 0 && 0 === eP.length && e_.visibleEdges.length > 0) {
              let e = e_.visibleEdges.filter((e) => {
                let t = K(e.source),
                  n = K(e.target);
                return ej.has(t) && ej.has(n);
              });
              if (e.length > 0)
                return [...e]
                  .sort((e, t) => {
                    var n, r, i, l, o, s, a, u, d, c, h, f;
                    let g = eu.has(e.kind) ? 1 : 0,
                      m = eu.has(t.kind) ? 1 : 0;
                    if (g !== m) return m - g;
                    let p = Number(
                        null !==
                          (d =
                            null !==
                              (u =
                                null !==
                                  (a =
                                    null === (n = e.data) || void 0 === n ? void 0 : n.strength) &&
                                void 0 !== a
                                  ? a
                                  : null === (r = e.data) || void 0 === r
                                    ? void 0
                                    : r.score) && void 0 !== u
                              ? u
                              : null === (i = e.data) || void 0 === i
                                ? void 0
                                : i.similarity) && void 0 !== d
                          ? d
                          : 0
                      ),
                      v = Number(
                        null !==
                          (f =
                            null !==
                              (h =
                                null !==
                                  (c =
                                    null === (l = t.data) || void 0 === l ? void 0 : l.strength) &&
                                void 0 !== c
                                  ? c
                                  : null === (o = t.data) || void 0 === o
                                    ? void 0
                                    : o.score) && void 0 !== h
                              ? h
                              : null === (s = t.data) || void 0 === s
                                ? void 0
                                : s.similarity) && void 0 !== f
                          ? f
                          : 0
                      );
                    return p !== v ? v - p : e.id.localeCompare(t.id);
                  })
                  .slice(0, 16);
            }
            return eP;
          }, [e_.visibleEdges, eP, ej, eL.length]);
        (0, i.useEffect)(() => {
          null == ee ||
            ee({
              webGlReady: et,
              lens: E,
              totalNodeCount: eM.length,
              lodVisibleNodeCount: e_.visibleNodes.length,
              lensVisibleNodeCount: eL.length,
              totalEdgeCount: ey.length,
              lodVisibleEdgeCount: e_.visibleEdges.length,
              lensVisibleEdgeCount: eT.length,
              width: s,
              height: a,
            });
        }, [
          a,
          e_.visibleEdges.length,
          e_.visibleNodes.length,
          ey.length,
          eM.length,
          ee,
          E,
          eT.length,
          eL.length,
          et,
          s,
        ]);
        let eF = (0, i.useMemo)(() => {
            let e = new Map(),
              t = [];
            for (let l of eL) {
              var n, r, i;
              let o;
              let s = (0, V.Bd)(l, 1600, 1200);
              if ('2d' === E) o = [s.x, -s.y, 0];
              else if ('3d' === E) {
                let e = null !== (n = eI.get(l.id)) && void 0 !== n ? n : (0, V.eP)(l, L.dims);
                o = [s.x, -s.y, (null !== (r = e[2]) && void 0 !== r ? r : 0) * 260];
              } else {
                let e = null !== (i = eI.get(l.id)) && void 0 !== i ? i : (0, V.eP)(l, L.dims),
                  t = (0, V.DG)(e, L);
                o = [t.x, t.y, t.z];
              }
              (t.push(o), e.set(l.id, o));
            }
            let l = U(t);
            for (let [t, n] of e.entries()) e.set(t, [n[0] - l[0], n[1] - l[1], n[2] - l[2]]);
            return e;
          }, [eL, E, eI, L]),
          eO = (0, i.useMemo)(() => {
            let e = new Map(eF);
            for (let [t, n] of ev.entries()) e.has(t) && e.set(t, n);
            return e;
          }, [eF, ev]);
        (0, i.useEffect)(() => {
          let e = new Set(eL.map((e) => e.id));
          eb((t) => {
            if (0 === t.size) return t;
            let n = new Map();
            for (let [r, i] of t.entries()) e.has(r) && n.set(r, i);
            return n;
          });
        }, [eL]);
        let eR = (0, i.useMemo)(
            () =>
              eL.map((e) => {
                var t;
                let n = eA.has(e.id),
                  r = eE.has(e.id),
                  i = e.id === ed,
                  l = !1;
                if ('nd' === E && !(r || n || ek.has(e.id))) {
                  let t = eI.get(e.id);
                  t && (l = !(0, V.iy)(t, L));
                }
                return {
                  node: e,
                  position: null !== (t = eO.get(e.id)) && void 0 !== t ? t : [0, 0, 0],
                  radius: (function (e) {
                    switch (e) {
                      case 'Constellation':
                        return 14;
                      case 'Group':
                      case 'Folder':
                        return 11;
                      case 'Principal':
                      case 'UserNode':
                        return 9;
                      case 'Source':
                      case 'SourceDoc':
                      case 'VerifiedSource':
                        return 7;
                      case 'ObjectiveClaim':
                      case 'VerifiedClaim':
                        return 6;
                      case 'Topic':
                      default:
                        return 5;
                      case 'Phrase':
                        return 4;
                      case 'Lexeme':
                        return 3;
                    }
                  })(e.kind),
                  color: (function (e, t, n) {
                    let r = e.kind;
                    if (t) return '#f8fafc';
                    if (n) return '#f59e0b';
                    if ('Principal' === r)
                      return 'human' === e.principal_kind
                        ? '#ec4899'
                        : 'agent' === e.principal_kind
                          ? '#8b5cf6'
                          : '#94a3b8';
                    switch (r) {
                      case 'Source':
                        return '#38bdf8';
                      case 'SourceDoc':
                        return '#14b8a6';
                      case 'Group':
                        return '#a855f7';
                      case 'Folder':
                        return '#f59e0b';
                      case 'ObjectiveClaim':
                        return '#22c55e';
                      case 'Constellation':
                        return '#f97316';
                      case 'Lexeme':
                        return '#94a3b8';
                      case 'Phrase':
                        return '#fb923c';
                      case 'Topic':
                        return '#ef4444';
                      case 'VerifiedSource':
                        return '#10b981';
                      case 'VerifiedClaim':
                        return '#3b82f6';
                      case 'ConversationThread':
                      case 'ChatThread':
                        return '#8b5cf6';
                      default:
                        return '#64748b';
                    }
                  })(e, n, r),
                  isSelected: n,
                  isPinned: r,
                  isHovered: i,
                  isGhosted: l,
                };
              }),
            [eL, eO, eA, eE, ed, E, ek, eI, L]
          ),
          eD = (0, i.useMemo)(
            () => eT.map((e) => ({ edge: e, sourceId: K(e.source), targetId: K(e.target) })),
            [eT]
          ),
          ez = (0, i.useMemo)(() => {
            let e = new Float32Array(6 * eD.length),
              t = 0;
            for (let n of eD) {
              let r = eO.get(n.sourceId),
                i = eO.get(n.targetId);
              r &&
                i &&
                ((e[t] = r[0]),
                (e[t + 1] = r[1]),
                (e[t + 2] = r[2]),
                (e[t + 3] = i[0]),
                (e[t + 4] = i[1]),
                (e[t + 5] = i[2]),
                (t += 6));
            }
            return t === e.length ? e : e.slice(0, t);
          }, [eD, eO]),
          eV = (0, i.useCallback)(
            (e) => {
              (ei(e), null == X || X(e));
            },
            [X]
          ),
          eW = (0, i.useCallback)(
            (e) => {
              let t = new Set(W);
              (t.has(e) ? t.delete(e) : t.add(e), null == Q || Q(Array.from(t)));
            },
            [Q, W]
          ),
          eG = (0, i.useCallback)(
            (e, t, n) => {
              let r;
              let i = eM.find((t) => t.id === e);
              if (i) {
                if (t.altKey) {
                  eW(e);
                  return;
                }
                if (t.shiftKey || t.ctrlKey || t.metaKey) {
                  let t = new Set(er);
                  (t.has(e) ? t.delete(e) : t.add(e), (r = Array.from(t)));
                } else r = [e];
                if ((eV(r), n)) {
                  var l;
                  (null == H || H(i),
                    null === (l = ex.current) || void 0 === l || l.setTargetById(i.id, 1.6));
                } else null == q || q(i);
              }
            },
            [eM, q, H, er, eW, eV]
          ),
          eB = (0, i.useCallback)(() => {
            (er.length > 0 && eV([]), ea(null), null == J || J(null, { x: 0, y: 0 }));
          }, [J, er.length, eV]),
          eK = (0, i.useCallback)(
            (e) => {
              var t;
              if ('edge' !== e.kind || !e.edgeId) {
                (ea(null), null == J || J(null, e.screen));
                return;
              }
              let n = eN.get(e.edgeId) || null;
              (ea(null !== (t = null == n ? void 0 : n.id) && void 0 !== t ? t : null),
                null == J || J(n, e.screen));
            },
            [eN, J]
          ),
          eU = (0, i.useCallback)(
            (e, t) => {
              eV(
                (function (e, t, n) {
                  if (!n.shift && !n.ctrlOrMeta) return [...t];
                  let r = new Set(e);
                  if (n.ctrlOrMeta) {
                    for (let e of t) r.has(e) ? r.delete(e) : r.add(e);
                    return Array.from(r).sort((e, t) => e.localeCompare(t));
                  }
                  for (let e of t) r.add(e);
                  return Array.from(r).sort((e, t) => e.localeCompare(t));
                })(er, e, t)
              );
            },
            [er, eV]
          ),
          eY = (0, i.useCallback)((e, t) => {
            var n;
            (eb((n) => {
              let r = new Map(n);
              return (r.set(e, t), r);
            }),
              null === (n = eC.current) || void 0 === n || n.set(e, t));
          }, []),
          eq = (0, i.useMemo)(
            () => ({ selectedNodeIds: er, hoveredEdgeId: es, marqueeSession: ef, dragSession: em }),
            [em, es, ef, er]
          );
        (0, i.useEffect)(() => {
          null == $ || $(eq);
        }, [eq, $]);
        let eH = (0, i.useMemo)(() => {
          if (!ef) return null;
          let e = Math.min(ef.start.x, ef.current.x);
          return {
            left: e,
            top: Math.min(ef.start.y, ef.current.y),
            width: Math.abs(ef.current.x - ef.start.x),
            height: Math.abs(ef.current.y - ef.start.y),
          };
        }, [ef]);
        return ((0, i.useImperativeHandle)(
          t,
          () => ({
            zoomIn: () => {
              var e;
              return null === (e = ex.current) || void 0 === e ? void 0 : e.zoomIn();
            },
            zoomOut: () => {
              var e;
              return null === (e = ex.current) || void 0 === e ? void 0 : e.zoomOut();
            },
            centerView: () => {
              var e;
              return null === (e = ex.current) || void 0 === e ? void 0 : e.centerView();
            },
            focusOnNode: function (e) {
              var t;
              let n = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : 1.6;
              return null === (t = ex.current) || void 0 === t ? void 0 : t.setTargetById(e, n);
            },
            zoomToFitNodes: (e) => {
              var t;
              return null === (t = ex.current) || void 0 === t ? void 0 : t.zoomToFitNodes(e);
            },
            resetView: () => {
              var e;
              return null === (e = ex.current) || void 0 === e ? void 0 : e.centerView();
            },
            optimizeView: () => {
              var e;
              return null === (e = ex.current) || void 0 === e
                ? void 0
                : e.zoomToFitNodes(Array.from(ej.values()));
            },
            resetLayout: () => {
              var e, t;
              (null === (e = eC.current) || void 0 === e || e.clear(),
                eb(new Map()),
                null === (t = ex.current) || void 0 === t || t.centerView());
            },
          }),
          [ej]
        ),
        null === et)
          ? (0, r.jsx)('div', { className: 'w-full h-full bg-slate-950' })
          : et
            ? (0, r.jsxs)('div', {
                className: 'w-full h-full relative',
                style: { width: s, height: a },
                children: [
                  (0, r.jsxs)(o.Xz, {
                    gl: { antialias: !0, alpha: !0 },
                    dpr: [1, 2],
                    camera: { position: [0, 0, 920], fov: 52, near: 0.1, far: 12e3 },
                    onPointerMissed: eB,
                    children: [
                      (0, r.jsx)(ec, {
                        renderLens: E,
                        interactive: G,
                        interactionLocked: !!em || !!ef,
                        edgePositions: ez,
                        renderNodes: eR,
                        renderEdges: eD,
                        onNodeClickInternal: eG,
                        onMissedClick: eB,
                        onZoomSample: eo,
                        registerController: (e) => {
                          ex.current = e;
                        },
                        positionById: eO,
                        onEdgePick: eK,
                        onMarqueeSessionChange: eg,
                        onMarqueeComplete: eU,
                        onDragSessionChange: ep,
                        onNodeDrag: eY,
                        onNodeHover: eh,
                      }),
                      Y && (0, r.jsx)(z, {}),
                    ],
                  }),
                  eH &&
                    (0, r.jsx)('div', {
                      className:
                        'absolute pointer-events-none border border-sky-300/80 bg-sky-500/10 rounded-sm',
                      style: { left: eH.left, top: eH.top, width: eH.width, height: eH.height },
                    }),
                ],
              })
            : (0, r.jsx)('div', {
                className:
                  'w-full h-full flex items-center justify-center bg-slate-950 text-slate-200',
                children: (0, r.jsxs)('div', {
                  className: 'max-w-md text-center px-6',
                  children: [
                    (0, r.jsx)('p', {
                      className: 'text-sm font-semibold mb-2',
                      children: 'WebGL renderer unavailable',
                    }),
                    (0, r.jsx)('p', {
                      className: 'text-xs text-slate-400',
                      children:
                        'Keimenon requires Three.js/WebGL for 2D, 3D, and ND canvas rendering.',
                    }),
                  ],
                }),
              });
      });
      eh.displayName = 'SharedThreeGraphRenderer';
    },
    4100: function (e, t, n) {
      n.d(t, {
        Bd: function () {
          return c;
        },
        DG: function () {
          return u;
        },
        eP: function () {
          return a;
        },
        hD: function () {
          return r;
        },
        iy: function () {
          return d;
        },
      });
      let r = { dims: 8, axes: [0, 1, 2], sliceDim: 3, sliceCenter: 0, sliceWidth: 0.35 };
      function i(e) {
        return (
          (function (e) {
            let t = 2166136261;
            for (let n = 0; n < e.length; n += 1)
              ((t ^= e.charCodeAt(n)), (t = Math.imul(t, 16777619)));
            return t >>> 0;
          })(e) / 4294967295
        );
      }
      function l(e) {
        return 'number' == typeof e && Number.isFinite(e);
      }
      function o(e) {
        let t = Math.sqrt(e.reduce((e, t) => e + t * t, 0));
        return t <= 0 ? e : e.map((e) => e / t);
      }
      function s(e, t) {
        return Number.isFinite(e) ? Math.max(0, Math.min(t - 1, Math.floor(e))) : 0;
      }
      function a(e, t) {
        var n, r, s, a, u, d;
        let c = Math.max(3, Math.floor(t)),
          h = (function (e) {
            var t, n;
            for (let r of [
              e.embedding,
              e.vector,
              null === (t = e.metadata) || void 0 === t ? void 0 : t.embedding,
              null === (n = e.metadata) || void 0 === n ? void 0 : n.vector,
            ]) {
              if (!Array.isArray(r)) continue;
              let e = r.filter(l);
              if (e.length > 0) return e;
            }
            return null;
          })(e);
        if (h && h.length >= c) return o(h.slice(0, c));
        let f = [],
          g = [
            e.mass,
            e.strength,
            e.frequency,
            e.importance,
            e.created_at,
            e.updated_at,
            null === (n = e.metadata) || void 0 === n ? void 0 : n.mass,
            null === (r = e.metadata) || void 0 === r ? void 0 : r.strength,
            null === (s = e.metadata) || void 0 === s ? void 0 : s.frequency,
            null === (a = e.metadata) || void 0 === a ? void 0 : a.importance,
            null === (u = e.metadata) || void 0 === u ? void 0 : u.confidence,
            null === (d = e.metadata) || void 0 === d ? void 0 : d.similarity,
          ].filter(l);
        for (let e = 0; e < g.length && f.length < c; e += 1) f.push(Number(g[e]));
        for (; f.length < c; ) {
          let t = f.length,
            n = ''.concat(e.id, ':').concat(t, ':').concat(e.kind);
          f.push(2 * i(n) - 1);
        }
        return o(f.slice(0, c));
      }
      function u(e, t) {
        var n, r, i;
        let l = Math.max(3, Math.floor(t.dims)),
          o = s(t.axes[0], l),
          a = s(t.axes[1], l),
          u = s(t.axes[2], l);
        return {
          x: (null !== (n = e[o]) && void 0 !== n ? n : 0) * 320,
          y: (null !== (r = e[a]) && void 0 !== r ? r : 0) * 320,
          z: (null !== (i = e[u]) && void 0 !== i ? i : 0) * 320,
        };
      }
      function d(e, t) {
        var n;
        let r = Math.max(3, Math.floor(t.dims)),
          i = null !== (n = e[s(t.sliceDim, r)]) && void 0 !== n ? n : 0,
          l = Math.max(1e-4, t.sliceWidth / 2);
        return Math.abs(i - t.sliceCenter) <= l;
      }
      function c(e) {
        let t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : 1200,
          n = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : 900;
        return l(e.x) && l(e.y)
          ? { x: e.x, y: e.y }
          : {
              x: i(''.concat(e.id, ':x:').concat(e.kind)) * t,
              y: i(''.concat(e.id, ':y:').concat(e.kind)) * n,
            };
      }
    },
  },
]);
