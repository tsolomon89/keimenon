'use client';

import React, { useState, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';

interface BenchmarkStats {
  fps: number;
  drawCalls: number;
  triangles: number;
}

export function BenchmarkHarness() {
  const { gl } = useThree();
  const [stats, setStats] = useState<BenchmarkStats>({ fps: 0, drawCalls: 0, triangles: 0 });

  const frames = useRef(0);
  const prevTime = useRef(performance.now());

  useFrame(() => {
    frames.current += 1;
    const time = performance.now();

    if (time >= prevTime.current + 1000) {
      const fps = Math.round((frames.current * 1000) / (time - prevTime.current));
      setStats({
        fps,
        drawCalls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
      });

      frames.current = 0;
      prevTime.current = time;
    }
  });

  return (
    <Html
      position={[-window.innerWidth / 2 + 20, window.innerHeight / 2 - 20, 0]}
      zIndexRange={[100, 0]}
    >
      <div className="bg-slate-900/90 border border-slate-700 text-slate-300 p-4 rounded shadow-lg font-mono text-xs w-64 pointer-events-none">
        <div className="font-semibold text-slate-100 mb-3 border-b border-slate-700 pb-2">
          Renderer Metrics
        </div>
        <div className="grid grid-cols-2 gap-y-2">
          <span className="text-slate-400">FPS:</span>
          <span
            className={
              stats.fps >= 55
                ? 'text-emerald-400 font-bold'
                : stats.fps >= 30
                  ? 'text-amber-400 font-bold'
                  : 'text-rose-400 font-bold'
            }
          >
            {stats.fps}
          </span>

          <span className="text-slate-400">Draw Calls:</span>
          <span
            className={
              stats.drawCalls <= 100 ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'
            }
          >
            {stats.drawCalls}
          </span>

          <span className="text-slate-400">Triangles:</span>
          <span className="text-slate-200">{stats.triangles.toLocaleString()}</span>
        </div>
      </div>
    </Html>
  );
}
