import React from 'react';
import { Home, MessageSquare, Bell, PlusCircle, ShoppingBag } from 'lucide-react';

interface NavbarProps {
  currentTab: string;
  setCurrentTab: (tab: 'home' | 'messages' | 'notifications' | 'create') => void;
}

export default function Navbar({ currentTab, setCurrentTab }: NavbarProps) {
  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-2 cursor-pointer" onClick={() => setCurrentTab('home')}>
          <ShoppingBag className="w-8 h-8 text-blue-600" />
          <span className="text-xl font-bold text-gray-800">CBFSOKO</span>
        </div>
        <nav className="flex space-x-1 sm:space-x-4">
          <button
            onClick={() => setCurrentTab('home')}
            className={`flex items-center space-x-1 px-3 py-2 rounded-lg text-sm font-medium transition ${
              currentTab === 'home' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Home className="w-4 h-4" />
            <span className="hidden sm:inline">Accueil</span>
          </button>
          <button
            onClick={() => setCurrentTab('messages')}
            className={`flex items-center space-x-1 px-3 py-2 rounded-lg text-sm font-medium transition ${
              currentTab === 'messages' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span className="hidden sm:inline">Messages</span>
          </button>
          <button
            onClick={() => setCurrentTab('notifications')}
            className={`flex items-center space-x-1 px-3 py-2 rounded-lg text-sm font-medium transition ${
              currentTab === 'notifications' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Bell className="w-4 h-4" />
            <span className="hidden sm:inline">Notifications</span>
          </button>
          <button
            onClick={() => setCurrentTab('create')}
            className="flex items-center space-x-1 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition shadow-sm"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Publier</span>
          </button>
        </nav>
      </div>
    </header>
  );
}
