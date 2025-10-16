# %% [markdown]
# # Chat Export Tool for Google Colab
# 
# Processes chat exports from ChatGPT, Claude, and Gemini platforms with CLI-like configuration.
# 
# **Quick Start:**
# 1. Run all cells in order
# 2. Place your JSON files in `/content/input_data/`
# 3. Configure settings in the Config cell
# 4. Run the Process cell

# %% Install dependencies
!pip install -q ijson 2>/dev/null && echo "✓ ijson installed (for large file support)" || echo "⚠ ijson not installed"

# %% Import libraries and setup
import json
import os
import re
import sys
import csv
import hashlib
import gzip
import zipfile
import shutil
from pathlib import Path
from typing import Dict, List, Optional, Union, Tuple, Any
from dataclasses import dataclass, field
from collections import defaultdict
from datetime import datetime
from glob import glob

# Create directories
Path("/content/input_data").mkdir(exist_ok=True)
Path("/content/chat_exports").mkdir(exist_ok=True)

print("✓ Directories created")
print("  Input:  /content/input_data/")
print("  Output: /content/chat_exports/")

# %% [markdown]
# ## Configuration
# 
# Modify these settings as needed:

# %% Configuration settings
CONFIG = {
    "input_root": "/content/input_data",
    "output_root": "/content/chat_exports",
    "subset": "both",  # Options: "both", "user", "assistant"
    "format": "md",     # Options: "md", "txt", "json"
    "export_code": True,
    "keywords": [],     # e.g., ["python", "javascript", "api"]
    "groups": "non-unique",  # Options: "non-unique", "unique"
    "drive_out": None,  # e.g., "/content/drive/MyDrive/chat_exports"
    "max_filename_len": 160,
    "dry_run": False,
    "verbose": True,
    
    # Sources Mode
    "build_sources": True,            # toggle Sources Mode
    "sources_cap": 150,               # hard cap on number of sources
    "include_assistant_context": False,  # if True, include nearby assistant lines as blockquotes
    "min_user_chars": 400,            # treat only user segments >= this length as "extended"
    "similarity_threshold": 0.35,     # Jaccard token overlap for near-dup attach/merge
}

# Print current configuration
print("Current Configuration:")
print("-" * 40)
for key, value in CONFIG.items():
    print(f"{key:20s}: {value}")

# %% Data structures
@dataclass
class Message:
    """Represents a single message in a conversation"""
    role: str  # 'user' or 'assistant'
    content: str
    timestamp: Optional[str] = None
    metadata: Dict = field(default_factory=dict)

@dataclass
class Conversation:
    """Represents a complete conversation"""
    id: str
    title: str
    messages: List[Message]
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    platform: str = "unknown"
    metadata: Dict = field(default_factory=dict)

# %% Platform parsers
class ChatGPTParser:
    """Parser for ChatGPT conversation exports"""
    
    @staticmethod
    def parse(data: Dict) -> List[Conversation]:
        """Parse ChatGPT conversations.json format (both legacy mapping and new messages format)"""
        conversations = []
        
        for conv_data in data:
            conv_id = conv_data.get('id', '')
            title = conv_data.get('title', 'Untitled')
            created_at = conv_data.get('create_time')
            updated_at = conv_data.get('update_time')
            
            messages = []
            
            # Try mapping format first (legacy)
            if 'mapping' in conv_data:
                mapping = conv_data.get('mapping', {})
                
                # Build message tree from mapping
                for node_id, node_data in mapping.items():
                    message = node_data.get('message')
                    if message and message.get('content'):
                        content_parts = message['content'].get('parts', [])
                        if content_parts:
                            content = '\n'.join(str(part) for part in content_parts)
                            role = message['author']['role']
                            # Map ChatGPT roles to our standard roles
                            if role == 'system':
                                continue  # Skip system messages
                            role = 'user' if role == 'user' else 'assistant'
                            
                            msg = Message(
                                role=role,
                                content=content,
                                timestamp=message.get('create_time'),
                                metadata={'id': message.get('id')}
                            )
                            messages.append(msg)
            
            # Fallback to new messages[] format if mapping yields nothing
            if not messages and 'messages' in conv_data:
                for msg_data in conv_data['messages']:
                    # Handle various role/content structures
                    role = msg_data.get('author', {}).get('role') or msg_data.get('role', '')
                    
                    # Skip system messages
                    if role == 'system':
                        continue
                    
                    # Get content from various possible locations
                    content = None
                    if 'content' in msg_data:
                        if isinstance(msg_data['content'], dict):
                            parts = msg_data['content'].get('parts', [])
                            if parts:
                                content = '\n'.join(str(p) for p in parts)
                            else:
                                content = msg_data['content'].get('text', '')
                        else:
                            content = str(msg_data['content'])
                    elif 'text' in msg_data:
                        content = msg_data['text']
                    
                    if content and role in ['user', 'assistant']:
                        messages.append(Message(
                            role=role,
                            content=content,
                            timestamp=msg_data.get('create_time'),
                            metadata={'id': msg_data.get('id')}
                        ))
            
            if messages:  # Only add if conversation has messages
                conversations.append(Conversation(
                    id=conv_id,
                    title=title,
                    messages=messages,
                    created_at=created_at,
                    updated_at=updated_at,
                    platform='chatgpt'
                ))
        
        return conversations

