"use client";
import { useEffect, useRef } from "react";

export function MathCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener("resize", handleResize);

    // Particle nodes for mathematical constellation
    const particleCount = Math.min(width > 768 ? 65 : 30, 80);
    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      baseAlpha: number;
      phase: number;
    }> = [];

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.45,
        vy: (Math.random() - 0.5) * 0.45,
        radius: Math.random() * 1.8 + 0.8,
        baseAlpha: Math.random() * 0.5 + 0.2,
        phase: Math.random() * Math.PI * 2,
      });
    }

    let mouseX = width / 2;
    let mouseY = height / 2;
    let targetMouseX = mouseX;
    let targetMouseY = mouseY;

    const handleMouseMove = (e: MouseEvent) => {
      targetMouseX = e.clientX;
      targetMouseY = e.clientY;
    };

    window.addEventListener("mousemove", handleMouseMove);

    let time = 0;

    const render = () => {
      time += 0.015;
      mouseX += (targetMouseX - mouseX) * 0.05;
      mouseY += (targetMouseY - mouseY) * 0.05;

      ctx.clearRect(0, 0, width, height);

      // 1. Draw 3D Mathematical Parametric Wave Ribbon (Lissajous Wave Lattice)
      const lines = 24;
      const pointsPerLine = 48;
      const waveAmplitude = 55;

      ctx.save();
      ctx.lineWidth = 1;

      for (let l = 0; l < lines; l++) {
        const progress = l / lines;
        const yOffset = height * 0.35 + (l - lines / 2) * 16;
        
        ctx.beginPath();
        for (let p = 0; p <= pointsPerLine; p++) {
          const u = p / pointsPerLine;
          const x = u * width;
          
          // Parametric harmonic equation combining multiple frequencies
          const wave1 = Math.sin(u * Math.PI * 3 + time + l * 0.15) * waveAmplitude;
          const wave2 = Math.cos(u * Math.PI * 2 - time * 0.8 + l * 0.1) * (waveAmplitude * 0.5);
          
          // Mouse gravitational influence
          const distToMouse = Math.hypot(x - mouseX, yOffset - mouseY);
          const mouseEffect = Math.max(0, 1 - distToMouse / 380) * 35 * Math.sin(time * 2);

          const y = yOffset + wave1 + wave2 + mouseEffect;

          if (p === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }

        // Sapphire-emerald gradient strokes
        const alpha = (Math.sin(progress * Math.PI) * 0.16 + 0.04).toFixed(3);
        ctx.strokeStyle = `rgba(76, 110, 245, ${alpha})`;
        ctx.stroke();
      }
      ctx.restore();

      // 2. Draw Floating Mathematical Geometry Grid (Orbital Hyperboloid Ring)
      ctx.save();
      const centerX = width * 0.78;
      const centerY = height * 0.42;
      const rings = 8;
      const ringRadius = 140;

      for (let r = 0; r < rings; r++) {
        const angleOffset = time * 0.4 + (r * Math.PI) / rings;
        const rx = ringRadius * Math.cos(angleOffset);
        const ry = (ringRadius * 0.45) * Math.sin(angleOffset);

        ctx.beginPath();
        ctx.ellipse(centerX, centerY, Math.abs(rx), Math.abs(ry) + 20, angleOffset, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(18, 184, 134, ${0.08 + (r / rings) * 0.08})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
      ctx.restore();

      // 3. Connect constellation particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (!p) continue;

        p.x += p.vx;
        p.y += p.vy;

        // Bounce at boundaries
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;

        // Particle pulse
        const pulse = Math.sin(time * 2 + p.phase) * 0.2;
        const currentAlpha = Math.max(0.1, p.baseAlpha + pulse);

        // Draw particle dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(116, 143, 252, ${currentAlpha})`;
        ctx.fill();

        // Connect nearby particles with subtle gradient threads
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          if (!p2) continue;
          const dist = Math.hypot(p.x - p2.x, p.y - p2.y);
          if (dist < 130) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            const lineAlpha = ((1 - dist / 130) * 0.18).toFixed(3);
            ctx.strokeStyle = `rgba(76, 110, 245, ${lineAlpha})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }

        // Connect to mouse cursor
        const mouseDist = Math.hypot(p.x - mouseX, p.y - mouseY);
        if (mouseDist < 160) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(mouseX, mouseY);
          const mouseLineAlpha = ((1 - mouseDist / 160) * 0.35).toFixed(3);
          ctx.strokeStyle = `rgba(18, 184, 134, ${mouseLineAlpha})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-70"
    />
  );
}
