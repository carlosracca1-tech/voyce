"use client"

import React from "react"
import { useState, useMemo, useEffect } from "react"
import { useRouter } from "next/navigation"

// ============ API Functions ============
async function apiLogin({ email, password }: { email: string; password: string }) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) throw { data, status: res.status };
  return data;
}

async function apiRegister({ name, email, password }: { name: string; email: string; password: string }) {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password })
  });
  const data = await res.json();
  if (!res.ok) throw { data, status: res.status };
  return data;
}

// ============ Particles Component ============
function Particles() {
  const particles = useMemo(() => Array.from({ length: 20 }, (_, i) => ({
    id: i,
    color: ['cyan', 'magenta', 'purple'][Math.floor(Math.random() * 3)],
    size: Math.random() * 6 + 2,
    left: Math.random() * 100,
    top: Math.random() * 100,
    tx: (Math.random() - 0.5) * 100,
    ty: (Math.random() - 0.5) * 100,
    duration: Math.random() * 10 + 10,
    delay: Math.random() * -20,
  })), []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          className={`absolute rounded-full blur-sm animate-float ${
            p.color === 'cyan' ? 'bg-[#00f0ff]' : 
            p.color === 'magenta' ? 'bg-[#ff00aa]' : 'bg-[#8b5cf6]'
          }`}
          style={{
            width: `${p.size}px`,
            height: `${p.size}px`,
            left: `${p.left}%`,
            top: `${p.top}%`,
            opacity: 0.6,
            animation: `float ${p.duration}s ease-in-out infinite`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

// ============ Icons ============
const VoyceIcon = () => (
  <svg className="w-16 h-16 drop-shadow-[0_0_20px_rgba(0,240,255,0.5)]" viewBox="0 0 60 60" fill="none">
    <circle cx="30" cy="30" r="28" stroke="url(#logoGrad)" strokeWidth="2" />
    <path d="M20 22L30 38L40 22" stroke="url(#logoGrad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="30" cy="18" r="4" fill="url(#logoGrad)" />
    <defs>
      <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#00f0ff" />
        <stop offset="50%" stopColor="#ff00aa" />
        <stop offset="100%" stopColor="#8b5cf6" />
      </linearGradient>
    </defs>
  </svg>
);

const EmailIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="M22 6l-10 7L2 6" />
  </svg>
);

const LockIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const UserIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const EyeIcon = ({ visible }: { visible: boolean }) => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    {visible ? (
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ) : (
      <>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </>
    )}
  </svg>
);

// ============ Login Component ============
interface UserData {
  id: number;
  email: string;
  name: string;
  token: string;
  subscription?: {
    status: string;
    canAccess: boolean;
    daysLeft?: number;
    trialEndsAt?: Date;
  };
}

function LoginScreen({ onLogin }: { onLogin: (user: UserData) => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsLoading(true);

    try {
      if (isLogin) {
        const data = await apiLogin({ email: formData.email, password: formData.password });
        onLogin({ ...data.user, token: data.token, subscription: data.subscription });
      } else {
        await apiRegister({ name: formData.name, email: formData.email, password: formData.password });
        const data = await apiLogin({ email: formData.email, password: formData.password });
        onLogin({ ...data.user, token: data.token, subscription: data.subscription });
      }
    } catch (err: unknown) {
      const error = err as { data?: { error?: string }; status?: number };
      const code = error?.data?.error;
      const status = error?.status;

      if (isLogin && (code === "invalid_credentials" || status === 401)) {
        setErrorMsg("Email o contraseña incorrectos. Registrate si no tenes cuenta.");
      } else if (!isLogin && code === "email_exists") {
        setErrorMsg("Ese email ya existe. Proba iniciar sesion.");
        setIsLogin(true);
      } else if (code === "weak_password") {
        setErrorMsg("La contraseña debe tener minimo 8 caracteres, mayusculas, minusculas y numeros.");
      } else {
        setErrorMsg("Error inesperado. Proba de nuevo.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden bg-[#0a0a0f]">
      <Particles />
      
      <div className="w-full max-w-md flex flex-col items-center relative z-10 animate-fadeInUp">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-4 mb-3">
            <VoyceIcon />
            <h1 className="text-5xl font-bold tracking-wider bg-gradient-to-r from-[#00f0ff] via-[#ff00aa] to-[#8b5cf6] bg-clip-text text-transparent">
              VOYCE
            </h1>
          </div>
          <p className="text-white/60 tracking-wide">Tu radio inteligente con IA</p>
        </div>

        {/* Card */}
        <div className="w-full p-8 bg-[rgba(18,18,26,0.8)] border border-white/10 rounded-3xl backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
          {/* Toggle */}
          <div className="flex relative bg-white/5 rounded-xl p-1 mb-7">
            <button
              type="button"
              className={`flex-1 py-3 px-4 rounded-lg text-sm font-medium transition-colors relative z-10 ${isLogin ? 'text-white' : 'text-white/50'}`}
              onClick={() => setIsLogin(true)}
            >
              Iniciar Sesion
            </button>
            <button
              type="button"
              className={`flex-1 py-3 px-4 rounded-lg text-sm font-medium transition-colors relative z-10 ${!isLogin ? 'text-white' : 'text-white/50'}`}
              onClick={() => setIsLogin(false)}
            >
              Registrarse
            </button>
            <div 
              className={`absolute top-1 h-[calc(100%-8px)] w-[calc(50%-4px)] bg-gradient-to-r from-[rgba(0,240,255,0.2)] to-[rgba(255,0,170,0.2)] rounded-lg transition-transform duration-300 ${!isLogin ? 'translate-x-full' : ''}`}
            />
          </div>

          {/* Form */}
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            {!isLogin && (
              <div className="relative flex items-center">
                <div className="absolute left-4 text-white/40">
                  <UserIcon />
                </div>
                <input
                  type="text"
                  placeholder="Tu nombre"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full py-4 pl-12 pr-4 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:border-[#00f0ff] focus:shadow-[0_0_20px_rgba(0,240,255,0.2)] transition-all"
                  required={!isLogin}
                />
              </div>
            )}

            <div className="relative flex items-center">
              <div className="absolute left-4 text-white/40">
                <EmailIcon />
              </div>
              <input
                type="email"
                placeholder="correo@ejemplo.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full py-4 pl-12 pr-4 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:border-[#00f0ff] focus:shadow-[0_0_20px_rgba(0,240,255,0.2)] transition-all"
                required
              />
            </div>

            <div className="relative flex items-center">
              <div className="absolute left-4 text-white/40">
                <LockIcon />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Contraseña"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full py-4 pl-12 pr-12 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:border-[#00f0ff] focus:shadow-[0_0_20px_rgba(0,240,255,0.2)] transition-all"
                required
              />
              <button
                type="button"
                className="absolute right-4 text-white/40 hover:text-[#00f0ff] transition-colors"
                onClick={() => setShowPassword(!showPassword)}
              >
                <EyeIcon visible={showPassword} />
              </button>
            </div>

            {isLogin && (
              <a href="#" className="self-end text-sm text-[#00f0ff] hover:text-[#ff00aa] transition-colors -mt-2">
                Olvidaste tu contraseña?
              </a>
            )}

            {errorMsg && (
              <div className="p-3 rounded-xl border border-[rgba(255,0,170,0.35)] bg-[rgba(255,0,170,0.12)] text-[#ffd1f0] text-sm">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 py-4 px-8 bg-gradient-to-r from-[#00f0ff] to-[#ff00aa] rounded-xl text-white font-semibold tracking-wide relative overflow-hidden transition-all hover:translate-y-[-2px] hover:shadow-[0_10px_40px_rgba(0,240,255,0.3)] disabled:opacity-70 disabled:cursor-not-allowed group"
            >
              <span className="relative z-10">
                {isLoading ? (
                  <span className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  isLogin ? 'Entrar' : 'Crear cuenta'
                )}
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-[#ff00aa] to-[#8b5cf6] opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-7 text-center text-xs text-white/40 leading-relaxed">
          Al continuar, aceptas nuestros{' '}
          <a href="#" className="text-[#00f0ff] hover:text-[#ff00aa] transition-colors">Terminos de servicio</a> y{' '}
          <a href="#" className="text-[#00f0ff] hover:text-[#ff00aa] transition-colors">Politica de privacidad</a>
        </p>
      </div>
    </div>
  );
}

// ============ Trial Banner ============
function TrialBanner({ daysLeft }: { daysLeft: number }) {
  if (daysLeft > 3) return null;
  
  return (
    <div className={`fixed top-0 left-0 right-0 py-3 px-5 text-white text-sm font-medium text-center z-50 flex items-center justify-center gap-4 ${
      daysLeft <= 1 
        ? 'bg-gradient-to-r from-[#ff00aa] to-[#8b5cf6] animate-pulse' 
        : 'bg-gradient-to-r from-[rgba(0,240,255,0.3)] to-[rgba(255,0,170,0.3)]'
    }`}>
      {daysLeft <= 1 
        ? "Tu prueba gratuita termina hoy!"
        : `Te quedan ${daysLeft} dias de prueba gratuita`
      }
      <a href="#pricing" className="py-1.5 px-4 bg-white/15 border border-white/30 rounded-full text-xs font-semibold hover:bg-white/25 transition-colors">
        Ver planes
      </a>
    </div>
  );
}

// ============ Paywall Screen ============
function PaywallScreen({ onLogout, onSubscribe }: { user: UserData; onLogout: () => void; onSubscribe: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden bg-[#0a0a0f]">
      <Particles />
      
      <div className="max-w-lg w-full text-center z-10 animate-fadeInUp">
        <div className="mb-8">
          <VoyceIcon />
          <h1 className="text-2xl font-semibold text-white mt-5 mb-2">Tu prueba gratuita ha terminado</h1>
          <p className="text-white/50 text-sm">Suscribite para seguir usando VOYCE</p>
        </div>
        
        <div className="p-10 bg-[rgba(18,18,26,0.8)] border border-white/10 rounded-3xl backdrop-blur-xl mb-6">
          <h2 className="text-xl font-semibold mb-5 bg-gradient-to-r from-[#00f0ff] to-[#ff00aa] bg-clip-text text-transparent">
            VOYCE Pro
          </h2>
          
          <div className="mb-7">
            <span className="text-5xl font-bold text-white">$3.99</span>
            <span className="text-white/50 ml-2">USD / mes</span>
          </div>
          
          <ul className="text-left mb-8 space-y-4">
            {[
              'Acceso ilimitado al asistente de radio IA',
              'Modo Podcast y Conversacion',
              'Briefings diarios personalizados',
              'Busqueda RAG de noticias',
              'Soporte prioritario'
            ].map((feature, i) => (
              <li key={i} className="flex items-center gap-3 text-white/70 text-sm py-3 border-b border-white/10 last:border-0">
                <span className="w-5 h-5 rounded-full bg-gradient-to-br from-[#00f0ff] to-[#ff00aa] flex-shrink-0" />
                {feature}
              </li>
            ))}
          </ul>
          
          <button
            onClick={onSubscribe}
            className="w-full py-4 bg-gradient-to-r from-[#00f0ff] to-[#ff00aa] rounded-2xl text-white font-semibold text-lg hover:translate-y-[-2px] hover:shadow-[0_10px_40px_rgba(0,240,255,0.3)] transition-all"
          >
            Suscribirme ahora
          </button>
          
          <p className="mt-4 text-xs text-white/40">Cancela cuando quieras. Sin compromisos.</p>
        </div>
        
        <button
          onClick={onLogout}
          className="py-3 px-6 bg-transparent border border-white/10 rounded-xl text-white/50 text-sm hover:border-[#ff00aa] hover:text-[#ff00aa] transition-all"
        >
          Cerrar sesion
        </button>
      </div>
    </div>
  );
}

// ============ Dashboard (App Principal) ============
function Dashboard({ user, subscription, onLogout }: { user: UserData; subscription: UserData['subscription']; onLogout: () => void }) {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {subscription?.status === 'trial' && subscription?.daysLeft && (
        <TrialBanner daysLeft={subscription.daysLeft} />
      )}
      
      <div className={`${subscription?.status === 'trial' && subscription?.daysLeft && subscription.daysLeft <= 3 ? 'pt-14' : ''}`}>
        {/* Header */}
        <header className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <VoyceIcon />
            <span className="text-2xl font-bold bg-gradient-to-r from-[#00f0ff] to-[#ff00aa] bg-clip-text text-transparent">
              VOYCE
            </span>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium">{user.name || user.email}</p>
              <p className="text-xs text-white/50">
                {subscription?.status === 'trial' 
                  ? `Trial - ${subscription.daysLeft} dias restantes` 
                  : subscription?.status === 'active' 
                    ? 'Pro' 
                    : 'Sin suscripcion'}
              </p>
            </div>
            <button
              onClick={onLogout}
              className="py-2 px-4 bg-white/5 border border-white/10 rounded-lg text-sm hover:bg-white/10 transition-colors"
            >
              Salir
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex flex-col items-center justify-center min-h-[calc(100vh-100px)] p-6">
          <div className="text-center max-w-2xl">
            <div className="w-32 h-32 mx-auto mb-8 rounded-full bg-gradient-to-br from-[#00f0ff] to-[#ff00aa] p-1 animate-pulse">
              <div className="w-full h-full rounded-full bg-[#0a0a0f] flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#00f0ff]/50 to-[#ff00aa]/50 blur-sm" />
              </div>
            </div>
            
            <h1 className="text-3xl font-bold mb-4">Bienvenido a VOYCE, {user.name || 'Usuario'}!</h1>
            <p className="text-white/60 mb-8">
              Tu asistente de radio con IA esta listo. Conecta con el backend para activar todas las funcionalidades.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { title: 'Modo Podcast', desc: 'Genera contenido de audio con IA' },
                { title: 'Briefings', desc: 'Resumenes diarios personalizados' },
                { title: 'Busqueda RAG', desc: 'Encuentra noticias relevantes' }
              ].map((item, i) => (
                <div key={i} className="p-6 bg-white/5 border border-white/10 rounded-2xl hover:border-[#00f0ff]/50 transition-colors">
                  <h3 className="font-semibold mb-2">{item.title}</h3>
                  <p className="text-sm text-white/50">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// ============ Main App ============
export default function App() {
  const router = useRouter()
  const [user, setUser] = useState<UserData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Cargar sesion guardada y redirigir si ya esta logueado
  useEffect(() => {
    const stored = localStorage.getItem('voyce_user')
    if (stored) {
      try {
        const userData = JSON.parse(stored)
        setUser(userData)
        // Si tiene acceso, ir al dashboard
        if (userData.subscription?.canAccess) {
          router.push('/dashboard')
          return
        }
      } catch {
        localStorage.removeItem('voyce_user')
      }
    }
    setIsLoading(false)
  }, [router])

  const handleLogin = (userData: UserData) => {
    setUser(userData)
    localStorage.setItem('voyce_user', JSON.stringify(userData))
    // Redirigir al dashboard
    if (userData.subscription?.canAccess) {
      router.push('/dashboard')
    }
  }

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('voyce_user');
  };

  const handleSubscribe = () => {
    alert('Redirigiendo a MercadoPago... (integrar con tu backend)');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f]">
        <div className="w-12 h-12 border-2 border-white/10 border-t-[#00f0ff] rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  const canAccess = user.subscription?.canAccess !== false;

  if (!canAccess) {
    return <PaywallScreen user={user} onLogout={handleLogout} onSubscribe={handleSubscribe} />;
  }

  return <Dashboard user={user} subscription={user.subscription} onLogout={handleLogout} />;
}