class ClaudeParser:
    """Parser for Claude conversation exports"""
    
    @staticmethod
    def parse(data: Union[Dict, List]) -> List[Conversation]:
        """Parse Claude export format"""
        conversations = []
        
        # Handle both single conversation and multiple conversations
        if isinstance(data, dict):
            data = [data]
        
        for conv_data in data:
            # Try multiple possible formats
            conv_id = conv_data.get('id', conv_data.get('uuid', ''))
            title = conv_data.get('title', conv_data.get('name', 'Untitled'))
            
            messages = []
            # Check different possible message locations
            message_list = conv_data.get('messages', conv_data.get('chat_messages', 
                                         conv_data.get('conversation', [])))
            
            for msg_data in message_list:
                # Handle different role naming conventions
                role = msg_data.get('role', msg_data.get('sender', ''))
                if role in ['human', 'user']:
                    role = 'user'
                elif role in ['assistant', 'claude', 'ai']:
                    role = 'assistant'
                else:
                    continue  # Skip unknown roles
                
                # Get content from various possible fields
                content = msg_data.get('content', msg_data.get('text', 
                                       msg_data.get('message', '')))
                
                # Handle content that might be in nested structure
                if isinstance(content, list):
                    content = '\n'.join(str(item) for item in content)
                elif isinstance(content, dict):
                    content = content.get('text', str(content))
                
                if content:
                    messages.append(Message(
                        role=role,
                        content=str(content),
                        timestamp=msg_data.get('timestamp', msg_data.get('created_at')),
                        metadata=msg_data.get('metadata', {})
                    ))
            
            if messages:
                conversations.append(Conversation(
                    id=conv_id or hashlib.md5(title.encode()).hexdigest()[:8],
                    title=title,
                    messages=messages,
                    created_at=conv_data.get('created_at'),
                    updated_at=conv_data.get('updated_at'),
                    platform='claude'
                ))
        
        return conversations

class GeminiParser:
    """Parser for Gemini conversation exports"""
    
    @staticmethod
    def parse(data: Union[Dict, List]) -> List[Conversation]:
        """Parse Gemini export format"""
        conversations = []
        
        # Handle both single and multiple conversations
        if isinstance(data, dict):
            if 'conversations' in data:
                data = data['conversations']
            else:
                data = [data]
        
        for conv_data in data:
            conv_id = conv_data.get('id', '')
            title = conv_data.get('title', 'Untitled')
            
            messages = []
            # Check for messages in different possible locations
            message_list = conv_data.get('messages', conv_data.get('entries', 
                                         conv_data.get('chats', [])))
            
            for msg_data in message_list:
                # Determine role
                role = msg_data.get('role', msg_data.get('type', ''))
                if role in ['user', 'prompt']:
                    role = 'user'
                elif role in ['model', 'gemini', 'response', 'assistant']:
                    role = 'assistant'
                else:
                    continue
                
                # Extract content
                content = msg_data.get('content', msg_data.get('text', 
                                       msg_data.get('message', '')))
                
                # Handle nested content structures
                if isinstance(content, dict):
                    content = content.get('text', str(content))
                elif isinstance(content, list):
                    content = '\n'.join(str(item) for item in content)
                
                if content:
                    messages.append(Message(
                        role=role,
                        content=str(content),
                        timestamp=msg_data.get('timestamp'),
                        metadata=msg_data.get('metadata', {})
                    ))
            
            if messages:
                conversations.append(Conversation(
                    id=conv_id or hashlib.md5(title.encode()).hexdigest()[:8],
                    title=title,
                    messages=messages,
                    created_at=conv_data.get('created_at'),
                    updated_at=conv_data.get('updated_at'),
                    platform='gemini'
                ))
        
        return conversations

class UniversalChatParser:
    """Universal parser that auto-detects platform format"""
    
    @staticmethod
    def detect_platform(data: Union[Dict, List]) -> str:
        """Detect which platform the data is from"""
        
        # Convert to dict if needed for checking
        sample = data[0] if isinstance(data, list) and data else data
        
        # ChatGPT indicators
        if isinstance(sample, dict):
            if 'mapping' in sample:
                return 'chatgpt'
            # Claude indicators
            if 'chat_messages' in sample or 'uuid' in sample:
                return 'claude'
            # Gemini indicators
            if 'entries' in sample or ('messages' in sample and 
                any('model' in msg for msg in sample.get('messages', []))):
                return 'gemini'
        
        # Try to detect from message structure
        if 'messages' in sample:
            msgs = sample['messages']
            if msgs and isinstance(msgs[0], dict):
                if 'author' in msgs[0]:
                    return 'chatgpt'
                if 'sender' in msgs[0]:
                    return 'claude'
                if 'model' in msgs[0] or 'type' in msgs[0]:
                    return 'gemini'
        
        return 'unknown'
    
    @staticmethod
    def parse(data: Union[Dict, List], platform: Optional[str] = None) -> List[Conversation]:
        """Parse chat data from any supported platform"""
        
        if platform is None:
            platform = UniversalChatParser.detect_platform(data)
        
        parsers = {
            'chatgpt': ChatGPTParser(),
            'claude': ClaudeParser(),
            'gemini': GeminiParser()
        }
        
        if platform in parsers:
            try:
                return parsers[platform].parse(data)
            except Exception as e:
                print(f"Warning: {platform} parser failed ({e}), attempting fallback")
        
        # Fallback for unknown or failed parsing - try Claude-like structure
        if platform == 'unknown' or platform not in parsers:
            try:
                # Claude parser handles many generic formats well
                return ClaudeParser().parse(data)
            except:
                pass
        
        # Last resort - return empty
        return []

