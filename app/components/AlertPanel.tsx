'use client';

interface Alert {
  id: number;
  type: 'price' | 'prediction' | 'signal' | 'breakout';
  symbol: string;
  message: string;
  createdAt: Date;
  severity: 'info' | 'warning' | 'success' | 'error';
}

interface AlertPanelProps {
  alerts: Alert[];
  onDismiss: (id: number) => void;
}

export default function AlertPanel({ alerts, onDismiss }: AlertPanelProps) {
  const getSeverityStyles = (severity: string) => {
    switch (severity) {
      case 'success':
        return 'bg-green-500/20 border-green-500 text-green-400';
      case 'warning':
        return 'bg-yellow-500/20 border-yellow-500 text-yellow-400';
      case 'error':
        return 'bg-red-500/20 border-red-500 text-red-400';
      default:
        return 'bg-blue-500/20 border-blue-500 text-blue-400';
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'price':
        return '💰';
      case 'prediction':
        return '🔮';
      case 'signal':
        return '📊';
      case 'breakout':
        return '🚀';
      default:
        return '📢';
    }
  };

  return (
    <div className="bg-black/30 backdrop-blur-lg border-b border-white/10 p-4 overflow-x-auto">
      <div className="flex gap-3">
        {alerts.slice(-5).map((alert) => (
          <div
            key={alert.id}
            className={`flex items-center gap-3 px-4 py-2 rounded-lg border min-w-fit ${getSeverityStyles(alert.severity)}`}
          >
            <span className="text-xl">{getIcon(alert.type)}</span>
            <div className="flex-1">
              <div className="font-medium">{alert.symbol}</div>
              <div className="text-sm opacity-90">{alert.message}</div>
            </div>
            <button
              onClick={() => onDismiss(alert.id)}
              className="text-white/70 hover:text-white ml-2"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
