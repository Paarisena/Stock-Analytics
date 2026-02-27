'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { LogOut, Home, Menu, X } from 'lucide-react';

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
  className?: string;
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
  className = '',
}: SidebarProps) {
  const { user, logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Close mobile sidebar when clicking outside or selecting stock
  useEffect(() => {
    if (isMobile && isMobileOpen) {
      const handleClickOutside = (e: MouseEvent) => {
        const sidebar = document.getElementById('mobile-sidebar');
        const hamburger = document.getElementById('hamburger-button');
        if (sidebar && !sidebar.contains(e.target as Node) && 
            hamburger && !hamburger.contains(e.target as Node)) {
          setIsMobileOpen(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isMobile, isMobileOpen]);

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
    if (isMobile) setIsMobileOpen(false);
  };

  const handleSelectStock = (symbol: string) => {
    onSelectStock(symbol);
    if (isMobile) setIsMobileOpen(false);
  };

  const toggleMobileSidebar = () => {
    setIsMobileOpen(!isMobileOpen);
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
    <>
      {/* Mobile Hamburger Button */}
      {isMobile && (
        <button
          id="hamburger-button"
          onClick={toggleMobileSidebar}
          className="fixed top-4 left-4 z-50 p-2 bg-black/60 backdrop-blur-xl border border-white/20 rounded-lg text-white hover:bg-black/80 transition-all lg:hidden touch-manipulation"
          aria-label="Toggle sidebar"
        >
          {isMobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      )}

      {/* Mobile Overlay */}
      {isMobile && isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div 
        id="mobile-sidebar"
        className={`
          ${isMobile 
            ? `fixed top-0 left-0 h-full w-80 max-w-[85vw] z-50 transform transition-transform duration-300 ease-in-out ${
                isMobileOpen ? 'translate-x-0' : '-translate-x-full'
              }` 
            : 'w-80 relative'
          } 
          bg-black/40 backdrop-blur-xl border-r border-white/10 flex flex-col ${className}
        `}
      >
        {/* Header */}
        <div className={`${isMobile ? 'p-3 pt-16' : 'p-4'} border-b border-white/10`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className={`${isMobile ? 'text-lg' : 'text-xl'} font-bold text-white`}>My Watchlist</h2>
            {isMobile && (
              <button
                onClick={() => setIsMobileOpen(false)}
                className="p-1 text-gray-400 hover:text-white transition-colors touch-manipulation"
                aria-label="Close sidebar"
              >
                <X size={18} />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowAddMenu(!showAddMenu)}
            className={`w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white ${isMobile ? 'py-2.5 px-3 text-sm' : 'py-2 px-4'} rounded-lg font-medium hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl touch-manipulation min-h-[44px]`}
          >
            + Add Stock
          </button>
        </div>

        {/* Add Stock Menu */}
        {showAddMenu && (
          <div className={`${isMobile ? 'p-3' : 'p-4'} bg-black/60 border-b border-white/10`}>
            <input
              type="text"
              placeholder={isMobile ? "Search stocks (AAPL, RELIANCE...)" : "Search any stock worldwide (e.g., AAPL, RELIANCE, TSLA)..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full bg-white/10 text-white placeholder-gray-400 ${isMobile ? 'px-3 py-2.5 text-sm' : 'px-4 py-2'} rounded-lg border border-white/20 focus:border-blue-500 focus:outline-none mb-3 min-h-[44px]`}
              autoFocus
            />
          
          {isSearching ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
              <span className="ml-2 text-gray-400 text-sm">Searching...</span>
            </div>
          ) : searchResults.length > 0 ? (
            <div className={`${isMobile ? 'max-h-64' : 'max-h-96'} overflow-y-auto space-y-1`}>
              {searchResults.map((stock) => {
                const alreadyAdded = watchlist.some(w => w.symbol === stock.symbol);
                const flag = getRegionFlag(stock.symbol, stock.exchange);
                
                return (
                  <button
                    key={stock.symbol}
                    onClick={() => !alreadyAdded && handleAddStock(stock)}
                    disabled={alreadyAdded}
                    className={`w-full text-left ${isMobile ? 'px-2.5 py-2.5' : 'px-3 py-2'} rounded-lg transition-all touch-manipulation min-h-[44px] ${
                      alreadyAdded
                        ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
                        : 'bg-white/5 hover:bg-white/10 active:bg-white/15 text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`${isMobile ? 'text-sm' : 'text-base'}`}>{flag}</span>
                      <div className="flex-1 min-w-0">
                        <div className={`font-medium ${isMobile ? 'text-xs' : 'text-sm'} truncate`}>{stock.symbol}</div>
                        <div className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-gray-400 truncate`}>{stock.name}</div>
                        <div className={`${isMobile ? 'text-[9px]' : 'text-xs'} text-gray-500`}>{stock.exchange} • {stock.type}</div>
                      </div>
                      {alreadyAdded && (
                        <span className={`${isMobile ? 'text-[9px]' : 'text-xs'} bg-gray-700 px-1.5 py-0.5 rounded`}>Added</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : searchQuery.length >= 2 ? (
            <div className={`text-center text-gray-400 ${isMobile ? 'py-6 text-xs' : 'py-8 text-sm'}`}>
              No stocks found for "{searchQuery}"
            </div>
          ) : (
            <div className={`text-center text-gray-400 ${isMobile ? 'py-6 text-xs' : 'py-8 text-sm'}`}>
              <div className={`${isMobile ? 'mb-1 text-lg' : 'mb-2'}`}>🔍</div>
              <div>Search for any stock worldwide</div>
              <div className={`${isMobile ? 'text-[10px]' : 'text-xs'} mt-2 space-y-1`}>
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
        <div className={`flex-1 overflow-y-auto ${isMobile ? 'p-3' : 'p-4'} space-y-2`}>
          {watchlist.length === 0 ? (
            <div className={`text-center text-gray-400 ${isMobile ? 'mt-6' : 'mt-8'}`}>
              <div className={`${isMobile ? 'text-3xl mb-1' : 'text-4xl mb-2'}`}>📊</div>
              <p className={`${isMobile ? 'text-xs' : 'text-sm'}`}>No stocks in watchlist</p>
              <p className={`${isMobile ? 'text-[10px]' : 'text-xs'} mt-1`}>Click "Add Stock" to get started</p>
            </div>
          ) : (
            watchlist.map((stock) => (
              <div
                key={stock.symbol}
                className={`group relative ${isMobile ? 'p-2.5' : 'p-3'} rounded-lg cursor-pointer transition-all touch-manipulation min-h-[44px] ${
                  selectedStock === stock.symbol
                    ? 'bg-gradient-to-r from-blue-600/30 to-purple-600/30 border border-blue-500/50 shadow-lg'
                    : 'bg-white/5 hover:bg-white/10 active:bg-white/15 border border-transparent'
                }`}
                onClick={() => handleSelectStock(stock.symbol)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className={`font-bold text-white ${isMobile ? 'text-sm' : ''}`}>{stock.symbol.replace('.NS', '').replace('.BO', '')}</div>
                    <div className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-gray-400 mt-1 line-clamp-1`}>{stock.name}</div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveStock(stock.symbol);
                    }}
                    className={`${isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity text-red-400 hover:text-red-300 active:text-red-200 ml-2 touch-manipulation min-w-[24px] min-h-[24px] flex items-center justify-center`}
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
        <div className={`border-t border-white/10 ${isMobile ? 'p-3' : 'p-4'} bg-black/60`}>
          <div className={`flex items-center gap-3 ${isMobile ? 'mb-2' : 'mb-3'}`}>
            {user?.photoURL && (
              <img 
                src={user.photoURL} 
                alt="Profile" 
                className={`${isMobile ? 'w-8 h-8' : 'w-10 h-10'} rounded-full border-2 border-cyan-500/30`}
              />
            )}
            <div className="flex-1 min-w-0">
              <div className={`${isMobile ? 'text-xs' : 'text-sm'} font-medium text-white truncate`}>
                {user?.displayName || 'User'}
              </div>
              <div className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-gray-400 truncate`}>
                {user?.email}
              </div>
            </div>
          </div>
          <button
            onClick={logout}
            className={`w-full flex items-center justify-center gap-2 ${isMobile ? 'px-3 py-2.5 text-xs' : 'px-4 py-2.5 text-sm'} bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-lg text-white font-medium transition-all shadow-lg hover:shadow-xl touch-manipulation min-h-[44px]`}
          >
            <LogOut size={isMobile ? 16 : 18} />
            Logout
          </button>
        </div>
      </div>
    </>
  );
}
