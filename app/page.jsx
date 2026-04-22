"use client";
// @ts-nocheck

import React, { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, signInWithCustomToken, signInAnonymously } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc, onSnapshot, collection, query, where } from "firebase/firestore";

// ==========================================
// Firebase Setup
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyB4d0i6P8eVoTQYfxpGUkJBLCWeXXPQX0U",
  authDomain: "soccer-scoreboard-1d936.firebaseapp.com",
  projectId: "soccer-scoreboard-1d936",
  storageBucket: "soccer-scoreboard-1d936.firebasestorage.app",
  messagingSenderId: "961588422134",
  appId: "1:961588422134:web:3309f59c7f7c487abd13d7"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const globalAppId = "soccer-score-app";

// ==========================================
// ① エントリーポイント
// ==========================================
export default function App() {
  const [isObsMode, setIsObsMode] = useState(false);
  const [obsCourtId, setObsCourtId] = useState("");

  useEffect(() => {
    try {
      if (typeof window !== "undefined" && window.location) {
        const params = new URLSearchParams(window.location.search);
        if (params.get("mode") === "obs") {
          setIsObsMode(true);
          setObsCourtId(params.get("court") || "");
        }
      }
    } catch(e) {
      console.error("URL Params error:", e);
    }
  }, []);

  if (isObsMode) return <ObsScoreboard courtId={obsCourtId} />;
  return <MainController />;
}

// ==========================================
// Pinch Zoom & Pan Container (カスタムズーム機能)
// ==========================================
function PinchZoomWrapper({ children }) {
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const state = useRef({
    startDistance: null,
    startScale: 1,
    startPan: { x: 0, y: 0 },
    startCenter: { x: 0, y: 0 }
  });

  const onTouchStart = (e) => {
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const cx = (t1.clientX + t2.clientX) / 2;
      const cy = (t1.clientY + t2.clientY) / 2;

      state.current = {
        startDistance: dist,
        startScale: transform.scale,
        startPan: { x: transform.x, y: transform.y },
        startCenter: { x: cx, y: cy }
      };
    }
  };

  const onTouchMove = (e) => {
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const cx = (t1.clientX + t2.clientX) / 2;
      const cy = (t1.clientY + t2.clientY) / 2;

      const scaleRatio = dist / state.current.startDistance;
      let newScale = state.current.startScale * scaleRatio;
      newScale = Math.max(0.3, Math.min(newScale, 5)); 

      const dx = cx - state.current.startCenter.x;
      const dy = cy - state.current.startCenter.y;

      setTransform({
        scale: newScale,
        x: state.current.startPan.x + dx,
        y: state.current.startPan.y + dy
      });
    }
  };

  const onTouchEnd = () => {
    state.current.startDistance = null;
  };

  return (
    <div 
      className="absolute inset-0 touch-none select-none flex items-center justify-center overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div 
        className="will-change-transform origin-center flex flex-col items-center justify-center"
        style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}
      >
        {children}
      </div>
    </div>
  );
}

