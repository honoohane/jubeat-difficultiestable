import csv
import json
import re

def normalize_title(title):
    """统一特殊符号（保留[2]标记）"""
    # 全角转半角
    title = title.replace('？', '?')
    title = title.replace('！', '!')
    title = title.replace('＠', '@')
    title = title.replace('（', '(')
    title = title.replace('）', ')')
    title = title.replace('～', '~')
    title = title.replace('－', '-')
    title = title.replace('"', '"').replace('"', '"')
    title = title.replace(''', "'").replace(''', "'")
    return title

# 读取 titleToVersion 映射
def load_title_to_version():
    with open('src/data/jacketMapping.js', 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 找到 titleToVersion 对象
    match = re.search(r'export const titleToVersion = \{([^}]+(?:\{[^}]*\}[^}]*)*)\}', content, re.DOTALL)
    if not match:
        print("Warning: titleToVersion not found")
        return {}
    
    # 解析键值对
    mapping = {}
    pairs = re.findall(r'"([^"]+)":\s*"([^"]+)"', match.group(1))
    for title, version in pairs:
        mapping[title] = version
    
    print(f"Loaded {len(mapping)} version mappings")
    return mapping

title_to_version = load_title_to_version()

songs = []
with open('/Users/pdf7083/Downloads/jubeat_list.csv', 'r', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    for row in reader:
        # 跳过重复的 header 行
        if row['title'] == 'title':
            continue
        
        # 保留原始标题
        original_title = row['title']
        # normalized 用于查找（符号统一后）
        normalized = normalize_title(original_title)
        
        # 查找版本（优先用原标题，找不到用 normalized）
        version = title_to_version.get(original_title) or title_to_version.get(normalized) or None
        
        songs.append({
            'title': original_title,  # 保留原始（含[2]）
            'normalizedTitle': normalized,  # 用于匹配
            'artist': row['artist'],
            'bpm': row['bpm'],
            'version': version,
            'bscLevel': row['bsc_level'],
            'advLevel': row['adv_level'],
            'extLevel': row['ext_level'],
            'bscNotes': int(row['bsc_note']) if row['bsc_note'] else None,
            'advNotes': int(row['adv_note']) if row['adv_note'] else None,
            'extNotes': int(row['ext_note']) if row['ext_note'] else None,
        })

# 统计没有版本的歌曲
no_version = [s['title'] for s in songs if s['version'] is None]
if no_version:
    print(f"Warning: {len(no_version)} songs without version:")
    for t in no_version[:10]:
        print(f"  - {t}")
    if len(no_version) > 10:
        print(f"  ... and {len(no_version) - 10} more")

# 生成 JS 文件
js_content = f'''// Jubeat 全曲元数据
// 来源: jubeat_list.csv + jacketMapping.js (version)
// 总计: {len(songs)} 首歌
// 字段: title, normalizedTitle, artist, bpm, version, bscLevel/advLevel/extLevel, bscNotes/advNotes/extNotes

export const songMeta = {json.dumps(songs, ensure_ascii=False, indent=2)}
'''

with open('src/data/songMeta.js', 'w', encoding='utf-8') as f:
    f.write(js_content)

print(f'转换完成: {len(songs)} 首歌')