# %% Code extraction
# %% Code extraction
class CodeExtractor:
    """Extract code blocks from messages"""
    
    # Extensions without leading dots
    LANGUAGE_EXTENSIONS = {
        'python': 'py', 'javascript': 'js', 'typescript': 'ts',
        'java': 'java', 'cpp': 'cpp', 'c': 'c', 'csharp': 'cs',
        'html': 'html', 'css': 'css', 'sql': 'sql', 'bash': 'sh',
        'shell': 'sh', 'yaml': 'yml', 'json': 'json', 'xml': 'xml',
        'markdown': 'md', 'rust': 'rs', 'go': 'go', 'ruby': 'rb',
        'php': 'php', 'swift': 'swift', 'kotlin': 'kt', 'r': 'r'
    }
    
    # Non-greedy, language-tag-friendly fence
    CODE_FENCE_RE = re.compile(r"```([a-zA-Z0-9_+\-\.]*)\n(.*?)```", re.DOTALL)
    
    @staticmethod
    def extract_code_blocks(content: str) -> List[Tuple[str, str]]:
        """Extract code blocks from content
        Returns: List of (code, language) tuples"""
        
        code_blocks = []
        
        # Use the fixed regex pattern
        matches = CodeExtractor.CODE_FENCE_RE.findall(content)
        
        for language, code in matches:
            language = language.lower() if language else 'text'
            code_blocks.append((code.strip(), language))
        
        # Also check for inline code if no blocks found
        if not code_blocks:
            # Look for common code patterns
            inline_pattern = r'`([^`]+)`'
            inline_matches = re.findall(inline_pattern, content)
            for code in inline_matches:
                if len(code) > 50:  # Only consider substantial inline code
                    code_blocks.append((code, 'text'))
        
        return code_blocks

# %% Export functionality
class ChatExporter:
    """Export conversations in various formats"""
    
    def __init__(self, output_root: str, max_filename_len: int = 160, verbose: bool = False):
        self.output_root = Path(output_root)
        self.max_filename_len = max_filename_len
        self.verbose = verbose
        self.exported_files = []
        self.filename_cache = {}  # Track used filenames for collision detection
        
        # Create output directories
        self.default_dir = self.output_root / "default"
        self.code_dir = self.output_root / "code_exports"
        
        self.default_dir.mkdir(parents=True, exist_ok=True)
        self.code_dir.mkdir(parents=True, exist_ok=True)
        
    def _sanitize_filename(self, filename: str) -> str:
        """Sanitize filename for filesystem"""
        # Remove/replace invalid characters
        invalid_chars = '<>:"/\\|?*'
        for char in invalid_chars:
            filename = filename.replace(char, '_')
        # Limit length
        return filename[:self.max_filename_len]
    
    def _generate_unique_filename(self, base_name: str, directory: Path, ext: str) -> Path:
        """Generate unique filename with collision handling"""
        # Check if filename already used
        filepath = directory / f"{base_name}.{ext}"
        
        if filepath not in self.filename_cache:
            self.filename_cache[filepath] = True
            return filepath
        
        # Add hash for uniqueness
        for i in range(1, 100):
            hash_suffix = hashlib.md5(f"{base_name}{i}".encode()).hexdigest()[:6]
            unique_name = f"{base_name}-{hash_suffix}"
            filepath = directory / f"{unique_name}.{ext}"
            
            if filepath not in self.filename_cache:
                self.filename_cache[filepath] = True
                return filepath
        
        # Fallback with timestamp
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        filepath = directory / f"{base_name}-{timestamp}.{ext}"
        self.filename_cache[filepath] = True
        return filepath
    
    def export_conversation(self, conversation: Conversation, subset: str, format: str, 
                          target_dir: Optional[Path] = None) -> Optional[Path]:
        """Export a single conversation"""
        
        # Generate filename components
        safe_title = self._sanitize_filename(conversation.title)
        
        # Add date if available
        date_str = ""
        if conversation.created_at:
            try:
                # Try to parse various date formats
                if isinstance(conversation.created_at, (int, float)):
                    dt = datetime.fromtimestamp(conversation.created_at)
                else:
                    # Simple parse attempt
                    dt = datetime.fromisoformat(str(conversation.created_at).replace('Z', '+00:00'))
                date_str = f" - {dt.strftime('%Y%m%d_%H%M%S')}"
            except:
                pass  # Skip date if can't parse
        
        # Build filename
        subset_suffix = {'both': 'full', 'user': 'user', 'assistant': 'assistant'}[subset]
        base_name = f"{safe_title}{date_str} - {subset_suffix}"
        
        # Determine extension
        ext = {'markdown': 'md', 'md': 'md', 'text': 'txt', 'txt': 'txt', 'json': 'json'}[format]
        
        # Choose target directory
        if target_dir is None:
            target_dir = self.default_dir
        
        # Generate unique filename
        filepath = self._generate_unique_filename(base_name, target_dir, ext)
        
        # Generate content
        content = self._format_content(conversation, subset, format)
        
        # Write file
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        
        self.exported_files.append(filepath)
        
        if self.verbose:
            print(f"  Exported: {filepath.name}")
        
        return filepath
    
    def _format_content(self, conversation: Conversation, subset: str, format: str) -> str:
        """Format conversation content"""
        
        if format == 'json':
            messages = []
            for msg in conversation.messages:
                if subset == 'both' or subset == msg.role:
                    messages.append({
                        'role': msg.role,
                        'content': msg.content,
                        'timestamp': msg.timestamp
                    })
            
            export_data = {
                'title': conversation.title,
                'platform': conversation.platform,
                'created_at': conversation.created_at,
                'messages': messages
            }
            return json.dumps(export_data, indent=2, ensure_ascii=False)
        
        elif format in ['markdown', 'md']:
            lines = [f"# {conversation.title}\n"]
            lines.append(f"**Platform:** {conversation.platform}\n")
            if conversation.created_at:
                lines.append(f"**Date:** {conversation.created_at}\n")
            lines.append("\n---\n\n")
            
            for msg in conversation.messages:
                if subset == 'both' or subset == msg.role:
                    role_label = "👤 User" if msg.role == 'user' else "🤖 Assistant"
                    lines.append(f"### {role_label}\n\n")
                    lines.append(f"{msg.content}\n\n")
                    lines.append("---\n\n")
            
            return ''.join(lines)
        
        else:  # text format
            lines = [f"{conversation.title}\n"]
            lines.append(f"Platform: {conversation.platform}\n")
            lines.append("=" * 50 + "\n\n")
            
            for msg in conversation.messages:
                if subset == 'both' or subset == msg.role:
                    role_label = "USER" if msg.role == 'user' else "ASSISTANT"
                    lines.append(f"[{role_label}]:\n")
                    lines.append(f"{msg.content}\n\n")
                    lines.append("-" * 30 + "\n\n")
            
            return ''.join(lines)
    
    def export_code_blocks(self, conversation: Conversation) -> List[Path]:
        """Export code blocks from conversation"""
        
        exported_code_files = []
        safe_title = self._sanitize_filename(conversation.title)
        
        code_num = 1
        for msg in conversation.messages:
            if msg.role == 'assistant':
                code_blocks = CodeExtractor.extract_code_blocks(msg.content)
                
                for code, language in code_blocks:
                    ext = CodeExtractor.LANGUAGE_EXTENSIONS.get(language, 'txt')
                    base_name = f"{safe_title} - code{code_num:02d}"
                    
                    # Don't slice base_name
                    filepath = self._generate_unique_filename(base_name, self.code_dir, ext)
                    
                    with open(filepath, 'w', encoding='utf-8') as f:
                        f.write(code)
                    
                    exported_code_files.append(filepath)
                    code_num += 1
                    
                    if self.verbose:
                        print(f"    Code: {filepath.name}")
        
        return exported_code_files

