import json

f = open(r'C:\Development\Projects\ai_convo_parser\ai_context\chat_data\gpt_conversations.json')
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

f.close()
