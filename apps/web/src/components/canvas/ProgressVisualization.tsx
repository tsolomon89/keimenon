/**
 * Progress Visualization Overlay
 *
 * Game developer techniques for visualizing import progress on the canvas:
 * - Particle effects for nodes being created
 * - Animated progress bars
 * - Real-time node spawn animations
 * - FPS-optimized rendering loop
 *
 * Related: apps/web/src/hooks/useJobStream.ts (SSE updates)
 * Related: apps/web/src/components/canvas/Canvas2D.tsx (main graph canvas)
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { useJobStream } from '@/hooks/useJobStream';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  alpha: number;
}

interface ProgressVisualizationProps {
  width: number;
  height: number;
  jobId?: string | null; // Track specific job (e.g., import job)
}

export function ProgressVisualization({ width, height, jobId }: ProgressVisualizationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const particlesRef = useRef<Particle[]>([]);
  const lastSpawnTimeRef = useRef<number>(0);

  const { jobs } = useJobStream();
  const [progress, setProgress] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [stats, setStats] = useState({ nodesCreated: 0, totalNodes: 0 });

  // Track job progress from SSE
  useEffect(() => {
    if (!jobId) {
      setIsActive(false);
      return;
    }

    const job = jobs.get(jobId);
    if (!job) return;

    // Only show visualization for running import jobs
    if (job.type === 'import' && job.status === 'running') {
      setIsActive(true);
      setProgress(job.progress.percent);

      // Use progress data for stats
      setStats({
        nodesCreated: job.progress.current || 0,
        totalNodes: job.progress.total || 100,
      });
    } else if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'canceled') {
      // Fade out visualization after completion
      setTimeout(() => setIsActive(false), 2000);
    }
  }, [jobId, jobs]);

  // Particle system - game dev technique for visual feedback
  const spawnParticles = (x: number, y: number, count: number = 10) => {
    const particles: Particle[] = [];

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const speed = 2 + Math.random() * 3;

      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        maxLife: 1,
        size: 3 + Math.random() * 4,
        color: `hsl(${270 + Math.random() * 30}, 70%, 60%)`, // Purple spectrum
        alpha: 1,
      });
    }

    particlesRef.current.push(...particles);
  };

  // Update and render particles - optimized render loop (game dev pattern)
  const updateAndRender = (ctx: CanvasRenderingContext2D, deltaTime: number) => {
    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Update particles
    particlesRef.current = particlesRef.current.filter((p) => {
      // Update physics
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1; // Gravity
      p.life -= deltaTime / 1000;
      p.alpha = p.life / p.maxLife;

      // Remove dead particles
      if (p.life <= 0) return false;

      // Render particle
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      return true;
    });

    // Spawn particles at random intervals when job is active
    if (isActive && progress > 0 && progress < 100) {
      const now = Date.now();
      if (now - lastSpawnTimeRef.current > 200) {
        // Spawn particles every 200ms
        const spawnX = width * 0.2 + Math.random() * width * 0.6;
        const spawnY = height * 0.3 + Math.random() * height * 0.4;
        spawnParticles(spawnX, spawnY, 5);
        lastSpawnTimeRef.current = now;
      }
    }

    // Draw progress bar overlay (top of canvas)
    if (isActive) {
      drawProgressBar(ctx);
    }
  };

  // Progress bar rendering
  const drawProgressBar = (ctx: CanvasRenderingContext2D) => {
    const barHeight = 4;
    const barY = 20;
    const barX = 40;
    const barWidth = width - 80;

    // Background
    ctx.fillStyle = 'rgba(30, 41, 59, 0.8)'; // slate-800 with alpha
    ctx.fillRect(barX - 5, barY - 10, barWidth + 10, barHeight + 20);

    // Progress background (track)
    ctx.fillStyle = 'rgba(71, 85, 105, 0.5)'; // slate-600
    ctx.fillRect(barX, barY, barWidth, barHeight);

    // Progress fill with gradient (game dev technique)
    const progressWidth = (barWidth * progress) / 100;
    const gradient = ctx.createLinearGradient(barX, barY, barX + progressWidth, barY);
    gradient.addColorStop(0, '#a855f7'); // purple-500
    gradient.addColorStop(1, '#ec4899'); // pink-500
    ctx.fillStyle = gradient;
    ctx.fillRect(barX, barY, progressWidth, barHeight);

    // Glow effect (game dev technique)
    ctx.save();
    ctx.shadowColor = '#a855f7';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#a855f7';
    ctx.fillRect(barX, barY, progressWidth, barHeight);
    ctx.restore();

    // Progress text
    ctx.fillStyle = '#e2e8f0'; // slate-200
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(
      `Importing: ${progress.toFixed(0)}% (${stats.nodesCreated}/${stats.totalNodes} nodes)`,
      barX,
      barY - 15
    );
  };

  // Animation loop - game dev pattern (requestAnimationFrame)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let lastTime = performance.now();

    const animate = (currentTime: number) => {
      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;

      updateAndRender(ctx, deltaTime);

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [width, height, isActive, progress, stats]);

  // Only render when active
  if (!isActive) return null;

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute inset-0 pointer-events-none z-10"
      style={{
        opacity: isActive ? 1 : 0,
        transition: 'opacity 0.5s ease-out',
      }}
    />
  );
}