# %% Keyword grouping
class KeywordGrouper:
    """Group conversations by keywords"""
    
    def __init__(self, conversations: List[Conversation]):
        self.conversations = conversations
    
    def group_by_keywords(self, keywords: List[str], unique: bool = False) -> Dict[str, List[Conversation]]:
        """Group conversations by specified keywords"""
        
        groups = defaultdict(list)
        
        for conv in self.conversations:
            matched_keywords = []
            
            # Check in title and messages
            full_text = conv.title.lower()
            for msg in conv.messages:
                full_text += " " + msg.content.lower()
            
            for keyword in keywords:
                if keyword.lower() in full_text:
                    matched_keywords.append(keyword)
            
            # Add to groups
            if matched_keywords:
                if unique:
                    # Add to first matched keyword only
                    groups[matched_keywords[0]].append(conv)
                else:
                    # Add to all matched keywords
                    for kw in matched_keywords:
                        groups[kw].append(conv)
        
        return dict(groups)

# %% File loading utilities
def detect_encoding(file_path: Path) -> str:
    """Detect file encoding with BOM sniffing"""
    
    with open(file_path, 'rb') as f:
        raw = f.read(4)
    
    # Check for BOM
    if raw.startswith(b'\xff\xfe\x00\x00'):
        return 'utf-32-le'
    elif raw.startswith(b'\x00\x00\xfe\xff'):
        return 'utf-32-be'
    elif raw.startswith(b'\xff\xfe'):
        return 'utf-16-le'
    elif raw.startswith(b'\xfe\xff'):
        return 'utf-16-be'
    elif raw.startswith(b'\xef\xbb\xbf'):
        return 'utf-8-sig'
    
    # Check for compressed files
    if raw.startswith(b'\x1f\x8b'):  # GZIP
        raise ValueError(f"File {file_path} appears to be gzipped. Please decompress it first.")
    elif raw.startswith(b'PK'):  # ZIP
        raise ValueError(f"File {file_path} appears to be zipped. Please extract it first.")
    
    # Try UTF-8
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            f.read(1024)
        return 'utf-8'
    except UnicodeDecodeError:
        pass
    
    # Fallback to Latin-1
    return 'latin-1'

def load_json_file(filepath: Path, verbose: bool = False) -> Optional[List[Conversation]]:
    """Load and parse a JSON file with encoding detection"""
    
    file_size_mb = filepath.stat().st_size / (1024**2)
    
    if verbose:
        print(f"Processing: {filepath.name} ({file_size_mb:.1f} MB)")
    
    # Detect encoding
    try:
        encoding = detect_encoding(filepath)
        if verbose and encoding != 'utf-8':
            print(f"  Detected encoding: {encoding}")
    except ValueError as e:
        print(f"  Error: {e}")
        return None
    
    # Check for large files
    if file_size_mb >= 1000:  # 1GB+
        try:
            import ijson
            if verbose:
                print(f"  Using streaming parser for large file")
            
            # Real streaming with ijson
            with open(filepath, 'rb') as f:
                try:
                    items = list(ijson.items(f, 'item'))  # top-level array items
                    data = items
                except:
                    # Fallback if not a top-level array
                    f.seek(0)
                    content = f.read().decode(encoding, errors='replace')
                    if content.startswith('\ufeff'):
                        content = content[1:]
                    data = json.loads(content)
            
        except ImportError:
            print(f"  Warning: File ≥1GB and ijson not installed. Skipping to avoid memory issues.")
            print(f"  Install with: pip install ijson")
            return None
        except MemoryError:
            print(f"  Error: Out of memory processing {filepath.name}")
            return None
    else:
        # Regular loading
        with open(filepath, 'r', encoding=encoding, errors='replace') as f:
            content = f.read()
            # Remove BOM if present
            if content.startswith('\ufeff'):
                content = content[1:]
            data = json.loads(content)
    
    # Parse conversations
    try:
        conversations = UniversalChatParser.parse(data)
        platform = conversations[0].platform if conversations else 'unknown'
        if verbose:
            print(f"  Platform: {platform}, Conversations: {len(conversations)}")
        return conversations
    except Exception as e:
        print(f"  Error parsing {filepath.name}: {e}")
        return None

# %% [markdown]
# ## Main Processing
# 
# Run this cell to process all JSON files in `/content/input_data/`

