import Link from 'next/link';

export default function RoomPage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-6 p-4">
      <h2 className="text-2xl font-bold">対戦部屋待機</h2>
      <p className="text-gray-400">WebRTC接続を待機中...</p>

      <Link 
        href="/game" 
        className="px-6 py-3 text-white bg-green-600 rounded-lg font-bold hover:bg-green-700"
      >
        ゲーム画面へ移動（仮）
      </Link>
    </main>
  );
}