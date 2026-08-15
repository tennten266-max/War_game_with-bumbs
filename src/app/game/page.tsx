// src/app/game/page.tsx
'use client';

import { useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import GameCanvas, { GameCanvasHandle } from '@/components/GameCanvas';
import VirtualPad from '@/components/VirtualPad';
import { useWebRTCContext } from '@/context/WebRTCContext';
import InfoModal from '@/components/InfoModal';

export default function GamePage() {
  const router = useRouter();
  const { role, isConnected, playerName, bombMode, bombInterval } = useWebRTCContext();
  const canvasRef = useRef<GameCanvasHandle>(null);

  // 未接続で直接 /game に来た場合はトップページへリダイレクト
  useEffect(() => {
    if (!isConnected && !role) {
      router.push('/');
    }
  }, [isConnected, role, router]);

  // バーチャルパッド操作ハンドラ
  const handlePadMove = useCallback((vector: { x: number; y: number; active: boolean }) => {
    if (!vector.active) return;
    canvasRef.current?.handleMoveInput({ x: vector.x, y: vector.y });
  }, []);

  // 爆弾設置ハンドラ
  const handlePlaceBomb = useCallback(() => {
    canvasRef.current?.placeBomb();
  }, []);

  if (!isConnected && !role) {
    return null;
  }

  const isHost = !role || role === 'host';
  const displayInterval = (bombInterval || 2.0).toFixed(1);

  return (
    <main className="flex flex-col items-center justify-between h-[100dvh] max-h-[100dvh] bg-gray-950 text-white px-3 pt-2 pb-[max(2rem,env(safe-area-inset-bottom,28px))] select-none touch-none overflow-hidden relative">
      {/* ヘッダー */}
      <header className="w-full max-w-md flex items-center justify-between py-2 px-3 bg-gray-900/70 border border-gray-800 rounded-xl shrink-0">
        <div>
          <h1 className="text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-red-400 leading-tight">
            BOMB BATTLE 2D
          </h1>
          <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
            <span>{isHost ? '👑 1P (Host)' : '⚔️ 2P (Guest)'}:</span>
            <span className="font-bold text-white truncate max-w-[100px]">{playerName}</span>
          </p>
        </div>

        <div className="text-right">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${
              bombMode === 'auto'
                ? 'bg-amber-950/80 text-amber-300 border border-amber-600/40 animate-pulse'
                : 'bg-blue-950/80 text-blue-300 border border-blue-600/40'
            }`}
          >
            {bombMode === 'auto' ? `⏱️ 自動設置 (${displayInterval}s)` : '🎮 手動設置'}
          </span>
        </div>
      </header>

      {/* ゲーム画面 Canvas */}
      <div className="flex-1 flex items-center justify-center my-1 w-full max-w-md">
        <GameCanvas ref={canvasRef} />
      </div>

      {/* 操作エリア（Safariのボトムバーから持ち上げた配置） */}
      <div className="w-full max-w-md flex flex-col gap-2 shrink-0 mb-1">
        {/* 手動設置モード時のみボタンを表示（自動設置モード時は非レンダリング） */}
        {bombMode === 'manual' ? (
          <button
            onClick={handlePlaceBomb}
            className="w-full py-2.5 sm:py-3 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-black text-base rounded-xl shadow-lg active:scale-95 transition flex items-center justify-center gap-2"
          >
            <span>💣</span>
            <span>BOMB (爆弾設置)</span>
          </button>
        ) : (
          <div className="w-full py-1.5 bg-amber-950/40 border border-amber-700/30 rounded-xl text-center">
            <p className="text-[11px] font-semibold text-amber-300 flex items-center justify-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-ping mr-1"></span>
              {displayInterval}秒ごとに自機位置へ自動で爆弾を設置中
            </p>
          </div>
        )}

        <div className="w-full h-36 sm:h-40 bg-gray-900/70 border border-gray-800 rounded-2xl relative overflow-hidden shadow-inner">
          <VirtualPad onMove={handlePadMove} radius={52} />
        </div>
      </div>

      {/* 遊び方・ライセンス情報モーダル */}
      <InfoModal />
    </main>
  );
}