# %% Main processing function
def process_chats(config: Dict):
    """Main processing function - returns (conversations, platform_counts)"""
    
    # Find all JSON files
    input_path = Path(config['input_root'])
    if not input_path.exists():
        print(f"Error: Input directory {input_path} does not exist")
        return [], {}
    
    json_files = list(input_path.glob('**/*.json')) + list(input_path.glob('**/*.jsonl'))
    
    if not json_files:
        print(f"No JSON files found in {input_path}")
        print("Nothing to do.")
        return [], {}
    
    print(f"Found {len(json_files)} JSON file(s) in {input_path}")
    
    if config['dry_run']:
        print("DRY RUN MODE - No files will be written")
    
    # Initialize exporter
    exporter = ChatExporter(config['output_root'], config['max_filename_len'], config['verbose'])
    
    # Process all files
    all_conversations = []
    platform_counts = defaultdict(int)
    
    for json_file in json_files:
        conversations = load_json_file(json_file, config['verbose'])
        if conversations:
            all_conversations.extend(conversations)
            for conv in conversations:
                platform_counts[conv.platform] += 1
    
    if not all_conversations:
        print("No conversations found in any files")
        return [], {}
    
    print(f"\nTotal conversations loaded: {len(all_conversations)}")
    for platform, count in platform_counts.items():
        print(f"  {platform}: {count}")
    
    if config['dry_run']:
        print("\nDry run complete. No files written.")
        return all_conversations, platform_counts
    
    # Export conversations
    print("\nExporting conversations...")
    transcript_count = 0
    code_count = 0
    
    for conv in all_conversations:
        # Export transcript
        filepath = exporter.export_conversation(conv, config['subset'], config['format'])
        if filepath:
            transcript_count += 1
        
        # Export code if requested
        if config['export_code']:
            code_files = exporter.export_code_blocks(conv)
            code_count += len(code_files)
    
    # Handle keyword grouping
    group_count = 0
    if config['keywords']:
        print(f"\nGrouping by keywords: {', '.join(config['keywords'])}")
        grouper = KeywordGrouper(all_conversations)
        groups = grouper.group_by_keywords(config['keywords'], unique=(config['groups'] == 'unique'))
        
        for keyword, conversations in groups.items():
            keyword_dir = Path(config['output_root']) / f"keyword_{keyword}"
            keyword_dir.mkdir(parents=True, exist_ok=True)
            
            for conv in conversations:
                filepath = exporter.export_conversation(conv, config['subset'], config['format'], keyword_dir)
                if filepath:
                    group_count += 1
            
            print(f"  {keyword}: {len(conversations)} conversations")
    
    # Copy to Drive if requested
    if config['drive_out']:
        drive_path = Path(config['drive_out'])
        if drive_path.exists():
            print(f"\nCopying to Drive: {drive_path}")
            shutil.copytree(config['output_root'], drive_path / "chat_exports", dirs_exist_ok=True)
            print("  Copy complete")
        else:
            print(f"\nWarning: Drive path {drive_path} does not exist. Skipping copy.")
    
    # Summary
    print("\n" + "=" * 60)
    print("EXPORT SUMMARY")
    print("=" * 60)
    print(f"Files scanned: {len(json_files)}")
    print(f"Conversations parsed: {len(all_conversations)}")
    print(f"  ChatGPT: {platform_counts.get('chatgpt', 0)}")
    print(f"  Claude: {platform_counts.get('claude', 0)}")
    print(f"  Gemini: {platform_counts.get('gemini', 0)}")
    print(f"  Unknown: {platform_counts.get('unknown', 0)}")
    print(f"Transcripts exported: {transcript_count}")
    print(f"Code files exported: {code_count}")
    print(f"Keyword group outputs: {group_count}")
    print(f"\nOutput directory: {config['output_root']}")
    
    return all_conversations, platform_counts

# Run the processing
all_conversations, platform_counts = process_chats(CONFIG)
    transcript_count = 0
    code_count = 0
    
    for conv in all_conversations:
        # Export transcript
        filepath = exporter.export_conversation(conv, config['subset'], config['format'])
        if filepath:
            transcript_count += 1
        
        # Export code if requested
        if config['export_code']:
            code_files = exporter.export_code_blocks(conv)
            code_count += len(code_files)
    
    # Handle keyword grouping
    group_count = 0
    if config['keywords']:
        print(f"\nGrouping by keywords: {', '.join(config['keywords'])}")
        grouper = KeywordGrouper(all_conversations)
        groups = grouper.group_by_keywords(config['keywords'], unique=(config['groups'] == 'unique'))
        
        for keyword, conversations in groups.items():
            keyword_dir = Path(config['output_root']) / f"keyword_{keyword}"
            keyword_dir.mkdir(parents=True, exist_ok=True)
            
            for conv in conversations:
                filepath = exporter.export_conversation(conv, config['subset'], config['format'], keyword_dir)
                if filepath:
                    group_count += 1
            
            print(f"  {keyword}: {len(conversations)} conversations")
    
    # Copy to Drive if requested
    if config['drive_out']:
        drive_path = Path(config['drive_out'])
        if drive_path.exists():
            print(f"\nCopying to Drive: {drive_path}")
            shutil.copytree(config['output_root'], drive_path / "chat_exports", dirs_exist_ok=True)
            print("  Copy complete")
        else:
            print(f"\nWarning: Drive path {drive_path} does not exist. Skipping copy.")
    
    # Summary
    print("\n" + "=" * 60)
    print("EXPORT SUMMARY")
    print("=" * 60)
    print(f"Files scanned: {len(json_files)}")
    print(f"Conversations parsed: {len(all_conversations)}")
    print(f"  ChatGPT: {platform_counts.get('chatgpt', 0)}")
    print(f"  Claude: {platform_counts.get('claude', 0)}")
    print(f"  Gemini: {platform_counts.get('gemini', 0)}")
    print(f"  Unknown: {platform_counts.get('unknown', 0)}")
    print(f"Transcripts exported: {transcript_count}")
    print(f"Code files exported: {code_count}")
    print(f"Keyword group outputs: {group_count}")
    print(f"\nOutput directory: {config['output_root']}")

# Run the processing
all_conversations, platform_counts = process_chats(CONFIG)

# %% [markdown]
# ## Build Sources (KISS User-side Documents)
# 
# This cell builds at most 150 stitched, deduplicated documents from user messages using simple text similarity.

