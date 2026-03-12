import json
from pathlib import Path

source_path = (
    Path(__file__).resolve().parents[3]
    / 'ai_context'
    / 'chat_data'
    / 'gpt_conversations.json'
)

if not source_path.exists():
    print(f'Missing sample file: {source_path}')
    print('Place a chat export at this path to run quick_check.')
    raise SystemExit(0)

with source_path.open(encoding='utf-8') as f:
    d = json.load(f)

convs_with_msgs = [c for c in d if len(c.get('chat_messages', [])) > 0]
print(f'Total conversations: {len(d)}')
print(f'Convs with messages: {len(convs_with_msgs)}')

if convs_with_msgs:
    c = convs_with_msgs[0]
    print(f'\nExample: {c["name"]}')
    print(f'Messages: {len(c["chat_messages"])}')
    print(f'First msg keys: {list(c["chat_messages"][0].keys())}')
    print(f'First msg sender: {c["chat_messages"][0].get("sender")}')
    print(f'First msg text preview: {str(c["chat_messages"][0].get("text", ""))[:100]}')
