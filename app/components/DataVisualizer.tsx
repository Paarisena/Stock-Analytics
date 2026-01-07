"use client";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, PieChart as PieIcon, BarChart3, Activity } from 'lucide-react';

interface DataPoint {
  name: string;
  value: number;
  [key: string]: any;
}

interface DataVisualizerProps {
  data: DataPoint[];
  type: 'bar' | 'line' | 'pie';
  title?: string;
  xKey?: string;
  yKey?: string;
}

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'];

export default function DataVisualizer({ data, type, title, xKey = 'name', yKey = 'value' }: DataVisualizerProps) {
  const getIcon = () => {
    switch (type) {
      case 'bar': return <BarChart3 size={20} className="text-blue-400" />;
      case 'line': return <Activity size={20} className="text-purple-400" />;
      case 'pie': return <PieIcon size={20} className="text-pink-400" />;
    }
  };

  return (
    <div className="my-6 p-6 bg-gradient-to-br from-gray-800/60 to-gray-800/40 backdrop-blur-xl rounded-2xl border border-gray-700/50 shadow-2xl">
      {title && (
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-gradient-to-br from-blue-600/20 to-purple-600/20 rounded-lg">
            {getIcon()}
          </div>
          <h3 className="text-lg font-bold text-gray-100">{title}</h3>
        </div>
      )}
      
      <ResponsiveContainer width="100%" height={300}>
        {type === 'bar' && (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey={xKey} stroke="#9ca3af" />
            <YAxis stroke="#9ca3af" />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#1f2937', 
                border: '1px solid #374151',
                borderRadius: '0.5rem',
                color: '#f3f4f6'
              }} 
            />
            <Legend />
            <Bar dataKey={yKey} fill="#3b82f6" radius={[8, 8, 0, 0]} />
          </BarChart>
        )}
        
        {type === 'line' && (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey={xKey} stroke="#9ca3af" />
            <YAxis stroke="#9ca3af" />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#1f2937', 
                border: '1px solid #374151',
                borderRadius: '0.5rem',
                color: '#f3f4f6'
              }} 
            />
            <Legend />
            <Line 
              type="monotone" 
              dataKey={yKey} 
              stroke="#8b5cf6" 
              strokeWidth={3}
              dot={{ fill: '#8b5cf6', r: 5 }}
              activeDot={{ r: 8 }}
            />
          </LineChart>
        )}
        
        {type === 'pie' && (
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
              outerRadius={100}
              fill="#8884d8"
              dataKey={yKey}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#1f2937', 
                border: '1px solid #374151',
                borderRadius: '0.5rem',
                color: '#f3f4f6'
              }} 
            />
          </PieChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