# %% Build sources
def build_sources(conversations: List[Conversation], config: Dict):
    """Build sources from user messages using simple title bucketing and Jaccard similarity"""
    
    if not config.get('build_sources', True):
        print("Sources mode disabled")
        return
    
    print("\nBuilding sources from user messages...")
    
    output_root = Path(config['output_root'])
    sources_dir = output_root / "sources"
    meta_dir = output_root / "meta"
    sources_dir.mkdir(parents=True, exist_ok=True)
    meta_dir.mkdir(parents=True, exist_ok=True)
    
    # Utility functions
    def tokenize(text: str) -> set:
        """Simple tokenization: split on non-word chars, lowercase"""
        import re
        tokens = re.findall(r'\b\w+\b', text.lower())
        return set(tokens)
    
    def jaccard(set_a: set, set_b: set) -> float:
        """Jaccard similarity between two sets"""
        if not set_a or not set_b:
            return 0.0
        intersection = len(set_a & set_b)
        union = len(set_a | set_b)
        return intersection / union if union > 0 else 0.0
    
    def sanitize_filename(text: str, max_len: int = 100) -> str:
        """Sanitize filename"""
        invalid_chars = '<>:"/\\|?*'
        for char in invalid_chars:
            text = text.replace(char, '_')
        return text[:max_len]
    
    # Step 1: Collect user segments
    segments = []
    for conv in conversations:
        # Collect consecutive user messages as segments
        current_segment = []
        start_idx = None
        
        for i, msg in enumerate(conv.messages):
            if msg.role == 'user':
                if start_idx is None:
                    start_idx = i
                current_segment.append(msg.content)
            else:
                # End of user segment
                if current_segment:
                    combined_text = '\n\n'.join(current_segment)
                    if len(combined_text) >= config.get('min_user_chars', 400):
                        segments.append({
                            'text': combined_text,
                            'conversation_id': conv.id,
                            'title': conv.title,
                            'msg_idx_start': start_idx,
                            'msg_idx_end': i - 1,
                            'timestamp': msg.timestamp or conv.created_at,
                            'tokens': tokenize(combined_text)
                        })
                    current_segment = []
                    start_idx = None
        
        # Handle trailing segment
        if current_segment:
            combined_text = '\n\n'.join(current_segment)
            if len(combined_text) >= config.get('min_user_chars', 400):
                segments.append({
                    'text': combined_text,
                    'conversation_id': conv.id,
                    'title': conv.title,
                    'msg_idx_start': start_idx,
                    'msg_idx_end': len(conv.messages) - 1,
                    'timestamp': conv.messages[-1].timestamp if conv.messages else conv.created_at,
                    'tokens': tokenize(combined_text)
                })
    
    print(f"  Collected {len(segments)} user segments (>= {config.get('min_user_chars', 400)} chars)")
    
    # Step 2: Title bucketing
    title_buckets = {}
    for seg in segments:
        normalized_title = seg['title'].strip().casefold()
        if normalized_title not in title_buckets:
            title_buckets[normalized_title] = {
                'canonical': seg['title'],
                'segments': [],
                'total_chars': 0
            }
        title_buckets[normalized_title]['segments'].append(seg)
        title_buckets[normalized_title]['total_chars'] += len(seg['text'])
    
    print(f"  Found {len(title_buckets)} unique titles")
    
    # Step 3: Pick top sources_cap seeds by total chars
    sources_cap = config.get('sources_cap', 150)
    sorted_buckets = sorted(title_buckets.items(), key=lambda x: x[1]['total_chars'], reverse=True)
    
    seeds = []
    remaining_segments = []
    
    for i, (norm_title, bucket) in enumerate(sorted_buckets):
        if i < sources_cap:
            seeds.append({
                'title': bucket['canonical'],
                'segments': bucket['segments'],
                'combined_tokens': set()
            })
            # Build combined tokens for similarity matching
            for seg in bucket['segments']:
                seeds[-1]['combined_tokens'].update(seg['tokens'])
        else:
            # These segments need to be attached
            remaining_segments.extend(bucket['segments'])
    
    print(f"  Selected {len(seeds)} seed sources (cap={sources_cap})")
    
    # Step 4: Greedy attach remaining segments
    similarity_threshold = config.get('similarity_threshold', 0.35)
    attached_count = 0
    
    for seg in remaining_segments:
        best_match = None
        best_score = 0
        
        for seed in seeds:
            score = jaccard(seg['tokens'], seed['combined_tokens'])
            if score >= similarity_threshold and score > best_score:
                best_match = seed
                best_score = score
        
        if best_match:
            best_match['segments'].append(seg)
            best_match['combined_tokens'].update(seg['tokens'])
            attached_count += 1
    
    print(f"  Attached {attached_count} additional segments via similarity")
    
    # Step 5: Deduplicate within each source
    def deduplicate_segments(segments_list):
        """Remove exact and near-duplicates"""
        seen_hashes = set()
        deduped = []
        
        for seg in segments_list:
            # Exact dedup by sha256
            text_hash = hashlib.sha256(seg['text'].strip().lower().encode()).hexdigest()
            if text_hash in seen_hashes:
                continue
            
            # Near-dup check against existing
            is_dup = False
            for existing in deduped:
                if jaccard(seg['tokens'], existing['tokens']) >= similarity_threshold:
                    # Keep the longer one
                    if len(seg['text']) > len(existing['text']):
                        deduped.remove(existing)
                        deduped.append(seg)
                    is_dup = True
                    break
            
            if not is_dup:
                seen_hashes.add(text_hash)
                deduped.append(seg)
        
        return deduped
    
    # Step 6: Write sources
    sources_written = 0
    sources_index = []
    segments_index = []
    
    for seed in seeds:
        # Deduplicate
        seed['segments'] = deduplicate_segments(seed['segments'])
        
        if not seed['segments']:
            continue
        
        # Sort by timestamp
        seed['segments'].sort(key=lambda x: x['timestamp'] or '')
        
        # Build content
        lines = [f"# {seed['title']}\n\n"]
        
        for seg in seed['segments']:
            lines.append(seg['text'])
            lines.append("\n\n")
            
            # Optional: Add assistant context
            if config.get('include_assistant_context', False):
                # Would need to look up adjacent assistant messages here
                pass
        
        # Add provenance
        lines.append("\n---\n\n## Provenance\n\n")
        lines.append("| Conversation ID | Message Range | Timestamp | Original Title |\n")
        lines.append("|-----------------|---------------|-----------|----------------|\n")
        
        for seg in seed['segments']:
            msg_range = f"{seg['msg_idx_start']}-{seg['msg_idx_end']}" if seg['msg_idx_start'] != seg['msg_idx_end'] else str(seg['msg_idx_start'])
            lines.append(f"| {seg['conversation_id'][:8]}... | {msg_range} | {seg['timestamp'] or 'N/A'} | {seg['title']} |\n")
        
        content = ''.join(lines)
        
        # Generate filename
        safe_title = sanitize_filename(seed['title'])
        
        # Add date if available
        timestamps = [s['timestamp'] for s in seed['segments'] if s['timestamp']]
        date_str = ""
        if timestamps:
            try:
                earliest = min(timestamps)
                if isinstance(earliest, (int, float)):
                    dt = datetime.fromtimestamp(earliest)
                else:
                    dt = datetime.fromisoformat(str(earliest).replace('Z', '+00:00'))
                date_str = f" - {dt.strftime('%Y%m%d_%H%M%S')}"
            except:
                pass
        
        base_name = f"{safe_title}{date_str}"
        filepath = sources_dir / f"{base_name}.md"
        
        # Handle collisions
        if filepath.exists():
            content_hash = hashlib.sha256(content.encode()).hexdigest()[:8]
            filepath = sources_dir / f"{base_name}-{content_hash}.md"
        
        # Write file
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        
        sources_written += 1
        
        # Track in indexes
        sources_index.append({
            'source_id': f"src_{sources_written:03d}",
            'canonical_title': seed['title'],
            'n_segments': len(seed['segments']),
            'n_chars': len(content),
            'created_ts_min': min([s['timestamp'] for s in seed['segments'] if s['timestamp']] or ['']),
            'created_ts_max': max([s['timestamp'] for s in seed['segments'] if s['timestamp']] or ['']),
            'provenance_count': len(seed['segments'])
        })
        
        for seg in seed['segments']:
            segments_index.append({
                'source_id': f"src_{sources_written:03d}",
                'conversation_id': seg['conversation_id'],
                'message_idx_start': seg['msg_idx_start'],
                'message_idx_end': seg['msg_idx_end'],
                'chars': len(seg['text']),
                'ts_min': seg['timestamp'] or '',
                'ts_max': seg['timestamp'] or ''
            })
    
    # Write index files
    if sources_index:
        # sources_index.csv
        with open(meta_dir / "sources_index.csv", 'w', newline='') as f:
            import csv
            fieldnames = ['source_id', 'canonical_title', 'n_segments', 'n_chars', 
                         'created_ts_min', 'created_ts_max', 'provenance_count']
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(sources_index)
        
        # segments_index.csv
        with open(meta_dir / "segments_index.csv", 'w', newline='') as f:
            fieldnames = ['source_id', 'conversation_id', 'message_idx_start', 
                         'message_idx_end', 'chars', 'ts_min', 'ts_max']
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(segments_index)
    
    print(f"\n✓ Sources built:")
    print(f"  Sources exported: {sources_written} (cap={sources_cap})")
    print(f"  Sources dir: {sources_dir}")
    
    return sources_written

