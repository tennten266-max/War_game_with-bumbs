// src/components/GameCanvas.tsx
'use client';

import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useRouter } from 'next/navigation';
import { Vector2D, Bomb, Explosion, GameMessage } from '@/types/game';
import { useWebRTCContext } from '@/context/WebRTCContext';

export interface GameCanvasHandle {
  handleMoveInput: (vector: Vector2D) => void;
  placeBomb: () => void;
}

const GameCanvas = forwardRef<GameCanvasHandle>((_, ref) => {
  const router = useRouter();
  const { role, bombMode, playerName, opponentName, isConnected, sendMessage, onMessage } = useWebRTCContext();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const currentRole = role || 'host';

  const [p1Pos, setP1Pos] = useState<Vector2D>({ x: 100, y: 200 });
  const [p2Pos, setP2Pos] = useState<Vector2D>({ x: 300, y: 200 });

  const [p1Hp, setP1Hp] = useState<number>(3);
  const [p2Hp, setP2Hp] = useState<number>(3);

  // 勝敗状態 ('PLAYING' | 'WIN' | 'LOSE')
  const [gameState, setGameState] = useState<'PLAYING' | 'WIN' | 'LOSE'>('PLAYING');

  // タイムアウト・切断検知状態
  const [timeoutReason, setTimeoutReason] = useState<'INACTIVE' | 'DISCONNECTED' | null>(null);
  const [countdown, setCountdown] = useState<number>(3);

  const p1PosRef = useRef<Vector2D>({ x: 100, y: 200 });
  const p2PosRef = useRef<Vector2D>({ x: 300, y: 200 });

  const bombsRef = useRef<Bomb[]>([]);
  const explosionsRef = useRef<Explosion[]>([]);
  const lastOpponentActionTimeRef = useRef<number>(Date.now());

  // 表示名計算
  const p1DisplayName = currentRole === 'host' ? (playerName || '1P (Host)') : (opponentName || '1P (Host)');
  const p2DisplayName = currentRole === 'guest' ? (playerName || '2P (Guest)') : (opponentName || '2P (Guest)');

  // リセット（再戦）関数
  const resetGame = useCallback(() => {
    const initialP1 = { x: 100, y: 200 };
    const initialP2 = { x: 300, y: 200 };
    setP1Pos(initialP1);
    setP2Pos(initialP2);
    p1PosRef.current = initialP1;
    p2PosRef.current = initialP2;
    setP1Hp(3);
    setP2Hp(3);
    bombsRef.current = [];
    explosionsRef.current = [];
    lastOpponentActionTimeRef.current = Date.now();
    setTimeoutReason(null);
    setGameState('PLAYING');
  }, []);

  // 通信メッセージの受信処理
  useEffect(() => {
    const unsubscribe = onMessage((data: GameMessage) => {
      // 相手からの通信を受信したら最終アクティビティ時刻を更新
      lastOpponentActionTimeRef.current = Date.now();

      if (data.type === 'MOVE') {
        if (data.role === 'host') {
          setP1Pos(data.pos);
          p1PosRef.current = data.pos;
        }
        if (data.role === 'guest') {
          setP2Pos(data.pos);
          p2PosRef.current = data.pos;
        }
      }

      if (data.type === 'PLACE_BOMB') {
        // 端末間の時計のズレによる即時爆発を防ぐため、受信側ローカル時刻で起算
        bombsRef.current.push({
          ...data.bomb,
          createdAt: Date.now(),
        });
      }

      if (data.type === 'DAMAGE') {
        if (data.targetRole === 'host') setP1Hp((prev) => Math.max(0, prev - 1));
        if (data.targetRole === 'guest') setP2Hp((prev) => Math.max(0, prev - 1));
      }

      if (data.type === 'RETRY') {
        resetGame();
      }
    });

    return unsubscribe;
  }, [onMessage, resetGame]);

  // 相手の切断・放置検知タイマー（10秒無通信・操作なしで判定）
  useEffect(() => {
    if (gameState !== 'PLAYING' || timeoutReason !== null) {
      return;
    }

    // 判定インターバル（500msごと）
    const checkInterval = setInterval(() => {
      const elapsed = Date.now() - lastOpponentActionTimeRef.current;
      if (!isConnected) {
        setTimeoutReason('DISCONNECTED');
      } else if (elapsed >= 10000) {
        setTimeoutReason('INACTIVE');
      }
    }, 500);

    return () => {
      clearInterval(checkInterval);
    };
  }, [gameState, isConnected, timeoutReason]);

  // タイムアウト発生時の自動リダイレクトカウントダウン（3秒後に初期画面へ遷移）
  useEffect(() => {
    if (!timeoutReason) return;

    setCountdown(3);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          router.push('/');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [timeoutReason, router]);

  // HP判定による勝敗決定
  useEffect(() => {
    if (p1Hp === 0 || p2Hp === 0) {
      if (currentRole === 'host') {
        setGameState(p1Hp > 0 ? 'WIN' : 'LOSE');
      } else {
        setGameState(p2Hp > 0 ? 'WIN' : 'LOSE');
      }
    }
  }, [p1Hp, p2Hp, currentRole]);

  // 移動処理
  const handleMoveInput = useCallback((vector: Vector2D) => {
    if (gameState !== 'PLAYING' || timeoutReason !== null) return;
    const speed = 4;

    if (currentRole === 'host') {
      setP1Pos((prev) => {
        const next = {
          x: Math.max(20, Math.min(380, prev.x + vector.x * speed)),
          y: Math.max(20, Math.min(380, prev.y + vector.y * speed)),
        };
        p1PosRef.current = next;
        sendMessage({ type: 'MOVE', role: 'host', pos: next });
        return next;
      });
    } else {
      setP2Pos((prev) => {
        const next = {
          x: Math.max(20, Math.min(380, prev.x + vector.x * speed)),
          y: Math.max(20, Math.min(380, prev.y + vector.y * speed)),
        };
        p2PosRef.current = next;
        sendMessage({ type: 'MOVE', role: 'guest', pos: next });
        return next;
      });
    }
  }, [currentRole, sendMessage, gameState, timeoutReason]);

  // 爆弾設置（最新座標はrefから参照することで移動による再生成・タイマーリセットを防止）
  const placeBomb = useCallback(() => {
    if (gameState !== 'PLAYING' || timeoutReason !== null) return;
    const myPos = currentRole === 'host' ? p1PosRef.current : p2PosRef.current;

    const newBomb: Bomb = {
      id: `${currentRole}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      x: myPos.x,
      y: myPos.y,
      owner: currentRole,
      createdAt: Date.now(),
      armTime: 2500,
      radius: 50,
    };

    bombsRef.current.push(newBomb);
    sendMessage({ type: 'PLACE_BOMB', bomb: newBomb });
  }, [currentRole, sendMessage, gameState, timeoutReason]);

  // 自動設置モード（bombMode === 'auto'）: 2秒ごとに自動で自機位置に爆弾を設置
  useEffect(() => {
    if (bombMode !== 'auto' || gameState !== 'PLAYING' || timeoutReason !== null) {
      return;
    }

    const intervalId = setInterval(() => {
      placeBomb();
    }, 2000);

    return () => {
      clearInterval(intervalId);
    };
  }, [bombMode, gameState, placeBomb, timeoutReason]);

  // リトライ要求
  const handleRetry = () => {
    resetGame();
    sendMessage({ type: 'RETRY' });
  };

  const handleReturnHome = () => {
    router.push('/');
  };

  useImperativeHandle(ref, () => ({
    handleMoveInput,
    placeBomb,
  }));

  // 描画 ＆ 爆発判定ループ
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const now = Date.now();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 背景グリッド
      ctx.strokeStyle = '#1F2937';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
      }

      // 爆弾処理
      bombsRef.current = bombsRef.current.filter((bomb) => {
        const elapsed = now - bomb.createdAt;

        if (elapsed >= bomb.armTime) {
          explosionsRef.current.push({
            id: bomb.id,
            x: bomb.x,
            y: bomb.y,
            radius: bomb.radius,
            createdAt: now,
            duration: 400,
          });

          if (currentRole === 'host' && gameState === 'PLAYING' && timeoutReason === null) {
            const checkDamage = (pos: Vector2D, targetRole: 'host' | 'guest') => {
              const dist = Math.hypot(pos.x - bomb.x, pos.y - bomb.y);
              if (dist <= bomb.radius + 14) {
                if (targetRole === 'host') setP1Hp((p) => Math.max(0, p - 1));
                if (targetRole === 'guest') setP2Hp((p) => Math.max(0, p - 1));
                sendMessage({ type: 'DAMAGE', targetRole });
              }
            };
            checkDamage(p1Pos, 'host');
            checkDamage(p2Pos, 'guest');
          }

          return false;
        }

        // 爆弾点滅アニメーション
        const isRed = Math.floor(elapsed / 150) % 2 === 0;
        ctx.fillStyle = isRed ? '#EF4444' : '#F59E0B';
        ctx.beginPath();
        ctx.arc(bomb.x, bomb.y, 10, 0, Math.PI * 2);
        ctx.fill();

        // 導火線炎
        ctx.fillStyle = '#FBBF24';
        ctx.beginPath();
        ctx.arc(bomb.x, bomb.y - 12, 3, 0, Math.PI * 2);
        ctx.fill();

        return true;
      });

      // 爆発エフェクト
      explosionsRef.current = explosionsRef.current.filter((exp) => {
        const elapsed = now - exp.createdAt;
        if (elapsed >= exp.duration) return false;

        const alpha = 1 - elapsed / exp.duration;
        ctx.fillStyle = `rgba(239, 68, 68, ${alpha * 0.6})`;
        ctx.beginPath();
        ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = `rgba(251, 191, 36, ${alpha})`;
        ctx.lineWidth = 3;
        ctx.stroke();

        return true;
      });

      // プレイヤー 1P (Blue)
      ctx.fillStyle = '#3B82F6';
      ctx.beginPath();
      ctx.arc(p1Pos.x, p1Pos.y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#93C5FD';
      ctx.lineWidth = 3;
      ctx.stroke();

      // 1P 名前表示
      ctx.fillStyle = '#93C5FD';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(p1DisplayName.length > 8 ? p1DisplayName.slice(0, 8) + '…' : p1DisplayName, p1Pos.x, p1Pos.y - 20);

      // プレイヤー 2P (Red)
      ctx.fillStyle = '#EF4444';
      ctx.beginPath();
      ctx.arc(p2Pos.x, p2Pos.y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FCA5A5';
      ctx.lineWidth = 3;
      ctx.stroke();

      // 2P 名前表示
      ctx.fillStyle = '#FCA5A5';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(p2DisplayName.length > 8 ? p2DisplayName.slice(0, 8) + '…' : p2DisplayName, p2Pos.x, p2Pos.y - 20);

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [p1Pos, p2Pos, currentRole, sendMessage, gameState, p1DisplayName, p2DisplayName, timeoutReason]);

  return (
    <div className="flex flex-col items-center gap-3 relative">
      {/* HP & プレイヤー名表示 */}
      <div className="flex justify-between items-center w-full max-w-[400px] text-xs sm:text-sm font-bold bg-gray-900/90 px-4 py-2.5 rounded-xl border border-gray-800 shadow-md">
        <div className="flex flex-col">
          <span className="text-blue-400 font-extrabold truncate max-w-[120px]">{p1DisplayName}</span>
          <span className="text-xs">{p1Hp > 0 ? '❤️'.repeat(p1Hp) : '💀 DEAD'}</span>
        </div>
        <div className="text-gray-600 font-black text-xs px-2">VS</div>
        <div className="flex flex-col items-end">
          <span className="text-red-400 font-extrabold truncate max-w-[120px]">{p2DisplayName}</span>
          <span className="text-xs">{p2Hp > 0 ? '❤️'.repeat(p2Hp) : '💀 DEAD'}</span>
        </div>
      </div>

      <div className="relative">
        <canvas
          ref={canvasRef}
          width={400}
          height={400}
          className="bg-gray-900 border-2 border-gray-700 rounded-xl shadow-2xl touch-none"
        />

        {/* タイムアウト・切断検知ダイアログ */}
        {timeoutReason && (
          <div className="absolute inset-0 bg-black/85 backdrop-blur-md rounded-xl flex flex-col items-center justify-center p-6 space-y-4 text-center z-20 animate-fade-in">
            <div className="w-14 h-14 rounded-full bg-amber-500/20 border-2 border-amber-500 flex items-center justify-center text-2xl">
              ⚠️
            </div>
            <div className="space-y-1.5 max-w-xs">
              <h3 className="text-lg font-black text-amber-400">
                {timeoutReason === 'INACTIVE' ? '通信タイムアウト' : '接続切断'}
              </h3>
              <p className="text-sm text-gray-200 font-medium">
                相手の動きがみられないため、ゲームを終了します。
              </p>
              <p className="text-xs text-gray-400">
                {countdown} 秒後に初期画面へ戻ります...
              </p>
            </div>
            <button
              onClick={handleReturnHome}
              className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-600 font-bold rounded-xl shadow-lg transition active:scale-95 text-sm text-white"
            >
              今すぐ初期画面に戻る
            </button>
          </div>
        )}

        {/* 勝敗判定オーバーレイ（タイムアウト時は非表示） */}
        {!timeoutReason && gameState !== 'PLAYING' && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center p-6 space-y-4 animate-fade-in z-10">
            <h2 className={`text-4xl font-black ${gameState === 'WIN' ? 'text-yellow-400' : 'text-red-500'}`}>
              {gameState === 'WIN' ? '🏆 VICTORY!' : '💀 DEFEAT...'}
            </h2>
            <button
              onClick={handleRetry}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 font-bold rounded-xl shadow-lg transition active:scale-95"
            >
              もう一度対戦する
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

GameCanvas.displayName = 'GameCanvas';
export default GameCanvas;