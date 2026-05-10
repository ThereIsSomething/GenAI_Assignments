'use client';

import { useRef, useEffect } from 'react';

interface Particle {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  size: number;
  opacity: number;
  phase: number;
}

export default function WaveBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;
    let animationId: number;
    let particles: Particle[] = [];
    let time = 0;
    let mouseX = -1000;
    let mouseY = -1000;

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      initParticles();
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
    };

    const initParticles = () => {
      particles = [];
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      const spacing = 22;
      const cols = Math.ceil(w / spacing);
      const rows = Math.ceil(h / spacing);

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          particles.push({
            x: i * spacing,
            y: j * spacing,
            baseX: i * spacing,
            baseY: j * spacing,
            size: Math.random() * 1.4 + 0.5,
            opacity: Math.random() * 0.12 + 0.04,
            phase: Math.random() * Math.PI * 2,
          });
        }
      }
    };

    const draw = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;

      // Ghost "Engram" text — centered on right panel (offset by sidebar 288px)
      const sidebarWidth = 288;
      const mainCx = sidebarWidth + (w - sidebarWidth) / 2;
      const mainCy = h / 2;
      ctx.save();
      ctx.font = `800 ${Math.min((w - sidebarWidth) * 0.3, 260)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.fillText('Engram', mainCx, mainCy - 20);
      ctx.restore();

      // Draw particles
      for (const p of particles) {
        const dx = p.baseX - cx;
        const dy = p.baseY - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = Math.sqrt(cx * cx + cy * cy);

        // Wave layers
        const wave1 = Math.sin(dist * 0.012 - time * 1.0 + p.phase) * 10;
        const wave2 = Math.cos(dist * 0.008 + time * 0.7) * 7;
        const wave3 = Math.sin(p.baseX * 0.006 + time * 0.9) * 5;
        const wave4 = Math.cos(p.baseY * 0.006 - time * 0.6) * 4;

        p.x = p.baseX + (wave1 + wave3) * 0.5;
        p.y = p.baseY + wave2 + wave4;

        // Mouse interaction
        const mdx = p.x - mouseX;
        const mdy = p.y - mouseY;
        const mouseDist = Math.sqrt(mdx * mdx + mdy * mdy);
        if (mouseDist < 100) {
          const force = (100 - mouseDist) / 100;
          p.x += mdx * force * 0.4;
          p.y += mdy * force * 0.4;
        }

        // Brightness — kept subtle
        const distFactor = 1 - (dist / maxDist) * 0.5;
        const waveBright = (Math.sin(dist * 0.015 - time * 1.5) + 1) * 0.06;
        const mouseBright = mouseDist < 120 ? (120 - mouseDist) / 120 * 0.15 : 0;
        const finalOpacity = Math.min((p.opacity + waveBright + mouseBright) * distFactor, 0.3);

        const shade = Math.round(140 + (Math.sin(dist * 0.01 + time * 0.5) + 1) * 30);

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade}, ${finalOpacity})`;
        ctx.fill();
      }

      // Connection lines — slate gray
      for (let i = 0; i < particles.length; i += 2) {
        for (let j = i + 1; j < Math.min(i + 20, particles.length); j++) {
          const a = particles[i];
          const b = particles[j];
          const ddx = a.x - b.x;
          const ddy = a.y - b.y;
          const dist = ddx * ddx + ddy * ddy;

          if (dist < 1800) {
            const opacity = (1 - dist / 1800) * 0.05;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(180, 180, 180, ${opacity})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      // Orbital rings — muted gray
      ctx.save();
      for (let ring = 0; ring < 4; ring++) {
        const radius = 100 + ring * 70;
        const opacity = 0.03 - ring * 0.006;
        const rotation = time * 0.1 * (ring % 2 === 0 ? 1 : -1);
        const dashPhase = time * 30 * (ring % 2 === 0 ? 1 : -1);

        ctx.beginPath();
        ctx.setLineDash([8, 12]);
        ctx.lineDashOffset = dashPhase;
        ctx.ellipse(cx, cy, radius, radius * 0.35, rotation, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(200, 200, 200, ${opacity})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();

      // Floating dots — white/gray
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 + time * 0.2;
        const r = 140 + Math.sin(time * 0.5 + i) * 40;
        const fx = cx + Math.cos(angle) * r;
        const fy = cy + Math.sin(angle) * r * 0.4;
        const glow = (Math.sin(time * 2 + i * 1.5) + 1) * 0.1 + 0.05;

        ctx.beginPath();
        ctx.arc(fx, fy, 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180, 180, 180, ${glow})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(fx, fy, 6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180, 180, 180, ${glow * 0.08})`;
        ctx.fill();
      }

      time += 0.016;
      animationId = requestAnimationFrame(draw);
    };

    resize();
    draw();
    canvas.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(animationId);
      canvas.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
    />
  );
}
