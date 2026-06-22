// ═══════════════════════════════════════════════════════════════════
// Login — Pantalla de inicio bi-empresa
// ═══════════════════════════════════════════════════════════════════
//
// Split diagonal con curva orgánica:
//   - Lado superior izquierdo: cielo nocturno (TravelAirSolutions)
//     · ~45 estrellas titilando · 2 estrellas fugaces en arco con cabeza amarilla
//     · 2 aviones horizontales con doble estela tipo humo
//   - Lado inferior derecho: atardecer caribeño intenso (Viajes Libero)
//     · sol con dispersión natural · 5 nubes premium · mar saturado
//     · reflejo del sol en el agua · arena blanca con textura · palmera + gaviotas
//
// Tarjeta de login centrada con branding bi-empresa.
// ═══════════════════════════════════════════════════════════════════

import { useState } from "react";
import { supabase } from "./supabase.js";

const C = {
  navy: "#142855",
  coral: "#E76F51",
  border: "#E2E8F0",
  muted: "#64748B",
  text: "#1A2332",
  danger: "#E53935",
};

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data, error: dbError } = await supabase
        .from("app_users")
        .select("*")
        .eq("username", username.trim().toLowerCase())
        .eq("password", password)
        .eq("activo", true)
        .single();

      if (dbError || !data) {
        setError("Usuario o contraseña incorrectos");
        setLoading(false);
        return;
      }

      onLogin(data);
    } catch (err) {
      setError("Error al conectar con el servidor");
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: "100vh",
      position: "relative",
      overflow: "hidden",
      fontFamily: "'Inter','Segoe UI',sans-serif",
      background: "#050B1A",
    }}>

      {/* ═══ ANIMACIONES CSS ═══ */}
      <style>{`
        @keyframes login-twinkle {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.15); }
        }
        .login-star {
          position: absolute;
          background: #fff;
          border-radius: 50%;
          animation: login-twinkle 2s ease-in-out infinite;
          box-shadow: 0 0 4px #fff;
        }
        .login-star-big { box-shadow: 0 0 8px #fff, 0 0 14px rgba(255,255,255,0.5); }

        @keyframes login-shoot-arc {
          0%   { offset-distance: 0%; opacity: 0; }
          8%   { opacity: 1; }
          85%  { opacity: 1; }
          100% { offset-distance: 100%; opacity: 0; }
        }
        .login-shoot-1 {
          position: absolute; top: 0; left: 0;
          offset-path: path('M 60 100 Q 260 60 480 280');
          animation: login-shoot-arc 3.2s linear infinite;
        }
        .login-shoot-2 {
          position: absolute; top: 0; left: 0;
          offset-path: path('M 300 80 Q 540 180 720 380');
          animation: login-shoot-arc 3s linear infinite;
          animation-delay: 7s;
        }
        .login-shooting-star { position: relative; width: 70px; height: 8px; }
        .login-shooting-star .tail {
          position: absolute; right: 8px; top: 3px;
          width: 56px; height: 2px;
          background: linear-gradient(90deg, rgba(255,220,100,0), rgba(255,220,100,0.5), rgba(255,220,100,0.9));
          border-radius: 2px;
          filter: blur(0.5px);
        }
        .login-shooting-star .head {
          position: absolute; right: 0; top: 0;
          width: 7px; height: 7px;
          background: #FFD700;
          border-radius: 50%;
          box-shadow: 0 0 12px #FFD700, 0 0 20px rgba(255,215,0,0.6), 0 0 4px #fff;
        }

        @keyframes login-fly {
          0%   { transform: translate(-200px, 80px); opacity: 0; }
          6%   { opacity: 1; }
          94%  { opacity: 1; }
          100% { transform: translate(110vw, -100px); opacity: 0; }
        }
        .login-plane-1 { position: absolute; animation: login-fly 24s linear infinite; }
        .login-plane-2 { position: absolute; animation: login-fly 28s linear infinite; animation-delay: 11s; }

        @keyframes login-wave {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(-14px); }
        }
        .login-wave-1 { animation: login-wave 5s ease-in-out infinite; }
        .login-wave-2 { animation: login-wave 7s ease-in-out infinite; animation-delay: 1.5s; }

        @keyframes login-cloud-drift {
          0%   { transform: translateX(0); }
          100% { transform: translateX(40px); }
        }
        .login-cloud-drift { animation: login-cloud-drift 22s ease-in-out infinite alternate; }

        @keyframes login-sun-glow {
          0%, 100% { opacity: 0.95; }
          50% { opacity: 1; }
        }
        .login-sun { animation: login-sun-glow 4s ease-in-out infinite; }

        @keyframes login-card-fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .login-card-anim { animation: login-card-fadeUp 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) both; animation-delay: 0.2s; }

        @keyframes login-chip-fadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .login-chip-anim { animation: login-chip-fadeIn 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) both; }

        .login-input:focus {
          border-color: #142855 !important;
          background: #fff !important;
        }
      `}</style>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* LADO CIELO NOCTURNO (TAS) */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(180deg, #030814 0%, #050B1A 35%, #0A1530 70%, #0F1F40 100%)",
      }}/>

      {/* Vía láctea sutil */}
      <div style={{
        position: "absolute", top: "5%", left: "10%", width: "60%", height: "55%",
        background: "radial-gradient(ellipse, rgba(120,140,200,0.08), transparent 70%)",
        pointerEvents: "none",
      }}/>
      <div style={{
        position: "absolute", top: "25%", left: "30%", width: "35%", height: "35%",
        background: "radial-gradient(ellipse, rgba(180,140,200,0.05), transparent 70%)",
        pointerEvents: "none",
      }}/>

      {/* Estrellas (~45) */}
      {[
        // [top, left, size, delay, big]
        [2, 4, 1.5, 0, false], [3, 12, 2, 0.2, false], [5, 18, 1.5, 0.5, false],
        [2, 26, 2.5, 0.8, true], [4, 33, 1.5, 1.1, false], [6, 41, 2, 1.4, false],
        [3, 50, 1.5, 0.3, false], [5, 58, 2.5, 1.7, true], [2, 66, 1.5, 0.6, false],
        [4, 74, 2, 0.9, false], [6, 82, 1.5, 1.2, false], [3, 90, 1.5, 0.4, false],
        [9, 8, 2, 0.7, false], [11, 16, 3, 1.5, true], [13, 23, 1.5, 0.2, false],
        [10, 31, 2, 1.0, false], [14, 38, 1.5, 1.8, false], [12, 46, 2.5, 0.5, true],
        [9, 54, 2, 1.3, false], [13, 62, 1.5, 0.8, false], [11, 70, 3, 1.6, true],
        [10, 78, 1.5, 0.3, false], [14, 86, 2, 1.1, false],
        [17, 6, 2.5, 1.4, true], [20, 13, 1.5, 0.6, false], [18, 21, 2, 0.9, false],
        [22, 28, 1.5, 1.7, false], [19, 36, 3, 0.4, true], [23, 43, 2, 1.2, false],
        [16, 51, 1.5, 0.7, false], [21, 59, 1.5, 1.5, false],
        [27, 4, 2, 1.0, false], [30, 11, 2.5, 0.3, true], [32, 19, 1.5, 1.8, false],
        [28, 27, 2, 0.8, false], [34, 35, 3, 1.3, true], [31, 43, 1.5, 0.5, false],
        [38, 3, 1.5, 1.6, false], [41, 9, 2, 0.7, false], [44, 15, 2.5, 1.1, true],
        [40, 22, 1.5, 0.4, false], [46, 6, 1.5, 1.4, false],
        [52, 2, 1.5, 0.9, false], [55, 7, 2, 1.7, false], [58, 12, 2.5, 0.6, true],
      ].map(([top, left, size, delay, big], i) => (
        <div key={`star-${i}`}
          className={`login-star ${big ? "login-star-big" : ""}`}
          style={{
            top: `${top}%`, left: `${left}%`,
            width: `${size}px`, height: `${size}px`,
            animationDelay: `${delay}s`,
          }}/>
      ))}

      {/* Estrellas fugaces con arco y cabeza amarilla */}
      <div className="login-shoot-1">
        <div className="login-shooting-star">
          <div className="tail"/>
          <div className="head"/>
        </div>
      </div>
      <div className="login-shoot-2">
        <div className="login-shooting-star">
          <div className="tail"/>
          <div className="head"/>
        </div>
      </div>

      {/* Aviones horizontales con doble estela */}
      <div className="login-plane-1" style={{ top: "22%", left: "-200px" }}>
        <div style={{ position: "relative", width: 240, height: 60 }}>
          <svg viewBox="0 0 240 60" style={{ position: "absolute", inset: 0, width: 240, height: 60 }}>
            <defs>
              <linearGradient id="loginTrail1" x1="0%" y1="50%" x2="100%" y2="50%">
                <stop offset="0%" stopColor="rgba(255,255,255,0)"/>
                <stop offset="50%" stopColor="rgba(255,255,255,0.2)"/>
                <stop offset="100%" stopColor="rgba(255,255,255,0.75)"/>
              </linearGradient>
              <filter id="loginTrailBlur1"><feGaussianBlur stdDeviation="1"/></filter>
            </defs>
            <path d="M 5 24 Q 100 24 190 24" stroke="url(#loginTrail1)" strokeWidth="2.5" fill="none" strokeLinecap="round" filter="url(#loginTrailBlur1)"/>
            <path d="M 5 36 Q 100 36 190 36" stroke="url(#loginTrail1)" strokeWidth="2.5" fill="none" strokeLinecap="round" filter="url(#loginTrailBlur1)"/>
          </svg>
          <i className="ti ti-plane" style={{
            position: "absolute", right: 14, top: 14, fontSize: 34, color: "#fff",
            filter: "drop-shadow(0 2px 6px rgba(255,255,255,0.5))",
            transform: "rotate(0deg)",
          }}/>
        </div>
      </div>

      <div className="login-plane-2" style={{ top: "7%", left: "-160px" }}>
        <div style={{ position: "relative", width: 190, height: 50 }}>
          <svg viewBox="0 0 190 50" style={{ position: "absolute", inset: 0, width: 190, height: 50 }}>
            <defs>
              <linearGradient id="loginTrail2" x1="0%" y1="50%" x2="100%" y2="50%">
                <stop offset="0%" stopColor="rgba(255,255,255,0)"/>
                <stop offset="50%" stopColor="rgba(255,255,255,0.15)"/>
                <stop offset="100%" stopColor="rgba(255,255,255,0.6)"/>
              </linearGradient>
              <filter id="loginTrailBlur2"><feGaussianBlur stdDeviation="0.8"/></filter>
            </defs>
            <path d="M 5 20 Q 80 20 150 20" stroke="url(#loginTrail2)" strokeWidth="2" fill="none" strokeLinecap="round" filter="url(#loginTrailBlur2)"/>
            <path d="M 5 30 Q 80 30 150 30" stroke="url(#loginTrail2)" strokeWidth="2" fill="none" strokeLinecap="round" filter="url(#loginTrailBlur2)"/>
          </svg>
          <i className="ti ti-plane" style={{
            position: "absolute", right: 12, top: 12, fontSize: 26, color: "rgba(255,255,255,0.9)",
            filter: "drop-shadow(0 2px 4px rgba(255,255,255,0.4))",
            transform: "rotate(0deg)",
          }}/>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* LADO ATARDECER CARIBEÑO INTENSO (VL) — curva orgánica */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div style={{
        position: "absolute", inset: 0,
        clipPath: "polygon(100% 0, 100% 100%, 0 100%, 5% 90%, 12% 80%, 20% 70%, 28% 60%, 36% 50%, 44% 40%, 52% 32%, 60% 24%, 68% 17%, 75% 11%, 82% 6%, 89% 3%, 95% 1%, 100% 0)",
      }}>
        {/* Cielo intenso con 13 paradas */}
        <div style={{
          position: "absolute", inset: 0,
          background: `linear-gradient(180deg,
            #4A8FCC 0%,
            #B89A6E 8%,
            #FFB840 14%,
            #FF9020 22%,
            #FF6A1A 32%,
            #F0481E 42%,
            #D62831 52%,
            #A02858 62%,
            #5A3585 72%,
            #2A4894 80%,
            #0E5BA6 88%,
            #0A4078 96%,
            #062850 100%
          )`,
        }}/>

        {/* Sol con dispersión natural (3 capas con mix-blend) */}
        <div style={{
          position: "absolute", top: 0, right: 0, width: "80%", height: "60%",
          background: "radial-gradient(ellipse 700px 400px at 78% 38%, rgba(255,200,80,0.7) 0%, rgba(255,140,40,0.4) 25%, rgba(220,80,30,0.15) 50%, transparent 75%)",
          mixBlendMode: "screen",
        }}/>
        <div style={{
          position: "absolute", top: 0, right: 0, width: "70%", height: "50%",
          background: "radial-gradient(circle 350px at 82% 32%, rgba(255,220,140,0.85) 0%, rgba(255,170,60,0.5) 30%, transparent 60%)",
          mixBlendMode: "screen",
        }}/>
        <div className="login-sun" style={{
          position: "absolute", top: "22%", right: "10%", width: 100, height: 100,
          borderRadius: "50%",
          background: "radial-gradient(circle, #FFFEF0 0%, #FFE8A0 25%, #FFC050 50%, rgba(255,150,40,0.8) 75%, transparent 95%)",
          boxShadow: "0 0 80px rgba(255,200,80,0.9), 0 0 160px rgba(255,140,40,0.5)",
          filter: "blur(0.5px)",
        }}/>
        <div className="login-sun" style={{
          position: "absolute", top: "24%", right: "11%", width: 70, height: 70,
          borderRadius: "50%",
          background: "radial-gradient(circle, #FFFFFF 0%, #FFF4B8 50%, transparent 85%)",
          animationDelay: "0.5s",
        }}/>

        {/* 5 nubes premium */}
        <svg className="login-cloud-drift" viewBox="0 0 300 90" style={{ position: "absolute", top: "18%", left: "4%", width: 280, height: 80, opacity: 0.85 }}>
          <defs>
            <radialGradient id="loginCloud1" cx="50%" cy="60%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.95)"/>
              <stop offset="50%" stopColor="rgba(255,225,200,0.7)"/>
              <stop offset="100%" stopColor="rgba(200,170,180,0.2)"/>
            </radialGradient>
            <filter id="loginCloudBlur1"><feGaussianBlur stdDeviation="3"/></filter>
          </defs>
          <ellipse cx="80" cy="50" rx="60" ry="22" fill="url(#loginCloud1)" filter="url(#loginCloudBlur1)"/>
          <ellipse cx="140" cy="42" rx="55" ry="20" fill="url(#loginCloud1)" filter="url(#loginCloudBlur1)"/>
          <ellipse cx="200" cy="48" rx="50" ry="20" fill="url(#loginCloud1)" filter="url(#loginCloudBlur1)"/>
          <ellipse cx="240" cy="55" rx="40" ry="15" fill="url(#loginCloud1)" filter="url(#loginCloudBlur1)" opacity="0.7"/>
        </svg>

        <svg className="login-cloud-drift" viewBox="0 0 250 70" style={{ position: "absolute", top: "28%", left: "30%", width: 230, height: 65, opacity: 0.75, animationDelay: "3s" }}>
          <defs>
            <radialGradient id="loginCloud2" cx="50%" cy="60%">
              <stop offset="0%" stopColor="rgba(255,230,200,0.9)"/>
              <stop offset="60%" stopColor="rgba(255,180,140,0.5)"/>
              <stop offset="100%" stopColor="rgba(180,120,100,0.15)"/>
            </radialGradient>
            <filter id="loginCloudBlur2"><feGaussianBlur stdDeviation="2.5"/></filter>
          </defs>
          <ellipse cx="60" cy="40" rx="50" ry="18" fill="url(#loginCloud2)" filter="url(#loginCloudBlur2)"/>
          <ellipse cx="115" cy="32" rx="45" ry="16" fill="url(#loginCloud2)" filter="url(#loginCloudBlur2)"/>
          <ellipse cx="170" cy="38" rx="42" ry="16" fill="url(#loginCloud2)" filter="url(#loginCloudBlur2)"/>
        </svg>

        <svg viewBox="0 0 400 30" style={{ position: "absolute", top: "12%", left: "35%", width: 350, height: 28, opacity: 0.55 }}>
          <defs>
            <linearGradient id="loginCloud3" x1="0%" y1="50%" x2="100%" y2="50%">
              <stop offset="0%" stopColor="rgba(255,255,255,0)"/>
              <stop offset="40%" stopColor="rgba(255,255,255,0.7)"/>
              <stop offset="80%" stopColor="rgba(255,255,255,0.4)"/>
              <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
            </linearGradient>
            <filter id="loginCloudBlur3"><feGaussianBlur stdDeviation="2"/></filter>
          </defs>
          <ellipse cx="180" cy="14" rx="160" ry="6" fill="url(#loginCloud3)" filter="url(#loginCloudBlur3)"/>
        </svg>

        <svg viewBox="0 0 400 30" style={{ position: "absolute", top: "15%", left: "50%", width: 280, height: 22, opacity: 0.5 }}>
          <defs>
            <linearGradient id="loginCloud4" x1="0%" y1="50%" x2="100%" y2="50%">
              <stop offset="0%" stopColor="rgba(255,235,200,0)"/>
              <stop offset="50%" stopColor="rgba(255,235,200,0.6)"/>
              <stop offset="100%" stopColor="rgba(255,235,200,0)"/>
            </linearGradient>
            <filter id="loginCloudBlur4"><feGaussianBlur stdDeviation="2"/></filter>
          </defs>
          <ellipse cx="140" cy="11" rx="120" ry="5" fill="url(#loginCloud4)" filter="url(#loginCloudBlur4)"/>
        </svg>

        {/* Nube oscura dramática (sobre el mar) */}
        <svg className="login-cloud-drift" viewBox="0 0 250 60" style={{ position: "absolute", top: "50%", left: "10%", width: 220, height: 50, opacity: 0.7, animationDelay: "6s" }}>
          <defs>
            <radialGradient id="loginCloud5" cx="50%" cy="50%">
              <stop offset="0%" stopColor="rgba(60,30,70,0.85)"/>
              <stop offset="60%" stopColor="rgba(90,50,100,0.45)"/>
              <stop offset="100%" stopColor="rgba(60,30,70,0.05)"/>
            </radialGradient>
            <filter id="loginCloudBlur5"><feGaussianBlur stdDeviation="3"/></filter>
          </defs>
          <ellipse cx="55" cy="32" rx="50" ry="16" fill="url(#loginCloud5)" filter="url(#loginCloudBlur5)"/>
          <ellipse cx="110" cy="26" rx="45" ry="14" fill="url(#loginCloud5)" filter="url(#loginCloudBlur5)"/>
          <ellipse cx="165" cy="32" rx="40" ry="14" fill="url(#loginCloud5)" filter="url(#loginCloudBlur5)"/>
        </svg>

        {/* Mar saturado */}
        <div style={{
          position: "absolute", top: "65%", left: 0, right: 0, bottom: "22%",
          background: "linear-gradient(180deg, #0E5BA6 0%, #073D7A 50%, #04275A 100%)",
        }}/>

        {/* Reflejo del sol en el mar (camino dorado) */}
        <div style={{
          position: "absolute", top: "65%", right: "8%", width: 120, height: 100,
          background: "linear-gradient(180deg, rgba(255,180,60,0.9) 0%, rgba(255,140,40,0.6) 40%, rgba(255,100,30,0.2) 80%, transparent 100%)",
          filter: "blur(8px)", mixBlendMode: "screen",
          borderRadius: "50% 50% 30% 30%",
        }}/>
        <div style={{
          position: "absolute", top: "66%", right: "10%", width: 80, height: 90,
          background: "linear-gradient(180deg, rgba(255,235,180,0.8), rgba(255,200,120,0.4), transparent)",
          filter: "blur(4px)", mixBlendMode: "screen",
        }}/>

        {/* Ondas color cálido */}
        <svg className="login-wave-1" viewBox="0 0 400 30" style={{ position: "absolute", top: "67%", left: "25%", width: "75%", height: 20, opacity: 0.55 }}>
          <path d="M 0 15 Q 50 8 100 15 T 200 15 T 300 15 T 400 15" stroke="rgba(255,200,140,0.8)" strokeWidth="1.5" fill="none"/>
        </svg>
        <svg className="login-wave-2" viewBox="0 0 400 30" style={{ position: "absolute", top: "70%", left: "30%", width: "70%", height: 20, opacity: 0.45 }}>
          <path d="M 0 15 Q 60 9 120 15 T 240 15 T 360 15" stroke="rgba(255,180,100,0.7)" strokeWidth="1.2" fill="none"/>
        </svg>
        <svg className="login-wave-1" viewBox="0 0 400 30" style={{ position: "absolute", top: "73%", left: "35%", width: "65%", height: 20, opacity: 0.4, animationDelay: "2s" }}>
          <path d="M 0 15 Q 70 10 140 15 T 280 15 T 400 15" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8" fill="none"/>
        </svg>

        {/* Orilla con espuma blanca */}
        <div style={{
          position: "absolute", bottom: "22%", left: "18%", right: 0, height: 6,
          background: "linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0.4))",
          borderRadius: 4, filter: "blur(1.5px)",
        }}/>
        <svg viewBox="0 0 600 20" style={{ position: "absolute", bottom: "21%", left: "18%", width: "82%", height: 14, opacity: 0.85 }}>
          <path d="M 0 10 Q 25 4 50 10 Q 75 6 100 10 Q 125 3 150 10 Q 175 7 200 10 Q 225 4 250 10 Q 275 8 300 10 Q 325 5 350 10 Q 375 3 400 10 Q 425 7 450 10 Q 475 4 500 10 Q 525 6 550 10 Q 575 8 600 10"
            stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round"/>
        </svg>

        {/* Arena blanca */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: "22%",
          background: "linear-gradient(180deg, #FFF2D8 0%, #F8E0A8 30%, #EFD58A 65%, #E8C870 100%)",
        }}/>

        {/* Reflejo del cielo en arena mojada (cálido) */}
        <div style={{
          position: "absolute", bottom: "18%", left: "18%", right: 0, height: 25,
          background: "linear-gradient(180deg, rgba(255,140,60,0.35), transparent)",
          mixBlendMode: "multiply",
        }}/>

        {/* Textura sutil arena */}
        {[
          [8, 30, 2], [5, 38, 1.5], [12, 45, 1.5], [4, 55, 2],
          [10, 62, 1.5], [6, 72, 1.5], [14, 80, 2], [16, 35, 1.5],
          [8, 88, 1.5],
        ].map(([bottom, left, size], i) => (
          <div key={`sand-${i}`} style={{
            position: "absolute",
            bottom: `${bottom}%`, left: `${left}%`,
            width: size, height: size,
            background: "#C9A858", borderRadius: "50%", opacity: 0.45,
          }}/>
        ))}

        {/* Gaviotas */}
        <svg viewBox="0 0 40 20" style={{ position: "absolute", top: "25%", right: "35%", width: 28, height: 14, opacity: 0.55 }}>
          <path d="M5 12 Q12 4 18 10 Q24 4 32 12" stroke="#2A2A2A" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        </svg>
        <svg viewBox="0 0 40 20" style={{ position: "absolute", top: "33%", right: "26%", width: 22, height: 11, opacity: 0.5 }}>
          <path d="M5 12 Q12 4 18 10 Q24 4 32 12" stroke="#2A2A2A" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        </svg>

        {/* Palmera tropical con cocos */}
        <svg viewBox="0 0 120 180" style={{ position: "absolute", bottom: "18%", right: "6%", width: 110, height: 160 }}>
          <path d="M 65 175 Q 60 130 55 85 Q 52 60 60 35" stroke="#3D2618" strokeWidth="4" fill="none" strokeLinecap="round"/>
          <path d="M 60 140 L 64 142" stroke="#2A1A10" strokeWidth="0.8"/>
          <path d="M 57 110 L 62 112" stroke="#2A1A10" strokeWidth="0.8"/>
          <path d="M 54 80 L 59 82" stroke="#2A1A10" strokeWidth="0.8"/>
          <ellipse cx="38" cy="38" rx="28" ry="9" fill="#1A4D3A" opacity="0.92" transform="rotate(-25 38 38)"/>
          <ellipse cx="82" cy="38" rx="28" ry="9" fill="#1A4D3A" opacity="0.92" transform="rotate(25 82 38)"/>
          <ellipse cx="40" cy="22" rx="28" ry="9" fill="#235D44" opacity="0.92" transform="rotate(-55 40 22)"/>
          <ellipse cx="80" cy="22" rx="28" ry="9" fill="#235D44" opacity="0.92" transform="rotate(55 80 22)"/>
          <ellipse cx="60" cy="12" rx="28" ry="7" fill="#2A6B4F" opacity="0.88"/>
          <circle cx="56" cy="38" r="4" fill="#3D2618"/>
          <circle cx="62" cy="40" r="3.5" fill="#3D2618"/>
        </svg>

        {/* Sombra palmera */}
        <div style={{
          position: "absolute", bottom: "12%", right: "18%", width: 80, height: 6,
          background: "rgba(60,40,30,0.25)", borderRadius: "50%",
          filter: "blur(3px)", transform: "rotate(-15deg)",
        }}/>

        {/* Vignette sutil */}
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse 120% 80% at 60% 50%, transparent 60%, rgba(0,0,0,0.15) 100%)",
          pointerEvents: "none",
        }}/>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* CHIPS DE EMPRESAS (esquinas opuestas) */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="login-chip-anim" style={{
        position: "absolute", top: 28, left: 28,
        display: "inline-flex", alignItems: "center", gap: 8,
        background: "rgba(255,255,255,0.1)",
        border: "0.5px solid rgba(255,255,255,0.25)",
        padding: "6px 14px", borderRadius: 99,
        backdropFilter: "blur(8px)",
        zIndex: 5,
      }}>
        <i className="ti ti-plane" style={{ fontSize: 14, color: "#fff" }}/>
        <span style={{ fontSize: 11, color: "#fff", fontWeight: 600, letterSpacing: 0.4 }}>TravelAirSolutions</span>
      </div>

      <div className="login-chip-anim" style={{
        position: "absolute", bottom: 28, right: 28,
        display: "inline-flex", alignItems: "center", gap: 8,
        background: "rgba(255,255,255,0.18)",
        border: "0.5px solid rgba(255,255,255,0.35)",
        padding: "6px 14px", borderRadius: 99,
        backdropFilter: "blur(8px)",
        zIndex: 5,
        animationDelay: "0.15s",
      }}>
        <i className="ti ti-palmtree" style={{ fontSize: 14, color: "#fff" }}/>
        <span style={{ fontSize: 11, color: "#fff", fontWeight: 600, letterSpacing: 0.4 }}>Viajes Libero</span>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TARJETA DEL LOGIN */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div style={{
        position: "relative", zIndex: 10,
        minHeight: "100vh", display: "flex",
        alignItems: "center", justifyContent: "center",
        padding: 20,
      }}>
        <div className="login-card-anim" style={{
          background: "rgba(255,255,255,0.98)",
          backdropFilter: "blur(12px)",
          borderRadius: 20,
          padding: "40px 38px",
          width: "100%", maxWidth: 420,
          boxShadow: "0 32px 80px rgba(5,11,26,0.45), 0 4px 12px rgba(15,45,74,0.12)",
          border: "0.5px solid rgba(255,255,255,0.7)",
        }}>

          {/* Branding bi-empresa */}
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ display: "inline-flex", gap: 6, marginBottom: 14 }}>
              <div style={{
                width: 44, height: 44,
                background: "linear-gradient(135deg, #142855, #4A6FA5)",
                borderRadius: 10,
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 4px 12px rgba(20,40,85,0.3)",
              }}>
                <i className="ti ti-plane" style={{ fontSize: 22, color: "#fff" }}/>
              </div>
              <div style={{
                width: 44, height: 44,
                background: "linear-gradient(135deg, #E76F51, #2A9D8F)",
                borderRadius: 10,
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 4px 12px rgba(231,111,81,0.25)",
              }}>
                <i className="ti ti-palmtree" style={{ fontSize: 22, color: "#fff" }}/>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 6 }}>
              <div style={{ fontSize: 19, fontWeight: 800, color: C.navy, letterSpacing: "-0.4px", lineHeight: 1.1, textAlign: "right" }}>
                TravelAir<br/>
                <span style={{ fontWeight: 500, fontSize: 13, color: C.muted }}>Solutions</span>
              </div>
              <div style={{
                width: 1, height: 36,
                background: "linear-gradient(180deg, transparent, #E2E8F0, transparent)",
              }}/>
              <div style={{ fontSize: 19, fontWeight: 800, color: C.coral, letterSpacing: "-0.4px", lineHeight: 1.1, textAlign: "left" }}>
                Viajes<br/>
                <span style={{ fontWeight: 500, fontSize: 13, color: C.muted }}>Libero</span>
              </div>
            </div>

            <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 14, paddingTop: 14, borderTop: "0.5px solid #F1F5F9" }}>
              Sistema de Cuentas por Pagar
            </div>
          </div>

          {/* Formulario */}
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 14 }}>
              <label style={{
                display: "block", fontSize: 10, fontWeight: 700, color: C.muted,
                textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5,
              }}>
                Usuario
              </label>
              <div style={{ position: "relative" }}>
                <i className="ti ti-user" style={{
                  position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
                  fontSize: 14, color: "#94A3B8", pointerEvents: "none",
                }}/>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="tu.usuario"
                  autoFocus
                  className="login-input"
                  style={{
                    width: "100%", padding: "12px 14px 12px 38px",
                    borderRadius: 10, border: "1px solid #E2E8F0",
                    fontSize: 14, outline: "none", background: "#FAFBFC",
                    fontFamily: "inherit", color: C.text,
                    boxSizing: "border-box", transition: "border-color .2s, background .2s",
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{
                display: "block", fontSize: 10, fontWeight: 700, color: C.muted,
                textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5,
              }}>
                Contraseña
              </label>
              <div style={{ position: "relative" }}>
                <i className="ti ti-lock" style={{
                  position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
                  fontSize: 14, color: "#94A3B8", pointerEvents: "none",
                }}/>
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="login-input"
                  style={{
                    width: "100%", padding: "12px 42px 12px 38px",
                    borderRadius: 10, border: "1px solid #E2E8F0",
                    fontSize: 14, outline: "none", background: "#FAFBFC",
                    fontFamily: "inherit", color: C.text,
                    boxSizing: "border-box", transition: "border-color .2s, background .2s",
                  }}
                />
                <button type="button"
                  onClick={() => setShowPass(!showPass)}
                  style={{
                    position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                    background: "transparent", border: "none", cursor: "pointer",
                    padding: 4, color: showPass ? C.navy : "#94A3B8",
                    fontFamily: "inherit", lineHeight: 1,
                  }}
                  tabIndex={-1}>
                  <i className={`ti ti-${showPass ? "eye-off" : "eye"}`} style={{ fontSize: 16 }}/>
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                background: "#FFEBEE", border: "1px solid #EF9A9A", borderRadius: 8,
                padding: "10px 14px", marginBottom: 14, color: C.danger,
                fontSize: 12, fontWeight: 600, textAlign: "center",
              }}>
                ⚠️ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !username || !password}
              style={{
                width: "100%", padding: "13px 20px", borderRadius: 10, border: "none",
                background: loading || !username || !password
                  ? "#94A3B8"
                  : "linear-gradient(90deg, #142855 0%, #4A4A7A 50%, #E76F51 100%)",
                color: "#fff", fontWeight: 700, fontSize: 14,
                cursor: loading ? "wait" : (!username || !password ? "not-allowed" : "pointer"),
                fontFamily: "inherit",
                boxShadow: !loading && username && password ? "0 4px 14px rgba(20,40,85,0.25)" : "none",
                transition: "transform .15s, box-shadow .15s, background .2s",
                letterSpacing: 0.3,
              }}
              onMouseEnter={e => {
                if (!loading && username && password) {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = "0 6px 20px rgba(20,40,85,0.35)";
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = !loading && username && password ? "0 4px 14px rgba(20,40,85,0.25)" : "none";
              }}
            >
              {loading ? "Verificando…" : "Iniciar Sesión"}
            </button>
          </form>
        </div>
      </div>

    </div>
  );
}
