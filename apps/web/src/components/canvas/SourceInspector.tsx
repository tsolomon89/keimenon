'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Calendar,
  Hash,
  Tag,
  Code,
  Copy,
  ExternalLink,
  Trash2,
  Eye,
} from 'lucide-react';
import { InspectorData } from '@/types/keimenon';

interface SourceInspectorProps {
  data: InspectorData | null;
  onAction?: (actionLabel: string) => void;
  onViewFullDetails?: () => void;
}

export function SourceInspector({ data, onAction, onViewFullDetails }: SourceInspectorProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['details', 'metadata'])
  );

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (expandedSections.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const formatValue = (value: string | number, type?: 'text' | 'number' | 'date' | 'badge') => {
    if (type === 'date') {
      return new Date(value as number).toLocaleString();
    }
    if (type === 'badge') {
      return (
        <span className="px-2 py-0.5 bg-purple-600/20 border border-purple-500/30 rounded text-xs text-purple-400">
          {value}
        </span>
      );
    }
    return value;
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'conversation':
        return <MessageSquare className="w-5 h-5 text-purple-400" />;
      case 'source_doc':
        return <Tag className="w-5 h-5 text-green-400" />;
      case 'code_asset':
        return <Code className="w-5 h-5 text-orange-400" />;
      default:
        return <Tag className="w-5 h-5 text-gray-400" />;
    }
  };

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-sm text-slate-500 px-6">
        <Tag className="w-16 h-16 mb-4 text-slate-600" />
        <p className="font-medium">No selection</p>
        <p className="mt-2 text-xs">Select a source from the tree or keimenon to view details</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-start gap-3 mb-3">
          <div className="p-2 bg-slate-800 rounded-lg">{getTypeIcon(data.type)}</div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-white truncate">{data.title}</h3>
            <p className="text-xs text-slate-400 mt-1">{data.type}</p>
          </div>
        </div>

        {/* View Full Details Button */}
        {onViewFullDetails && (
          <button
            onClick={onViewFullDetails}
            className="w-full px-3 py-2 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors text-purple-400"
          >
            <Eye className="w-4 h-4" />
            View Full Details
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Details Section */}
        <div className="border-b border-slate-800">
          <button
            onClick={() => toggleSection('details')}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-800/50 transition-colors"
          >
            <span className="text-sm font-medium">Details</span>
            {expandedSections.has('details') ? (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {expandedSections.has('details') && (
            <div className="px-4 pb-4 space-y-3">
              {data.details.map((detail, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    {detail.label === 'Messages' && <MessageSquare className="w-3 h-3" />}
                    {detail.label === 'Created' && <Calendar className="w-3 h-3" />}
                    {detail.label === 'Characters' && <Hash className="w-3 h-3" />}
                    <span>{detail.label}</span>
                  </div>
                  <div className="text-sm text-white">{formatValue(detail.value, detail.type)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Metadata Section */}
        {Object.keys(data.metadata).length > 0 && (
          <div className="border-b border-slate-800">
            <button
              onClick={() => toggleSection('metadata')}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-800/50 transition-colors"
            >
              <span className="text-sm font-medium">Metadata</span>
              {expandedSections.has('metadata') ? (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {expandedSections.has('metadata') && (
              <div className="px-4 pb-4">
                <div className="bg-slate-800/50 rounded-lg p-3 space-y-2">
                  {Object.entries(data.metadata).map(([key, value]) => (
                    <div key={key} className="flex justify-between text-xs">
                      <span className="text-slate-400">{key}:</span>
                      <span className="text-white font-mono">
                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions Section */}
        {data.actions && data.actions.length > 0 && (
          <div className="p-4">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Actions
            </h4>
            <div className="space-y-2">
              {data.actions.map((action, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    action.onClick();
                    onAction?.(action.label);
                  }}
                  className="w-full px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-left flex items-center gap-2 transition-colors"
                >
                  {action.icon === 'copy' && <Copy className="w-4 h-4 text-slate-400" />}
                  {action.icon === 'link' && <ExternalLink className="w-4 h-4 text-slate-400" />}
                  {action.icon === 'delete' && <Trash2 className="w-4 h-4 text-red-400" />}
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
