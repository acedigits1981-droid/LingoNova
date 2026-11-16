import React, { useEffect, useRef } from 'react';

interface ParticleItem {
  kind: 'dot' | 'confetti';
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  width: number;
  height: number;
  rotation: number;
  vRot: number;
  wobblePhase: number;
  color: string;
  alpha: number;
  decay: number;
  gravity: number;
}

export function triggerParticleBurst(
  x = window.innerWidth * 0.5,
  y = window.innerHeight * 0.65,
  count = 36
): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('lingonova:burst', {
      detail: { x, y, count },
    })
  );
}

export function triggerConfettiCelebration(
  x = window.innerWidth * 0.5,
  y = window.innerHeight * 0.35,
  count = 110
): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('lingonova:confetti', {
      detail: { x, y, count },
    })
  );
}

export const ParticleCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<ParticleItem[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const colors = [
      '#10B981',
      '#22D3EE',
      '#34D399',
      '#FBBF24',
      '#F472B6',
      '#A78BFA',
      '#38BDF8',
    ];

    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particlesRef.current = particlesRef.current.filter((p) => p.alpha > 0.02);

      for (const p of particlesRef.current) {
        p.wobblePhase += 0.14;
        p.x += p.vx + (p.kind === 'confetti' ? Math.sin(p.wobblePhase) * 0.9 : 0);
        p.y += p.vy;
        p.vy += p.gravity;
        p.vx *= p.kind === 'confetti' ? 0.99 : 0.985;
        p.rotation += p.vRot;
        p.alpha -= p.decay;

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.fillStyle = p.color;

        if (p.kind === 'confetti') {
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          // 3D tumbling ribbon flip
          const flipScale = Math.cos(p.wobblePhase * 1.3);
          ctx.scale(1, Math.abs(flipScale) < 0.25 ? 0.25 : flipScale);
          ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      if (particlesRef.current.length > 0) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        rafRef.current = null;
      }
    };

    const startLoopIfIdle = () => {
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(loop);
      }
    };

    const handleBurst = (e: Event) => {
      const detail = (e as CustomEvent<{ x: number; y: number; count: number }>).detail;
      const x = detail?.x ?? window.innerWidth * 0.5;
      const y = detail?.y ?? window.innerHeight * 0.5;
      const count = detail?.count ?? 36;

      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
        const speed = 3 + Math.random() * 6.2;
        particlesRef.current.push({
          kind: 'dot',
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 2.4,
          size: 2.5 + Math.random() * 3.8,
          width: 4,
          height: 4,
          rotation: 0,
          vRot: 0,
          wobblePhase: 0,
          color: colors[Math.floor(Math.random() * colors.length)],
          alpha: 1,
          decay: 0.018 + Math.random() * 0.014,
          gravity: 0.18,
        });
      }

      startLoopIfIdle();
    };

    const handleConfetti = (e: Event) => {
      const detail = (e as CustomEvent<{ x: number; y: number; count: number }>).detail;
      const originX = detail?.x ?? window.innerWidth * 0.5;
      const originY = detail?.y ?? window.innerHeight * 0.35;
      const count = detail?.count ?? 110;

      // Launch twin celebratory confetti cannons (from target origin + top-center shower)
      for (let i = 0; i < count; i++) {
        const isShower = i % 3 === 0;
        const startX = isShower
          ? Math.random() * window.innerWidth
          : originX + (Math.random() - 0.5) * 140;
        const startY = isShower
          ? -12 - Math.random() * 40
          : originY + (Math.random() - 0.5) * 40;
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.65;
        const speed = isShower ? 2 + Math.random() * 3.5 : 5 + Math.random() * 9;

        particlesRef.current.push({
          kind: 'confetti',
          x: startX,
          y: startY,
          vx: isShower ? (Math.random() - 0.5) * 3 : Math.cos(angle) * speed,
          vy: isShower ? 2.5 + Math.random() * 3.2 : Math.sin(angle) * speed - 2.5,
          size: 4,
          width: 7 + Math.random() * 6,
          height: 4 + Math.random() * 4,
          rotation: Math.random() * Math.PI * 2,
          vRot: (Math.random() - 0.5) * 0.25,
          wobblePhase: Math.random() * Math.PI * 2,
          color: colors[Math.floor(Math.random() * colors.length)],
          alpha: 1,
          decay: 0.0065 + Math.random() * 0.005,
          gravity: 0.14,
        });
      }

      startLoopIfIdle();
    };

    window.addEventListener('lingonova:burst', handleBurst);
    window.addEventListener('lingonova:confetti', handleConfetti);
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('lingonova:burst', handleBurst);
      window.removeEventListener('lingonova:confetti', handleConfetti);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-50"
    />
  );
};
