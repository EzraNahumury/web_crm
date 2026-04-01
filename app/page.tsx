'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Role } from '@/lib/types';

function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let w = 0, h = 0;

    function resize() {
      w = canvas!.width = window.innerWidth;
      h = canvas!.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    // Particles
    const PARTICLE_COUNT = 80;
    const particles: { x: number; y: number; vx: number; vy: number; r: number; color: string; alpha: number }[] = [];
    const colors = ['rgba(30,140,255,', 'rgba(0,210,220,', 'rgba(100,80,255,', 'rgba(60,180,255,'];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        r: Math.random() * 2 + 0.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: Math.random() * 0.5 + 0.2,
      });
    }

    // Flowing orbs (large slow moving glows)
    const orbs = [
      { x: w * 0.2, y: h * 0.3, vx: 0.3, vy: 0.2, size: 250, color: 'rgba(20,100,220,' },
      { x: w * 0.8, y: h * 0.7, vx: -0.25, vy: -0.15, size: 200, color: 'rgba(0,180,210,' },
      { x: w * 0.5, y: h * 0.5, vx: 0.15, vy: -0.25, size: 180, color: 'rgba(80,60,220,' },
    ];

    // Aurora wave points
    const WAVE_POINTS = 8;
    const waveOffsets = Array.from({ length: WAVE_POINTS }, () => Math.random() * Math.PI * 2);

    let time = 0;

    function draw() {
      ctx!.clearRect(0, 0, w, h);
      time += 0.008;

      // Draw orbs
      for (const orb of orbs) {
        orb.x += orb.vx;
        orb.y += orb.vy;
        if (orb.x < -orb.size) orb.x = w + orb.size;
        if (orb.x > w + orb.size) orb.x = -orb.size;
        if (orb.y < -orb.size) orb.y = h + orb.size;
        if (orb.y > h + orb.size) orb.y = -orb.size;

        const g = ctx!.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.size);
        g.addColorStop(0, orb.color + '0.12)');
        g.addColorStop(0.5, orb.color + '0.04)');
        g.addColorStop(1, orb.color + '0)');
        ctx!.fillStyle = g;
        ctx!.fillRect(orb.x - orb.size, orb.y - orb.size, orb.size * 2, orb.size * 2);
      }

      // Draw aurora waves
      for (let wave = 0; wave < 3; wave++) {
        ctx!.beginPath();
        const baseY = h * (0.35 + wave * 0.15);
        const amplitude = 40 + wave * 15;
        ctx!.moveTo(0, baseY);

        for (let i = 0; i <= WAVE_POINTS; i++) {
          const x = (w / WAVE_POINTS) * i;
          const offset = waveOffsets[i % WAVE_POINTS];
          const y = baseY + Math.sin(time * (1.2 + wave * 0.3) + offset + i * 0.8) * amplitude;
          if (i === 0) ctx!.moveTo(x, y);
          else {
            const prevX = (w / WAVE_POINTS) * (i - 1);
            const cpx = (prevX + x) / 2;
            const prevY = baseY + Math.sin(time * (1.2 + wave * 0.3) + waveOffsets[(i - 1) % WAVE_POINTS] + (i - 1) * 0.8) * amplitude;
            ctx!.quadraticCurveTo(prevX + (x - prevX) * 0.5, prevY, cpx + (x - prevX) * 0.25, (prevY + y) / 2);
            ctx!.lineTo(x, y);
          }
        }

        const gradient = ctx!.createLinearGradient(0, baseY - amplitude, 0, baseY + amplitude);
        const auroraAlpha = 0.03 + wave * 0.01;
        if (wave === 0) {
          gradient.addColorStop(0, `rgba(30,140,255,${auroraAlpha})`);
          gradient.addColorStop(1, `rgba(0,210,220,${auroraAlpha * 0.5})`);
        } else if (wave === 1) {
          gradient.addColorStop(0, `rgba(80,60,255,${auroraAlpha})`);
          gradient.addColorStop(1, `rgba(30,140,255,${auroraAlpha * 0.5})`);
        } else {
          gradient.addColorStop(0, `rgba(0,180,220,${auroraAlpha})`);
          gradient.addColorStop(1, `rgba(100,60,255,${auroraAlpha * 0.5})`);
        }
        ctx!.strokeStyle = gradient;
        ctx!.lineWidth = 1.5;
        ctx!.stroke();

        // Aurora fill glow
        ctx!.lineTo(w, h);
        ctx!.lineTo(0, h);
        ctx!.closePath();
        const fillGrad = ctx!.createLinearGradient(0, baseY, 0, baseY + 200);
        fillGrad.addColorStop(0, `rgba(30,120,220,${0.02 + wave * 0.005})`);
        fillGrad.addColorStop(1, 'rgba(30,120,220,0)');
        ctx!.fillStyle = fillGrad;
        ctx!.fill();
      }

      // Update & draw particles
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        // Twinkle
        p.alpha += (Math.random() - 0.5) * 0.02;
        p.alpha = Math.max(0.1, Math.min(0.7, p.alpha));

        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fillStyle = p.color + p.alpha + ')';
        ctx!.fill();
      }

      // Draw connecting lines between close particles
      const CONNECTION_DIST = 140;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECTION_DIST) {
            const lineAlpha = (1 - dist / CONNECTION_DIST) * 0.12;
            ctx!.beginPath();
            ctx!.moveTo(particles[i].x, particles[i].y);
            ctx!.lineTo(particles[j].x, particles[j].y);
            ctx!.strokeStyle = `rgba(60,160,255,${lineAlpha})`;
            ctx!.lineWidth = 0.5;
            ctx!.stroke();
          }
        }
      }

      // Shooting streaks (occasional)
      if (Math.random() < 0.006) {
        const sx = Math.random() * w;
        const sy = Math.random() * h * 0.5;
        const angle = Math.random() * 0.4 + 0.2;
        const len = Math.random() * 200 + 100;
        const ex = sx + Math.cos(angle) * len;
        const ey = sy + Math.sin(angle) * len;
        const streakGrad = ctx!.createLinearGradient(sx, sy, ex, ey);
        streakGrad.addColorStop(0, 'rgba(100,200,255,0)');
        streakGrad.addColorStop(0.4, 'rgba(100,200,255,0.2)');
        streakGrad.addColorStop(1, 'rgba(100,200,255,0)');
        ctx!.beginPath();
        ctx!.moveTo(sx, sy);
        ctx!.lineTo(ex, ey);
        ctx!.strokeStyle = streakGrad;
        ctx!.lineWidth = 1;
        ctx!.stroke();
      }

      animId = requestAnimationFrame(draw);
    }
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}

