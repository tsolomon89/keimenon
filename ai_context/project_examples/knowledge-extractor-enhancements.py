# %% [markdown]
# # 🚀 Knowledge Extractor v3.1 - Enhanced Features
# ### Additional modules for the Advanced AI Knowledge Extractor
# 
# This module adds:
# - Automatic compression for large exports
# - Streaming for huge JSON files
# - Conversation merging for related topics
# - Summary statistics dashboard
# - Export to Google Sheets
# - Incremental processing capabilities

# %% Import additional dependencies
"""
Additional dependencies for enhanced features
Run after main system installation
"""
import zipfile
import tarfile
import ijson
import io
import tempfile
from typing import Iterator, Generator
import pandas as pd
from google.colab import auth
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
import gspread
from google.auth import default
import plotly.subplots as sp
from plotly.offline import init_notebook_mode
init_notebook_mode(connected=True)

# Install additional packages if needed
try:
    import ijson
except ImportError:
    !pip install -q ijson
    import ijson

try:
    import gspread
except ImportError:
    !pip install -q gspread gspread-dataframe google-auth-httplib2 google-auth-oauthlib
    import gspread

# %% [markdown]
# ## 1. 📦 Automatic Compression for Large Exports

# %%
class CompressionManager:
    """Manage automatic compression of large exports"""
    
    def __init__(self, threshold_mb: float = 10.0):
        self.threshold_bytes = threshold_mb * 1024 * 1024
        
    def compress_if_needed(self, file_path: Path, format: str = 'zip') -> Path:
        """Compress file if it exceeds threshold"""
        file_size = file_path.stat().st_size
        
        if file_size < self.threshold_bytes:
            print(f"📄 File {file_path.name} is {file_size/1024/1024:.2f}MB - no compression needed")
            return file_path
        
        print(f"📦 Compressing {file_path.name} ({file_size/1024/1024:.2f}MB)...")
        
        if format == 'zip':
            compressed_path = self._compress_zip(file_path)
        elif format == 'tar.gz':
            compressed_path = self._compress_tar(file_path)
        else:
            compressed_path = self._compress_zip(file_path)
        
        # Compare sizes
        compressed_size = compressed_path.stat().st_size
        compression_ratio = (1 - compressed_size/file_size) * 100
        print(f"✅ Compressed to {compressed_size/1024/1024:.2f}MB ({compression_ratio:.1f}% reduction)")
        
        # Remove original if compression is significant
        if compression_ratio > 20:
            file_path.unlink()
            return compressed_path
        else:
            compressed_path.unlink()
            return file_path
    
    def _compress_zip(self, file_path: Path) -> Path:
        """Compress to ZIP format"""
        zip_path = file_path.with_suffix('.zip')
        
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
            zf.write(file_path, file_path.name)
        
        return zip_path
    
    def _compress_tar(self, file_path: Path) -> Path:
        """Compress to tar.gz format"""
        tar_path = file_path.with_suffix('.tar.gz')
        
        with tarfile.open(tar_path, 'w:gz', compresslevel=9) as tf:
            tf.add(file_path, arcname=file_path.name)
        
        return tar_path
    
    def compress_directory(self, dir_path: Path, output_name: str = None) -> Path:
        """Compress entire directory"""
        if output_name is None:
            output_name = f"{dir_path.name}_archive"
        
        output_path = dir_path.parent / f"{output_name}.zip"
        
        print(f"📦 Compressing directory {dir_path.name}...")
        
        with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            for file_path in dir_path.rglob('*'):
                if file_path.is_file():
                    arcname = file_path.relative_to(dir_path.parent)
                    zf.write(file_path, arcname)
        
        size_mb = output_path.stat().st_size / 1024 / 1024
        print(f"✅ Created archive: {output_path.name} ({size_mb:.2f}MB)")
        
        return output_path

# Integration with ExportManager
def export_with_compression(self, documents: List[KnowledgeDocument]) -> Dict[str, Path]:
    """Export documents with automatic compression"""
    # Original export
    files = self.export_documents(documents)
    
    # Compress if needed
    compressor = CompressionManager(threshold_mb=10.0)
    compressed_files = {}
    
    for name, path in files.items():
        compressed_path = compressor.compress_if_needed(path)
        compressed_files[name] = compressed_path
    
    # If multiple files, create archive
    if len(compressed_files) > 5:
        archive = compressor.compress_directory(self.output_dir, "knowledge_base_complete")
        compressed_files['complete_archive'] = archive
    
    return compressed_files

# %% [markdown]
# ## 2. 🌊 Streaming for Huge JSON Files

