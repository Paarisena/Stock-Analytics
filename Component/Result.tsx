'use client'
import { Clock, ExternalLink, Sparkles} from "lucide-react"
import { SearchResult, ResultProps } from "@/DB/interface";



export default function Result({ results, isLoading, query }: ResultProps) {

    if (isLoading) {
        return (
            <div className="mt-8 space-y-4 w-full max-w-4xl mx-auto">
                <div className="flex items-center gap-2 text-gray-400 mb-4">
                    <Sparkles size={20} className='animate-spin'/>
                    <span>Thinking...</span>
                </div>
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="bg-gray-800/30 rounded-xl p-6 border border-gray-700/30 animate-pulse">
                        <div className="h-5 bg-gray-700 rounded w-3/4 mb-3"></div>
                        <div className="h-4 bg-gray-700 rounded w-full mb-2"></div>
                        <div className="h-4 bg-gray-700 rounded w-5/6 mb-3"></div>
                        <div className="h-3 bg-gray-700 rounded w-1/4"></div>
                    </div>
                ))}
            </div>
        );
    }

    if(results.length === 0 && query) {
        return(
            <div className="mt-8 text-center w-full max-w-4xl mx-auto">
                <div className="bg-gray-800/20 rounded-xl p-12 border border-gray-700/30">
                    <div className="text-6xl mb-4">🔍</div>
                    <h3 className="text-xl text-gray-300 mb-2">No results found</h3>
                    <p className="text-gray-500">Try different keywords for "{query}"</p>
                </div>
            </div>
        )
    }

    if (results.length === 0) {
        return null;
    }

    return (
        <div className="mt-8 w-full max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between px-2">
                <h2 className="text-xl font-semibold text-white">
                    Search Results for "{query}"
                </h2>
                <span className="text-sm text-gray-400">
                    {results.length} {results.length === 1 ? 'result' : 'results'}
                </span>
            </div>
            <div className="space-y-4">
                {results.map((result) => (
                    <div 
                        key={result.id}
                        className="bg-gray-800/30 backdrop-blur-sm rounded-xl p-6 border border-gray-700/30 hover:bg-gray-700/30 hover:border-gray-600/40 transition-all duration-300 group"
                    >
                        <h3 className="text-white font-semibold text-lg mb-3 group-hover:text-blue-400 transition-colors">
                            {result.title}
                        </h3>
                        <p className="text-gray-300 leading-relaxed mb-4 text-base whitespace-pre-wrap">
                            {result.content}
                        </p>
                        <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-4">
                                <span className="text-gray-400 flex items-center gap-1">
                                    <ExternalLink size={14} />
                                    {result.source}
                                </span>
                                <span className="text-gray-500 flex items-center gap-1">
                                    <Clock size={14} />
                                    {new Date(result.timestamp).toLocaleTimeString()}
                                </span>
                            </div>
                            {result.url && (
                                <a
                                    href={result.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                                >
                                    View source
                                    <ExternalLink size={12} />
                                </a>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}