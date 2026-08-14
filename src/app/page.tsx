// src/app/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWebRTCContext } from '@/context/WebRTCContext';
import { GameMessage } from '@/types/game';

export default function HomePage() {
  const router = useRouter();
  const { peerId, isConnected, role, connectToHost, sendMessage, onMessage } = useWebRTCContext();
  const [inputHostId, setInputHostId] = useState('');
  const [isHostCreated, setIsHostCreated] = useState(false);

  // ルーム作成 (Host)
  const handleCreateRoom = () => {
    setIsHostCreated(true);
  };

  // ルーム参加 (Guest)
  const handleJoinRoom = () => {
    if (!inputHostId.trim()) return;
    connectToHost(inputHostId.trim());
  };

  // ホストが「対戦を開始する」を押した時
  const handleStartGame = () => {
    // 相手（ゲスト）にスタート信号を送信
    sendMessage({ type: 'START_GAME' });
    // 自身（ホスト）もゲーム画面へ遷移
    router.push('/game');
  };

  // ゲスト側：ホストからの START_GAME メッセージを受信して自動で画面遷移
  useEffect(() => {
    onMessage((data: GameMessage) => {
      if (data.type === 'START_GAME') {
        router.push('/game');
      }
    });
  }, [onMessage, router]);

  const isWaitingOrConnected = isHostCreated || isConnected || !!role;
  const isHost = !role || role === 'host';

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gray-950 text-white p-6 select-none">
      <div className="w-full max-w-md space-y-6 text-center">
        <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-red-500">
          BOMB BATTLE 2D
        </h1>

        {!isWaitingOrConnected ? (
          /* ----- 初期画面（ルーム作成・参加） ----- */
          <div className="space-y-4 bg-gray-900 p-6 rounded-2xl border border-gray-800 shadow-xl">
            <button
              onClick={handleCreateRoom}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 font-bold rounded-xl shadow-lg transition active:scale-95"
            >
              部屋を作成する (1P / Host)
            </button>

            <div className="flex items-center my-4">
              <div className="flex-1 border-t border-gray-800"></div>
              <span className="px-3 text-xs text-gray-500 font-bold">OR</span>
              <div className="flex-1 border-t border-gray-800"></div>
            </div>

            <div className="space-y-2">
              <input
                type="text"
                placeholder="ホストのPeer IDを入力"
                value={inputHostId}
                onChange={(e) => setInputHostId(e.target.value)}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-center text-lg font-mono focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={handleJoinRoom}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 font-bold rounded-xl shadow-lg transition active:scale-95"
              >
                部屋に参加する (2P / Guest)
              </button>
            </div>
          </div>
        ) : (
          /* ----- 待機 / 接続完了 画面 ----- */
          <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800 shadow-xl space-y-4">
            <p className="text-sm text-gray-400">
              あなたの役職: <span className="text-yellow-400 font-bold">{isHost ? 'Host (1P)' : 'Guest (2P)'}</span>
            </p>

            {/* Host側の場合は自分のPeer IDを表示 */}
            {isHost && (
              <div className="p-3 bg-gray-800 rounded-xl border border-gray-700">
                <p className="text-xs text-gray-400 mb-1">相手に伝える ルームID (Peer ID):</p>
                <p className="text-xl font-mono font-bold text-blue-400 select-all break-all">
                  {peerId || 'ID生成中...'}
                </p>
              </div>
            )}

            {/* 接続状況に応じた表示 */}
            {isConnected ? (
              <div className="space-y-3">
                <p className="text-emerald-400 font-bold animate-pulse">相手と接続されました！</p>
                
                {isHost ? (
                  /* ホストのみ開始ボタンを表示 */
                  <button
                    onClick={handleStartGame}
                    className="w-full py-4 bg-gradient-to-r from-red-600 to-amber-600 font-black text-xl rounded-xl shadow-xl hover:brightness-110 active:scale-95 transition"
                  >
                    ⚔️ 対戦を開始する
                  </button>
                ) : (
                  /* ゲスト側はホストの開始を待つメッセージ */
                  <div className="p-4 bg-gray-800/80 rounded-xl border border-gray-700 text-yellow-300 font-bold animate-pulse">
                    ホストがゲームを開始するのを待っています...
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 text-gray-400 py-4">
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span>{isHost ? '相手の接続を待っています...' : 'ホストに接続中...'}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}