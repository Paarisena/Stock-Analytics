"use client";
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Sparkles, Loader2, TrendingUp, BarChart3, Shield, Zap } from 'lucide-react';

export default function LoginPage() {
  const { user, signInWithGoogle, loading } = useAuth();
  const router = useRouter();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && !loading) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  const handleGoogleSignIn = async () => {
    try {
      setIsSigningIn(true);
      setError(null);
      await signInWithGoogle();
    } catch (err: any) {
      console.error('Sign-in error:', err);
      setError(err.message || 'Failed to sign in with Google');
      setIsSigningIn(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-black to-slate-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-cyan-400 animate-spin mx-auto" />
          <p className="text-gray-400 text-sm animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-black to-slate-900 relative overflow-hidden">
      {/* Animated background gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute top-1/2 -left-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-700"></div>
        <div className="absolute -bottom-40 right-1/3 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div className="relative flex flex-col lg:flex-row min-h-screen">
        {/* Left side - Hero Section */}
        <div className="flex-1 flex items-center justify-center p-6 sm:p-8 lg:p-12">
          <div className="max-w-xl w-full">
            <div className="mb-8 lg:mb-12 animate-fade-in">
              <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 mb-6 sm:mb-8 bg-gradient-to-br from-cyan-600/20 to-blue-600/20 rounded-3xl backdrop-blur-xl border border-cyan-500/30 shadow-2xl shadow-cyan-500/20 hover:scale-110 transition-transform duration-300">
                <Sparkles size={32} className="sm:w-10 sm:h-10 text-cyan-400 animate-pulse" />
              </div>
              
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6 bg-gradient-to-r from-cyan-400 via-blue-400 to-teal-400 bg-clip-text text-transparent leading-tight">
                AI Stock Analysis Platform
              </h1>
              
              <p className="text-gray-400 text-base sm:text-lg lg:text-xl leading-relaxed">
                Unlock powerful insights with AI-driven stock analysis. Make informed investment decisions with real-time data and comprehensive market intelligence.
              </p>
            </div>

            {/* Feature highlights */}
            <div className="hidden lg:grid grid-cols-2 gap-4 xl:gap-6">
              <div className="group p-4 xl:p-6 bg-gradient-to-br from-cyan-900/10 to-blue-900/10 rounded-2xl border border-cyan-500/20 hover:border-cyan-500/40 transition-all duration-300 hover:scale-105">
                <div className="w-10 h-10 xl:w-12 xl:h-12 bg-cyan-500/20 rounded-xl flex items-center justify-center mb-3 xl:mb-4 group-hover:bg-cyan-500/30 transition-colors">
                  <TrendingUp className="w-5 h-5 xl:w-6 xl:h-6 text-cyan-400" />
                </div>
                <h3 className="font-semibold text-white mb-2 text-sm xl:text-base">Real-time Analytics</h3>
                <p className="text-gray-400 text-xs xl:text-sm">Live market data and AI-powered insights at your fingertips</p>
              </div>
              
              <div className="group p-4 xl:p-6 bg-gradient-to-br from-blue-900/10 to-teal-900/10 rounded-2xl border border-blue-500/20 hover:border-blue-500/40 transition-all duration-300 hover:scale-105">
                <div className="w-10 h-10 xl:w-12 xl:h-12 bg-blue-500/20 rounded-xl flex items-center justify-center mb-3 xl:mb-4 group-hover:bg-blue-500/30 transition-colors">
                  <BarChart3 className="w-5 h-5 xl:w-6 xl:h-6 text-blue-400" />
                </div>
                <h3 className="font-semibold text-white mb-2 text-sm xl:text-base">Deep Analysis</h3>
                <p className="text-gray-400 text-xs xl:text-sm">Comprehensive fundamental and technical analysis reports</p>
              </div>
              
              <div className="group p-4 xl:p-6 bg-gradient-to-br from-teal-900/10 to-cyan-900/10 rounded-2xl border border-teal-500/20 hover:border-teal-500/40 transition-all duration-300 hover:scale-105">
                <div className="w-10 h-10 xl:w-12 xl:h-12 bg-teal-500/20 rounded-xl flex items-center justify-center mb-3 xl:mb-4 group-hover:bg-teal-500/30 transition-colors">
                  <Shield className="w-5 h-5 xl:w-6 xl:h-6 text-teal-400" />
                </div>
                <h3 className="font-semibold text-white mb-2 text-sm xl:text-base">Secure Platform</h3>
                <p className="text-gray-400 text-xs xl:text-sm">Enterprise-grade security with Google authentication</p>
              </div>
              
              <div className="group p-4 xl:p-6 bg-gradient-to-br from-purple-900/10 to-blue-900/10 rounded-2xl border border-purple-500/20 hover:border-purple-500/40 transition-all duration-300 hover:scale-105">
                <div className="w-10 h-10 xl:w-12 xl:h-12 bg-purple-500/20 rounded-xl flex items-center justify-center mb-3 xl:mb-4 group-hover:bg-purple-500/30 transition-colors">
                  <Zap className="w-5 h-5 xl:w-6 xl:h-6 text-purple-400" />
                </div>
                <h3 className="font-semibold text-white mb-2 text-sm xl:text-base">Lightning Fast</h3>
                <p className="text-gray-400 text-xs xl:text-sm">Instant search results and portfolio tracking</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right side - Login Form */}
        <div className="flex-1 flex items-center justify-center p-6 sm:p-8 lg:p-12">
          <div className="w-full max-w-md">
            <div className="bg-gradient-to-br from-slate-900/90 to-slate-800/90 backdrop-blur-2xl rounded-3xl border border-slate-700/50 shadow-2xl p-6 sm:p-8 lg:p-10 hover:border-cyan-500/30 transition-all duration-500">
              <div className="text-center mb-6 sm:mb-8">
                <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3 sm:mb-4">Welcome Back</h2>
                <p className="text-gray-400 text-sm sm:text-base">Sign in to access your dashboard</p>
              </div>

              <button
                onClick={handleGoogleSignIn}
                disabled={isSigningIn}
                className="w-full group relative overflow-hidden flex items-center justify-center gap-3 px-6 py-4 sm:py-5 bg-white hover:bg-gray-50 disabled:bg-gray-200 disabled:cursor-not-allowed text-gray-900 font-semibold rounded-xl sm:rounded-2xl transition-all duration-300 shadow-lg hover:shadow-2xl hover:shadow-cyan-500/20 transform hover:scale-[1.02] active:scale-[0.98]"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                {isSigningIn ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin relative z-10" />
                    <span className="relative z-10">Signing in...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-6 h-6 relative z-10" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    <span className="relative z-10">Continue with Google</span>
                  </>
                )}
              </button>

              {error && (
                <div className="mt-4 sm:mt-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl sm:rounded-2xl backdrop-blur-sm animate-shake">
                  <p className="text-red-400 text-sm text-center">{error}</p>
                </div>
              )}

              <div className="mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-slate-700/50">
                <p className="text-gray-500 text-xs sm:text-sm text-center leading-relaxed">
                  By signing in, you agree to our <span className="text-cyan-400 hover:underline cursor-pointer">Terms of Service</span> and <span className="text-cyan-400 hover:underline cursor-pointer">Privacy Policy</span>
                </p>
              </div>

              {/* Mobile features list */}
              <div className="lg:hidden mt-8 pt-8 border-t border-slate-700/50 space-y-3">
                <div className="flex items-start gap-3 text-sm">
                  <span className="text-green-400 text-lg mt-0.5">✓</span>
                  <span className="text-gray-300">Real-time stock analysis with AI</span>
                </div>
                <div className="flex items-start gap-3 text-sm">
                  <span className="text-green-400 text-lg mt-0.5">✓</span>
                  <span className="text-gray-300">Comprehensive fundamental analysis</span>
                </div>
                <div className="flex items-start gap-3 text-sm">
                  <span className="text-green-400 text-lg mt-0.5">✓</span>
                  <span className="text-gray-300">Personalized stock watchlist</span>
                </div>
                <div className="flex items-start gap-3 text-sm">
                  <span className="text-green-400 text-lg mt-0.5">✓</span>
                  <span className="text-gray-300">Save your search history</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
