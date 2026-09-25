import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, Clock } from 'lucide-react';

export default function Orders() {
  const navigate = useNavigate();
  const [orders] = useState([
    { id: 'ORD-001', title: 'Smartphone 128Go', price: '250 $', status: 'En attente', date: 'Aujourd\'hui' },
    { id: 'ORD-002', title: 'Chaussures de sport', price: '45 $', status: 'Livré', date: 'Hier' }
  ]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 pb-20">
      <header className="sticky top-0 z-40 border-b border-neutral-800 bg-neutral-900/90 px-4 py-3 flex items-center space-x-3">
        <button onClick={() => navigate('/')} className="p-1.5 rounded-lg hover:bg-neutral-800 transition text-neutral-400 hover:text-neutral-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-bold text-base">Mes Commandes</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {orders.length === 0 ? (
          <div className="text-center py-16 border border-neutral-800 rounded-xl bg-neutral-900 text-neutral-400">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Aucune commande enregistrée.</p>
          </div>
        ) : (
          orders.map((order) => (
            <div key={order.id} className="p-4 rounded-xl border border-neutral-800 bg-neutral-900 flex items-center justify-between">
              <div>
                <span className="text-xs text-neutral-500 font-mono">{order.id}</span>
                <h2 className="font-semibold text-sm mt-0.5">{order.title}</h2>
                <span className="text-xs text-neutral-400 flex items-center mt-1">
                  <Clock className="w-3.5 h-3.5 mr-1" /> {order.date}
                </span>
              </div>
              <div className="text-right">
                <span className="font-bold text-orange-600 block text-sm">{order.price}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 mt-1 inline-block">
                  {order.status}
                </span>
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  );
}