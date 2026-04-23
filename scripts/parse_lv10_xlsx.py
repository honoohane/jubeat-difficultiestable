#!/usr/bin/env python3
"""
解析 jubeat_lv10_by_level.xlsx 的 "排序用" sheet
生成 src/data/chartTags.js

数据结构:
{
  title: string,        // 曲名（保留[2]，去掉★※和难度标记）
  difficulty: string,   // BSC / ADV / EXT
  version: number,      // 1 或 2
  officialLevel: string,// 官方等级 "10.0" - "10.9"
  customLevel: string,  // 自定义等级 "10.0-" - "12.0++"
  type: string,         // stamina / balanced / technique
  isKojinsa: boolean,   // 个人差谱 (※)
  region: string,       // "jp" 仅日服, "cn" 国行已上线, "cn_only" 国行特供
  order: number,        // 排序序号
  tag: string | null    // 区分同封面歌曲的标识There is no application set to open the document “Jubeat 乐曲资源.rar”.
}
"""

import zipfile
import xml.etree.ElementTree as ET
import pandas as pd
import re
import json
from pathlib import Path

# === 配置 ===
XLSX_PATH = '/Users/pdf7083/Downloads/jubeat_lv10_by_level.xlsx'
OUTPUT_PATH = Path(__file__).parent.parent / 'src' / 'data' / 'chartTags.js'
SONGS_PATH = Path(__file__).parent.parent / 'src' / 'data' / 'songMeta.js'
SHEET_NAME = '排序用'
MAX_ROWS = 405

# 颜色映射 (从 Excel 样式中提取)
COLOR_MAP = {
    'FFCFE2F3': 'stamina',   # 蓝色 = 地力
    'FFFFE599': 'balanced',  # 黄色 = 综合
    'FFF4CCCC': 'technique', # 红色 = 手法
}

# Tag 映射 (区分同封面歌曲)
TAG_MAP = {
    'VOLAQUAS -GITADO ROCK ver.-': 'GTDR',
    'KHAMEN BREAK -SDVX Infinity MashUp-': 'SDVX',
    'Gray Heaven': 'G',
    '灰の羽搏': '灰',
    'Drenched in Air': 'D',
    '厳冬記': '厳',
    'JACK THE RIPPER feat. Iceon': 'J',
}



def normalize_title(s: str) -> str:
    """
    规范化标题，用于匹配 songMeta.js 中的标题
    """
    import unicodedata
    s = s.replace('[2]', '').strip()
    # 全角转半角
    s = s.replace('？', '?').replace('！', '!').replace('＠', '@')
    s = s.replace('（', '(').replace('）', ')').replace('～', '~').replace('－', '-')
    # 引号规范化
    s = re.sub(r'[""„‟]', '"', s)
    s = re.sub(r"[''‚‛]", "'", s)
    # NFD 规范化去掉变音符号
    s = unicodedata.normalize('NFD', s)
    s = re.sub(r'[\u0300-\u036f]', '', s)
    # 空格规范化
    s = re.sub(r'\s+', ' ', s)
    return s.lower()


def load_songs_titles() -> dict:
    """
    从 songMeta.js 加载所有歌曲标题
    返回 {normalized_title: original_title} 映射
    """
    content = SONGS_PATH.read_text(encoding='utf-8')
    # 提取所有 "title": "..." 字段 (JSON 格式)
    titles = re.findall(r'"title": "([^"]+)"', content)
    # 去重并建立映射
    title_map = {}
    for title in titles:
        normalized = normalize_title(title)
        if normalized not in title_map:
            title_map[normalized] = title
    return title_map