// ==========================================
// Custom Hook for Timer logic (自立同期型タイマー)
// ==========================================
function useTimer(timerData, durationMinutes = 20) {
  const [displayTime, setDisplayTime] = useState(0);

  useEffect(() => {
    let reqId;
    const update = () => {
      if (timerData?.isRunning && timerData?.startTime) {
        const now = Date.now();
        const diff = now - timerData.startTime;
        setDisplayTime((timerData.accumulated || 0) + diff);
      } else {
        setDisplayTime(timerData?.accumulated || 0);
      }
      reqId = requestAnimationFrame(update);
    };
    reqId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(reqId);
  }, [timerData]);

  const validTime = isNaN(displayTime) ? 0 : Math.max(0, displayTime);
  const totalSeconds = Math.floor(validTime / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  
  const isOverTime = durationMinutes > 0 && totalSeconds >= (durationMinutes * 60);

  return { displayTime: validTime, formattedTime, isOverTime };
}


// ==========================================
// ② 通常の操作画面
// ==========================================
function MainController() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [currentView, setCurrentView] = useState("scoreboard");

  useEffect(() => {
    let isMounted = true;
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        }
      } catch (err) {
        console.error("Auth init error:", err);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (isMounted) {
        if (currentUser && currentUser.isAnonymous) {
          setUser(null);
        } else {
          setUser(currentUser);
        }
        setLoading(false);
      }
    }, (authErr) => {
      console.error("Auth state error:", authErr);
      if (isMounted) setLoading(false);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError("ログインに失敗しました。メールアドレスまたはパスワードを確認してください。");
    }
  };

  const handleLogout = async () => signOut(auth);

  if (loading) {
    return <div className="min-h-screen bg-black flex items-center justify-center text-pink-500 font-black tracking-widest uppercase">LOADING...</div>;
  }

  // ログイン画面
  if (!user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center font-sans text-white select-none">
        <div className="bg-slate-900/80 p-10 rounded-2xl border border-slate-700 shadow-[0_20px_50px_rgba(0,0,0,0.5)] w-[400px] max-w-[90vw] flex flex-col gap-8 backdrop-blur-md">
          <div className="text-center">
            <h1 className="text-3xl md:text-4xl font-black tracking-[0.1em] uppercase mb-2" style={{ textShadow: "0 4px 8px rgba(0,0,0,0.5)" }}>LOGIN</h1>
            <p className="text-pink-500 text-xs font-bold tracking-widest uppercase">Soccer Scoreboard System</p>
          </div>
          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label className="text-slate-400 text-xs font-bold tracking-widest uppercase">Email</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com" className="w-full bg-slate-800 text-white px-4 py-3 rounded border border-slate-600 focus:border-pink-500 focus:ring-1 focus:ring-pink-500 focus:outline-none font-bold placeholder:text-slate-500 transition-colors" required />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-slate-400 text-xs font-bold tracking-widest uppercase">Password</label>
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" className="w-full bg-slate-800 text-white px-4 py-3 rounded border border-slate-600 focus:border-pink-500 focus:ring-1 focus:ring-pink-500 focus:outline-none font-bold placeholder:text-slate-500 transition-colors" required />
            </div>
            {error && <div className="text-red-400 text-xs font-bold tracking-widest leading-relaxed bg-red-500/10 p-3 rounded border border-red-500/20">{error}</div>}
            <button type="submit" className="w-full bg-pink-600 hover:bg-pink-700 text-white font-black py-4 rounded transition-colors tracking-[0.2em] mt-4 uppercase shadow-md text-lg">
              SIGN IN
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 権限設定
  const safeEmail = user?.email || "";
  const isSuperAdmin = safeEmail === "abctv1@abctv.com";
  const isGroupAdmin = safeEmail.startsWith("cerezo");
  const isAdmin = isSuperAdmin || isGroupAdmin;

  if (currentView === "dashboard" && isAdmin) {
    return <AdminDashboard user={user} onBack={() => setCurrentView("scoreboard")} />;
  }

  const courtId = safeEmail ? safeEmail.split("@")[0] : "guest_court";
  const obsUrl = typeof window !== 'undefined' ? `${window.location.origin}/?mode=obs&court=${courtId}` : '';
  
  const handleCopyUrl = () => {
    try {
      document.execCommand('copy'); 
      const textArea = document.createElement("textarea");
      textArea.value = obsUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch(err) {
      console.error("Copy failed", err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black overflow-hidden font-sans">
      
      {/* メニューボタン */}
      <button 
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className="absolute top-4 right-4 z-[100] w-12 h-12 bg-slate-800/60 rounded border border-white/10 flex items-center justify-center text-white/80 hover:bg-slate-700 hover:text-white transition-colors shadow-lg backdrop-blur-md"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287-.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
        </svg>
      </button>

      {isMenuOpen && (
        <div className="absolute top-20 right-4 z-[100] w-80 bg-white p-6 rounded-lg border-2 border-slate-200 shadow-2xl flex flex-col gap-4">
          <div className="flex items-center justify-between pb-4 border-b border-slate-200">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-2 h-2 rounded bg-green-500 shadow-sm flex-shrink-0"></div>
              <span className="text-[#0f172a] text-xs font-black tracking-widest truncate uppercase">{safeEmail || "GUEST"}</span>
            </div>
            <button onClick={handleLogout} className="text-slate-400 text-xs font-black hover:text-pink-600 transition-colors ml-4 shrink-0 uppercase">LOGOUT</button>
          </div>
          <div className="flex flex-col gap-2">
             <span className="text-slate-400 text-[10px] font-black tracking-widest uppercase">OBS URL</span>
             <div onClick={handleCopyUrl} className="flex items-center justify-between bg-slate-50 px-3 py-3 rounded border border-slate-200 cursor-pointer hover:border-cyan-400 transition-colors group">
                <span className="text-slate-500 text-xs truncate mr-3 group-hover:text-[#0f172a]">{obsUrl}</span>
                <span className={`text-xs font-black shrink-0 ${copied ? 'text-green-500' : 'text-pink-500'}`}>{copied ? "COPIED" : "COPY"}</span>
             </div>
          </div>
          
          {isAdmin && (
            <>
              <div className="h-px bg-slate-200 my-2"></div>
              <button 
                onClick={() => { setCurrentView("dashboard"); setIsMenuOpen(false); }} 
                className="w-full py-3 bg-pink-600 hover:bg-pink-700 text-white text-xs font-black rounded transition-colors tracking-widest uppercase"
              >
                 MULTI MONITOR
              </button>
            </>
          )}
        </div>
      )}

      <div onClick={() => setIsMenuOpen(false)} className="absolute inset-0 z-10"> 
        <Scoreboard user={user} courtId={courtId} />
      </div>
    </div>
  );
}


// ==========================================
// ③ サッカー用 スコアボード本体
// ==========================================
function Scoreboard({ user, courtId }) {
  const [isLoaded, setIsLoaded] = useState(false);
  
  // Soccer specific states
  const [tournamentName, setTournamentName] = useState("第1回 ジュニアカップ");
  const [halfTimeDuration, setHalfTimeDuration] = useState(20); 
  const [extraTimeDuration, setExtraTimeDuration] = useState(5); 
  const [hasExtraTime, setHasExtraTime] = useState(false); 
  const [hasPK, setHasPK] = useState(true); 
  const [period, setPeriod] = useState("1st"); // '1st', '2nd', '1stEX', '2ndEX', 'PK', 'End'
  const [score, setScore] = useState({ home: 0, away: 0 }); 
  const [teamNames, setTeamNames] = useState({ home: "大阪", away: "奈良" });
  const [teamColors, setTeamColors] = useState({ home: "#0ea5e9", away: "#ec4899" });
  const [timer, setTimer] = useState({ isRunning: false, startTime: null, accumulated: 0 });
  const [additionalTime, setAdditionalTime] = useState(0);
  const [pkState, setPkState] = useState({ home: [], away: [] }); 
  const [firstHalfScore, setFirstHalfScore] = useState({ home: 0, away: 0 }); 

  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);

  // Firestore DB Path
  const collectionPath = `artifacts/${globalAppId}/public/data/courts`;
  const courtRef = doc(db, collectionPath, courtId);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;
    const fetchInitialData = async () => {
      try {
        const snap = await getDoc(courtRef);
        if (snap.exists() && isMounted) {
          const d = snap.data();
          if(d.tournamentName !== undefined) setTournamentName(d.tournamentName);
          if(d.halfTimeDuration !== undefined) setHalfTimeDuration(d.halfTimeDuration);
          if(d.extraTimeDuration !== undefined) setExtraTimeDuration(d.extraTimeDuration);
          if(d.hasExtraTime !== undefined) setHasExtraTime(d.hasExtraTime);
          if(d.hasPK !== undefined) setHasPK(d.hasPK);
          if(d.period) setPeriod(d.period);
          if(d.score) setScore(d.score);
          if(d.teamNames) setTeamNames(d.teamNames);
          if(d.teamColors) setTeamColors(d.teamColors);
          if(d.timer) setTimer(d.timer);
          if(d.additionalTime !== undefined) setAdditionalTime(d.additionalTime);
          if(d.pkState) setPkState(d.pkState);
          if(d.firstHalfScore) setFirstHalfScore(d.firstHalfScore);
        }
        if (isMounted) setIsLoaded(true);
      } catch (err) {
        console.error("Data fetch error", err);
        if (isMounted) setIsLoaded(true); 
      }
    };
    fetchInitialData();
    return () => { isMounted = false; };
  }, [courtId, user]);

  useEffect(() => {
    if (!isLoaded || !user) return; 
    const saveToCloud = async () => {
      try {
        await setDoc(courtRef, { 
          tournamentName, halfTimeDuration, extraTimeDuration, hasExtraTime, hasPK, period, score, teamNames, teamColors, timer, additionalTime, pkState, firstHalfScore,
          updatedAt: new Date().toISOString() 
        });
      } catch (err) {
        console.error("Data save error", err);
      }
    };
    saveToCloud();
  }, [tournamentName, halfTimeDuration, extraTimeDuration, hasExtraTime, hasPK, period, score, teamNames, teamColors, timer, additionalTime, pkState, firstHalfScore, isLoaded, courtId, user]);

  const currentDuration = (period === '1stEX' || period === '2ndEX') ? extraTimeDuration : halfTimeDuration;
  const { formattedTime, isOverTime } = useTimer(timer, currentDuration);

  // Undo/Redo Logic
  const getCurrentStateSnapshot = () => ({ 
    tournamentName, halfTimeDuration, extraTimeDuration, hasExtraTime, hasPK, period, score: { ...score }, teamNames: { ...teamNames }, teamColors: { ...teamColors },
    timer: { ...timer }, additionalTime, pkState: { home: [...(pkState?.home||[])], away: [...(pkState?.away||[])] },
    firstHalfScore: { ...firstHalfScore }
  });
  
  const saveHistory = () => { setHistory(prev => [...prev, getCurrentStateSnapshot()]); setFuture([]); };
  
  const handleUndo = () => { 
    if (history.length === 0) return; 
    setFuture(prev => [...prev, getCurrentStateSnapshot()]); 
    const prev = history[history.length - 1]; 
    setTournamentName(prev.tournamentName); setHalfTimeDuration(prev.halfTimeDuration); setExtraTimeDuration(prev.extraTimeDuration);
    setHasExtraTime(prev.hasExtraTime); setHasPK(prev.hasPK);
    setPeriod(prev.period); setScore(prev.score); setTeamNames(prev.teamNames); setTeamColors(prev.teamColors);
    setTimer({ ...prev.timer, isRunning: false, startTime: null }); 
    setAdditionalTime(prev.additionalTime); setPkState(prev.pkState); setFirstHalfScore(prev.firstHalfScore);
    setHistory(h => h.slice(0, -1)); 
  };
  
  const handleRedo = () => { 
    if (future.length === 0) return; 
    setHistory(prev => [...prev, getCurrentStateSnapshot()]); 
    const next = future[future.length - 1]; 
    setTournamentName(next.tournamentName); setHalfTimeDuration(next.halfTimeDuration); setExtraTimeDuration(next.extraTimeDuration);
    setHasExtraTime(next.hasExtraTime); setHasPK(next.hasPK);
    setPeriod(next.period); setScore(next.score); setTeamNames(next.teamNames); setTeamColors(next.teamColors);
    setTimer({ ...next.timer, isRunning: false, startTime: null }); 
    setAdditionalTime(next.additionalTime); setPkState(next.pkState); setFirstHalfScore(next.firstHalfScore);
    setFuture(f => f.slice(0, -1)); 
  };

  const toggleTimer = () => {
    saveHistory();
    if (timer.isRunning) {
      const now = Date.now();
      const diff = now - timer.startTime;
      setTimer({ isRunning: false, startTime: null, accumulated: timer.accumulated + diff });
    } else {
      setTimer({ isRunning: true, startTime: Date.now(), accumulated: timer.accumulated });
    }
  };

  const handleScoreChange = (team, delta) => { 
    saveHistory(); 
    setScore(s => ({ ...s, [team]: Math.max(0, (s[team] || 0) + delta) })); 
  };

  const checkPkWinner = (pkStatus) => {
    const homeList = Array.isArray(pkStatus?.home) ? pkStatus.home : [];
    const awayList = Array.isArray(pkStatus?.away) ? pkStatus.away : [];
    const homeKicks = homeList.length;
    const awayKicks = awayList.length;
    const homePkScore = homeList.filter(r => r === 'O').length;
    const awayPkScore = awayList.filter(r => r === 'O').length;
    
    // ▼ 修正：どちらかが5回「未満」の場合のみ、残りキック数による決着判定を行う
    if (homeKicks < 5 || awayKicks < 5) {
      const homeRemaining = Math.max(5 - homeKicks, 0);
      const awayRemaining = Math.max(5 - awayKicks, 0);
      if (homePkScore > awayPkScore + awayRemaining) return 'home';
      if (awayPkScore > homePkScore + homeRemaining) return 'away';
    }

    // ▼ 修正：両チームが5回「以上」蹴っている場合は、必ず同回数になった時だけ判定する
    if (homeKicks >= 5 && awayKicks >= 5 && homeKicks === awayKicks) {
      if (homePkScore !== awayPkScore) return homePkScore > awayPkScore ? 'home' : 'away';
    }
    return null;
  };

  const handlePeriodEnd = (type) => {
    saveHistory();
    setTimer({ isRunning: false, startTime: null, accumulated: 0 }); 
    setAdditionalTime(0);

    if (type === '1stEnd') {
      setPeriod('2nd');
      setFirstHalfScore({ ...score });
    } else if (type === '2ndEnd') {
      if (score.home === score.away) {
        if (hasExtraTime) setPeriod('1stEX');
        else if (hasPK) setPeriod('PK');
        else setPeriod('End');
      } else {
        setPeriod('End');
      }
    } else if (type === '1stExEnd') {
      setPeriod('2ndEX');
    } else if (type === '2ndExEnd') {
      if (score.home === score.away) {
        if (hasPK) setPeriod('PK');
        else setPeriod('End');
      } else {
        setPeriod('End');
      }
    }
  };

  const handlePkAction = (team, result) => {
    saveHistory();
    setPkState(prev => {
      const homeList = Array.isArray(prev?.home) ? prev.home : [];
      const awayList = Array.isArray(prev?.away) ? prev.away : [];
      const newState = { home: [...homeList], away: [...awayList] };
      
      if (newState[team].length < 15) { 
        newState[team].push(result);
      }

      const winner = checkPkWinner(newState);
      if (winner) {
        setTimeout(() => {
          setPeriod(current => current === 'PK' ? 'End' : current);
          setTimer({ isRunning: false, startTime: null, accumulated: 0 }); 
        }, 1500);
      }

      return newState;
    });
  };

  const resetAllAction = () => { 
    saveHistory(); 
    setPeriod('1st');
    setScore({ home: 0, away: 0 });
    setTimer({ isRunning: false, startTime: null, accumulated: 0 });
    setAdditionalTime(0);
    setPkState({ home: [], away: [] });
    setFirstHalfScore({ home: 0, away: 0 });
    setShowSettingsModal(false);
  };

  if (!isLoaded) return <div className="flex items-center justify-center min-h-screen bg-black text-pink-500 font-black tracking-widest">SYNCING...</div>;

  // PK戦の正しい枠数計算を追加
  const homeKicks = Array.isArray(pkState?.home) ? pkState.home.length : 0;
  const awayKicks = Array.isArray(pkState?.away) ? pkState.away.length : 0;
  const maxKicks = Math.max(homeKicks, awayKicks);
  const pkSlotsCount = Math.max(5, homeKicks === awayKicks ? maxKicks + 1 : maxKicks);

  const getPeriodKanji = () => {
    switch(period) {
      case '1st': return '前半';
      case '2nd': return '後半';
      case '1stEX': return '延長前半';
      case '2ndEX': return '延長後半';
      case 'PK': return 'PK戦';
      case 'End': return '試合終了';
      default: return '';
    }
  };

  return (
    <>
      <PinchZoomWrapper>
        <div className="font-sans text-white w-[900px] md:w-[1000px] max-w-[95vw] flex flex-col items-center relative z-20">
          
          {/* 大会名（枠の外側） - ブラックアウトラインでくっきりと */}
          <div 
            className="text-white text-5xl md:text-7xl font-black tracking-[0.2em] mb-8 cursor-pointer pointer-events-auto uppercase drop-shadow-xl"
            style={{ textShadow: "2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 0px 2px 0 #000, 0px -2px 0 #000, 2px 0px 0 #000, -2px 0px 0 #000, 0px 6px 12px rgba(0,0,0,0.5)" }}
            onClick={() => setShowSettingsModal(true)}
          >
             {String(tournamentName || "")}
          </div>

          {/* Main Board Container (Pop & Clean Style) */}
          <div className="relative w-full aspect-[16/9] rounded-2xl border-[3px] border-white/60 shadow-[0_20px_50px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden backdrop-blur-sm">
            
            {/* 背景グループ (ここに flex flex-col を復活！) */}
            <div className="absolute inset-0 z-0 pointer-events-none flex flex-col">
                <div className="flex-[3] bg-white/85"></div>
                <div className="flex-[1] bg-pink-50/85"></div>
            </div>
            {/* ストライプ */}
            <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "repeating-linear-gradient(-45deg, transparent, transparent 15px, rgba(255,255,255,0.4) 15px, rgba(255,255,255,0.4) 30px)" }}></div>
            
            {/* コンテンツの配置レイヤー (isolationで背景との干渉を遮断) */}
            <div className="relative z-10 w-full h-full flex flex-col pointer-events-none" style={{ isolation: 'isolate' }}>
              
              {/* 上段：チーム名 (白背景部分) */}
              <div className="flex-1 flex flex-col justify-end pb-8 pointer-events-auto">
                <div className="w-full flex items-end justify-center gap-4 md:gap-12 px-12">
                  
                  {/* HOME */}
                  <div className="flex-1 flex items-end justify-end gap-2 md:gap-4">
                    <div className="w-6 h-8 md:w-10 md:h-[50px] rounded-sm mb-1 shadow-sm transition-colors" style={{ backgroundColor: teamColors?.home || "#0ea5e9" }}></div>
                    <div 
                      className="text-center font-black text-6xl md:text-[100px] text-[#0f172a] uppercase leading-none drop-shadow-md" 
                      style={{ textShadow: "3px 3px 0 #fff, -3px -3px 0 #fff, 3px -3px 0 #fff, -3px 3px 0 #fff, 0 6px 12px rgba(0,0,0,0.2)", letterSpacing: "-0.02em" }}
                    >
                       {String(teamNames?.home || "")}
                    </div>
                    <div className="w-6 h-8 md:w-10 md:h-[50px] rounded-sm mb-1 shadow-sm transition-colors" style={{ backgroundColor: teamColors?.home || "#0ea5e9" }}></div>
                  </div>
                  
                  {/* VS or - */}
                  <div className="text-5xl w-8 md:w-12 opacity-0">-</div>
                  
                  {/* AWAY */}
                  <div className="flex-1 flex items-end justify-start gap-2 md:gap-4">
                    <div className="w-6 h-8 md:w-10 md:h-[50px] rounded-sm mb-1 shadow-sm transition-colors" style={{ backgroundColor: teamColors?.away || "#ec4899" }}></div>
                    <div 
                      className="text-center font-black text-6xl md:text-[100px] text-[#0f172a] uppercase leading-none drop-shadow-md" 
                      style={{ textShadow: "3px 3px 0 #fff, -3px -3px 0 #fff, 3px -3px 0 #fff, -3px 3px 0 #fff, 0 6px 12px rgba(0,0,0,0.2)", letterSpacing: "-0.02em" }}
                    >
                       {String(teamNames?.away || "")}
                    </div>
                    <div className="w-6 h-8 md:w-10 md:h-[50px] rounded-sm mb-1 shadow-sm transition-colors" style={{ backgroundColor: teamColors?.away || "#ec4899" }}></div>
                  </div>

                </div>
              </div>

              {/* 中段：水色のお洒落ベース (得点エリア) */}
              <div className="h-[40%] w-full bg-gradient-to-r from-cyan-400/90 to-cyan-500/90 shadow-md flex items-center justify-center gap-10 md:gap-32 px-12 pointer-events-auto relative backdrop-blur-sm z-20">
                <div className="flex-1 flex justify-center">
                  <div onClick={() => handleScoreChange('home', 1)} className="text-[9rem] md:text-[14rem] leading-none font-mono font-black text-white cursor-pointer hover:text-cyan-100 transition-colors drop-shadow-md select-none tabular-nums">
                     {Number(score?.home || 0)}
                  </div>
                </div>
                
                {/* PK戦の時はハイフンを消して「PK戦」と中央に表示 */}
                {period === 'PK' ? (
                  <div className="text-5xl md:text-7xl font-black tracking-widest text-white drop-shadow-md z-10 whitespace-nowrap">PK戦</div>
                ) : (
                  <div className="text-6xl md:text-8xl font-black text-white/50">-</div>
                )}
                
                <div className="flex-1 flex justify-center">
                  <div onClick={() => handleScoreChange('away', 1)} className="text-[9rem] md:text-[14rem] leading-none font-mono font-black text-white cursor-pointer hover:text-cyan-100 transition-colors drop-shadow-md select-none tabular-nums">
                     {Number(score?.away || 0)}
                  </div>
                </div>

                {/* PK履歴 */}
                {period === 'PK' && (
                  <div className="absolute -bottom-10 translate-y-1/2 w-full flex justify-between px-4 md:px-12 z-30 pointer-events-auto scale-90 md:scale-100">
                    <div className="flex-1 flex justify-center max-w-[48%]">
                       <PkTracker team="home" history={Array.isArray(pkState?.home) ? pkState.home : []} slotsCount={pkSlotsCount} onAdd={(res) => handlePkAction('home', res)} />
                    </div>
                    <div className="flex-1 flex justify-center max-w-[48%]">
                       <PkTracker team="away" history={Array.isArray(pkState?.away) ? pkState.away : []} slotsCount={pkSlotsCount} onAdd={(res) => handlePkAction('away', res)} />
                    </div>
                  </div>
                )}
              </div>

              {/* 下段：タイム表示 (縦書き＆センター配置) */}
              <div className="flex-1 flex items-center justify-center pointer-events-auto relative w-full h-full">
                
                <div className={`absolute inset-0 flex items-center justify-center cursor-pointer transition-colors duration-200 ${isOverTime && period !== 'End' && period !== 'PK' ? 'text-pink-600 drop-shadow-[0_2px_10px_rgba(219,39,119,0.3)]' : 'text-[#0f172a] drop-shadow-sm'}`} onClick={period !== 'End' && period !== 'PK' ? toggleTimer : undefined}>
                   {/* PK戦の時は下段を空にする、試合終了時は横書きで大きく表示 */}
                   {period === 'PK' ? null : period === 'End' ? (
                      <span className="text-5xl md:text-7xl font-black tracking-widest z-10">試合終了</span>
                   ) : (
                      <div className="relative flex items-center justify-center">
                         {/* 縦に文字を積み上げる（100%確実な縦書き） */}
                         <div className="absolute right-[100%] mr-2 md:mr-6 bg-slate-800/10 px-2 py-3 md:px-2.5 md:py-4 rounded-lg flex items-center justify-center shadow-inner">
                            <div className="flex flex-col items-center justify-center gap-0.5 md:gap-1 text-lg md:text-2xl font-black opacity-80 leading-none">
                               {String(getPeriodKanji()).split('').map((char, index) => (
                                 <span key={index}>{char}</span>
                               ))}
                            </div>
                         </div>
                         
                         {/* センター配置のタイム */}
                         <span className="text-[4rem] md:text-[6.5rem] font-mono font-black tabular-nums tracking-tighter leading-none z-10">{String(formattedTime)}</span>

                         {/* ロスタイム表示 (タイムの右隣に固定) */}
                         {additionalTime > 0 && (
                           <div className="absolute left-[100%] ml-4 md:ml-6 bg-pink-600 border border-white text-white font-black text-3xl md:text-4xl px-3 py-1 md:px-4 rounded shadow-md z-20">
                             +{Number(additionalTime)}
                           </div>
                         )}
                      </div>
                   )}
                </div>
                
                {/* 試合終了時の前後半別スコア表示 */}
                {period === 'End' && (
                  <div className="absolute top-0 -translate-y-1/2 bg-white border-2 border-cyan-400 px-8 py-2 rounded-full flex gap-10 text-[#0f172a] font-bold tracking-widest shadow-md z-30 uppercase">
                     <div>前半: {Number(firstHalfScore?.home || 0)} - {Number(firstHalfScore?.away || 0)}</div>
                     {(() => {
                        const homeArr = Array.isArray(pkState?.home) ? pkState.home : [];
                        const awayArr = Array.isArray(pkState?.away) ? pkState.away : [];
                        const homePkScore = homeArr.filter(r => r === 'O').length || 0;
                        const awayPkScore = awayArr.filter(r => r === 'O').length || 0;
                        const homeSecondHalf = Number(score?.home || 0) - Number(firstHalfScore?.home || 0);
                        const awaySecondHalf = Number(score?.away || 0) - Number(firstHalfScore?.away || 0);
                        
                        return (
                          <>
                            <div>後半: {homeSecondHalf} - {awaySecondHalf}</div>
                            {(homeArr.length > 0 || awayArr.length > 0) && (
                              <div className="text-pink-600">PK: {homePkScore} - {awayPkScore}</div>
                            )}
                          </>
                        );
                     })()}
                  </div>
                )}
              </div>

            </div> {/* /コンテンツの配置レイヤー 閉じタグ */}

            {/* Layer 3: Controls (ステルス化された操作ボタン) */}
            
            {/* 右上：⚙️設定アイコン */}
            <button 
              onClick={() => setShowSettingsModal(true)} 
              className="absolute top-6 right-6 w-12 h-12 bg-slate-800/40 hover:bg-slate-800/70 text-white/70 hover:text-white rounded-full border border-white/20 flex items-center justify-center text-xl transition-colors shadow-md z-30 backdrop-blur-sm"
            >
              ⚙️
            </button>

            {/* 左下：ロスタイム設定＆終了ボタン (スマホ時はマージンとサイズを縮小) */}
            <div className="absolute bottom-4 left-4 md:bottom-6 md:left-6 flex gap-2 md:gap-3 z-30">
              {period !== 'PK' && (
                <button onClick={() => { saveHistory(); setAdditionalTime(prev => prev + 1); }} className="px-3 py-2 md:px-5 md:py-3 bg-slate-800/40 hover:bg-slate-800/70 border border-white/20 text-white/80 hover:text-white text-xs md:text-sm font-black tracking-widest rounded shadow-md transition-colors uppercase backdrop-blur-sm">
                   ロスタイム
                </button>
              )}
              {period === '1st' && <ConfirmButton label="前半終了" onConfirm={() => handlePeriodEnd('1stEnd')} positionClass="relative" />}
              {period === '2nd' && <ConfirmButton label="後半終了" onConfirm={() => handlePeriodEnd('2ndEnd')} positionClass="relative" />}
              {period === '1stEX' && <ConfirmButton label="前半終了" onConfirm={() => handlePeriodEnd('1stExEnd')} positionClass="relative" />}
              {period === '2ndEX' && <ConfirmButton label="後半終了" onConfirm={() => handlePeriodEnd('2ndExEnd')} positionClass="relative" />}
            </div>

            {/* 右下：UNDO / REDO */}
            <div className="absolute bottom-6 right-6 flex gap-2 z-30">
              <button onClick={handleUndo} disabled={history.length === 0} title="UNDO" className={`w-12 h-12 flex items-center justify-center bg-slate-800/40 hover:bg-slate-800/70 border border-white/20 text-white/80 hover:text-white rounded text-xl font-black transition-colors shadow-md backdrop-blur-sm ${history.length===0?'opacity-30':''}`}>↶</button>
              <button onClick={handleRedo} disabled={future.length === 0} title="REDO" className={`w-12 h-12 flex items-center justify-center bg-slate-800/40 hover:bg-slate-800/70 border border-white/20 text-white/80 hover:text-white rounded text-xl font-black transition-colors shadow-md backdrop-blur-sm ${future.length===0?'opacity-30':''}`}>↷</button>
            </div>

          </div> {/* /Main Board Container 閉じタグ */}
        </div> 
      </PinchZoomWrapper>

      {/* モーダル群 */}
      {showSettingsModal && (
        <SettingsModal 
           currentData={{ tournamentName, teamNames, teamColors, score, timer, halfTimeDuration, extraTimeDuration, hasExtraTime, hasPK, additionalTime }}
           onSave={(newData) => {
             saveHistory();
             if(newData.tournamentName !== undefined) setTournamentName(newData.tournamentName);
             if(newData.teamNames) setTeamNames(newData.teamNames);
             if(newData.teamColors) setTeamColors(newData.teamColors);
             if(newData.score) setScore(newData.score);
             if(newData.timer) setTimer(newData.timer);
             if(newData.halfTimeDuration !== undefined) setHalfTimeDuration(newData.halfTimeDuration);
             if(newData.extraTimeDuration !== undefined) setExtraTimeDuration(newData.extraTimeDuration);
             if(newData.hasExtraTime !== undefined) setHasExtraTime(newData.hasExtraTime);
             if(newData.hasPK !== undefined) setHasPK(newData.hasPK);
             if(newData.additionalTime !== undefined) setAdditionalTime(newData.additionalTime);
             setShowSettingsModal(false);
           }}
           onClose={() => setShowSettingsModal(false)}
           onReset={resetAllAction}
        />
      )}

    </>
  );
}

