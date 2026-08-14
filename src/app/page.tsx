import Link from 'next/link';

export default function TitlePage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-6 p-4">
      <h1 className="text-4xl font-bold tracking-wider text-center">
        爆走タンク罠合戦
      </h1>
      
      <div className="flex flex-col w-full max-w-xs gap-3">
        <Link 
          href="/room" 
          className="w-full py-3 text-center text-white bg-blue-600 rounded-lg font-bold hover:bg-blue-700"
        >
          対戦をはじめる (ルーム作成/参加)
        </Link>
      </div>
    </main>
  );
}