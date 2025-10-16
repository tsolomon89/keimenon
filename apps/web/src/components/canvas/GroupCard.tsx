'use client';

import { MessageSquare, FileText, Code, MoreVertical, Maximize2 } from 'lucide-react';
import { CanvasNode } from '@/types/canvas';

interface GroupCardProps {
  node: CanvasNode;
  selected?: boolean;
  onSelect?: () => void;
  onDoubleClick?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  style?: React.CSSProperties;
}

export function GroupCard({
  node,
  selected,
  onSelect,
  onDoubleClick,
  onDragStart,
  style,
}: GroupCardProps) {
  const getTypeColor = (type: string) => {
    switch (type) {
      case 'conversation':
        return {
          bg: 'bg-purple-600/10',
          border: 'border-purple-500/30',
          icon: 'text-purple-400',
        };
      case 'source':
        return {
          bg: 'bg-green-600/10',
          border: 'border-green-500/30',
          icon: 'text-green-400',
        };
      case 'code':
        return {
          bg: 'bg-orange-600/10',
          border: 'border-orange-500/30',
          icon: 'text-orange-400',
        };
      case 'group':
        return {
          bg: 'bg-blue-600/10',
          border: 'border-blue-500/30',
          icon: 'text-blue-400',
        };
      default:
        return {
          bg: 'bg-slate-600/10',
          border: 'border-slate-500/30',
          icon: 'text-slate-400',
        };
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'conversation':
        return <MessageSquare className="w-5 h-5" />;
      case 'source':
        return <FileText className="w-5 h-5" />;
      case 'code':
        return <Code className="w-5 h-5" />;
      case 'group':
        return <Maximize2 className="w-5 h-5" />;
      default:
        return <FileText className="w-5 h-5" />;
    }
  };

  const colors = getTypeColor(node.type);

  return (
    <div
      className={`
        absolute w-64 p-4 rounded-lg border backdrop-blur-sm cursor-pointer
        transition-all duration-200
        ${colors.bg} ${colors.border}
        ${selected ? 'ring-2 ring-purple-500 shadow-lg shadow-purple-500/20' : 'hover:shadow-md'}
      `}
      style={{
        left: node.position.x,
        top: node.position.y,
        ...style,
      }}
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
      draggable
      onDragStart={onDragStart}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 ${colors.bg} rounded-lg ${colors.icon}`}>
          {getIcon(node.type)}
        </div>
        <button className="p-1 hover:bg-slate-700/50 rounded transition-colors">
          <MoreVertical className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-white mb-1 line-clamp-2">
        {node.data.title}
      </h3>

      {/* Subtitle */}
      {node.data.subtitle && (
        <p className="text-xs text-slate-400 mb-3 line-clamp-1">{node.data.subtitle}</p>
      )}

      {/* Metadata badges */}
      {node.data.metadata && Object.keys(node.data.metadata).length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-700/50">
          {Object.entries(node.data.metadata).slice(0, 3).map(([key, value]) => (
            <span
              key={key}
              className="px-2 py-1 bg-slate-800/50 rounded text-xs text-slate-400"
            >
              {key}: {String(value)}
            </span>
          ))}
        </div>
      )}

      {/* Selection indicator */}
      {selected && (
        <div className="absolute top-2 right-2 w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
      )}
    </div>
  );
}
