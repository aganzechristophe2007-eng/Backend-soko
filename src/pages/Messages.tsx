import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageSquare, Send } from 'lucide-react';

export default function MessagingPage() {
  const navigate = useNavigate();
  const [conversations] = useState([
    { id: '1', name: 'Boutique Express', lastMessage: 'Bonjour, cet article est toujours disponible ?', time: '10:45' }
  ]);
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 pb-20">
      <header className="sticky top-0 z-40 border-b border-neutral-800 bg-neutral-900/90 px-4 py-3 flex items-center space-x-3">
        <button onClick={() => navigate('/')} className="p-1.5 rounded-lg hover:bg-neutral-800 transition text-neutral-400 hover:text-neutral-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-bold text-base">Messages</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {conversations.length === 0 ? (
          <div className="text-center py-16 border border-neutral-800 rounded-xl bg-neutral-900 text-neutral-400">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Aucune discussion en cours.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {conversations.map((conv) => (
              <div 
                key={conv.id} 
                onClick={() => setSelectedConv(conv.id)}
                className="p-4 rounded-xl border border-neutral-800 bg-neutral-900 hover:border-orange-600/50 transition cursor-pointer flex items-center justify-between"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-orange-600/20 text-orange-600 flex items-center justify-center font-bold text-sm">
                    {conv.name.charAt(0)}
                  </div>
                  <div>
                    <h2 className="font-semibold text-sm">{conv.name}</h2>
                    <p className="text-xs text-neutral-400 truncate max-w-xs">{conv.lastMessage}</p>
                  </div>
                </div>
                <span className="text-xs text-neutral-500">{conv.time}</span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}