export default function LoginPage() {
  const { user, login, loading } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const redirectByRole = useCallback((role: Role) => {
    if (role === 'admin') router.replace('/dashboard');
    else if (role === 'cs') router.replace('/orders');
    else router.replace('/production');
  }, [router]);

  useEffect(() => {
    if (!loading && user) redirectByRole(user.role);
  }, [user, loading, redirectByRole]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await login(username.trim(), password.trim());
      if (!res.success) {
        setError(res.error || 'Username atau password salah.');
      }
      // On success, useEffect above will handle redirect when user state updates
    } catch {
      setError('Tidak dapat terhubung ke server.');
    }
    setSubmitting(false);
  }

  if (loading) return null;

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#050508]">
      {/* Canvas animated background */}
      <AnimatedBackground />

      {/* Main card */}
      <div className={`relative z-10 w-full max-w-[440px] px-5 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
        {/* Card with hexagonal clip */}
        <div className="relative">
          {/* Outer border glow */}
          <div className="absolute -inset-[1px] login-hex-clip bg-gradient-to-b from-white/20 via-white/[0.06] to-white/[0.03]" />

          {/* Card body */}
          <div className="relative login-hex-clip bg-[#0a0c14]/90 backdrop-blur-2xl overflow-hidden">
            {/* Noise texture on card */}
            <div className="login-card-noise" />

            {/* Inner blue glow on card */}
            <div className="absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[300px] pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at center, rgba(30,100,210,0.12) 0%, transparent 70%)' }} />

            {/* Top edge highlight */}
            <div className="absolute top-0 left-[60px] right-0 h-px bg-gradient-to-r from-white/25 via-white/10 to-transparent" />

            <div className="relative px-10 pt-10 pb-12">
              {/* Brand */}
              <div className="mb-10">
                <h1 className="text-[15px] font-bold text-white/90 tracking-[0.15em] uppercase italic">
                  AYRES
                </h1>
              </div>

              {/* Title */}
              <div className="mb-4">
                <h2 className="text-[28px] font-bold text-white leading-tight">Masuk ke Akun</h2>
                <p className="text-slate-500 text-[13px] mt-2 leading-relaxed max-w-[300px]">
                  Masuk ke AYRES Production System untuk mengelola produksi Anda
                </p>
              </div>

              {/* Divider */}
              <div className="w-full h-px bg-gradient-to-r from-white/15 via-white/8 to-transparent mb-8 mt-6" />

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Username */}
                <div>
                  <label className="block text-[13px] font-medium text-white mb-2">
                    Username
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="Enter your username"
                    required
                    autoFocus
                    className="w-full bg-white/[0.07] text-white placeholder-slate-500 px-5 py-3.5 text-[13px] rounded-full focus:outline-none focus:bg-white/[0.11] focus:ring-1 focus:ring-white/20 transition-all duration-300 border border-white/[0.05]"
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-[13px] font-medium text-white mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                      className="w-full bg-white/[0.07] text-white placeholder-slate-500 px-5 pr-12 py-3.5 text-[13px] rounded-full focus:outline-none focus:bg-white/[0.11] focus:ring-1 focus:ring-white/20 transition-all duration-300 border border-white/[0.05]"
                    />
                    <button
                      type="button"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {showPassword ? (
                        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
                        </svg>
                      ) : (
                        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-full bg-red-500/[0.1] border border-red-500/20">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                    <p className="text-[13px] text-red-400">{error}</p>
                  </div>
                )}

                {/* Submit Button */}
                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-white hover:bg-gray-100 disabled:bg-white/50 text-[#0a0c14] font-semibold py-3.5 text-[14px] rounded-full transition-all duration-300 hover:shadow-[0_0_30px_rgba(255,255,255,0.15)] disabled:shadow-none"
                  >
                    {submitting ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                        Memproses...
                      </span>
                    ) : (
                      'Login'
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Corner accents */}
            <div className="absolute bottom-4 left-4 w-4 h-4 pointer-events-none">
              <div className="absolute bottom-0 left-0 w-full h-px bg-amber-500/40" />
              <div className="absolute bottom-0 left-0 w-px h-full bg-amber-500/40" />
            </div>
            <div className="absolute bottom-4 right-4 w-4 h-4 pointer-events-none">
              <div className="absolute bottom-0 right-0 w-full h-px bg-amber-500/40" />
              <div className="absolute bottom-0 right-0 w-px h-full bg-amber-500/40" />
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-slate-700 text-[11px] mt-8 tracking-wide">&copy; 2026 AYRES System</p>
      </div>
    </div>
  );
}
