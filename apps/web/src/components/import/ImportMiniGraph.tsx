/**
 * Import Mini Graph
 *
 * Canvas-based force-directed graph visualization showing import nodes being created in real-time.
 * Features galaxy-style visual effects with particles, gradients, and glow.
 *
 * Features:
 * - Real-time node creation animation
 * - Force-directed layout (simplified)
 * - Particle effects for data flow
 * - Radial gradients and glow effects
 * - Galaxy/solar-system styling
 */

'use client';

import { useEffect, useRef } from 'react';

interface Node {
  id: string;
  kind: 'ChatThread' | 'Message' | 'Source' | 'CodeBlock';
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
  createdAt: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface ImportMiniGraphProps {
  recentNodes?: Array<{
    id: string;
    kind: string;
    label: string;
  }>;
  width?: number;
  height?: number;
}

// Node colors by type (galaxy theme)
const NODE_COLORS: Record<string, string> = {
  ChatThread: '#8b5cf6', // purple
  Message: '#3b82f6', // blue
  Source: '#10b981', // green
  CodeBlock: '#f59e0b', // orange
};

// Node sizes by type
const NODE_SIZES: Record<string, number> = {
  ChatThread: 20,
  Message: 8,
  Source: 14,
  CodeBlock: 12,
};

export function ImportMiniGraph({
  recentNodes = [],
  width = 400,
  height = 300,
}: ImportMiniGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Node[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const animationFrameRef = useRef<number>();
  const lastTimeRef = useRef<number>(0);

  // Initialize nodes from recentNodes prop
  useEffect(() => {
    if (recentNodes.length === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const centerX = width / 2;
    const centerY = height / 2;

    // Add new nodes with spawn animation
    recentNodes.forEach((nodeData, index) => {
      const existing = nodesRef.current.find((n) => n.id === nodeData.id);
      if (existing) return; // Skip if already exists

      // Random angle for spawn position (around center)
      const angle = (Math.PI * 2 * index) / recentNodes.length;
      const spawnDistance = 50;

      const node: Node = {
        id: nodeData.id,
        kind: nodeData.kind as any,
        label: nodeData.label,
        x: centerX + Math.cos(angle) * spawnDistance,
        y: centerY + Math.sin(angle) * spawnDistance,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        radius: NODE_SIZES[nodeData.kind] || 10,
        opacity: 0, // Start invisible, fade in
        createdAt: Date.now(),
      };

      nodesRef.current.push(node);

      // Spawn particles
      spawnParticles(node.x, node.y, NODE_COLORS[nodeData.kind] || '#888');
    });
  }, [recentNodes, width, height]);

  // Spawn particles at position
  const spawnParticles = (x: number, y: number, color: string) => {
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 2 + 1;

      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: Math.random() * 60 + 30,
        size: Math.random() * 3 + 1,
        color,
      });
    }
  };

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = width;
    canvas.height = height;

    const centerX = width / 2;
    const centerY = height / 2;

    const animate = (time: number) => {
      const deltaTime = time - lastTimeRef.current;
      lastTimeRef.current = time;

      // Clear canvas with fade effect (for trails)
      ctx.fillStyle = 'rgba(15, 23, 42, 0.3)'; // slate-900 with alpha
      ctx.fillRect(0, 0, width, height);

      // Update and draw particles
      particlesRef.current = particlesRef.current.filter((particle) => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.life += 1;

        const alpha = 1 - particle.life / particle.maxLife;
        if (alpha <= 0) return false;

        // Draw particle
        ctx.globalAlpha = alpha * 0.6;
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();

        return true;
      });

      ctx.globalAlpha = 1;

      // Update nodes (simple physics)
      nodesRef.current.forEach((node) => {
        // Fade in animation
        if (node.opacity < 1) {
          node.opacity = Math.min(1, node.opacity + 0.02);
        }

        // Gravity toward center (orbit effect)
        const dx = centerX - node.x;
        const dy = centerY - node.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 10) {
          const force = 0.001;
          node.vx += (dx / distance) * force;
          node.vy += (dy / distance) * force;
        }

        // Apply velocity with damping
        node.x += node.vx;
        node.y += node.vy;
        node.vx *= 0.98;
        node.vy *= 0.98;

        // Boundary bounce
        if (node.x < node.radius) {
          node.x = node.radius;
          node.vx *= -0.8;
        }
        if (node.x > width - node.radius) {
          node.x = width - node.radius;
          node.vx *= -0.8;
        }
        if (node.y < node.radius) {
          node.y = node.radius;
          node.vy *= -0.8;
        }
        if (node.y > height - node.radius) {
          node.y = height - node.radius;
          node.vy *= -0.8;
        }

        // Spawn occasional particles
        if (Math.random() < 0.02) {
          spawnParticles(node.x, node.y, NODE_COLORS[node.kind] || '#888');
        }
      });

      // Draw connections between nodes (faint lines)
      ctx.globalAlpha = 0.1;
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1;

      nodesRef.current.forEach((node1, i) => {
        nodesRef.current.slice(i + 1).forEach((node2) => {
          const dx = node2.x - node1.x;
          const dy = node2.y - node1.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          // Only draw connection if close enough
          if (distance < 100) {
            ctx.globalAlpha = (1 - distance / 100) * 0.2;
            ctx.beginPath();
            ctx.moveTo(node1.x, node1.y);
            ctx.lineTo(node2.x, node2.y);
            ctx.stroke();
          }
        });
      });

      ctx.globalAlpha = 1;

      // Draw nodes with galaxy glow effect
      nodesRef.current.forEach((node) => {
        const color = NODE_COLORS[node.kind] || '#888888';

        // Outer glow
        const gradient = ctx.createRadialGradient(
          node.x,
          node.y,
          0,
          node.x,
          node.y,
          node.radius * 2
        );
        gradient.addColorStop(0, `${color}80`);
        gradient.addColorStop(0.5, `${color}40`);
        gradient.addColorStop(1, `${color}00`);

        ctx.globalAlpha = node.opacity * 0.5;
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius * 2, 0, Math.PI * 2);
        ctx.fill();

        // Inner core
        const coreGradient = ctx.createRadialGradient(
          node.x,
          node.y,
          0,
          node.x,
          node.y,
          node.radius
        );
        coreGradient.addColorStop(0, '#ffffff');
        coreGradient.addColorStop(0.5, color);
        coreGradient.addColorStop(1, `${color}dd`);

        ctx.globalAlpha = node.opacity;
        ctx.fillStyle = coreGradient;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fill();

        // Rim highlight
        ctx.strokeStyle = `${color}ff`;
        ctx.lineWidth = 2;
        ctx.globalAlpha = node.opacity * 0.8;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius - 1, 0, Math.PI * 2);
        ctx.stroke();
      });

      ctx.globalAlpha = 1;

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [width, height]);

  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-700 bg-slate-900">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="block"
        style={{ width: '100%', height: 'auto' }}
      />

      {/* Legend overlay */}
      <div className="absolute bottom-3 left-3 flex gap-3 text-xs">
        {Object.entries(NODE_COLORS).map(([kind, color]) => (
          <div
            key={kind}
            className="flex items-center gap-1.5 bg-slate-900/80 backdrop-blur-sm px-2 py-1 rounded"
          >
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-slate-300">{kind}</span>
          </div>
        ))}
      </div>

      {/* Node count */}
      <div className="absolute top-3 right-3 bg-slate-900/80 backdrop-blur-sm px-3 py-1.5 rounded text-xs">
        <span className="text-slate-400">Nodes:</span>{' '}
        <span className="text-white font-semibold">{nodesRef.current.length}</span>
      </div>
    </div>
  );
}
