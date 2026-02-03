"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./context/AuthContext";
import { Loader2, TrendingUp, BarChart3, LineChart, Activity } from "lucide-react";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (user) {
        // Redirect authenticated users to dashboard
        router.push("/dashboard");
      } else {
        // Redirect non-authenticated users to login
        router.push("/login");
      }
    }
  }, [user, loading, router]);

  // Show a nice loading screen while redirecting
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }}></div>
      </div>

      {/* Content */}
      <div className="relative z-10 text-center px-4">
        {/* Logo/Icon */}
        <div className="flex items-center justify-center gap-4 mb-8">
          <div className="relative">
            <TrendingUp className="w-16 h-16 text-cyan-400 animate-bounce" />
            <div className="absolute inset-0 bg-cyan-400/20 blur-xl rounded-full"></div>
          </div>
          <div className="relative">
            <BarChart3 className="w-16 h-16 text-blue-400 animate-bounce" style={{ animationDelay: "0.2s" }} />
            <div className="absolute inset-0 bg-blue-400/20 blur-xl rounded-full"></div>
          </div>
          <div className="relative">
            <LineChart className="w-16 h-16 text-purple-400 animate-bounce" style={{ animationDelay: "0.4s" }} />
            <div className="absolute inset-0 bg-purple-400/20 blur-xl rounded-full"></div>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-5xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
          AI Stock Analyzer
        </h1>

        <p className="text-gray-400 text-lg mb-8 max-w-md mx-auto">
          Real-time stock analysis powered by artificial intelligence
        </p>

        {/* Loading Spinner */}
        <div className="flex items-center justify-center gap-3">
          <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
          <span className="text-gray-500">Loading...</span>
        </div>

        {/* Features */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto">
          <div className="p-6 bg-gray-800/30 backdrop-blur-sm border border-gray-700/50 rounded-2xl">
            <Activity className="w-8 h-8 text-cyan-400 mb-3 mx-auto" />
            <h3 className="text-white font-semibold mb-2">Real-time Data</h3>
            <p className="text-gray-500 text-sm">Live stock prices and market updates</p>
          </div>

          <div className="p-6 bg-gray-800/30 backdrop-blur-sm border border-gray-700/50 rounded-2xl">
            <BarChart3 className="w-8 h-8 text-blue-400 mb-3 mx-auto" />
            <h3 className="text-white font-semibold mb-2">AI Analysis</h3>
            <p className="text-gray-500 text-sm">Intelligent market Analytics</p>
          </div>

          <div className="p-6 bg-gray-800/30 backdrop-blur-sm border border-gray-700/50 rounded-2xl">
            <TrendingUp className="w-8 h-8 text-purple-400 mb-3 mx-auto" />
            <h3 className="text-white font-semibold mb-2">Portfolio Tracking</h3>
            <p className="text-gray-500 text-sm">Monitor your investments</p>
          </div>
        </div>
      </div>
    </div>
  );
}
