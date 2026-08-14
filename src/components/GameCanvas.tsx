// src/components/GameCanvas.tsx
'use client';

import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Vector2D, Bomb, Explosion, GameMessage } from '@/types/game';
import { useWebRTCContext } from '@/context/WebRTCContext';

export interface GameCanvasHandle {
  handleMoveInput: (vector: Vector2D) => void;
  placeBomb: () => void;
}

const GameCanvas = forwardRef<GameCanvasHandle>((_, ref) => {
  const { role, sendMessage, onMessage } = useWebRTCContext();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const currentRole = role || 'host';

  const [p1Pos, setP1Pos] = useState<Vector2D>({ x: 100, y: 200 });
  const [p2Pos, setP2Pos] = useState<Vector2D>({ x: 300, y: 200 });

  const [p1Hp, setP1Hp] = useState<number>(3);
  const [p2Hp, setP2Hp] = useState<number>(3);

  // 勝敗状態 ('PLAYING' | 'WIN' | 'LOSE')
  const [gameState, setGameState] = useState<'PLAYING' | 'WIN' | 'LOSE'>('PLAYING');

  const bombsRef = useRef<Bomb[]>([]);
  const explosionsRef = useRef<Explosion[]>([]);

  // リセット（再戦）関数
  const resetGame = useCallback(() => {
    setP1Pos({ x: 100, y: 200 });
    setP2Pos({ x: 300, y: 200 });
    setP1Hp(3);
    setP2Hp(3);
    bombsRef.current = [];
    explosionsRef.current = [];
    setGameState('PLAYING');
  }, []);

  // 通信メッセージの受信処理
  useEffect(() => {
    onMessage((data: GameMessage) => {
      if (data.type === 'MOVE') {
        if (data.role === 'host') setP1Pos(data.pos);
        if (data.role === 'guest') setP2Pos(data.pos);
      }

      if (data.type === 'PLACE_BOMB') {
        bombsRef.current.push(data.bomb);
      }

      if (data.type === 'DAMAGE') {
        if (data.targetRole === 'host') setP1Hp((prev) => Math.max(0, prev - 1));
        if (data.targetRole === 'guest') setP2Hp((prev) => Math.max(0, prev - 1));
      }

      if (data.type === 'RETRY') {
        resetGame();
      }
    });
  }, [onMessage, resetGame]);

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
    if (gameState !== 'PLAYING') return;
    const speed = 4;

    if (currentRole === 'host') {
      setP1Pos((prev) => {
        const next = {
          x: Math.max(20, Math.min(380, prev.x + vector.x * speed)),
          y: Math.max(20, Math.min(380, prev.y + vector.y * speed)),
        };
        sendMessage({ type: 'MOVE', role: 'host', pos: next });
        return next;
      });
    } else {
      setP2Pos((prev) => {
        const next = {
          x: Math.max(20, Math.min(380, prev.x + vector.x * speed)),
          y: Math.max(20, Math.min(380, prev.y + vector.y * speed)),
        };
        sendMessage({ type: 'MOVE', role: 'guest', pos: next });
        return next;
      });
    }
  }, [currentRole, sendMessage, gameState]);

  // 爆弾設置
  const placeBomb = useCallback(() => {
    if (gameState !== 'PLAYING') return;
    const myPos = currentRole === 'host' ? p1Pos : p2Pos;

    const newBomb: Bomb = {
      id: `${currentRole}-${Date.now()}`,
      x: myPos.x,
      y: myPos.y,
      owner: currentRole,
      createdAt: Date.now(),
      armTime: 2500,
      radius: 50,
    };

    bombsRef.current.push(newBomb);
    sendMessage({ type: 'PLACE_BOMB', bomb: newBomb });
  }, [currentRole, p1Pos, p2Pos, sendMessage, gameState]);

  // リトライ要求
  const handleRetry = () => {
    resetGame();
    sendMessage({ type: 'RETRY' });
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

      // 背景
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

          if (currentRole === 'host' && gameState === 'PLAYING') {
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

        const isRed = Math.floor(elapsed / 150) % 2 === 0;
        ctx.fillStyle = isRed ? '#EF4444' : '#F59E0B';
        ctx.beginPath();
        ctx.arc(bomb.x, bomb.y, 10, 0, Math.PI * 2);
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

      // プレイヤー 2P (Red)
      ctx.fillStyle = '#EF4444';
      ctx.beginPath();
      ctx.arc(p2Pos.x, p2Pos.y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FCA5A5';
      ctx.lineWidth = 3;
      ctx.stroke();

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [p1Pos, p2Pos, currentRole, sendMessage, gameState]);

  return (
    <div className="flex flex-col items-center gap-3 relative">
      {/* HP表示 */}
      <div className="flex justify-between w-80 text-sm font-bold bg-gray-900 px-4 py-2 rounded-lg border border-gray-800">
        <span className="text-blue-400">1P (Host): {'❤️'.repeat(p1Hp) || '💀'}</span>
        <span className="text-red-400">2P (Guest): {'❤️'.repeat(p2Hp) || '💀'}</span>
      </div>

      <div className="relative">
        <canvas
          ref={canvasRef}
          width={400}
          height={400}
          className="bg-gray-900 border-2 border-gray-700 rounded-xl shadow-2xl"
        />

        {/* 勝敗判定オーバーレイ */}
        {gameState !== 'PLAYING' && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center p-6 space-y-4 animate-fade-in">
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