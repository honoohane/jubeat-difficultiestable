#!/usr/bin/env python3
"""
从 atwiki 抓取全曲数据，生成 src/data/songMeta.js

用法 (项目根目录):
    python3 scripts/fetch_song_meta.py
公司网络需指定 CA:
    REQUESTS_CA_BUNDLE=/path/to/company-ca-bundle.pem python3 scripts/fetch_song_meta.py

version: 沿用现有 songMeta.js，新曲默认 DEFAULT_VERSION 并在终端列出
依赖: pip install cloudscraper beautifulsoup4
"""

import json
import re
from pathlib import Path

import cloudscraper
from bs4 import BeautifulSoup

WIKI_PAGES = [
    'https://w.atwiki.jp/jubeat/pages/2334.html',  # 旧曲
    'https://w.atwiki.jp/jubeat/pages/2333.html',  # 新曲
]
OUTPUT_PATH = Path(__file__).parent.parent / 'src' / 'data' / 'songMeta.js'
DEFAULT_VERSION = 'jubeat beyond the Ave.'

# 每张表前 9 列固定为: 曲名, アーティスト, BPM, 難易度 BSC/ADV/EXT, ノート数 BSC/ADV/EXT
FIELDS = ['title', 'artist', 'bpm', 'bsc_level', 'adv_level', 'ext_level',
          'bsc_note', 'adv_note', 'ext_note']


def normalize_title(title):
    """统一特殊符号（保留[2]标记）"""
    table = str.maketrans({
        '？': '?', '！': '!', '＠': '@', '（': '(', '）': ')', '～': '~', '－': '-',
    })
    return title.translate(table)


def clean_title(title):
    title = title.strip().rstrip('◆').strip()
    return re.sub(r'\s*\[2\]$', '[2]', title)


def parse_table(table):
    """展开 rowspan，返回本行实际含曲名单元格的歌曲行"""
    songs = []
    pending = {}  # col -> (cell, 剩余行数)
    for tr in table.find_all('tr'):
        if tr.find('th'):
            continue
        tds = tr.find_all('td')
        row = {}
        physical_title = None
        col = 0
        it = iter(tds)
        while True:
            if col in pending:
                cell, left = pending[col]
                row[col] = cell
                if left > 1:
                    pending[col] = (cell, left - 1)
                else:
                    del pending[col]
                col += 1
                continue
            td = next(it, None)
            if td is None:
                break
            span = int(td.get('colspan') or 1)
            rs = int(td.get('rowspan') or 1)
            if col == 0 and span == 1:
                physical_title = td
            for c in range(col, col + span):
                row[c] = td
                if rs > 1:
                    pending[c] = (td, rs - 1)
            col += span
        # 跳过分段标题行和被 rowspan 带下来的重复行
        if physical_title is None or any(c not in row for c in range(len(FIELDS))):
            continue
        songs.append({f: row[i].text.strip() for i, f in enumerate(FIELDS)})
    return songs


def fetch_songs():
    scraper = cloudscraper.create_scraper()
    songs = []
    for url in WIKI_PAGES:
        resp = scraper.get(url)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'html.parser')
        count = 0
        for table in soup.find_all('table'):
            header = table.find('th')
            if header is None or header.get_text(strip=True) != '曲名':
                continue
            rows = parse_table(table)
            songs.extend(rows)
            count += len(rows)
        print(f'{url}: {count} 首')
    return songs


def load_existing():
    if not OUTPUT_PATH.exists():
        return []
    content = OUTPUT_PATH.read_text(encoding='utf-8')
    return json.loads(content[content.index('['):])


def to_int(s):
    return int(s) if s.isdigit() else None


def main():
    existing = load_existing()
    by_key = {(s['title'], s['artist']): s for s in existing}  # 有同名曲
    by_title = {s['title']: s for s in existing}
    by_norm = {s['normalizedTitle']: s for s in existing}

    songs = []
    new_titles = []
    for raw in fetch_songs():
        title = clean_title(raw['title'])
        normalized = normalize_title(title)
        old = by_key.get((title, raw['artist'])) or by_title.get(title) or by_norm.get(normalized)
        if old:
            version = old['version']
        else:
            version = DEFAULT_VERSION
            new_titles.append(title)
        songs.append({
            'title': title,
            'normalizedTitle': normalized,
            'artist': raw['artist'],
            'bpm': raw['bpm'],
            'version': version,
            'bscLevel': raw['bsc_level'],
            'advLevel': raw['adv_level'],
            'extLevel': raw['ext_level'],
            'bscNotes': to_int(raw['bsc_note']),
            'advNotes': to_int(raw['adv_note']),
            'extNotes': to_int(raw['ext_note']),
        })

    new_set = {s['title'] for s in songs}
    removed = [s['title'] for s in existing if s['title'] not in new_set]
    changed = []
    for s in songs:
        old = by_key.get((s['title'], s['artist'])) or by_title.get(s['title'])
        if old and old != s:
            diff = [k for k in s if s[k] != old.get(k)]
            changed.append((s['title'], {k: (old.get(k), s[k]) for k in diff}))

    print(f'\n新曲 ({len(new_titles)}，version 默认 {DEFAULT_VERSION}):')
    for t in new_titles:
        print(f'  + {t}')
    print(f'\n现有但 wiki 上找不到 ({len(removed)}):')
    for t in removed:
        print(f'  - {t}')
    print(f'\n字段有变化 ({len(changed)}):')
    for t, d in changed:
        print(f'  * {t}: {d}')

    js = f'''// Jubeat 全曲元数据
// 来源: atwiki (pages/2334, 2333) + 现有 songMeta.js (version)
// 总计: {len(songs)} 首歌
// 字段: title, normalizedTitle, artist, bpm, version, bscLevel/advLevel/extLevel, bscNotes/advNotes/extNotes

export const songMeta = {json.dumps(songs, ensure_ascii=False, indent=2)}
'''
    OUTPUT_PATH.write_text(js, encoding='utf-8')
    print(f'\n写入 {OUTPUT_PATH}: {len(songs)} 首')


if __name__ == '__main__':
    main()
