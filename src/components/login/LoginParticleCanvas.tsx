import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/** 品牌酒红（略加深，亚麻底上更易辨认）≈ hsl(5 34% 40%) */
const WINE_RGB = { r: 138, g: 76, b: 72 } as const;

const MOUSE_RADIUS = 110;
const PARTICLE_FILL_ALPHA = 0.26;
const LINE_ALPHA_MAX = 0.14;

/** 按左栏面积取点数，避免半屏里挤成一张密网 */
function particleBudget(width: number, height: number): number {
  const area = Math.max(1, width * height);
  return Math.max(18, Math.min(36, Math.round(area / 28000)));
}

function connectionDistanceFor(width: number, height: number): number {
  return Math.min(112, Math.max(72, Math.min(width, height) * 0.12));
}

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
};

function createParticle(width: number, height: number): Particle {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3,
    size: Math.random() * 1.6 + 1.1,
  };
}

type Props = {
  className?: string;
};

/**
 * 登录页背景：漂浮粒子 + 距离连线 + 鼠标轻排斥（参考设计稿交互，配色用品牌酒红）
 */
export function LoginParticleCanvas({ className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef<{ x: number | null; y: number | null }>({
    x: null,
    y: null,
  });

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const ctx2d = canvasEl.getContext("2d");
    if (!ctx2d) return;

    const canvas: HTMLCanvasElement = canvasEl;
    const ctx: CanvasRenderingContext2D = ctx2d;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let connectionDistance = 96;
    let particles: Particle[] = [];
    let raf = 0;

    function resize() {
      const parent = canvas.parentElement;
      const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
      const nextWidth = parent?.clientWidth || canvas.clientWidth || 0;
      const nextHeight = parent?.clientHeight || canvas.clientHeight || 0;
      if (nextWidth < 1 || nextHeight < 1) return;
      if (nextWidth === width && nextHeight === height && nextDpr === dpr) return;
      dpr = nextDpr;
      width = nextWidth;
      height = nextHeight;
      connectionDistance = connectionDistanceFor(width, height);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = Array.from({ length: particleBudget(width, height) }, () =>
        createParticle(width, height)
      );
    }

    function updateParticle(p: Particle) {
      if (reducedMotion) return;

      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0 || p.x > width) p.vx *= -1;
      if (p.y < 0 || p.y > height) p.vy *= -1;

      const { x: mx, y: my } = mouseRef.current;
      if (mx != null && my != null) {
        const dx = mx - p.x;
        const dy = my - p.y;
        const distance = Math.hypot(dx, dy);
        if (distance < MOUSE_RADIUS) {
          p.x -= dx * 0.01;
          p.y -= dy * 0.01;
        }
      }
    }

    function drawParticle(p: Particle) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${WINE_RGB.r}, ${WINE_RGB.g}, ${WINE_RGB.b}, ${PARTICLE_FILL_ALPHA})`;
      ctx.fill();
    }

    function drawConnections() {
      for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i]!;
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j]!;
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const distance = Math.hypot(dx, dy);
          if (distance >= connectionDistance) continue;

          ctx.beginPath();
          ctx.strokeStyle = `rgba(${WINE_RGB.r}, ${WINE_RGB.g}, ${WINE_RGB.b}, ${
            LINE_ALPHA_MAX * (1 - distance / connectionDistance)
          })`;
          ctx.lineWidth = 0.5;
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }
    }

    function frame() {
      ctx.clearRect(0, 0, width, height);

      for (const p of particles) {
        updateParticle(p);
        drawParticle(p);
      }
      drawConnections();

      if (!reducedMotion) {
        raf = requestAnimationFrame(frame);
      }
    }

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    const onMouseLeave = () => {
      mouseRef.current = { x: null, y: null };
    };

    resize();
    frame();

    const parent = canvas.parentElement;
    const observer =
      parent && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => resize())
        : null;
    observer?.observe(parent!);

    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMouseMove);
    document.documentElement.addEventListener("mouseleave", onMouseLeave);

    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      document.documentElement.removeEventListener("mouseleave", onMouseLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={cn("pointer-events-none", className)}
      aria-hidden
    />
  );
}
