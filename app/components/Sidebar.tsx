'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { LogOut, Home } from 'lucide-react';

interface WatchlistStock {
  symbol: string;
  name: string;
  addedAt: number;
}

interface SidebarProps {
  watchlist: WatchlistStock[];
  selectedStock: string | null;
  onSelectStock: (symbol: string) => void;
  onAddStock: (stock: WatchlistStock) => void;
  onRemoveStock: (symbol: string) => void;
}

interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

export default function Sidebar({
  watchlist,
  selectedStock,
  onSelectStock,
  onAddStock,
  onRemoveStock,
}: SidebarProps) {
  const { user, logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Debounced search effect
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const searchTimeout = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(`/api/stock-search?q=${encodeURIComponent(searchQuery)}`);
        const data = await response.json();
        setSearchResults(data.results || []);
      } catch (error) {
        console.error('Search error:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 500); // Debounce 500ms

    return () => clearTimeout(searchTimeout);
  }, [searchQuery]);

  const handleAddStock = (stock: { symbol: string; name: string }) => {
    onAddStock({ ...stock, addedAt: Date.now() });
    setShowAddMenu(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const getRegionFlag = (symbol: string, exchange: string) => {
    if (symbol.includes('.NS') || symbol.includes('.BO') || exchange.includes('NSE') || exchange.includes('BSE')) return '🇮🇳';
    if (symbol.includes('.T') || exchange.includes('Tokyo')) return '🇯🇵';
    if (symbol.includes('.L') || exchange.includes('London')) return '🇬🇧';
    if (symbol.includes('.HK') || exchange.includes('Hong Kong')) return '🇭🇰';
    if (symbol.includes('.SS') || symbol.includes('.SZ') || exchange.includes('Shanghai') || exchange.includes('Shenzhen')) return '🇨🇳';
    if (symbol.includes('.DE') || exchange.includes('Frankfurt') || exchange.includes('XETRA')) return '🇩🇪';
    if (symbol.includes('.PA') || exchange.includes('Paris')) return '🇫🇷';
    if (symbol.includes('.TO') || exchange.includes('Toronto')) return '🇨🇦';
    if (symbol.includes('.AX') || exchange.includes('ASX')) return '🇦🇺';
    if (symbol.includes('.KS') || symbol.includes('.KQ') || exchange.includes('Korea')) return '🇰🇷';
    if (symbol.includes('.SA') || exchange.includes('Sao Paulo')) return '🇧🇷';
    if (symbol.includes('.MI') || exchange.includes('Milan')) return '🇮🇹';
    if (symbol.includes('.AS') || exchange.includes('Amsterdam')) return '🇳🇱';
    if (symbol.includes('.SW') || exchange.includes('Swiss')) return '🇨🇭';
    if (symbol.includes('.SI') || exchange.includes('Singapore')) return '🇸🇬';
    if (symbol.startsWith('^')) return '📈';
    if (exchange.includes('NASDAQ') || exchange.includes('NYSE') || exchange.includes('NYQ') || exchange.includes('NMS')) return '🇺🇸';
    return '🌐';
  };

  return (
    <div className="w-80 bg-black/40 backdrop-blur-xl border-r border-white/10 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-white/10">
        <h2 className="text-xl font-bold text-white mb-3">My Watchlist</h2>
        <button
          onClick={() => setShowAddMenu(!showAddMenu)}
          className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-2 px-4 rounded-lg font-medium hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl"
        >
          + Add Stock
        </button>
      </div>

      {/* Add Stock Menu */}
      {showAddMenu && (
        <div className="p-4 bg-black/60 border-b border-white/10">
          <input
            type="text"
            placeholder="Search any stock worldwide (e.g., AAPL, RELIANCE, TSLA)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/10 text-white placeholder-gray-400 px-4 py-2 rounded-lg border border-white/20 focus:border-blue-500 focus:outline-none mb-3"
            autoFocus
          />
          
          {isSearching ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
              <span className="ml-2 text-gray-400 text-sm">Searching...</span>
            </div>
          ) : searchResults.length > 0 ? (
            <div className="max-h-96 overflow-y-auto space-y-1">
              {searchResults.map((stock) => {
                const alreadyAdded = watchlist.some(w => w.symbol === stock.symbol);
                const flag = getRegionFlag(stock.symbol, stock.exchange);
                
                return (
                  <button
                    key={stock.symbol}
                    onClick={() => !alreadyAdded && handleAddStock(stock)}
                    disabled={alreadyAdded}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-all ${
                      alreadyAdded
                        ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
                        : 'bg-white/5 hover:bg-white/10 text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">{flag}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{stock.symbol}</div>
                        <div className="text-xs text-gray-400 truncate">{stock.name}</div>
                        <div className="text-xs text-gray-500">{stock.exchange} • {stock.type}</div>
                      </div>
                      {alreadyAdded && (
                        <span className="text-xs bg-gray-700 px-2 py-1 rounded">Added</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : searchQuery.length >= 2 ? (
            <div className="text-center text-gray-400 py-8 text-sm">
              No stocks found for "{searchQuery}"
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8 text-sm">
              <div className="mb-2">🔍</div>
              <div>Search for any stock worldwide</div>
              <div className="text-xs mt-2 space-y-1">
                <div>Examples:</div>
                <div>🇺🇸 AAPL, TSLA, MSFT</div>
                <div>🇮🇳 RELIANCE, TCS, INFY</div>
                <div>🇯🇵 Toyota, Sony</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Watchlist */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {watchlist.length === 0 ? (
          <div className="text-center text-gray-400 mt-8">
            <div className="text-4xl mb-2">📊</div>
            <p className="text-sm">No stocks in watchlist</p>
            <p className="text-xs mt-1">Click "Add Stock" to get started</p>
          </div>
        ) : (
          watchlist.map((stock) => (
            <div
              key={stock.symbol}
              className={`group relative p-3 rounded-lg cursor-pointer transition-all ${
                selectedStock === stock.symbol
                  ? 'bg-gradient-to-r from-blue-600/30 to-purple-600/30 border border-blue-500/50 shadow-lg'
                  : 'bg-white/5 hover:bg-white/10 border border-transparent'
              }`}
              onClick={() => onSelectStock(stock.symbol)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="font-bold text-white">{stock.symbol.replace('.NS', '').replace('.BO', '')}</div>
                  <div className="text-xs text-gray-400 mt-1 line-clamp-1">{stock.name}</div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveStock(stock.symbol);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-300 ml-2"
                  title="Remove from watchlist"
                >
                  ✕
                </button>
              </div>
              {selectedStock === stock.symbol && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-l-lg"></div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer with User Info and Logout */}
      <div className="border-t border-white/10 p-4 bg-black/60">
        <div className="flex items-center gap-3 mb-3">
          {user?.photoURL && (
            <img 
              src={user.photoURL} 
              alt="Profile" 
              className="w-10 h-10 rounded-full border-2 border-cyan-500/30"
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white truncate">
              {user?.displayName || 'User'}
            </div>
            <div className="text-xs text-gray-400 truncate">
              {user?.email}
            </div>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 rounded-lg text-white text-sm font-medium transition-all shadow-lg hover:shadow-xl"
        >
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </div>
    
  );
}
