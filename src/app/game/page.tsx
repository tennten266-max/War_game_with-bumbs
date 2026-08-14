// src/app/game/page.tsx
'use client';

import { useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import GameCanvas, { GameCanvasHandle } from '@/components/GameCanvas';
import VirtualPad from '@/components/VirtualPad';
import { useWebRTCContext } from '@/context/WebRTCContext';

export default function GamePage() {
  const router = useRouter();
  const { role, isConnected } = useWebRTCContext();
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

  // リダイレクト処理中の画面ちらつき防止
  if (!isConnected && !role) {
    return null;
  }

  return (
    <main className="flex flex-col items-center justify-between min-h-screen bg-gray-950 text-white p-4 select-none touch-none overflow-hidden">
      {/* ヘッダー */}
      <header className="w-full max-w-md text-center py-2 border-b border-gray-800">
        <h1 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-red-400">
          BOMB BATTLE 2D
        </h1>
        <p className="text-xs text-gray-400">
          Your Role: <span className="font-bold text-yellow-400">{role || 'host'}</span>
        </p>
      </header>

      {/* ゲーム画面 Canvas */}
      <div className="flex-1 flex items-center justify-center">
        <GameCanvas ref={canvasRef} />
      </div>

      {/* 操作エリア（爆弾ボタン ＋ バーチャルパッド） */}
      <div className="w-full max-w-md flex flex-col gap-3">
        <button
          onClick={handlePlaceBomb}
          className="w-full py-3 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-black text-lg rounded-xl shadow-lg active:scale-95 transition"
        >
          💣 BOMB (爆弾設置)
        </button>

        <div className="w-full h-44 bg-gray-900/60 border border-gray-800 rounded-2xl relative overflow-hidden">
          <VirtualPad onMove={handlePadMove} radius={55} />
        </div>
      </div>
    </main>
  );
}