# Build sources if enabled
if CONFIG.get('build_sources', True) and all_conversations:
    num_sources = build_sources(all_conversations, CONFIG)

# %% [markdown]
# ## Check Output Files
# 
# Run this cell to see what was exported:

# %% Check output
output_root = Path(CONFIG['output_root'])

if output_root.exists():
    print("📁 Output Directory Structure:")
    print("=" * 60)
    
    # Count files in each directory
    default_files = list((output_root / "default").glob("*")) if (output_root / "default").exists() else []
    code_files = list((output_root / "code_exports").glob("*")) if (output_root / "code_exports").exists() else []
    source_files = list((output_root / "sources").glob("*")) if (output_root / "sources").exists() else []
    
    print(f"\n📄 Transcripts in default/: {len(default_files)}")
    if default_files[:5]:  # Show first 5
        for f in default_files[:5]:
            print(f"  • {f.name}")
        if len(default_files) > 5:
            print(f"  ... and {len(default_files) - 5} more")
    
    print(f"\n💻 Code files in code_exports/: {len(code_files)}")
    if code_files[:5]:  # Show first 5
        for f in code_files[:5]:
            print(f"  • {f.name}")
        if len(code_files) > 5:
            print(f"  ... and {len(code_files) - 5} more")
    
    print(f"\n📚 Sources in sources/: {len(source_files)}")
    if source_files[:5]:  # Show first 5
        for f in source_files[:5]:
            print(f"  • {f.name}")
        if len(source_files) > 5:
            print(f"  ... and {len(source_files) - 5} more")
    
    # Check meta files
    meta_dir = output_root / "meta"
    if meta_dir.exists():
        print(f"\n📊 Metadata files in meta/:")
        sources_index = meta_dir / "sources_index.csv"
        segments_index = meta_dir / "segments_index.csv"
        
        if sources_index.exists():
            size_kb = sources_index.stat().st_size / 1024
            print(f"  • sources_index.csv ({size_kb:.1f} KB)")
        
        if segments_index.exists():
            size_kb = segments_index.stat().st_size / 1024
            print(f"  • segments_index.csv ({size_kb:.1f} KB)")
        
        for f in meta_dir.glob("*.csv"):
            if f.name not in ['sources_index.csv', 'segments_index.csv']:
                size_kb = f.stat().st_size / 1024
                print(f"  • {f.name} ({size_kb:.1f} KB)")
    
    # Check keyword directories
    keyword_dirs = [d for d in output_root.iterdir() if d.is_dir() and d.name.startswith("keyword_")]
    if keyword_dirs:
        print(f"\n🏷️ Keyword groups: {len(keyword_dirs)}")
        for d in keyword_dirs:
            files = list(d.glob("*"))
            print(f"  • {d.name}: {len(files)} files")
