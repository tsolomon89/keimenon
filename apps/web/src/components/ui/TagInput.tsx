'use client';

import { useState, KeyboardEvent } from 'react';
import { X } from 'lucide-react';

interface TagInputProps {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function TagInput({ tags, onTagsChange, placeholder, className }: TagInputProps) {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      if (!tags.includes(inputValue.trim())) {
        onTagsChange([...tags, inputValue.trim()]);
      }
      setInputValue('');
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      // Remove last tag when backspace on empty input
      onTagsChange(tags.slice(0, -1));
    }
  };

  const removeTag = (index: number) => {
    onTagsChange(tags.filter((_, i) => i !== index));
  };

  return (
    <div
      className={`flex flex-wrap gap-2 p-2 bg-slate-900 border border-slate-700 rounded-lg focus-within:border-purple-500 transition-colors ${className}`}
    >
      {tags.map((tag, index) => (
        <div
          key={index}
          className="flex items-center gap-1 px-2 py-1 bg-purple-600/20 text-purple-300 rounded text-sm"
        >
          <span>{tag}</span>
          <button
            type="button"
            onClick={() => removeTag(index)}
            className="hover:bg-purple-600/30 rounded p-0.5 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}

      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={tags.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[120px] bg-transparent outline-none text-sm placeholder:text-slate-500"
      />
    </div>
  );
}
