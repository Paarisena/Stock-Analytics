'use client';

import { useState, useEffect } from 'react';
import Sidebar from'@/app/components/Sidebar';
import StockCardWrapper from '@/app/components/StockCardWrapper';
import ComparisonGrid from '@/app/components/ComparisonGrid';
import AlertPanel from '@/app/components/AlertPanel';

interface WatchlistStock {
  symbol: string;
  name: string;
  addedAt: number;
}

export default function Dashboard() {
  const [watchlist, setWatchlist] = useState<WatchlistStock[]>([]);
  const [selectedStock, setSelectedStock] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'detailed' | 'grid'>('detailed');
  const [alerts, setAlerts] = useState<any[]>([]);

  // Load watchlist from localStorage on mount
  useEffect(() => {
    const savedWatchlist = localStorage.getItem('stockWatchlist');
    if (savedWatchlist) {
      try {
        const parsed = JSON.parse(savedWatchlist);
        setWatchlist(parsed);
        if (parsed.length > 0 && !selectedStock) {
          setSelectedStock(parsed[0].symbol);
        }
      } catch (e) {
        console.error('Failed to load watchlist', e);
      }
    } else {
      // Default watchlist
      const defaultStocks = [
        { symbol: 'RELIANCE.NS', name: 'Reliance Industries', addedAt: Date.now() },
        { symbol: 'TCS.NS', name: 'Tata Consultancy Services', addedAt: Date.now() },
        { symbol: 'INFY.NS', name: 'Infosys', addedAt: Date.now() },
      ];
      setWatchlist(defaultStocks);
      setSelectedStock(defaultStocks[0].symbol);
      localStorage.setItem('stockWatchlist', JSON.stringify(defaultStocks));
    }
  }, []);

  // Save watchlist to localStorage whenever it changes
  useEffect(() => {
    if (watchlist.length > 0) {
      localStorage.setItem('stockWatchlist', JSON.stringify(watchlist));
    }
  }, [watchlist]);

  const addToWatchlist = (stock: WatchlistStock) => {
    if (!watchlist.find(s => s.symbol === stock.symbol)) {
      const newWatchlist = [...watchlist, { ...stock, addedAt: Date.now() }];
      setWatchlist(newWatchlist);
      setSelectedStock(stock.symbol);
    }
  };

  const removeFromWatchlist = (symbol: string) => {
    const newWatchlist = watchlist.filter(s => s.symbol !== symbol);
    setWatchlist(newWatchlist);
    if (selectedStock === symbol && newWatchlist.length > 0) {
      setSelectedStock(newWatchlist[0].symbol);
    } else if (newWatchlist.length === 0) {
      setSelectedStock(null);
    }
  };

  const addAlert = (alert: any) => {
    setAlerts(prev => [...prev, { ...alert, id: Date.now(), createdAt: new Date() }]);
  };

  const dismissAlert = (id: number) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900">
      {/* Sidebar */}
      <Sidebar
        watchlist={watchlist}
        selectedStock={selectedStock}
        onSelectStock={setSelectedStock}
        onAddStock={addToWatchlist}
        onRemoveStock={removeFromWatchlist}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-black/30 backdrop-blur-lg border-b border-white/10 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">Stock Analysis Dashboard</h1>
              <p className="text-gray-400 text-sm mt-1">
                AI-Powered Predictions • Real-time Intelligence • Technical Analysis
              </p>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode('detailed')}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  viewMode === 'detailed'
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'bg-white/10 text-gray-300 hover:bg-white/20'
                }`}
              >
                📊 Detailed View
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  viewMode === 'grid'
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'bg-white/10 text-gray-300 hover:bg-white/20'
                }`}
              >
                📈 Comparison Grid
              </button>
            </div>
          </div>
        </header>

        {/* Alert Panel */}
        {alerts.length > 0 && (
          <AlertPanel alerts={alerts} onDismiss={dismissAlert} />
        )}

        {/* Content Area */}
        <main className="flex-1 overflow-auto p-6">
          {viewMode === 'detailed' ? (
            selectedStock ? (
              <StockCardWrapper 
                query={selectedStock} 
                onAlert={addAlert}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="text-6xl mb-4">📊</div>
                  <h2 className="text-2xl font-bold text-white mb-2">No Stock Selected</h2>
                  <p className="text-gray-400">Add stocks to your watchlist to get started</p>
                </div>
              </div>
            )
          ) : (
            <ComparisonGrid 
              symbols={watchlist.map(s => s.symbol)} 
              onSelectStock={setSelectedStock}
              onSwitchToDetailed={() => setViewMode('detailed')}
            />
          )}
        </main>
      </div>
    </div>
  );
}
