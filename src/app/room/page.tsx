// src/app/room/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWebRTCContext } from '@/context/WebRTCContext';

export default function RoomPage() {
  const { peerId, isConnected, role, connectToHost, sendMessage, onMessage } = useWebRTCContext();
  const [inputHostId, setInputHostId] = useState('');
  const router = useRouter();

  // ゲスト側：ホストからの START_GAME を検知して自動で画面遷移
  useEffect(() => {
    onMessage((data) => {
      if (data.type === 'START_GAME') {
        router.push('/game');
      }
    });
  }, [onMessage, router]);

  const handleStartGame = () => {
    // 相手にゲーム開始メッセージを通知して自分も遷移
    sendMessage({ type: 'START_GAME' });
    router.push('/game');
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-6 p-4 bg-gray-900 text-white select-none">
      <h2 className="text-2xl font-bold">対戦ルーム</h2>

      {/* ホスト側：部屋コード表示 */}
      <div className="w-full max-w-xs p-4 bg-gray-800 rounded-lg border border-gray-700 text-center">
        <p className="text-sm text-gray-400 mb-1">あなたの部屋コード (1P / ホスト)</p>
        <p className="text-3xl font-mono font-extrabold tracking-widest text-yellow-400">
          {peerId || '発行中...'}
        </p>
      </div>

      <div className="text-sm text-gray-500">─ または ─</div>

      {/* ゲスト側：部屋コード入力 */}
      <div className="w-full max-w-xs flex flex-col gap-2">
        <input
          type="text"
          placeholder="相手の部屋コードを入力"
          value={inputHostId}
          onChange={(e) => setInputHostId(e.target.value.toUpperCase())}
          className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded text-center font-mono text-lg text-white focus:outline-none focus:border-blue-500 uppercase"
        />
        <button
          onClick={() => connectToHost(inputHostId)}
          disabled={!inputHostId || isConnected}
          className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 rounded font-bold transition"
        >
          部屋に入る (2P / ゲスト)
        </button>
      </div>

      {/* 接続成功時の画面遷移コントロール */}
      {isConnected && (
        <div className="p-4 bg-green-900/50 border border-green-500 rounded text-center w-full max-w-xs">
          <p className="text-green-400 font-bold mb-2">接続成功！ ({role === 'host' ? '1P' : '2P'})</p>
          {role === 'host' ? (
            <button
              onClick={handleStartGame}
              className="w-full py-2 bg-green-500 hover:bg-green-600 text-black font-extrabold rounded shadow transition"
            >
              対戦を開始する (全員遷移)
            </button>
          ) : (
            <p className="text-xs text-gray-300 animate-pulse">
              ホストがゲームを開始するのを待っています...
            </p>
          )}
        </div>
      )}

      <Link href="/" className="text-sm text-gray-400 hover:underline mt-4">
        タイトルへ戻る
      </Link>
    </main>
  );
}