#!/usr/bin/env python3
"""
Analyze large chat export files and generate test samples
"""

import json
import sys
from pathlib import Path


def analyze_file(filepath):
    """Analyze a conversation file structure"""
    print(f"Analyzing: {filepath}")
    print("=" * 60)

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)

        if isinstance(data, list):
            total_convs = len(data)
            platforms = {}
            total_messages = 0
            samples = []

            for i, conv in enumerate(data[:5]):  # Sample first 5
                # Detect platform
                platform = 'unknown'
                msg_count = 0

                if 'mapping' in conv:
                    platform = 'chatgpt'
                    msg_count = len([n for n in conv['mapping'].values() if n.get('message')])
                elif 'chat_messages' in conv:
                    platform = 'claude'
                    msg_count = len(conv['chat_messages'])
                elif 'messages' in conv:
                    msg_count = len(conv['messages'])

                platforms[platform] = platforms.get(platform, 0) + 1
                total_messages += msg_count

                samples.append({
                    'index': i,
                    'title': conv.get('title') or conv.get('name', 'Untitled'),
                    'platform': platform,
                    'messages': msg_count
                })

            print(f"Total Conversations: {total_convs}")
            print(f"Estimated Total Messages: ~{total_messages * (total_convs / len(samples)):.0f}")
            print(f"\nPlatforms (from sample):")
            for platform, count in platforms.items():
                print(f"  {platform}: {count}")

            print(f"\nSample Conversations:")
            for sample in samples:
                print(f"  {sample['index']}. {sample['title'][:50]} ({sample['platform']}, {sample['messages']} msgs)")

            return total_convs, samples

    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON - {e}")
        return 0, []
    except Exception as e:
        print(f"Error: {e}")
        return 0, []


def generate_samples(filepath, output_dir, sizes):
    """Generate test samples of various sizes"""
    output_dir = Path(output_dir)
    output_dir.mkdir(exist_ok=True, parents=True)

    print(f"\nGenerating test samples...")
    print(f"Output directory: {output_dir}")

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)

        if not isinstance(data, list):
            print("Error: Expected JSON array")
            return

        for size_name, count in sizes.items():
            sample = data[:count]
            output_file = output_dir / f"{size_name}.json"

            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(sample, f, indent=2)

            file_size_mb = output_file.stat().st_size / (1024 * 1024)
            print(f"  [OK] {size_name}.json ({len(sample)} convs, {file_size_mb:.2f} MB)")

        print("\n[OK] Test sample generation complete!")

    except Exception as e:
        print(f"Error generating samples: {e}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  Analyze: python analyze_and_generate.py analyze <file>")
        print("  Generate: python analyze_and_generate.py generate <file> [output-dir]")
        sys.exit(1)

    command = sys.argv[1]

    if command == "analyze":
        filepath = sys.argv[2]
        analyze_file(filepath)

    elif command == "generate":
        filepath = sys.argv[2]
        output_dir = sys.argv[3] if len(sys.argv) > 3 else "./test-samples"

        sizes = {
            'tiny': 5,
            'small': 50,
            'medium': 500,
        }

        generate_samples(filepath, output_dir, sizes)

    else:
        print(f"Unknown command: {command}")
        sys.exit(1)