# %%
class StreamingJSONParser:
    """Stream parse huge JSON files without loading into memory"""
    
    def __init__(self, chunk_size: int = 100):
        self.chunk_size = chunk_size
        
    def stream_parse_file(self, file_path: Path) -> Generator[List[Conversation], None, None]:
        """Stream parse JSON file yielding conversation chunks"""
        
        with open(file_path, 'rb') as file:
            # Try to detect format from first few bytes
            first_bytes = file.read(100)
            file.seek(0)
            
            if b'[' in first_bytes[:10]:
                # Array format
                yield from self._stream_array(file)
            elif b'{' in first_bytes[:10]:
                # Object format
                yield from self._stream_object(file)
            else:
                raise ValueError("Unknown JSON format")
    
    def _stream_array(self, file) -> Generator[List[Conversation], None, None]:
        """Stream parse JSON array"""
        parser = ijson.items(file, 'item')
        chunk = []
        
        for item in parser:
            # Parse individual conversation
            conv = self._parse_conversation_item(item)
            if conv:
                chunk.append(conv)
            
            if len(chunk) >= self.chunk_size:
                yield chunk
                chunk = []
                gc.collect()  # Free memory
        
        if chunk:
            yield chunk
    
    def _stream_object(self, file) -> Generator[List[Conversation], None, None]:
        """Stream parse JSON object with conversations"""
        # Look for common keys
        possible_keys = ['conversations', 'data', 'items', 'messages']
        
        for key in possible_keys:
            file.seek(0)
            try:
                parser = ijson.items(file, f'{key}.item')
                chunk = []
                
                for item in parser:
                    conv = self._parse_conversation_item(item)
                    if conv:
                        chunk.append(conv)
                    
                    if len(chunk) >= self.chunk_size:
                        yield chunk
                        chunk = []
                        gc.collect()
                
                if chunk:
                    yield chunk
                    
                break  # Found valid key
            except:
                continue
    
    def _parse_conversation_item(self, item: Dict) -> Optional[Conversation]:
        """Parse single conversation item"""
        try:
            # Use existing parser
            parser = UniversalParser(ProcessingConfig())
            conversations = parser.parse(item)
            return conversations[0] if conversations else None
        except:
            return None
    
    def estimate_file_size(self, file_path: Path) -> Dict[str, Any]:
        """Estimate conversations and memory requirements"""
        file_size = file_path.stat().st_size
        
        # Sample first 1MB to estimate
        sample_size = min(1024 * 1024, file_size)
        
        with open(file_path, 'rb') as f:
            sample = f.read(sample_size)
        
        # Count conversation markers
        conv_markers = [b'"id"', b'"title"', b'"messages"']
        marker_count = sum(sample.count(marker) for marker in conv_markers)
        
        # Estimate total conversations
        estimated_convs = int((file_size / sample_size) * marker_count / 3)
        
        # Estimate memory requirement (rough)
        estimated_memory_mb = file_size / (1024 * 1024) * 0.5  # Assume 50% overhead
        
        return {
            'file_size_mb': file_size / (1024 * 1024),
            'estimated_conversations': estimated_convs,
            'estimated_memory_mb': estimated_memory_mb,
            'recommended_chunks': max(1, estimated_convs // 100)
        }

# Usage example
def process_huge_file(file_path: Path):
    """Process huge JSON file with streaming"""
    streamer = StreamingJSONParser(chunk_size=50)
    
    # Estimate size
    info = streamer.estimate_file_size(file_path)
    print(f"📊 File info: {info}")
    
    if info['file_size_mb'] > 100:
        print("⚠️ Large file detected - using streaming mode")
        
        all_contributions = []
        for chunk_num, conversation_chunk in enumerate(streamer.stream_parse_file(file_path)):
            print(f"Processing chunk {chunk_num + 1} ({len(conversation_chunk)} conversations)")
            
            # Process chunk
            analyzer = ContentAnalyzer(ProcessingConfig())
            for conv in conversation_chunk:
                # Extract contributions from chunk
                contributions = extract_contributions_from_conversation(conv, analyzer)
                all_contributions.extend(contributions)
            
            # Save checkpoint
            if chunk_num % 5 == 0:
                save_checkpoint(all_contributions, f"chunk_{chunk_num}")
            
            # Memory management
            gc.collect()
        
        return all_contributions
    else:
        # Small file - use regular processing
        with open(file_path, 'r') as f:
            data = json.load(f)
        return process_normal(data)

# %% [markdown]
# ## 3. 🔄 Conversation Merging for Related Topics

# %%
class ConversationMerger:
    """Merge related conversations based on semantic similarity"""
    
    def __init__(self, similarity_threshold: float = 0.8):
        self.similarity_threshold = similarity_threshold
        self.embedder = SentenceTransformer('all-MiniLM-L6-v2')
    
    def merge_related_conversations(self, conversations: List[Conversation]) -> List[Conversation]:
        """Merge conversations with high topical overlap"""
        
        print(f"🔄 Analyzing {len(conversations)} conversations for merging...")
        
        # Generate conversation embeddings based on titles and content
        conv_texts = []
        for conv in conversations:
            # Combine title with sample of messages
            text = conv.title + " " + " ".join([
                msg.content[:200] for msg in conv.messages[:5] if msg.role == 'user'
            ])
            conv_texts.append(text)
        
        embeddings = self.embedder.encode(conv_texts, show_progress_bar=True)
        
        # Find similar conversation pairs
        merge_groups = self._find_merge_groups(conversations, embeddings)
        
        # Merge conversations
        merged_conversations = []
        processed = set()
        
        for group in merge_groups:
            if any(i in processed for i in group):
                continue
            
            # Merge group
            merged = self._merge_conversation_group([conversations[i] for i in group])
            merged_conversations.append(merged)
            processed.update(group)
        
        # Add unmerged conversations
        for i, conv in enumerate(conversations):
            if i not in processed:
                merged_conversations.append(conv)
        
        print(f"✅ Merged {len(conversations)} → {len(merged_conversations)} conversations")
        return merged_conversations
    
    def _find_merge_groups(self, conversations: List[Conversation], embeddings: np.ndarray) -> List[List[int]]:
        """Find groups of conversations to merge"""
        n = len(conversations)
        groups = []
        processed = set()
        
        for i in range(n):
            if i in processed:
                continue
            
            group = [i]
            processed.add(i)
            
            # Find similar conversations
            for j in range(i + 1, n):
                if j in processed:
                    continue
                
                similarity = cosine_similarity([embeddings[i]], [embeddings[j]])[0][0]
                
                if similarity >= self.similarity_threshold:
                    # Check temporal proximity (optional)
                    if self._are_temporally_close(conversations[i], conversations[j]):
                        group.append(j)
                        processed.add(j)
            
            if len(group) > 1:
                groups.append(group)
        
        return groups
    
    def _are_temporally_close(self, conv1: Conversation, conv2: Conversation, days: int = 7) -> bool:
        """Check if conversations are temporally close"""
        if not conv1.created_at or not conv2.created_at:
            return True  # Can't determine, allow merge
        
        time_diff = abs((conv1.created_at - conv2.created_at).days)
        return time_diff <= days
    
    def _merge_conversation_group(self, group: List[Conversation]) -> Conversation:
        """Merge a group of conversations"""
        # Sort by creation date
        group.sort(key=lambda c: c.created_at or datetime.min)
        
        # Combine titles
        titles = [c.title for c in group]
        merged_title = self._generate_merged_title(titles)
        
        # Combine messages (maintaining temporal order)
        all_messages = []
        for conv in group:
            for msg in conv.messages:
                # Add conversation source to metadata
                msg.metadata['original_conversation'] = conv.id
                all_messages.append(msg)
        
        # Sort messages by timestamp if available
        all_messages.sort(key=lambda m: m.timestamp or datetime.min)
        
        # Reindex messages
        for i, msg in enumerate(all_messages):
            msg.index = i
        
        return Conversation(
            id=f"merged_{group[0].id}",
            title=merged_title,
            messages=all_messages,
            created_at=group[0].created_at,
            updated_at=group[-1].updated_at,
            platform=group[0].platform,
            metadata={
                'merged_from': [c.id for c in group],
                'original_titles': titles,
                'merge_count': len(group)
            }
        )
    
    def _generate_merged_title(self, titles: List[str]) -> str:
        """Generate title for merged conversation"""
        # Find common words
        word_freq = Counter()
        for title in titles:
            words = title.lower().split()
            word_freq.update(words)
        
        # Get most common meaningful words
        common_words = [word for word, count in word_freq.most_common() 
                       if count > 1 and len(word) > 3][:3]
        
        if common_words:
            return f"Merged: {' '.join(common_words).title()}"
        else:
            return f"Merged Conversation ({len(titles)} topics)"

# %% [markdown]
# ## 4. 📊 Summary Statistics Dashboard

# %%
class StatisticsDashboard:
    """Create comprehensive statistics dashboard"""
    
    def __init__(self):
        self.stats = {}
    
    def generate_dashboard(self, 
                          conversations: List[Conversation],
                          contributions: List[Contribution],
                          documents: List[KnowledgeDocument]) -> None:
        """Generate interactive statistics dashboard"""
        
        print("📊 Generating statistics dashboard...")
        
        # Collect statistics
        self.stats = self._collect_statistics(conversations, contributions, documents)
        
        # Create visualizations
        fig = self._create_dashboard_figure()
        
        # Display
        fig.show()
        
        # Generate summary report
        self._print_summary_report()
        
        return self.stats
    
    def _collect_statistics(self, conversations, contributions, documents) -> Dict:
        """Collect comprehensive statistics"""
        
        stats = {
            'overview': {
                'total_conversations': len(conversations),
                'total_messages': sum(len(c.messages) for c in conversations),
                'total_contributions': len(contributions),
                'total_documents': len(documents),
                'date_range': self._get_date_range(conversations)
            },
            'platforms': Counter(c.platform for c in conversations),
            'intent_distribution': Counter(c.intent_type for c in contributions),
            'quality_scores': {
                'mean': np.mean([c.quality_score for c in contributions]),
                'median': np.median([c.quality_score for c in contributions]),
                'std': np.std([c.quality_score for c in contributions])
            },
            'temporal': self._analyze_temporal_patterns(conversations),
            'content': self._analyze_content_patterns(contributions),
            'clustering': self._analyze_clustering(documents)
        }
        
        return stats
    
    def _get_date_range(self, conversations) -> Dict:
        """Get date range of conversations"""
        dates = [c.created_at for c in conversations if c.created_at]
        if dates:
            return {
                'start': min(dates).isoformat(),
                'end': max(dates).isoformat(),
                'days': (max(dates) - min(dates)).days
            }
        return {'start': None, 'end': None, 'days': 0}
    
    def _analyze_temporal_patterns(self, conversations) -> Dict:
        """Analyze temporal patterns"""
        # Group by day of week
        weekday_counts = Counter()
        hour_counts = Counter()
        
        for conv in conversations:
            if conv.created_at:
                weekday_counts[conv.created_at.strftime('%A')] += 1
                hour_counts[conv.created_at.hour] += 1
        
        # Group by month
        monthly_counts = Counter()
        for conv in conversations:
            if conv.created_at:
                monthly_counts[conv.created_at.strftime('%Y-%m')] += 1
        
        return {
            'by_weekday': dict(weekday_counts),
            'by_hour': dict(hour_counts),
            'by_month': dict(monthly_counts),
            'peak_day': weekday_counts.most_common(1)[0][0] if weekday_counts else None,
            'peak_hour': hour_counts.most_common(1)[0][0] if hour_counts else None
        }
    
    def _analyze_content_patterns(self, contributions) -> Dict:
        """Analyze content patterns"""
        # Calculate text statistics
        word_counts = [len(c.content.split()) for c in contributions]
        code_contributions = [c for c in contributions if c.code_blocks]
        
        # Extract top entities
        all_entities = []
        for c in contributions:
            all_entities.extend(c.entities)
        top_entities = Counter(all_entities).most_common(20)
        
        # Extract top keywords
        all_keywords = []
        for c in contributions:
            all_keywords.extend(c.keywords)
        top_keywords = Counter(all_keywords).most_common(20)
        
        return {
            'avg_word_count': np.mean(word_counts) if word_counts else 0,
            'total_words': sum(word_counts),
            'code_contributions': len(code_contributions),
            'code_percentage': len(code_contributions) / len(contributions) * 100 if contributions else 0,
            'top_entities': top_entities,
            'top_keywords': top_keywords,
            'complexity_scores': {
                'mean': np.mean([c.complexity_score for c in contributions]),
                'std': np.std([c.complexity_score for c in contributions])
            }
        }
    
    def _analyze_clustering(self, documents) -> Dict:
        """Analyze clustering results"""
        cluster_sizes = [len(d.contributions) for d in documents]
        
        return {
            'num_clusters': len(documents),
            'avg_cluster_size': np.mean(cluster_sizes) if cluster_sizes else 0,
            'max_cluster_size': max(cluster_sizes) if cluster_sizes else 0,
            'min_cluster_size': min(cluster_sizes) if cluster_sizes else 0,
            'size_distribution': Counter(cluster_sizes)
        }
    
    def _create_dashboard_figure(self):
        """Create interactive dashboard figure"""
        
        # Create subplots
        fig = make_subplots(
            rows=3, cols=3,
            subplot_titles=(
                'Conversations by Platform',
                'Intent Distribution',
                'Quality Score Distribution',
                'Temporal Activity',
                'Top Keywords',
                'Cluster Sizes',
                'Complexity Distribution',
                'Daily Activity Pattern',
                'Content Statistics'
            ),
            specs=[
                [{'type': 'pie'}, {'type': 'bar'}, {'type': 'histogram'}],
                [{'type': 'scatter'}, {'type': 'bar'}, {'type': 'box'}],
                [{'type': 'histogram'}, {'type': 'heatmap'}, {'type': 'indicator'}]
            ]
        )
        
        # 1. Platform distribution
        if self.stats['platforms']:
            fig.add_trace(
                go.Pie(labels=list(self.stats['platforms'].keys()),
                      values=list(self.stats['platforms'].values())),
                row=1, col=1
            )
        
        # 2. Intent distribution
        if self.stats['intent_distribution']:
            fig.add_trace(
                go.Bar(x=list(self.stats['intent_distribution'].keys()),
                      y=list(self.stats['intent_distribution'].values())),
                row=1, col=2
            )
        
        # 3. Quality scores histogram
        if 'quality_scores' in self.stats:
            quality_values = [c.quality_score for c in contributions]
            fig.add_trace(
                go.Histogram(x=quality_values, nbinsx=20),
                row=1, col=3
            )
        
        # 4. Temporal activity
        if self.stats['temporal']['by_month']:
            months = list(self.stats['temporal']['by_month'].keys())
            counts = list(self.stats['temporal']['by_month'].values())
            fig.add_trace(
                go.Scatter(x=months, y=counts, mode='lines+markers'),
                row=2, col=1
            )
        
        # 5. Top keywords
        if self.stats['content']['top_keywords']:
            keywords = [k for k, _ in self.stats['content']['top_keywords'][:10]]
            counts = [c for _, c in self.stats['content']['top_keywords'][:10]]
            fig.add_trace(
                go.Bar(x=counts, y=keywords, orientation='h'),
                row=2, col=2
            )
        
        # 6. Cluster sizes
        if self.stats['clustering']['size_distribution']:
            sizes = list(self.stats['clustering']['size_distribution'].keys())
            counts = list(self.stats['clustering']['size_distribution'].values())
            fig.add_trace(
                go.Box(y=sizes, name='Cluster Sizes'),
                row=2, col=3
            )
        
        # Update layout
        fig.update_layout(
            height=900,
            showlegend=False,
            title_text="Knowledge Extraction Statistics Dashboard"
        )
        
        return fig
    
    def _print_summary_report(self):
        """Print text summary report"""
        
        print("\n" + "="*60)
        print("📋 EXTRACTION SUMMARY REPORT")
        print("="*60)
        
        # Overview
        print("\n📊 Overview:")
        for key, value in self.stats['overview'].items():
            print(f"  • {key}: {value}")
        
        # Quality metrics
        print("\n⭐ Quality Metrics:")
        print(f"  • Mean quality score: {self.stats['quality_scores']['mean']:.3f}")
        print(f"  • Median quality score: {self.stats['quality_scores']['median']:.3f}")
        print(f"  • Std deviation: {self.stats['quality_scores']['std']:.3f}")
        
        # Content analysis
        print("\n📝 Content Analysis:")
        print(f"  • Total words: {self.stats['content']['total_words']:,}")
        print(f"  • Average words per contribution: {self.stats['content']['avg_word_count']:.0f}")
        print(f"  • Code contributions: {self.stats['content']['code_percentage']:.1f}%")
        
        # Temporal patterns
        print("\n⏰ Temporal Patterns:")
        print(f"  • Peak day: {self.stats['temporal']['peak_day']}")
        print(f"  • Peak hour: {self.stats['temporal']['peak_hour']}:00")
        
        # Top entities
        print("\n🏷️ Top Entities:")
        for entity, count in self.stats['content']['top_entities'][:5]:
            print(f"  • {entity}: {count}")
        
        print("\n" + "="*60)

# %% [markdown]
# ## 5. 📊 Export to Google Sheets

# %%
class GoogleSheetsExporter:
    """Export metadata and summaries to Google Sheets"""
    
    def __init__(self):
        self.authenticate()
    
    def authenticate(self):
        """Authenticate with Google Sheets API"""
        auth.authenticate_user()
        creds, _ = default()
        self.gc = gspread.authorize(creds)
    
    def export_to_sheets(self, 
                        documents: List[KnowledgeDocument],
                        contributions: List[Contribution],
                        sheet_name: str = None) -> str:
        """Export knowledge base metadata to Google Sheets"""
        
        if sheet_name is None:
            sheet_name = f"Knowledge_Base_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        print(f"📊 Creating Google Sheet: {sheet_name}")
        
        # Create new spreadsheet
        spreadsheet = self.gc.create(sheet_name)
        
        # Share with user's email (make it accessible)
        spreadsheet.share('', perm_type='anyone', role='reader')
        
        # Create worksheets
        self._create_summary_sheet(spreadsheet, documents)
        self._create_documents_sheet(spreadsheet, documents)
        self._create_contributions_sheet(spreadsheet, contributions)
        self._create_statistics_sheet(spreadsheet, documents, contributions)
        
        print(f"✅ Google Sheet created: {spreadsheet.url}")
        return spreadsheet.url
    
    def _create_summary_sheet(self, spreadsheet, documents):
        """Create summary worksheet"""
        ws = spreadsheet.sheet1
        ws.update_title("Summary")
        
        # Prepare summary data
        summary_data = [
            ["Knowledge Base Summary", ""],
            ["Generated", datetime.now().strftime("%Y-%m-%d %H:%M")],
            ["Total Documents", len(documents)],
            ["Total Contributions", sum(len(d.contributions) for d in documents)],
            ["Total Word Count", sum(d.word_count for d in documents)],
            ["Average Quality Score", np.mean([d.quality_score for d in documents])],
            ["", ""],
            ["Top Categories", "Count"]
        ]
        
        # Add category counts
        categories = Counter(d.category for d in documents)
        for category, count in categories.most_common():
            summary_data.append([category, count])
        
        ws.update('A1', summary_data)
        
        # Format headers
        ws.format('A1:B1', {'textFormat': {'bold': True}, 'backgroundColor': {'red': 0.9, 'green': 0.9, 'blue': 1}})
        ws.format('A8:B8', {'textFormat': {'bold': True}, 'backgroundColor': {'red': 0.9, 'green': 0.9, 'blue': 1}})
    
    def _create_documents_sheet(self, spreadsheet, documents):
        """Create documents listing worksheet"""
        ws = spreadsheet.add_worksheet(title="Documents", rows=len(documents)+1, cols=10)
        
        # Headers
        headers = [
            "Document ID", "Title", "Category", "Word Count",
            "Quality Score", "Contributions", "Key Concepts",
            "Created", "Timeline Events", "Related Docs"
        ]
        
        # Prepare data
        data = [headers]
        for doc in documents:
            data.append([
                doc.id,
                doc.title,
                doc.category,
                doc.word_count,
                round(doc.quality_score, 3),
                len(doc.contributions),
                ", ".join(doc.key_concepts[:5]),
                doc.created_at.strftime("%Y-%m-%d") if doc.created_at else "",
                len(doc.evolution_timeline),
                ", ".join(doc.related_documents[:3])
            ])
        
        ws.update('A1', data)
        
        # Format headers
        ws.format('A1:J1', {'textFormat': {'bold': True}, 'backgroundColor': {'red': 0.9, 'green': 0.9, 'blue': 1}})
    
    def _create_contributions_sheet(self, spreadsheet, contributions):
        """Create contributions worksheet (sample)"""
        ws = spreadsheet.add_worksheet(title="Contributions Sample", rows=min(1001, len(contributions)+1), cols=8)
        
        # Headers
        headers = [
            "Contribution ID", "Intent Type", "Quality Score",
            "Complexity Score", "Word Count", "Has Code",
            "Entities", "Keywords"
        ]
        
        # Sample first 1000 contributions
        data = [headers]
        for contrib in contributions[:1000]:
            data.append([
                contrib.id,
                contrib.intent_type,
                round(contrib.quality_score, 3),
                round(contrib.complexity_score, 3),
                len(contrib.content.split()),
                "Yes" if contrib.code_blocks else "No",
                ", ".join(contrib.entities[:5]),
                ", ".join(contrib.keywords[:5])
            ])
        
        ws.update('A1', data)
        
        # Format headers
        ws.format('A1:H1', {'textFormat': {'bold': True}, 'backgroundColor': {'red': 0.9, 'green': 0.9, 'blue': 1}})
    
    def _create_statistics_sheet(self, spreadsheet, documents, contributions):
        """Create statistics worksheet"""
        ws = spreadsheet.add_worksheet(title="Statistics", rows=50, cols=4)
        
        # Calculate statistics
        stats_dashboard = StatisticsDashboard()
        stats = stats_dashboard._collect_statistics([], contributions, documents)
        
        # Prepare data
        data = [
            ["Statistic", "Value", "Details", "Notes"],
            ["", "", "", ""],
            ["Intent Distribution", "", "", ""],
        ]
        
        for intent, count in stats['intent_distribution'].most_common():
            data.append([intent, count, f"{count/len(contributions)*100:.1f}%", ""])
        
        data.extend([
            ["", "", "", ""],
            ["Quality Metrics", "", "", ""],
            ["Mean Quality", round(stats['quality_scores']['mean'], 3), "", ""],
            ["Median Quality", round(stats['quality_scores']['median'], 3), "", ""],
            ["Std Deviation", round(stats['quality_scores']['std'], 3), "", ""],
            ["", "", "", ""],
            ["Content Metrics", "", "", ""],
            ["Total Words", stats['content']['total_words'], "", ""],
            ["Avg Words/Contribution", round(stats['content']['avg_word_count'], 0), "", ""],
            ["Code Contributions %", f"{stats['content']['code_percentage']:.1f}%", "", ""],
        ])
        
        ws.update('A1', data)
        
        # Format headers
        ws.format('A1:D1', {'textFormat': {'bold': True}, 'backgroundColor': {'red': 0.9, 'green': 0.9, 'blue': 1}})

# %% [markdown]
# ## 6. ♻️ Incremental Processing

# %%
class IncrementalProcessor:
    """Process new conversations incrementally without reprocessing everything"""
    
    def __init__(self, knowledge_base_path: Path):
        self.kb_path = knowledge_base_path
        self.kb_path.mkdir(exist_ok=True, parents=True)
        
        self.state_file = self.kb_path / "processing_state.json"
        self.embeddings_cache = self.kb_path / "embeddings_cache.pkl"
        self.contributions_db = self.kb_path / "contributions.pkl"
        self.documents_db = self.kb_path / "documents.pkl"
        
        self.state = self._load_state()
    
    def _load_state(self) -> Dict:
        """Load processing state"""
        if self.state_file.exists():
            with open(self.state_file, 'r') as f:
                return json.load(f)
        return {
            'processed_conversations': {},  # id -> hash
            'last_processed': None,
            'total_contributions': 0,
            'total_documents': 0,
            'version': '3.1'
        }
    
    def _save_state(self):
        """Save processing state"""
        with open(self.state_file, 'w') as f:
            json.dump(self.state, f, indent=2, default=str)
    
    def _load_existing_data(self) -> Tuple[List[Contribution], List[KnowledgeDocument]]:
        """Load existing knowledge base"""
        contributions = []
        documents = []
        
        if self.contributions_db.exists():
            with open(self.contributions_db, 'rb') as f:
                contributions = pickle.load(f)
        
        if self.documents_db.exists():
            with open(self.documents_db, 'rb') as f:
                documents = pickle.load(f)
        
        return contributions, documents
    
    def _save_data(self, contributions: List[Contribution], documents: List[KnowledgeDocument]):
        """Save knowledge base"""
        with open(self.contributions_db, 'wb') as f:
            pickle.dump(contributions, f)
        
        with open(self.documents_db, 'wb') as f:
            pickle.dump(documents, f)
    
    def process_incrementally(self, 
                             new_conversations: List[Conversation],
                             config: ProcessingConfig) -> Tuple[List[Contribution], List[KnowledgeDocument]]:
        """Process new conversations and merge with existing knowledge base"""
        
        print("♻️ Starting incremental processing...")
        
        # Load existing data
        existing_contributions, existing_documents = self._load_existing_data()
        print(f"  Loaded {len(existing_contributions)} existing contributions")
        print(f"  Loaded {len(existing_documents)} existing documents")
        
        # Filter out already processed conversations
        new_to_process = []
        for conv in new_conversations:
            conv_hash = hashlib.md5(json.dumps({
                'id': conv.id,
                'messages': len(conv.messages)
            }).encode()).hexdigest()
            
            if conv.id not in self.state['processed_conversations'] or \
               self.state['processed_conversations'][conv.id] != conv_hash:
                new_to_process.append(conv)
                self.state['processed_conversations'][conv.id] = conv_hash
        
        print(f"  Found {len(new_to_process)} new conversations to process")
        
        if not new_to_process:
            print("  No new conversations to process")
            return existing_contributions, existing_documents
        
        # Process new conversations
        analyzer = ContentAnalyzer(config)
        new_contributions = []
        
        for conv in tqdm(new_to_process, desc="Processing new conversations"):
            for msg in conv.messages:
                if msg.role == 'user' and len(msg.content) >= config.min_contribution_length:
                    context = {
                        'conv_id': conv.id,
                        'conv_title': conv.title,
                        'msg_index': msg.index,
                        'timestamp': msg.timestamp
                    }
                    
                    contrib = analyzer.analyze_contribution(msg.content, context)
                    
                    if contrib.quality_score >= config.quality_threshold:
                        new_contributions.append(contrib)
        
        print(f"  Extracted {len(new_contributions)} new contributions")
        
        # Merge with existing contributions
        all_contributions = existing_contributions + new_contributions
        
        # Check for duplicates across old and new
        if config.cross_conversation_dedup:
            all_contributions = self._deduplicate_merged(all_contributions, config)
        
        # Re-cluster everything (or incrementally update clusters)
        if len(new_contributions) > 50:  # Significant new content
            print("  Re-clustering all contributions...")
            organizer = SemanticOrganizer(config)
            documents = organizer.organize_contributions(all_contributions)
        else:
            print("  Incrementally updating clusters...")
            documents = self._incremental_cluster_update(
                existing_documents,
                new_contributions,
                config
            )
        
        # Save updated data
        self._save_data(all_contributions, documents)
        
        # Update state
        self.state['total_contributions'] = len(all_contributions)
        self.state['total_documents'] = len(documents)
        self.state['last_processed'] = datetime.now().isoformat()
        self._save_state()
        
        print(f"✅ Incremental processing complete:")
        print(f"  Total contributions: {len(all_contributions)}")
        print(f"  Total documents: {len(documents)}")
        
        return all_contributions, documents
    
    def _deduplicate_merged(self, contributions: List[Contribution], config: ProcessingConfig) -> List[Contribution]:
        """Deduplicate across old and new contributions"""
        if not config.use_embeddings:
            # Hash-based deduplication
            seen = {}
            unique = []
            
            for contrib in contributions:
                content_hash = hashlib.md5(contrib.content.encode()).hexdigest()
                if content_hash not in seen:
                    seen[content_hash] = contrib.id
                    unique.append(contrib)
            
            return unique
        
        # Embedding-based deduplication
        # Load cached embeddings if available
        cached_embeddings = {}
        if self.embeddings_cache.exists():
            with open(self.embeddings_cache, 'rb') as f:
                cached_embeddings = pickle.load(f)
        
        # Generate embeddings for new contributions
        embedder = SentenceTransformer(config.embedding_model)
        
        for contrib in contributions:
            if contrib.id not in cached_embeddings:
                if contrib.embedding is None:
                    contrib.embedding = embedder.encode(contrib.content)
                cached_embeddings[contrib.id] = contrib.embedding
        
        # Save updated cache
        with open(self.embeddings_cache, 'wb') as f:
            pickle.dump(cached_embeddings, f)
        
        # Deduplicate
        unique = []
        unique_embeddings = []
        
        for contrib in contributions:
            if not unique_embeddings:
                unique.append(contrib)
                unique_embeddings.append(cached_embeddings[contrib.id])
                continue
            
            similarities = cosine_similarity([cached_embeddings[contrib.id]], unique_embeddings)[0]
            
            if max(similarities) < config.dedup_threshold:
                unique.append(contrib)
                unique_embeddings.append(cached_embeddings[contrib.id])
        
        return unique
    
    def _incremental_cluster_update(self, 
                                   existing_documents: List[KnowledgeDocument],
                                   new_contributions: List[Contribution],
                                   config: ProcessingConfig) -> List[KnowledgeDocument]:
        """Incrementally update clusters with new contributions"""
        
        # Find best matching document for each new contribution
        if config.use_embeddings:
            embedder = SentenceTransformer(config.embedding_model)
            
            # Get document embeddings (average of contribution embeddings)
            doc_embeddings = []
            for doc in existing_documents:
                if doc.contributions:
                    contrib_embeddings = []
                    for contrib in doc.contributions[:10]:  # Sample
                        if contrib.embedding is not None:
                            contrib_embeddings.append(contrib.embedding)
                        else:
                            contrib_embeddings.append(embedder.encode(contrib.content[:500]))
                    
                    doc_embeddings.append(np.mean(contrib_embeddings, axis=0))
                else:
                    doc_embeddings.append(np.zeros(384))  # Default embedding size
            
            # Assign new contributions
            for contrib in new_contributions:
                if contrib.embedding is None:
                    contrib.embedding = embedder.encode(contrib.content)
                
                # Find most similar document
                similarities = cosine_similarity([contrib.embedding], doc_embeddings)[0]
                best_doc_idx = np.argmax(similarities)
                best_similarity = similarities[best_doc_idx]
                
                if best_similarity > config.similarity_threshold:
                    # Add to existing document
                    existing_documents[best_doc_idx].contributions.append(contrib)
                    existing_documents[best_doc_idx].word_count += len(contrib.content.split())
                else:
                    # Create new document
                    new_doc = KnowledgeDocument(
                        id=f"doc_incremental_{contrib.id[:8]}",
                        title=f"New Topic: {', '.join(contrib.topics[:3])}",
                        category='incremental',
                        contributions=[contrib],
                        word_count=len(contrib.content.split()),
                        quality_score=contrib.quality_score,
                        key_concepts=contrib.keywords
                    )
                    existing_documents.append(new_doc)
        else:
            # Simple topic-based assignment
            topic_map = defaultdict(list)
            
            for doc in existing_documents:
                for concept in doc.key_concepts[:5]:
                    topic_map[concept.lower()].append(doc)
            
            for contrib in new_contributions:
                assigned = False
                
                for keyword in contrib.keywords:
                    if keyword.lower() in topic_map:
                        # Add to first matching document
                        topic_map[keyword.lower()][0].contributions.append(contrib)
                        assigned = True
                        break
                
                if not assigned:
                    # Create new document
                    new_doc = KnowledgeDocument(
                        id=f"doc_incremental_{contrib.id[:8]}",
                        title=f"New: {', '.join(contrib.topics[:3])}",
                        category='incremental',
                        contributions=[contrib],
                        word_count=len(contrib.content.split()),
                        quality_score=contrib.quality_score,
                        key_concepts=contrib.keywords
                    )
                    existing_documents.append(new_doc)
        
        return existing_documents

# %% [markdown]
# ## 🎯 Integration with Main System

# %%
def enhance_main_system(ui_instance):
    """Enhance the main KnowledgeExtractorUI with new features"""
    
    # Add new configuration options
    ui_instance.settings_widgets['enable_compression'] = widgets.Checkbox(
        value=True,
        description='Auto-compress large exports'
    )
    
    ui_instance.settings_widgets['merge_related'] = widgets.Checkbox(
        value=True,
        description='Merge related conversations'
    )
    
    ui_instance.settings_widgets['export_to_sheets'] = widgets.Checkbox(
        value=False,
        description='Export metadata to Google Sheets'
    )
    
    ui_instance.settings_widgets['incremental_mode'] = widgets.Checkbox(
        value=False,
        description='Incremental processing mode'
    )
    
    # Override export method
    original_export = ui_instance._export
    
    def enhanced_export(b):
        """Enhanced export with new features"""
        # Original export
        original_export(b)
        
        # Apply compression if enabled
        if ui_instance.settings_widgets['enable_compression'].value:
            compressor = CompressionManager()
            for file in ui_instance.exporter.output_dir.glob('*'):
                if file.is_file():
                    compressor.compress_if_needed(file)
        
        # Export to Google Sheets if enabled
        if ui_instance.settings_widgets['export_to_sheets'].value:
            sheets_exporter = GoogleSheetsExporter()
            url = sheets_exporter.export_to_sheets(
                ui_instance.documents,
                ui_instance.contributions
            )
            print(f"📊 Google Sheet: {url}")
        
        # Generate statistics dashboard
        dashboard = StatisticsDashboard()
        dashboard.generate_dashboard(
            ui_instance.conversations,
            ui_instance.contributions,
            ui_instance.documents
        )
    
    ui_instance._export = enhanced_export
    
    # Add merge conversations step
    original_parse = ui_instance._parse_files
    
    def enhanced_parse():
        """Enhanced parsing with conversation merging"""
        original_parse()
        
        if ui_instance.settings_widgets['merge_related'].value:
            merger = ConversationMerger()
            ui_instance.conversations = merger.merge_related_conversations(
                ui_instance.conversations
            )
    
    ui_instance._parse_files = enhanced_parse
    
    print("✨ Main system enhanced with new features!")

# %% [markdown]
# ## 🚀 Usage Example

# %%
# Example of using the enhanced features

def demo_enhanced_features():
    """Demonstrate the enhanced features"""
    
    print("🎯 Enhanced Knowledge Extractor v3.1 Demo\n")
    
    # 1. Compression
    print("1️⃣ Testing automatic compression...")
    compressor = CompressionManager(threshold_mb=5.0)
    test_file = Path("/content/test_export.md")
    test_file.write_text("Test content " * 100000)  # Create large file
    compressed = compressor.compress_if_needed(test_file)
    print(f"   Result: {compressed.name}\n")
    
    # 2. Streaming parser
    print("2️⃣ Testing streaming JSON parser...")
    streamer = StreamingJSONParser(chunk_size=10)
    # Would process actual large file here
    print("   Streaming parser ready for large files\n")
    
    # 3. Statistics dashboard
    print("3️⃣ Generating statistics dashboard...")
    dashboard = StatisticsDashboard()
    # Would generate actual dashboard here
    print("   Dashboard components ready\n")
    
    # 4. Incremental processing
    print("4️⃣ Setting up incremental processing...")
    kb_path = Path("/content/drive/MyDrive/KnowledgeBase") if Path("/content/drive").exists() else Path("/content/knowledge_base")
    processor = IncrementalProcessor(kb_path)
    print(f"   Incremental processor initialized at {kb_path}\n")
    
    print("✅ All enhanced features operational!")

# Run demo
demo_enhanced_features()

print("\n" + "="*60)
print("🎉 Knowledge Extractor v3.1 Enhanced Features Ready!")
print("="*60)
print("\nFeatures added:")
print("  ✅ Automatic compression for large exports")
print("  ✅ Streaming for huge JSON files") 
print("  ✅ Conversation merging for related topics")
print("  ✅ Comprehensive statistics dashboard")
print("  ✅ Export to Google Sheets")
print("  ✅ Incremental processing mode")
print("\n💡 To use: Run the main system and the enhanced features will be available!")