// ==========================================
// Settings Modal Component (一括設定画面)
// ==========================================
function SettingsModal({ currentData, onSave, onClose, onReset }) {
  const [tName, setTName] = useState(currentData?.tournamentName || "");
  const [hName, setHName] = useState(currentData?.teamNames?.home || "");
  const [aName, setAName] = useState(currentData?.teamNames?.away || "");
  const [hColor, setHColor] = useState(currentData?.teamColors?.home || "#0ea5e9");
  const [aColor, setAColor] = useState(currentData?.teamColors?.away || "#ec4899");
  const [hScore, setHScore] = useState(currentData?.score?.home || 0);
  const [aScore, setAScore] = useState(currentData?.score?.away || 0);
  const [duration, setDuration] = useState(currentData?.halfTimeDuration || 20);
  const [exDuration, setExDuration] = useState(currentData?.extraTimeDuration || 5);
  const [addTime, setAddTime] = useState(currentData?.additionalTime || 0);
  const [exTime, setExTime] = useState(currentData?.hasExtraTime || false);
  const [pk, setPk] = useState(currentData?.hasPK || false);
  
  // タイム計算
  const timerData = currentData?.timer || { isRunning: false, accumulated: 0, startTime: null };
  const currentTotalMs = (timerData.accumulated || 0) + (timerData.isRunning ? Date.now() - (timerData.startTime || Date.now()) : 0);
  const [mins, setMins] = useState(Math.floor(currentTotalMs / 60000) || 0);
  const [secs, setSecs] = useState(Math.floor((currentTotalMs % 60000) / 1000) || 0);

  const handleSave = () => {
    const parsedMins = parseInt(mins) || 0;
    const parsedSecs = parseInt(secs) || 0;
    const newAccumulated = (parsedMins * 60 + parsedSecs) * 1000;
    onSave({
      tournamentName: tName,
      teamNames: { home: hName, away: aName },
      teamColors: { home: hColor, away: aColor },
      score: { home: parseInt(hScore) || 0, away: parseInt(aScore) || 0 },
      halfTimeDuration: parseInt(duration) || 20,
      extraTimeDuration: parseInt(exDuration) || 5,
      hasExtraTime: exTime,
      hasPK: pk,
      additionalTime: parseInt(addTime) || 0,
      timer: { isRunning: false, startTime: null, accumulated: newAccumulated }
    });
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-white border-t-[6px] border-t-pink-500 p-8 rounded-xl shadow-2xl w-[500px] max-w-full max-h-[90vh] overflow-y-auto z-10 flex flex-col gap-6">
        
        <div className="flex justify-between items-center border-b border-slate-200 pb-4">
          <h2 className="text-[#0f172a] font-black tracking-widest text-2xl flex items-center gap-2 uppercase">
            <span className="text-pink-500">⚙️</span> SYSTEM SETTINGS
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-pink-500 transition text-2xl font-black">✕</button>
        </div>

        {/* 試合設定チェックボックス */}
        <div className="flex gap-6 bg-pink-50 p-4 rounded border border-pink-100">
          <label className="flex items-center gap-2 cursor-pointer text-[#0f172a] font-bold tracking-widest">
            <input type="checkbox" checked={exTime} onChange={e => setExTime(e.target.checked)} className="w-5 h-5 accent-pink-500" />
            同点時 延長戦あり
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-[#0f172a] font-bold tracking-widest">
            <input type="checkbox" checked={pk} onChange={e => setPk(e.target.checked)} className="w-5 h-5 accent-pink-500" />
            同点時 PK戦あり
          </label>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-slate-500 text-xs font-bold tracking-widest uppercase">大会名</label>
          <input value={tName} onChange={e=>setTName(e.target.value)} className="w-full bg-slate-50 text-[#0f172a] px-4 py-3 rounded border border-slate-300 focus:border-pink-500 focus:outline-none font-bold" />
        </div>

        <div className="flex gap-4">
          <div className="flex flex-col gap-2 flex-1">
            <label className="text-slate-500 text-xs font-bold tracking-widest uppercase">ホーム チーム名 & カラー</label>
            <div className="flex items-center gap-2">
               <input type="color" value={hColor} onChange={e=>setHColor(e.target.value)} className="w-12 h-12 rounded cursor-pointer shrink-0 border border-slate-300 bg-white p-1" />
               <input value={hName} onChange={e=>setHName(e.target.value)} className="w-full bg-slate-50 text-[#0f172a] px-4 py-3 rounded border border-slate-300 focus:border-pink-500 focus:outline-none font-bold uppercase" />
            </div>
          </div>
          <div className="flex flex-col gap-2 flex-1">
            <label className="text-slate-500 text-xs font-bold tracking-widest uppercase">アウェイ チーム名 & カラー</label>
            <div className="flex items-center gap-2">
               <input type="color" value={aColor} onChange={e=>setAColor(e.target.value)} className="w-12 h-12 rounded cursor-pointer shrink-0 border border-slate-300 bg-white p-1" />
               <input value={aName} onChange={e=>setAName(e.target.value)} className="w-full bg-slate-50 text-[#0f172a] px-4 py-3 rounded border border-slate-300 focus:border-pink-500 focus:outline-none font-bold uppercase" />
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex flex-col gap-2 flex-1">
            <label className="text-slate-500 text-xs font-bold tracking-widest uppercase">ホーム 得点</label>
            <input type="number" value={hScore} onChange={e=>setHScore(e.target.value)} className="w-full bg-slate-50 text-[#0f172a] px-4 py-3 rounded border border-slate-300 focus:border-pink-500 focus:outline-none font-bold text-center text-xl font-mono tabular-nums" />
          </div>
          <div className="flex flex-col gap-2 flex-1">
            <label className="text-slate-500 text-xs font-bold tracking-widest uppercase">アウェイ 得点</label>
            <input type="number" value={aScore} onChange={e=>setAScore(e.target.value)} className="w-full bg-slate-50 text-[#0f172a] px-4 py-3 rounded border border-slate-300 focus:border-pink-500 focus:outline-none font-bold text-center text-xl font-mono tabular-nums" />
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex flex-col gap-2 flex-1">
            <label className="text-slate-500 text-xs font-bold tracking-widest uppercase">通常ハーフ時間（分）</label>
            <div className="flex items-center gap-2">
               <input type="number" value={duration} onChange={e=>setDuration(e.target.value)} className="w-full bg-slate-50 text-[#0f172a] px-4 py-3 rounded border border-slate-300 focus:border-pink-500 focus:outline-none font-bold text-center text-xl font-mono tabular-nums" />
               <span className="text-slate-500 font-bold">分</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 flex-1">
            <label className="text-slate-500 text-xs font-bold tracking-widest uppercase">延長戦ハーフ時間（分）</label>
            <div className="flex items-center gap-2">
               <input type="number" value={exDuration} onChange={e=>setExDuration(e.target.value)} className="w-full bg-slate-50 text-[#0f172a] px-4 py-3 rounded border border-slate-300 focus:border-pink-500 focus:outline-none font-bold text-center text-xl font-mono tabular-nums" />
               <span className="text-slate-500 font-bold">分</span>
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex flex-col gap-2 flex-1">
            <label className="text-slate-500 text-xs font-bold tracking-widest uppercase">タイム修正</label>
            <div className="flex items-center gap-2">
               <input type="number" value={mins} onChange={e=>setMins(e.target.value)} className="w-full bg-slate-50 text-[#0f172a] px-2 py-3 rounded border border-slate-300 focus:border-pink-500 focus:outline-none font-bold text-center text-xl font-mono tabular-nums" />
               <span className="text-slate-500 font-bold">:</span>
               <input type="number" value={secs} onChange={e=>setSecs(e.target.value)} className="w-full bg-slate-50 text-[#0f172a] px-2 py-3 rounded border border-slate-300 focus:border-pink-500 focus:outline-none font-bold text-center text-xl font-mono tabular-nums" />
            </div>
          </div>
          <div className="flex flex-col gap-2 flex-1">
            <label className="text-slate-500 text-xs font-bold tracking-widest uppercase">ロスタイム表記</label>
            <div className="flex items-center gap-2">
               <span className="text-slate-500 font-bold">+</span>
               <input type="number" value={addTime} onChange={e=>setAddTime(e.target.value)} className="w-full bg-slate-50 text-[#0f172a] px-4 py-3 rounded border border-slate-300 focus:border-pink-500 focus:outline-none font-bold text-center text-xl font-mono tabular-nums" />
            </div>
          </div>
        </div>

        <button onClick={handleSave} className="w-full bg-pink-600 hover:bg-pink-700 text-white font-black py-4 rounded transition-colors tracking-widest mt-4 text-lg uppercase shadow-md">
          SAVE & APPLY
        </button>

        <div className="border-t border-slate-200 mt-2 pt-6">
           <button onClick={onReset} className="w-full bg-slate-100 hover:bg-red-50 border border-slate-300 hover:border-red-300 text-red-500 font-bold py-3 rounded transition-colors tracking-widest uppercase">
             RESET MATCH DATA
           </button>
        </div>

      </div>
    </div>
  );
}

// ==========================================
// PK Tracker Component
// ==========================================
function PkTracker({ team, history = [], slotsCount = 5, onAdd }) {
  const safeHistory = Array.isArray(history) ? history : [];
  const slots = Array.from({ length: slotsCount });

  return (
    <div className="flex flex-col items-center gap-2 md:gap-3 bg-white/90 px-4 md:px-6 py-4 rounded-2xl shadow-lg border border-slate-200 backdrop-blur-sm w-full max-w-full">
      <div className="flex items-center justify-center gap-1.5 md:gap-2 flex-wrap">
        {slots.map((_, i) => {
          const res = safeHistory[i];
          let bgClass = "bg-white border-slate-300 text-slate-300";
          let icon = "-";
          if (res === 'O') { bgClass = "bg-pink-500 border-pink-500 text-white shadow-md"; icon = "O"; }
          if (res === 'X') { bgClass = "bg-slate-400 border-slate-400 text-white shadow-inner"; icon = "X"; }
          
          return (
            <div key={i} className={`w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-full border-[3px] font-black text-lg md:text-xl shrink-0 ${bgClass}`}>
              {icon}
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 md:gap-3 mt-1">
        <button onClick={() => onAdd('O')} className="px-4 py-2 bg-white hover:bg-slate-50 text-pink-600 font-black border-2 border-pink-200 rounded-lg transition-colors tracking-widest text-xs md:text-sm uppercase shadow-sm">O 成功</button>
        <button onClick={() => onAdd('X')} className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-500 font-black border-2 border-slate-200 rounded-lg transition-colors tracking-widest text-xs md:text-sm uppercase shadow-sm">X 失敗</button>
      </div>
    </div>
  );
}

// ==========================================
// Reusable Confirm Button (ステルス化)
// ==========================================
function ConfirmButton({ label, onConfirm, positionClass }) {
  const [status, setStatus] = useState("IDLE"); 
  useEffect(() => { let timer; if (status === "CONFIRMING") { timer = setTimeout(() => setStatus("IDLE"), 3000); } return () => clearTimeout(timer); }, [status]);
  const handleClick = () => { if (status === "IDLE") { setStatus("CONFIRMING"); } else { onConfirm(); setStatus("IDLE"); } };
  
  return (
    <button onClick={handleClick} className={`z-50 group ${positionClass}`}>
      <span className={`block px-3 py-2 md:px-5 md:py-3 text-xs md:text-sm font-black tracking-widest rounded border transition-colors duration-200 uppercase shadow-md backdrop-blur-sm ${status === "CONFIRMING" ? 'bg-red-600/90 border-red-500 text-white' : 'bg-slate-800/40 hover:bg-slate-800/70 border-white/20 text-white/80 hover:text-white'}`}>
        {status === "CONFIRMING" ? `${label}？` : label}
      </span>
    </button>
  );
}

// ==========================================
// ④ 管理者ダッシュボード
// ==========================================
function AdminDashboard({ user, onBack }) {
  const [visibleCourts, setVisibleCourts] = useState([]);
  const [deletedCourts, setDeletedCourts] = useState([]);
  const [allDetectedIds, setAllDetectedIds] = useState([]); 
  const [selectedAddId, setSelectedAddId] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const safeEmail = user?.email || "";
  const isSuperAdmin = safeEmail === "abctv1@abctv.com";
  const groupPrefix = "cerezo"; 

  useEffect(() => {
    try {
      const savedVisible = localStorage.getItem("soccerDashboardVisible");
      const savedDeleted = localStorage.getItem("soccerDashboardDeleted");
      if (savedVisible) setVisibleCourts(JSON.parse(savedVisible));
      if (savedDeleted) setDeletedCourts(JSON.parse(savedDeleted));
    } catch(e) {
      console.error("Local storage error:", e);
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    try {
      localStorage.setItem("soccerDashboardVisible", JSON.stringify(visibleCourts));
      localStorage.setItem("soccerDashboardDeleted", JSON.stringify(deletedCourts));
    } catch(e) {
      console.error("Local storage set error:", e);
    }
  }, [visibleCourts, deletedCourts, isLoaded]);

  useEffect(() => {
    if (!isLoaded || !user) return;
    
    let isMounted = true;
    const courtsRef = collection(db, `artifacts/${globalAppId}/public/data/courts`);
    const unsub = onSnapshot(courtsRef, (snapshot) => {
      if (!isMounted) return;
      const incomingIds = [];
      const past24HoursMs = Date.now() - 24 * 60 * 60 * 1000;

      snapshot.forEach(doc => {
        const id = doc.id;
        const d = doc.data();
        const updatedAtMs = d.updatedAt ? new Date(d.updatedAt).getTime() : 0;
        
        if (updatedAtMs >= past24HoursMs) {
          if (isSuperAdmin || id.startsWith(groupPrefix)) {
            incomingIds.push(id);
          }
        }
      });
      
      setAllDetectedIds(incomingIds.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));

      setVisibleCourts(prev => {
        let newCourts = [...prev];
        let changed = false;
        incomingIds.forEach(id => {
          if (!newCourts.includes(id) && !deletedCourts.includes(id)) {
            newCourts.push(id);
            changed = true;
          }
        });
        if (changed) {
          newCourts.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
          return newCourts;
        }
        return prev;
      });
    }, (error) => console.error("Dashboard snapshot error:", error));
    return () => {
      isMounted = false;
      unsub();
    };
  }, [isLoaded, deletedCourts, isSuperAdmin, groupPrefix, user]);

  const handleAdd = () => {
    if (!selectedAddId) return;
    if (!visibleCourts.includes(selectedAddId)) {
      const newCourts = [...visibleCourts, selectedAddId].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      setVisibleCourts(newCourts);
    }
    setDeletedCourts(prev => prev.filter(c => c !== selectedAddId));
    setSelectedAddId("");
  };

  const handleRemove = (id) => {
    setVisibleCourts(prev => prev.filter(c => c !== id));
    if (!deletedCourts.includes(id)) {
      setDeletedCourts(prev => [...prev, id]);
    }
  };

  const availableOptions = allDetectedIds.filter(id => !visibleCourts.includes(id));
  const itemsPerPage = 9;
  const totalPages = Math.ceil(visibleCourts.length / itemsPerPage) || 1;
  const paginatedData = visibleCourts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="min-h-screen bg-black flex flex-col font-sans select-none overflow-hidden">
      <div className="w-full h-[60px] bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm z-10 shrink-0">
        <div className="flex items-center gap-6">
          <button onClick={onBack} className="text-pink-600 hover:text-pink-700 font-black text-sm flex items-center gap-2 transition-colors uppercase">
            <span>◀</span> BACK
          </button>
          <div className="h-6 w-px bg-slate-300"></div>
          <h1 className="text-[#0f172a] font-black tracking-widest text-lg flex items-center gap-3 uppercase">
            MULTI MONITOR
            <span className="bg-pink-50 text-pink-600 border border-pink-200 text-[10px] px-2 py-0.5 rounded animate-pulse">LIVE: {visibleCourts.length}</span>
          </h1>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <select 
              value={selectedAddId}
              onChange={e => setSelectedAddId(e.target.value)}
              className="bg-slate-50 text-[#0f172a] text-xs font-bold px-3 py-1.5 rounded border border-slate-300 focus:border-pink-500 focus:outline-none w-48 cursor-pointer"
            >
              <option value="">コートIDを選択...</option>
              {availableOptions.map(id => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
            <button onClick={handleAdd} disabled={!selectedAddId} className="bg-pink-600 hover:bg-pink-700 text-white disabled:opacity-30 text-xs font-black px-4 py-1.5 rounded transition shadow-sm uppercase">ADD</button>
          </div>
          <div className="h-6 w-px bg-slate-300"></div>
          <div className="flex items-center gap-4">
            <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="w-8 h-8 flex items-center justify-center bg-white text-slate-500 rounded hover:bg-slate-50 border border-slate-300 disabled:opacity-30 transition">◀</button>
            <span className="text-[#0f172a] font-bold text-sm tracking-widest w-24 text-center">PAGE {currentPage} / {totalPages}</span>
            <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="w-8 h-8 flex items-center justify-center bg-white text-slate-500 rounded hover:bg-slate-50 border border-slate-300 disabled:opacity-30 transition">▶</button>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-y-auto">
        {visibleCourts.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-600 font-black tracking-widest text-xl uppercase relative z-10">NO ACTIVE COURTS</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 w-full max-w-[1600px] mx-auto relative z-10">
            {paginatedData.map(id => (
              <div key={id} className="flex justify-center">
                 <MiniBoard courtId={id} onRemove={handleRemove} user={user} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MiniBoard({ courtId, onRemove, user }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if(!user) return;
    let isMounted = true;
    const unsub = onSnapshot(doc(db, `artifacts/${globalAppId}/public/data/courts`, courtId), (snapshot) => {
      if (snapshot.exists() && isMounted) setData(snapshot.data());
    }, (err) => console.error("MiniBoard error:", err));
    return () => {
      isMounted = false;
      unsub();
    };
  }, [courtId, user]);

  const currentDuration = (data?.period === '1stEX' || data?.period === '2ndEX') ? data?.extraTimeDuration : data?.halfTimeDuration;
  const { formattedTime, isOverTime } = useTimer(data?.timer, currentDuration);

  if (!data) return <div className="w-[448px] h-[240px] bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-400 font-bold tracking-widest relative">LOADING...</div>;

  return (
    <div className="relative w-[448px] h-[240px] rounded-lg overflow-hidden border border-white/60 shadow-xl group flex flex-col justify-between backdrop-blur-sm">
      
      {/* 背景グループ */}
      <div className="absolute inset-0 z-0 pointer-events-none">
         <div className="absolute inset-0 flex flex-col">
            <div className="flex-[3] bg-white/60"></div>
            <div className="flex-[1] bg-pink-400/40"></div>
         </div>
         <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "repeating-linear-gradient(-45deg, transparent, transparent 10px, rgba(255,255,255,0.4) 10px, rgba(255,255,255,0.4) 20px)" }}></div>
      </div>

      <button 
        onClick={() => onRemove(courtId)} 
        className="absolute top-3 right-3 w-8 h-8 bg-white/90 hover:bg-red-600 text-slate-400 hover:text-white rounded flex items-center justify-center font-black z-[200] opacity-0 group-hover:opacity-100 transition-colors border border-slate-200 hover:border-red-500 shadow-md"
      >✕</button>

      {/* コンテンツ層 (干渉防止) */}
      <div className="relative z-10 w-full h-full flex flex-col" style={{ isolation: 'isolate' }}>
         
         {/* 大会名 & チーム名 */}
         <div className="flex-1 w-full flex flex-col justify-between pt-2 pb-2">
            <div className="w-full text-center text-[#0f172a] font-black text-sm truncate opacity-70 uppercase tracking-widest">
               {String(data.tournamentName || "MATCH")}
            </div>
            <div className="w-full flex items-end justify-center gap-4 px-4 pb-2">
               <div className="flex-1 flex items-end justify-end gap-1.5">
                  <div className="w-2 h-5 rounded-sm mb-0.5 shadow-sm" style={{ backgroundColor: data.teamColors?.home || "#0ea5e9" }}></div>
                  <div className="text-center font-black text-3xl text-[#0f172a] uppercase truncate leading-none" style={{ textShadow: "1px 1px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff" }}>{String(data.teamNames?.home || "")}</div>
                  <div className="w-2 h-5 rounded-sm mb-0.5 shadow-sm" style={{ backgroundColor: data.teamColors?.home || "#0ea5e9" }}></div>
               </div>
               <div className="w-2"></div>
               <div className="flex-1 flex items-end justify-start gap-1.5">
                  <div className="w-2 h-5 rounded-sm mb-0.5 shadow-sm" style={{ backgroundColor: data.teamColors?.away || "#ec4899" }}></div>
                  <div className="text-center font-black text-3xl text-[#0f172a] uppercase truncate leading-none" style={{ textShadow: "1px 1px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff" }}>{String(data.teamNames?.away || "")}</div>
                  <div className="w-2 h-5 rounded-sm mb-0.5 shadow-sm" style={{ backgroundColor: data.teamColors?.away || "#ec4899" }}></div>
               </div>
            </div>
         </div>

         {/* 水色帯の得点 */}
         <div className="h-[40%] w-full bg-gradient-to-r from-cyan-400/90 to-cyan-500/90 flex items-center justify-center gap-4 px-4 shadow-inner relative backdrop-blur-sm z-20">
            <div className="flex-1 flex justify-center">
               <div className="text-[5rem] font-mono font-black text-white drop-shadow-md tabular-nums leading-none">{Number(data.score?.home || 0)}</div>
            </div>
            
            {/* PK戦の時はハイフンを消して「PK戦」と表示 (MiniBoard側) */}
            {data.period === 'PK' ? (
               <div className="text-3xl font-black tracking-widest text-white drop-shadow-md z-10 whitespace-nowrap">PK戦</div>
            ) : (
               <div className="text-4xl font-black text-white/50">-</div>
            )}

            <div className="flex-1 flex justify-center">
               <div className="text-[5rem] font-mono font-black text-white drop-shadow-md tabular-nums leading-none">{Number(data.score?.away || 0)}</div>
            </div>

            {/* PK Status Overlay for MiniBoard (縮小版) */}
            {(data.period === 'PK' || (data.period === 'End' && (data.pkState?.home?.length > 0 || data.pkState?.away?.length > 0))) && (
               <div className="absolute -bottom-5 translate-y-1/2 w-full flex justify-between px-8 z-30 pointer-events-auto">
                 <div className="flex gap-1 bg-white/90 px-2 py-1.5 rounded-xl shadow-md border border-slate-200 backdrop-blur-sm">
                    {Array.from({ length: Math.max(5, (data.pkState?.home?.length || 0)) }).map((_, i) => {
                       const res = data.pkState?.home?.[i];
                       let bgClass = "bg-white border-slate-300 text-slate-300";
                       let icon = "-";
                       if (res === 'O') { bgClass = "bg-pink-500 border-pink-500 text-white shadow-sm"; icon = "O"; }
                       if (res === 'X') { bgClass = "bg-slate-400 border-slate-400 text-white shadow-inner"; icon = "X"; }
                       return <div key={i} className={`w-6 h-6 rounded-full border-[2px] flex justify-center items-center font-black text-[10px] ${bgClass}`}>{icon}</div>
                    })}
                 </div>
                 <div className="flex gap-1 bg-white/90 px-2 py-1.5 rounded-xl shadow-md border border-slate-200 backdrop-blur-sm">
                    {Array.from({ length: Math.max(5, (data.pkState?.away?.length || 0)) }).map((_, i) => {
                       const res = data.pkState?.away?.[i];
                       let bgClass = "bg-white border-slate-300 text-slate-300";
                       let icon = "-";
                       if (res === 'O') { bgClass = "bg-pink-500 border-pink-500 text-white shadow-sm"; icon = "O"; }
                       if (res === 'X') { bgClass = "bg-slate-400 border-slate-400 text-white shadow-inner"; icon = "X"; }
                       return <div key={i} className={`w-6 h-6 rounded-full border-[2px] flex justify-center items-center font-black text-[10px] ${bgClass}`}>{icon}</div>
                    })}
                 </div>
               </div>
            )}
         </div>

         {/* 桃色ベースのタイム */}
         <div className="flex-1 w-full flex justify-center items-center relative">
            <div className={`flex items-baseline gap-3 ${isOverTime && data.period !== 'End' && data.period !== 'PK' ? 'text-pink-600' : 'text-[#0f172a]'}`}>
               {/* 試合終了時はドカンと横書きで表示 (MiniBoard側) */}
               {data.period === 'PK' ? null : data.period === 'End' ? (
                  <span className="text-3xl font-black tracking-widest z-10">試合終了</span>
               ) : (
                  <>
                     <span className="text-xs font-black tracking-widest uppercase">
                        {data.period === '1st' ? '前半' : 
                         data.period === '2nd' ? '後半' : 
                         data.period === '1stEX' ? '延長前半' : 
                         data.period === '2ndEX' ? '延長後半' : ''}
                     </span>
                     <span className="text-4xl font-mono font-black tabular-nums">{String(formattedTime)}</span>
                  </>
               )}
            </div>
            {data.additionalTime > 0 && data.period !== 'PK' && data.period !== 'End' && <span className="absolute right-4 bg-pink-600 border border-white text-white px-2 py-0.5 rounded shadow-sm font-black text-sm">+{Number(data.additionalTime)}</span>}
         
            {/* 試合終了時の前後半別スコア表示 (MiniBoard用) */}
            {data.period === 'End' && (
              <div className="absolute top-0 -translate-y-1/2 bg-white border-2 border-cyan-400 px-4 py-1.5 rounded-full flex gap-4 text-[#0f172a] font-bold tracking-widest shadow-md z-30 uppercase text-[10px]">
                 <div>前半: {Number(data.firstHalfScore?.home || 0)} - {Number(data.firstHalfScore?.away || 0)}</div>
                 {(() => {
                    const homeArr = Array.isArray(data.pkState?.home) ? data.pkState.home : [];
                    const awayArr = Array.isArray(data.pkState?.away) ? data.pkState.away : [];
                    const homePkScore = homeArr.filter(r => r === 'O').length || 0;
                    const awayPkScore = awayArr.filter(r => r === 'O').length || 0;
                    const homeSecondHalf = Number(data.score?.home || 0) - Number(data.firstHalfScore?.home || 0);
                    const awaySecondHalf = Number(data.score?.away || 0) - Number(data.firstHalfScore?.away || 0);
                    
                    return (
                      <>
                        <div>後半: {homeSecondHalf} - {awaySecondHalf}</div>
                        {(homeArr.length > 0 || awayArr.length > 0) && (
                          <div className="text-pink-600">PK: {homePkScore} - {awayPkScore}</div>
                        )}
                      </>
                    );
                 })()}
              </div>
            )}
         </div>
      </div>
      
      {/* 修正：コートIDを左上に目立つバッジとして表示 */}
      <div className="absolute top-0 left-0 bg-pink-600 text-white text-[10px] md:text-xs font-black px-3 py-1 rounded-br-lg shadow-md uppercase z-30 tracking-widest border-r border-b border-pink-700">
         ID: {String(courtId)}
      </div>
    </div>
  );
}

// ==========================================
// ⑤ OBS配信用 観覧専用ビュー
// ==========================================
function ObsScoreboard({ courtId }) {
  const [data, setData] = useState(null);
  
  useEffect(() => {
    if (!courtId) return;
    let isMounted = true;
    const initAuth = async () => {
      try {
         await signInAnonymously(auth);
         const unsub = onSnapshot(doc(db, `artifacts/${globalAppId}/public/data/courts`, courtId), (docSnap) => {
          if (docSnap.exists() && isMounted) setData(docSnap.data());
         }, (err) => console.error("OBS Error:", err));
         return () => {
           isMounted = false;
           unsub();
         };
      } catch(e){
         console.error("OBS Auth Error:", e);
      }
    };
    initAuth();
    return () => { isMounted = false; };
  }, [courtId]);
  
  const currentDuration = (data?.period === '1stEX' || data?.period === '2ndEX') ? data?.extraTimeDuration : data?.halfTimeDuration;
  const { formattedTime, isOverTime } = useTimer(data?.timer, currentDuration);

  // ▼ 追加：枠数計算
  const homeKicks = Array.isArray(data?.pkState?.home) ? data.pkState.home.length : 0;
  const awayKicks = Array.isArray(data?.pkState?.away) ? data.pkState.away.length : 0;
  const maxKicks = Math.max(homeKicks, awayKicks);
  const pkSlotsCount = Math.max(5, homeKicks === awayKicks ? maxKicks + 1 : maxKicks);

  if (!data) return null;
  
  return (
    <>
      <style>{"body { background-color: transparent !important; margin: 0; padding: 0; overflow: hidden; }"}</style>
      <div style={{ width: '800px', height: '450px' }} className="relative bg-transparent font-sans select-none text-white pointer-events-none transform origin-top-left flex flex-col items-center">
        
        {/* 大会名（枠外） - ブラックアウトライン化 */}
        <div 
          className="text-white text-6xl font-black tracking-[0.2em] mb-6 mt-2 uppercase drop-shadow-xl"
          style={{ textShadow: "2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 0px 2px 0 #000, 0px -2px 0 #000, 2px 0px 0 #000, -2px 0px 0 #000, 0px 6px 12px rgba(0,0,0,0.5)" }}
        >
             {String(data.tournamentName || "")}
        </div>

        {/* Obs Container (Pop & Clean Style - Glassmorphism) */}
        <div className="w-full flex-1 rounded-xl border-[3px] border-white/60 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden relative mb-4 backdrop-blur-sm">
          
          {/* 背景グループ (透過度アップ・すりガラス感強調) */}
          <div className="absolute inset-0 z-0 pointer-events-none">
             <div className="absolute inset-0 flex flex-col">
                <div className="flex-[3] bg-white/85"></div>
                <div className="flex-[1] bg-pink-50/85"></div>
             </div>
             {/* ストライプも透過度を合わせて調整 */}
             <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "repeating-linear-gradient(-45deg, transparent, transparent 15px, rgba(255,255,255,0.4) 15px, rgba(255,255,255,0.4) 30px)" }}></div>
          </div>

          <div className="relative z-10 w-full h-full flex flex-col" style={{ isolation: 'isolate' }}>
            
            {/* 上段：チーム名 */}
            <div className="flex-1 flex flex-col justify-end pb-8">
              <div className="w-full flex items-end justify-center gap-10 px-12">
                <div className="flex-1 flex items-end justify-end gap-3">
                   <div className="w-8 h-[50px] rounded-sm mb-1 shadow-sm" style={{ backgroundColor: data.teamColors?.home || "#0ea5e9" }}></div>
                   <div className="text-center font-black text-7xl text-[#0f172a] uppercase leading-none" style={{ textShadow: "3px 3px 0 #fff, -3px -3px 0 #fff, 3px -3px 0 #fff, -3px 3px 0 #fff, 0 4px 8px rgba(0,0,0,0.15)" }}>{String(data.teamNames?.home || "")}</div>
                   <div className="w-8 h-[50px] rounded-sm mb-1 shadow-sm" style={{ backgroundColor: data.teamColors?.home || "#0ea5e9" }}></div>
                </div>
                <div className="text-5xl w-8 opacity-0">-</div>
                <div className="flex-1 flex items-end justify-start gap-3">
                   <div className="w-8 h-[50px] rounded-sm mb-1 shadow-sm" style={{ backgroundColor: data.teamColors?.away || "#ec4899" }}></div>
                   <div className="text-center font-black text-7xl text-[#0f172a] uppercase leading-none" style={{ textShadow: "3px 3px 0 #fff, -3px -3px 0 #fff, 3px -3px 0 #fff, -3px 3px 0 #fff, 0 4px 8px rgba(0,0,0,0.15)" }}>{String(data.teamNames?.away || "")}</div>
                   <div className="w-8 h-[50px] rounded-sm mb-1 shadow-sm" style={{ backgroundColor: data.teamColors?.away || "#ec4899" }}></div>
                </div>
              </div>
            </div>

            {/* 中段：水色帯の得点 */}
            <div className="h-[40%] w-full bg-gradient-to-r from-cyan-400/90 to-cyan-500/90 shadow-md flex items-center justify-center gap-12 px-12 relative backdrop-blur-sm z-20">
              <div className="flex-1 flex justify-center">
                <div className="text-[10rem] leading-none font-mono font-black text-white drop-shadow-md tabular-nums">{Number(data.score?.home || 0)}</div>
              </div>
              
              {/* PK戦の時はハイフンを消して「PK戦」と中央に表示 (OBS側) */}
              {data.period === 'PK' ? (
                <div className="text-6xl font-black tracking-widest text-white drop-shadow-md z-10 whitespace-nowrap">PK戦</div>
              ) : (
                <div className="text-7xl font-black text-white/50">-</div>
              )}

              <div className="flex-1 flex justify-center">
                <div className="text-[10rem] leading-none font-mono font-black text-white drop-shadow-md tabular-nums">{Number(data.score?.away || 0)}</div>
              </div>

              {/* ▼ 修正：PK Status Overlay for OBS (折り返し対応) */}
              {(data.period === 'PK' || (data.period === 'End' && (homeKicks > 0 || awayKicks > 0))) && (
                 <div className="absolute -bottom-10 translate-y-1/2 w-full flex justify-between px-16 z-30 pointer-events-auto">
                   <div className="flex gap-2 bg-white/90 px-4 py-3 rounded-2xl shadow-lg border border-slate-200 backdrop-blur-sm max-w-[48%] flex-wrap justify-center">
                      {Array.from({ length: pkSlotsCount }).map((_, i) => {
                         const res = data.pkState?.home?.[i];
                         let bgClass = "bg-white border-slate-300 text-slate-300";
                         let icon = "-";
                         if (res === 'O') { bgClass = "bg-pink-500 border-pink-500 text-white shadow-md"; icon = "O"; }
                         if (res === 'X') { bgClass = "bg-slate-400 border-slate-400 text-white shadow-inner"; icon = "X"; }
                         return <div key={i} className={`w-10 h-10 md:w-12 md:h-12 rounded-full border-[3px] flex justify-center items-center font-black text-xl shrink-0 ${bgClass}`}>{icon}</div>
                      })}
                   </div>
                   <div className="flex gap-2 bg-white/90 px-4 py-3 rounded-2xl shadow-lg border border-slate-200 backdrop-blur-sm max-w-[48%] flex-wrap justify-center">
                      {Array.from({ length: pkSlotsCount }).map((_, i) => {
                         const res = data.pkState?.away?.[i];
                         let bgClass = "bg-white border-slate-300 text-slate-300";
                         let icon = "-";
                         if (res === 'O') { bgClass = "bg-pink-500 border-pink-500 text-white shadow-md"; icon = "O"; }
                         if (res === 'X') { bgClass = "bg-slate-400 border-slate-400 text-white shadow-inner"; icon = "X"; }
                         return <div key={i} className={`w-10 h-10 md:w-12 md:h-12 rounded-full border-[3px] flex justify-center items-center font-black text-xl shrink-0 ${bgClass}`}>{icon}</div>
                      })}
                   </div>
                 </div>
              )}
            </div>

            {/* 下段：桃色背景のタイム (縦書き＆センター配置) */}
            <div className="flex-1 flex items-center justify-center relative w-full h-full">
               
               <div className={`absolute inset-0 flex items-center justify-center transition-colors duration-200 ${isOverTime && data.period !== 'End' && data.period !== 'PK' ? 'text-pink-600 drop-shadow-[0_2px_10px_rgba(219,39,119,0.3)]' : 'text-[#0f172a] drop-shadow-sm'}`}>
                  {/* PK戦の時は下段を空にする、試合終了時は横書きで大きく表示 (OBS側) */}
                  {data.period === 'PK' ? null : data.period === 'End' ? (
                     <span className="text-6xl font-black tracking-widest z-10">試合終了</span>
                  ) : (
                     <div className="relative flex items-center justify-center">
                        {/* 縦に文字を積み上げる（100%確実な縦書き / OBS側） */}
                        <div className="absolute right-[100%] mr-5 bg-slate-800/10 px-2.5 py-4 rounded-lg flex items-center justify-center shadow-inner">
                           <div className="flex flex-col items-center justify-center gap-1 text-2xl font-black opacity-80 leading-none">
                              {(data.period === '1st' ? '前半' : 
                               data.period === '2nd' ? '後半' : 
                               data.period === '1stEX' ? '延長前半' : 
                               data.period === '2ndEX' ? '延長後半' : '終了').split('').map((char, index) => (
                                 <span key={index}>{char}</span>
                              ))}
                           </div>
                        </div>
                        
                        {/* センター配置のタイム */}
                        <span className="text-[5.5rem] font-mono font-black tabular-nums tracking-tighter leading-none z-10">{String(formattedTime)}</span>

                        {/* ロスタイム表示 (タイムの右隣に固定) */}
                        {data.additionalTime > 0 && (
                          <div className="absolute left-[100%] ml-5 bg-pink-600 border border-white text-white font-black text-4xl px-4 py-1 rounded shadow-md z-20">
                            +{Number(data.additionalTime)}
                          </div>
                        )}
                     </div>
                  )}
               </div>

               {/* 試合終了時の前後半別スコア表示 (OBS用) */}
               {data.period === 'End' && (
                 <div className="absolute top-0 -translate-y-1/2 bg-white border-2 border-cyan-400 px-10 py-3 rounded-full flex gap-12 text-[#0f172a] font-bold tracking-widest shadow-md z-30 uppercase text-xl">
                    <div>前半: {Number(data.firstHalfScore?.home || 0)} - {Number(data.firstHalfScore?.away || 0)}</div>
                    {(() => {
                       const homeArr = Array.isArray(data.pkState?.home) ? data.pkState.home : [];
                       const awayArr = Array.isArray(data.pkState?.away) ? data.pkState.away : [];
                       const homePkScore = homeArr.filter(r => r === 'O').length || 0;
                       const awayPkScore = awayArr.filter(r => r === 'O').length || 0;
                       const homeSecondHalf = Number(data.score?.home || 0) - Number(data.firstHalfScore?.home || 0);
                       const awaySecondHalf = Number(data.score?.away || 0) - Number(data.firstHalfScore?.away || 0);
                       
                       return (
                         <>
                           <div>後半: {homeSecondHalf} - {awaySecondHalf}</div>
                           {(homeArr.length > 0 || awayArr.length > 0) && (
                             <div className="text-pink-600">PK: {homePkScore} - {awayPkScore}</div>
                           )}
                         </>
                       );
                    })()}
                 </div>
               )}
            </div>

          </div>

        </div>
      </div>
    </>
  );
}