def read_excel_colors(xlsx_path: str, sheet_index: int = 13) -> dict:
    """
    从 Excel 文件读取单元格颜色
    返回 {row_number: color_code} 映射
    """
    ns = {'main': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    row_colors = {}
    
    with zipfile.ZipFile(xlsx_path, 'r') as z:
        # 读取样式
        with z.open('xl/styles.xml') as f:
            styles_tree = ET.parse(f)
            styles_root = styles_tree.getroot()
            
            fills = []
            for fill in styles_root.findall('.//main:fills/main:fill', ns):
                fg = fill.find('.//main:fgColor', ns)
                fills.append(fg.get('rgb') if fg is not None else None)
            
            xfs = []
            for xf in styles_root.findall('.//main:cellXfs/main:xf', ns):
                xfs.append(int(xf.get('fillId', 0)))
        
        # 读取 sheet
        sheet_file = f'xl/worksheets/sheet{sheet_index}.xml'
        with z.open(sheet_file) as f:
            sheet_tree = ET.parse(f)
            sheet_root = sheet_tree.getroot()
            
            for row in sheet_root.findall('.//main:sheetData/main:row', ns):
                row_num = int(row.get('r'))
                if row_num > MAX_ROWS:
                    break
                
                for cell in row.findall('main:c', ns):
                    ref = cell.get('r')
                    col = ''.join(c for c in ref if c.isalpha())
                    
                    # D列 = 曲名列
                    if col == 'D':
                        style_idx = int(cell.get('s', 0))
                        fill_idx = xfs[style_idx] if style_idx < len(xfs) else 0
                        color = fills[fill_idx] if fill_idx < len(fills) else None
                        if color:
                            row_colors[row_num] = color
    
    return row_colors


def parse_title(raw_title: str) -> dict:
    """
    解析曲名，提取各种信息
    
    输入: "★Confiserie(EXT)" 或 "※KAMAITACHI" 或 "AIR RAID[2]"
    输出: {
        'title': 'Confiserie',
        'difficulty': 'EXT',
        'version': 1,
        'isKojinsa': False
    }
    """
    title = raw_title.strip()
    
    # 检测个人差 (※)
    is_kojinsa = title.startswith('※')
    if is_kojinsa:
        title = title[1:]
    
    # 去掉标杆标记 (★)
    if title.startswith('★'):
        title = title[1:]
    
    # 检测 version ([2])
    version = 1
    if title.endswith('[2]'):
        version = 2
        # 保留 [2] 在 title 中
    
    # 提取难度 (EXT)/(ADV)/(BSC) 或 [EXT]/[ADV]/[BSC]
    difficulty = 'EXT'  # 默认
    # 先尝试圆括号
    diff_match = re.search(r'\((EXT|ADV|BSC)\)$', title)
    if diff_match:
        difficulty = diff_match.group(1)
        title = title[:diff_match.start()]
    else:
        # 再尝试方括号 (Sky High 特殊格式)
        diff_match = re.search(r'\[(EXT|ADV|BSC)\]$', title)
        if diff_match:
            difficulty = diff_match.group(1)
            title = title[:diff_match.start()]
    
    return {
        'title': title,
        'difficulty': difficulty,
        'version': version,
        'isKojinsa': is_kojinsa,
    }


def get_tag(title: str) -> str | None:
    """获取同封面歌曲的区分标识"""
    for pattern, tag in TAG_MAP.items():
        if pattern in title:
            return tag
    return None


def custom_level_sort_key(level: str) -> tuple:
    """
    customLevel 排序键
    "10.0-" < "10.0" < "10.0+" < "10.0++" < "10.1" < ... < "12.0++"
    
    返回 (数字部分, 后缀权重)
    """
    level = level.strip()
    
    # 提取后缀
    if level.endswith('++'):
        base = level[:-2]
        suffix = 2
    elif level.endswith('+'):
        base = level[:-1]
        suffix = 1
    elif level.endswith('-'):
        base = level[:-1]
        suffix = -1
    else:
        base = level
        suffix = 0
    
    try:
        num = float(base)
    except ValueError:
        num = 0.0
    
    return (num, suffix)
    return None


def main():
    print(f"读取 Excel: {XLSX_PATH}")
    print(f"Sheet: {SHEET_NAME}")
    
    # 0. 加载 songMeta.js 标题映射
    print("\n加载 songMeta.js 标题...")
    songs_title_map = load_songs_titles()
    print(f"  获取 {len(songs_title_map)} 个唯一标题")
    
    # 1. 读取颜色
    print("\n读取单元格颜色...")
    row_colors = read_excel_colors(XLSX_PATH, sheet_index=13)
    print(f"  获取 {len(row_colors)} 行颜色数据")
    
    # 2. 读取数据
    print("\n读取数据...")
    df = pd.read_excel(
        XLSX_PATH, 
        sheet_name=SHEET_NAME, 
        usecols=[0, 3, 4, 5],  # 新等级, 曲名, 旧等级, 国行
        nrows=MAX_ROWS, 
        engine='calamine'
    )
    df.columns = ['customLevel', 'rawTitle', 'officialLevel', 'cnTag']
    
    # 填充 customLevel (NaN 用上一行的值)
    df['customLevel'] = df['customLevel'].ffill()
    
    # 过滤掉空行
    df = df[df['rawTitle'].notna()]
    print(f"  获取 {len(df)} 条数据")
    
    # 3. 处理数据
    print("\n处理数据...")
    songs = []
    
    for idx, row in df.iterrows():
        excel_row = idx + 2  # Excel 行号 (1-indexed, 跳过表头)
        
        # 解析曲名
        parsed = parse_title(row['rawTitle'])
        
        # 获取颜色/类型
        color = row_colors.get(excel_row)
        song_type = COLOR_MAP.get(color, 'balanced')  # 默认综合
        
        # 格式化等级
        official = row['officialLevel']
        if pd.notna(official):
            official = f"{float(official):.1f}" if isinstance(official, (int, float)) else str(official)
        else:
            official = "10.0"
        
        custom = row['customLevel']
        if pd.notna(custom):
            custom = str(custom).strip()
        else:
            custom = "11.0"
        
        # 国行区域
        cn_tag = row['cnTag']
        if cn_tag == '已实装':
            region = 'cn'
        elif cn_tag == '国行特供':
            region = 'cn_only'
        else:
            region = 'jp'
        
        # Tag
        tag = get_tag(row['rawTitle'])
        
        # 从 songMeta.js 查找正确的 jacketTitle
        normalized = normalize_title(parsed['title'])
        jacket_title = songs_title_map.get(normalized, None)
        
        song = {
            'id': 0,  # 全局序号，排序后赋值
            'title': parsed['title'],
            'jacketTitle': jacket_title,  # 用于封面查找的正确标题
            'difficulty': parsed['difficulty'],
            'version': parsed['version'],
            'officialLevel': official,
            'customLevel': custom,
            'type': song_type,
            'isKojinsa': parsed['isKojinsa'],
            'region': region,
            'order': 0,  # 组内序号，排序后赋值
            'tag': tag,
        }
        songs.append(song)
    
    # 3.5 按 (customLevel, isKojinsa) 排序后重新赋 order
    # 排序规则: customLevel 降序, 同级内 非个人差在前
    songs.sort(key=lambda s: (
        (-custom_level_sort_key(s['customLevel'])[0], -custom_level_sort_key(s['customLevel'])[1]),
        s['isKojinsa'],
    ))
    
    # id: 全局序号 1-N (方便索引/merge)
    # order: 每个 (customLevel, isKojinsa) 组内从 1 开始
    from collections import defaultdict
    group_counters = defaultdict(int)
    for i, song in enumerate(songs):
        song['id'] = i + 1
        key = (song['customLevel'], song['isKojinsa'])
        group_counters[key] += 1
        song['order'] = group_counters[key]
    
    # 4. 统计
    print("\n统计:")
    print(f"  总数: {len(songs)}")
    print(f"  地力谱: {sum(1 for s in songs if s['type'] == 'stamina')}")
    print(f"  综合谱: {sum(1 for s in songs if s['type'] == 'balanced')}")
    print(f"  手法谱: {sum(1 for s in songs if s['type'] == 'technique')}")
    print(f"  个人差: {sum(1 for s in songs if s['isKojinsa'])}")
    print(f"  国行已上线: {sum(1 for s in songs if s['region'] == 'cn')}")
    print(f"  国行特供: {sum(1 for s in songs if s['region'] == 'cn_only')}")
    print(f"  仅日服: {sum(1 for s in songs if s['region'] == 'jp')}")
    print(f"  有 tag: {sum(1 for s in songs if s['tag'])}")
    
    # 统计 jacketTitle 匹配情况
    missing_jacket = [s for s in songs if s['jacketTitle'] is None]
    print(f"  封面匹配: {len(songs) - len(missing_jacket)}/{len(songs)}")
    if missing_jacket:
        print(f"\n⚠️ 以下 {len(missing_jacket)} 首歌曲未找到封面标题:")
        for s in missing_jacket[:10]:
            print(f"    - {s['title']}")
        if len(missing_jacket) > 10:
            print(f"    ... 还有 {len(missing_jacket) - 10} 首")
    
    # 5. 输出 JS 文件
    print(f"\n输出到: {OUTPUT_PATH}")
    
    js_content = """// Jubeat Lv10 难度表数据
// 来源: jubeat_lv10_by_level.xlsx "排序用" sheet
// 生成时间: 自动生成

export const chartTags = """
    
    # 格式化 JSON
    json_str = json.dumps(songs, ensure_ascii=False, indent=2)
    js_content += json_str + ";\n"
    
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(js_content, encoding='utf-8')
    
    print("完成!")
    
    # 6. 显示前10条数据
    print("\n前10条数据预览:")
    for s in songs[:10]:
        tag_str = f" [{s['tag']}]" if s['tag'] else ""
        kojinsa_str = " ※" if s['isKojinsa'] else ""
        region_str = " 🇨🇳" if s['region'] == 'cn' else (" 🇨🇳!" if s['region'] == 'cn_only' else "")
        print(f"  #{s['id']:3d} | {s['order']:2d} | {s['customLevel']:7} | {s['type']:9} | {s['difficulty']} | {s['title'][:28]}{tag_str}{kojinsa_str}{region_str}")


if __name__ == '__main__':
    main()