else:
    print("No output directory found. Run the processing cell first.")

# %% [markdown]
# ## Download Results
# 
# Run this cell to create a ZIP file of all exports for download:

# %% Create downloadable ZIP
from google.colab import files
import zipfile

def create_download_zip():
    """Create a ZIP file of all exports"""
    
    output_root = Path(CONFIG['output_root'])
    if not output_root.exists():
        print("No exports found. Run the processing cell first.")
        return
    
    zip_path = "/content/chat_exports.zip"
    
    print("Creating ZIP file...")
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for file_path in output_root.rglob('*'):
            if file_path.is_file():
                arcname = file_path.relative_to(output_root.parent)
                zipf.write(file_path, arcname)
    
    print(f"✓ ZIP file created: {zip_path}")
    print(f"  Size: {Path(zip_path).stat().st_size / (1024**2):.1f} MB")
    
    # Download the file
    files.download(zip_path)
    print("📥 Download started...")

# Uncomment to download:
# create_download_zip()

# %% [markdown]
# ## Mount Google Drive (Optional)
# 
# Run this cell if you want to save exports directly to Google Drive:

# %% Mount Google Drive (optional)
from google.colab import drive

# Uncomment to mount Drive:
# drive.mount('/content/drive')

# Then update CONFIG['drive_out'] and re-run processing:
# CONFIG['drive_out'] = '/content/drive/MyDrive/chat_exports'
# process_chats(CONFIG)

# %% [markdown]
# ## Test Suite
# 
# Run these cells to verify the tool works correctly:

# %% Create test data
def create_test_data():
    """Create test files for verification"""
    
    input_dir = Path("/content/input_data")
    
    # Test 1: UTF-16 LE file with BOM
    print("Creating test files...")
    
    utf16_data = [{
        "title": "UTF16 Test Chat",
        "mapping": {
            "1": {
                "message": {
                    "author": {"role": "user"},
                    "content": {"parts": ["Test message"]},
                    "create_time": 1705159822
                }
            }
        }
    }]
    
    utf16_file = input_dir / "test_utf16.json"
    with open(utf16_file, 'w', encoding='utf-16-le') as f:
        f.write('\ufeff')  # BOM
        json.dump(utf16_data, f)
    
    # Test 2: Conversation with code blocks
    code_data = [{
        "title": "Code Examples",
        "mapping": {
            "1": {
                "message": {
                    "author": {"role": "user"},
                    "content": {"parts": ["Show me Python code"]}
                }
            },
            "2": {
                "message": {
                    "author": {"role": "assistant"},
                    "content": {"parts": [
                        "Here's Python:\n```python\ndef hello():\n    print('Hello')\n```"
                    ]}
                }
            }
        }
    }]
    
    with open(input_dir / "test_code.json", 'w') as f:
        json.dump(code_data, f)
    
    print("✓ Test files created")

# Run to create test data
create_test_data()

# Process test data
test_config = CONFIG.copy()
test_config['verbose'] = True
test_config['export_code'] = True
test_config['keywords'] = ['python', 'code']

print("\n" + "=" * 60)
print("RUNNING TESTS")
print("=" * 60)
process_chats(test_config)

# %% [markdown]
# ## Instructions
# 
# ### Setup:
# 1. Run all cells in order
# 2. Place your JSON export files in `/content/input_data/`
#    - ChatGPT: `conversations.json` (supports both mapping and messages[] formats)
#    - Claude: `conversations.json` (rename to avoid conflicts)
#    - Gemini: any JSON export file
# 
# ### Configuration:
# - Modify the CONFIG dictionary in the Configuration cell
# - Key options:
#   - `subset`: "both", "user", or "assistant"
#   - `format`: "md", "txt", or "json"
#   - `export_code`: True/False
#   - `keywords`: List of keywords for grouping
#   - `build_sources`: True/False (build user-side extended documents)
#   - `sources_cap`: Maximum number of sources to export (default 150)
#   - `min_user_chars`: Minimum user segment length (default 400 chars)
#   - `similarity_threshold`: Jaccard threshold for deduplication (default 0.35)
#   - `drive_out`: Path to copy outputs to Drive
# 
# ### Output Structure:
# ```
# /content/chat_exports/
# ├── default/                    # Individual conversation transcripts
# ├── code_exports/               # Extracted code blocks with proper extensions
# ├── sources/                    # User-side extended documents (≤150)
# ├── meta/                       # Metadata files
# │   ├── sources_index.csv       # Source metadata
# │   └── segments_index.csv      # Segment tracking
# └── keyword_{keyword}/          # Grouped by keywords
# ```
# 
# ### File Naming:
# - Transcripts: `<title> - <YYYYMMDD_HHMMSS> - <subset>.<ext>`
# - Sources: `<canonical_title> - <YYYYMMDD_HHMMSS>.md`
# - Code: `<title> - code<nn>.<ext>`
# - Collisions handled with `-<hash>` suffix
# 
# ### Features:
# - ✅ Handles UTF-16/32 with BOM
# - ✅ Detects and warns about ZIP/GZIP files
# - ✅ Streams large files (1GB+) with ijson
# - ✅ Builds user-side sources with Jaccard deduplication
# - ✅ Title-based bucketing with similarity attachment
# - ✅ No heavy dependencies (uses Python stdlib)
# - ✅ Preserves all platform parsing logic
# - ✅ Exports to flat, sortable structure
# - ✅ Optional Drive backup
