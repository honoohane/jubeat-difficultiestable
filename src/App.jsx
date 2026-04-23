import { useState, useMemo, useRef, useEffect } from 'react'
import './App.css'
import { chartTags } from './data/chartTags'
import { songMeta } from './data/songMeta'
import { titleToId } from './data/jacketMapping'

// 所有等级（从高到低排序）
const ALL_LEVELS = [
  '12.0++', '12.0+', '12.0',
  '11.9', '11.8', '11.7', '11.6', '11.5', '11.4', '11.3', '11.2', '11.1', '11.0',
  '10.9', '10.8', '10.7', '10.6', '10.5', '10.4', '10.3', '10.2', '10.1', '10.0', '10.0-', '10.0--'
]

// 版本列表（显示顺序）
const ALL_VERSIONS = [
  'jubeat',
  'jubeat ripples',
  'jubeat ripples APPEND',
  'jubeat knit',
  'jubeat knit APPEND',
  'jubeat copious',
  'jubeat copious APPEND',
  'jubeat saucer',
  'jubeat saucer fulfill',
  'jubeat prop',
  'jubeat Qubell',
  'jubeat clan',
  'jubeat festo',
  'jubeat Ave.',
  'jubeat beyond the Ave.',
]

// 国行特供版本
const CN_ONLY_VERSION = 'jubeat 音乐魔方'

// 国行特供曲目列表
const CN_ONLY_SONGS = ['Heracles', 'Wildfire', 'Booby Trap']

// Normalize title for matching
const normalizeTitle = (str) => {
  return str
    .replace(/\[2\]$/, '')
    .trim()
    .replace(/？/g, '?')
    .replace(/！/g, '!')
    .replace(/＠/g, '@')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/～/g, '~')
    .replace(/－/g, '-')
    .replace(/[""„‟]/g, '"')
    .replace(/[''‚‛]/g, "'")
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

// Build normalized lookup table
const normalizedMapping = {}
Object.entries(titleToId).forEach(([title, id]) => {
  const normalized = normalizeTitle(title)
  normalizedMapping[normalized] = id
})

// Find jacket ID
const findJacketId = (title) => {
  const normalized = normalizeTitle(title)
  return normalizedMapping[normalized] || null
}

// Get jacket URL (本地 webp 文件)
// 优先使用 jacketTitle (从 songs.js 匹配)，否则用 title
const getJacketUrl = (song) => {
  const title = song.jacketTitle || song.title
  const jacketId = findJacketId(title)
  if (jacketId) {
    return `/jackets/${jacketId}.webp`
  }
  return '/jackets/placeholder.webp'
}

// 构建 title -> version 映射
const titleToVersion = Object.fromEntries(
  songMeta.map(s => [s.title, s.version])
)

// 构建 title -> songMeta 映射（用于 hover 显示详情）
const titleToMeta = Object.fromEntries(
  songMeta.map(s => [s.title, s])
)

// Get song version from songMeta
const getSongVersion = (title) => {
  // 国行特供曲目
  if (CN_ONLY_SONGS.includes(title)) {
    return CN_ONLY_VERSION
  }
  return titleToVersion[title] || 'jubeat beyond the Ave.'
}

// 获取歌曲的 notes 数量
const getSongNotes = (title, difficulty) => {
  const meta = titleToMeta[title]
  if (!meta) return null
  const key = `${difficulty.toLowerCase()}Notes`
  return meta[key]
}

// Format level display
const formatLevel = (level) => {
  return level >= 9 ? level.toFixed(1) : String(level)
}

// 根据 customLevel 返回边栏文字颜色 (深灰背景上)
const getLevelColor = (levelStr) => {
  // 只有特殊等级有颜色，其他用白色
  if (levelStr === '12.0++') return '#FF6060'  // 最高 - 亮红
  if (levelStr === '12.0+') return '#FF8080'   // 次高 - 浅红
  if (levelStr === '12.0') return '#FFA0A0'    // 高 - 淡红
  if (levelStr === '10.0') return '#C0E0FF'    // 低 - 最浅蓝
  if (levelStr === '10.0-') return '#80C0FF'   // 次低 - 淡天蓝
  if (levelStr === '10.0--') return '#40A0FF'  // 最低 - 亮蓝
  return '#FFFFFF'  // 其他 - 白色
}

// 格式化等级显示：把 ++, +, -, -- 变成右上角小字
const formatLevelDisplay = (levelStr) => {
  if (levelStr.endsWith('++')) {
    return <>{levelStr.slice(0, -2)}<sup>++</sup></>
  }
  if (levelStr.endsWith('--')) {
    return <>{levelStr.slice(0, -2)}<sup>--</sup></>
  }
  if (levelStr.endsWith('+')) {
    return <>{levelStr.slice(0, -1)}<sup>+</sup></>
  }
  if (levelStr.endsWith('-')) {
    return <>{levelStr.slice(0, -1)}<sup>-</sup></>
  }
  return levelStr
}

// Get difficulty color class
const getDifficultyClass = (difficulty) => {
  return `difficulty-${difficulty.toLowerCase()}`
}

// 渲染单个歌曲卡片
const SongCard = ({ song }) => {
  const meta = titleToMeta[song.title]
  const notes = getSongNotes(song.title, song.difficulty)
  const [tooltipPos, setTooltipPos] = useState({ vertical: 'top', horizontal: 'center' })
  const cardRef = useRef(null)
  
  const handleMouseEnter = () => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const tooltipHeight = 200
    // 估算tooltip宽度：基础宽度 + 歌名长度
    const estimatedWidth = Math.max(260, song.title.length * 14 + 150)
    
    // 垂直方向：如果上方空间不够，显示在下方
    const vertical = rect.top < tooltipHeight + 20 ? 'bottom' : 'top'
    
    // 水平方向：根据card位置和估算的tooltip宽度决定
    const cardCenterX = rect.left + rect.width / 2
    let horizontal = 'center'
    
    // 如果居中会超出右边
    if (cardCenterX + estimatedWidth / 2 > window.innerWidth - 10) {
      horizontal = 'right'  // 靠右显示（向左展开）
    }
    // 如果居中会超出左边
    else if (cardCenterX - estimatedWidth / 2 < 10) {
      horizontal = 'left'  // 靠左显示（向右展开）
    }
    
    setTooltipPos({ vertical, horizontal })
  }
  
  return (
    <div 
      className="chart-body"
      data-difficulty={song.difficulty}
      ref={cardRef}
      onMouseEnter={handleMouseEnter}
    >
      <div className="chart-body-image">
        <div className={`chart-jacket ${getDifficultyClass(song.difficulty)} type-${song.type}`}>
          {song.version === 2 && <div className="chart-version2"></div>}
          {song.tag === 'GTDR' && <div className="chart-gtdr"></div>}
          {song.tag === 'SDVX' && <div className="chart-sdvx"></div>}
          <div className={`chart-level ${getDifficultyClass(song.difficulty)}`}>
            {song.officialLevel}
          </div>
          <img 
            className="chart-image"
            src={getJacketUrl(song)}
            alt={song.title}
            loading="lazy"
            onError={(e) => {
              e.target.style.display = 'none'
            }}
          />
        </div>
        <div className="chart-title">{song.title}</div>
        
        {/* Hover Tooltip */}
        <div 
          className={`chart-tooltip tooltip-${tooltipPos.vertical} tooltip-${tooltipPos.horizontal}`}
        >
          <div className="tooltip-jacket">
            <img src={getJacketUrl(song)} alt={song.title} />
          </div>
          <div className="tooltip-info">
            <div className="tooltip-title">{song.title}</div>
            <div className="tooltip-artist">{meta?.artist || 'Unknown'}</div>
            <div className="tooltip-row">
              <span className="tooltip-label">BPM</span>
              <span className="tooltip-value">{meta?.bpm || '-'}</span>
            </div>
            <div className="tooltip-row">
              <span className={`tooltip-diff tooltip-diff-${song.difficulty.toLowerCase()}`}>
                {song.difficulty}
              </span>
              <span className="tooltip-value">{song.officialLevel}</span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">NOTES</span>
              <span className="tooltip-value">{notes || '-'}</span>
            </div>
            <div className="tooltip-version">{meta?.version || '-'}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function App() {
  // 筛选状态
  const [selectedRegion, setSelectedRegion] = useState('JP') // JP=官机, CN=国行 (单选)
  const [minLevel, setMinLevel] = useState('9.0')
  const [maxLevel, setMaxLevel] = useState('10.9')
  const [selectedDifficulties, setSelectedDifficulties] = useState(['BSC', 'ADV', 'EXT'])
  const [selectedCharts, setSelectedCharts] = useState([1, 2])
  const [selectedTypes, setSelectedTypes] = useState(['stamina', 'balanced', 'technique'])
  const [selectedVersions, setSelectedVersions] = useState([...ALL_VERSIONS])
  const [versionDropdownOpen, setVersionDropdownOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 1024)

  // 监听窗口宽度变化 (使用 matchMedia 支持开发者工具设备切换)
  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1024px)')
    const handleChange = (e) => setIsMobile(e.matches)
    
    // 初始化时同步状态
    setIsMobile(mediaQuery.matches)
    
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  // 根据区域动态计算可用版本列表
  const availableVersions = useMemo(() => {
    if (selectedRegion === 'CN') {
      return [...ALL_VERSIONS, CN_ONLY_VERSION]
    }
    return ALL_VERSIONS
  }, [selectedRegion])

  // 区域切换时更新版本选择
  useEffect(() => {
    if (selectedRegion === 'CN') {
      // 切换到国行时，自动选中国行特供版本
      setSelectedVersions(prev => {
        if (!prev.includes(CN_ONLY_VERSION)) {
          return [...prev, CN_ONLY_VERSION]
        }
        return prev
      })
    } else {
      // 切换到官机时，移除国行特供版本
      setSelectedVersions(prev => prev.filter(v => v !== CN_ONLY_VERSION))
    }
  }, [selectedRegion])
  const versionDropdownRef = useRef(null)

  // Level step functions
  const stepUp = (current) => {
    const num = parseFloat(current)
    if (isNaN(num)) return '10.0'
    if (num >= 10.9) return '10.9'
    if (num >= 9) {
      const next = Math.round((num + 0.1) * 10) / 10
      return next > 10.9 ? '10.9' : formatLevel(next)
    } else if (num >= 8) {
      return '9.0'
    } else {
      return formatLevel(Math.min(num + 1, 8))
    }
  }

  const stepDown = (current) => {
    const num = parseFloat(current)
    if (isNaN(num)) return '10.0'
    if (num <= 1) return '1'
    if (num > 9) {
      const next = Math.round((num - 0.1) * 10) / 10
      return formatLevel(next)
    } else if (num >= 9) {
      return '8'
    } else {
      return formatLevel(Math.max(num - 1, 1))
    }
  }

  const handleLevelKeyDown = (e, value, setter) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setter(stepUp(value))
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setter(stepDown(value))
    }
  }

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (versionDropdownRef.current && !versionDropdownRef.current.contains(event.target)) {
        setVersionDropdownOpen(false)
      }
    }
    if (versionDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [versionDropdownOpen])

  // Toggle difficulty selection
  const toggleDifficulty = (diff) => {
    setSelectedDifficulties(prev => {
      if (prev.includes(diff)) {
        if (prev.length === 1) return prev
        return prev.filter(d => d !== diff)
      } else {
        return [...prev, diff]
      }
    })
  }

  // Toggle chart selection
  const toggleChart = (chart) => {
    setSelectedCharts(prev => {
      if (prev.includes(chart)) {
        if (prev.length === 1) return prev
        return prev.filter(c => c !== chart)
      } else {
        return [...prev, chart]
      }
    })
  }

  // Toggle type selection
  const toggleType = (type) => {
    setSelectedTypes(prev => {
      if (prev.includes(type)) {
        if (prev.length === 1) return prev
        return prev.filter(t => t !== type)
      } else {
        return [...prev, type]
      }
    })
  }

  // Toggle version selection
  const toggleVersion = (version) => {
    setSelectedVersions(prev => {
      if (prev.includes(version)) {
        return prev.filter(v => v !== version)
      } else {
        return [...prev, version]
      }
    })
  }

  // Select/Deselect all versions
  const toggleAllVersions = () => {
    if (selectedVersions.length === availableVersions.length) {
      setSelectedVersions([])
    } else {
      setSelectedVersions([...availableVersions])
    }
  }

  // 重置筛选条件（不重置官机/国行选择）
  const resetFilters = () => {
    setMinLevel('9.0')
    setMaxLevel('10.9')
    setSelectedDifficulties(['BSC', 'ADV', 'EXT'])
    setSelectedCharts([1, 2])
    setSelectedTypes(['stamina', 'balanced', 'technique'])
    setSelectedVersions([...availableVersions])
    setSearchQuery('')
  }

  // 过滤歌曲
  const filteredSongs = useMemo(() => {
    const minLv = parseFloat(minLevel) || 0
    const maxLv = parseFloat(maxLevel) || 99
    const query = searchQuery.toLowerCase().trim()
    return chartTags.filter(song => {
      // 搜索过滤
      if (query && !song.title.toLowerCase().includes(query)) {
        return false
      }
      // 区域过滤: JP=全曲-国行特供, CN=国行已上线+国行特供
      const regionMatch = selectedRegion === 'JP' 
        ? song.region !== 'cn_only'
        : (song.region === 'cn' || song.region === 'cn_only')
      // 官方难度范围过滤
      const officialLv = parseFloat(song.officialLevel) || 0
      const levelMatch = officialLv >= minLv && officialLv <= maxLv
      return regionMatch && levelMatch &&
        selectedDifficulties.includes(song.difficulty) &&
        selectedCharts.includes(song.version) &&
        selectedTypes.includes(song.type) &&
        selectedVersions.includes(getSongVersion(song.title))
    })
  }, [selectedRegion, minLevel, maxLevel, selectedDifficulties, selectedCharts, selectedTypes, selectedVersions, searchQuery])

  // 按 customLevel 分组，区分普通/个人差
  const songsByLevel = useMemo(() => {
    // 初始化所有等级的空分组
    const groups = {}
    ALL_LEVELS.forEach(level => {
      groups[level] = { normal: [], kojinsa: [] }
    })
    
    // 填充筛选后的歌曲
    filteredSongs.forEach(song => {
      const levelKey = song.customLevel
      if (groups[levelKey]) {
        if (song.isKojinsa) {
          groups[levelKey].kojinsa.push(song)
        } else {
          groups[levelKey].normal.push(song)
        }
      }
    })

    // 使用固定的等级顺序
    return { groups, sortedLevels: ALL_LEVELS }
  }, [filteredSongs])

  return (
    <div className="container">
      {/* Header Row: 标题 + 区域选择器 */}
      <div className="header-row">
        <div className="container-header">
          <img src="/icon.png" alt="JUBEAT" className="title-icon" />
          <div className="title-text">LV.10 SSS难易度表</div>
        </div>
        <div className="region-bar">
          <label className={`region-radio ${selectedRegion === 'JP' ? 'checked' : ''}`}>
            <input
              type="radio"
              name="region"
              checked={selectedRegion === 'JP'}
              onChange={() => setSelectedRegion('JP')}
            />
            <span className="radio-circle"></span>
            <img src="/icon-jp.png" alt="官机" className="region-icon" />
          </label>
          <label className={`region-radio ${selectedRegion === 'CN' ? 'checked' : ''}`}>
            <input
              type="radio"
              name="region"
              checked={selectedRegion === 'CN'}
              onChange={() => setSelectedRegion('CN')}
            />
            <span className="radio-circle"></span>
            <img src="/icon-cn.png" alt="国行" className="region-icon" />
          </label>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar">
        {/* 难度范围选择 + 谱面类型 - 同一行 */}
        <div className="filter-row filter-row-top">
          <div className="level-range-selector">
            <div className="level-input-item level-min">
              <label>下限 (Min Level)</label>
              <div className="level-input-wrapper">
                <button 
                  type="button" 
                  className="step-btn"
                  onClick={() => setMinLevel(stepDown(minLevel))}
                >−</button>
                <input
                  type="text"
                  value={minLevel}
                  onChange={(e) => setMinLevel(e.target.value)}
                  onKeyDown={(e) => handleLevelKeyDown(e, minLevel, setMinLevel)}
                />
                <button 
                  type="button" 
                  className="step-btn"
                  onClick={() => setMinLevel(stepUp(minLevel))}
                >+</button>
              </div>
            </div>
            <div className="level-input-item level-max">
              <label>上限 (Max Level)</label>
              <div className="level-input-wrapper">
                <button 
                  type="button" 
                  className="step-btn"
                  onClick={() => setMaxLevel(stepDown(maxLevel))}
                >−</button>
                <input
                  type="text"
                  value={maxLevel}
                  onChange={(e) => setMaxLevel(e.target.value)}
                  onKeyDown={(e) => handleLevelKeyDown(e, maxLevel, setMaxLevel)}
                />
                <button 
                  type="button" 
                  className="step-btn"
                  onClick={() => setMaxLevel(stepUp(maxLevel))}
                >+</button>
              </div>
            </div>
          </div>

          {/* 难度筛选 */}
          <div className="difficulty-selector">
            <label className={`difficulty-checkbox ${selectedDifficulties.includes('BSC') ? 'checked' : ''}`}>
              <input
                type="checkbox"
                checked={selectedDifficulties.includes('BSC')}
                onChange={() => toggleDifficulty('BSC')}
              />
              <span className="custom-checkbox checkbox-bsc"></span>
              <span className="difficulty-tag difficulty-bsc">BASIC</span>
            </label>
            <label className={`difficulty-checkbox ${selectedDifficulties.includes('ADV') ? 'checked' : ''}`}>
              <input
                type="checkbox"
                checked={selectedDifficulties.includes('ADV')}
                onChange={() => toggleDifficulty('ADV')}
              />
              <span className="custom-checkbox checkbox-adv"></span>
              <span className="difficulty-tag difficulty-adv">ADVANCED</span>
            </label>
            <label className={`difficulty-checkbox ${selectedDifficulties.includes('EXT') ? 'checked' : ''}`}>
              <input
                type="checkbox"
                checked={selectedDifficulties.includes('EXT')}
                onChange={() => toggleDifficulty('EXT')}
              />
              <span className="custom-checkbox checkbox-ext"></span>
              <span className="difficulty-tag difficulty-ext">EXTREME</span>
            </label>
          </div>
        </div>

        {/* 谱面类型筛选 */}
        <div className="filter-row">
          <div className="type-selector">
            <label className={`difficulty-checkbox ${selectedTypes.includes('stamina') ? 'checked' : ''}`}>
              <input
                type="checkbox"
                checked={selectedTypes.includes('stamina')}
                onChange={() => toggleType('stamina')}
              />
              <span className="custom-checkbox checkbox-stamina"></span>
              <span className="type-tag type-stamina">地力谱</span>
            </label>
            <label className={`difficulty-checkbox ${selectedTypes.includes('balanced') ? 'checked' : ''}`}>
              <input
                type="checkbox"
                checked={selectedTypes.includes('balanced')}
                onChange={() => toggleType('balanced')}
              />
              <span className="custom-checkbox checkbox-balanced"></span>
              <span className="type-tag type-balanced">综合谱</span>
            </label>
            <label className={`difficulty-checkbox ${selectedTypes.includes('technique') ? 'checked' : ''}`}>
              <input
                type="checkbox"
                checked={selectedTypes.includes('technique')}
                onChange={() => toggleType('technique')}
              />
              <span className="custom-checkbox checkbox-technique"></span>
              <span className="type-tag type-technique">手法谱</span>
            </label>
          </div>

          {/* 谱面版本筛选 */}
          <div className="chart-selector">
            <label className={`difficulty-checkbox ${selectedCharts.includes(1) ? 'checked' : ''}`}>
              <input
                type="checkbox"
                checked={selectedCharts.includes(1)}
                onChange={() => toggleChart(1)}
              />
              <span className="custom-checkbox checkbox-chart1"></span>
              <span className="chart-tag chart-1">[1]谱面</span>
            </label>
            <label className={`difficulty-checkbox ${selectedCharts.includes(2) ? 'checked' : ''}`}>
              <input
                type="checkbox"
                checked={selectedCharts.includes(2)}
                onChange={() => toggleChart(2)}
              />
              <span className="custom-checkbox checkbox-chart2"></span>
              <span className="chart-tag chart-2">[2]谱面</span>
            </label>
          </div>

          {/* 游戏版本筛选 */}
          <div className="version-selector" ref={versionDropdownRef}>
            <div 
              className="version-dropdown-trigger"
              onClick={() => setVersionDropdownOpen(!versionDropdownOpen)}
            >
              <span>版本 ({selectedVersions.length}/{availableVersions.length})</span>
              <span className="dropdown-arrow">{versionDropdownOpen ? '▲' : '▼'}</span>
            </div>
            {versionDropdownOpen && (
              <div className="version-dropdown">
                <div className="version-option version-all" onClick={toggleAllVersions}>
                  <input
                    type="checkbox"
                    checked={selectedVersions.length === availableVersions.length}
                    readOnly
                  />
                  <span>{selectedVersions.length === availableVersions.length ? '取消全选' : '全选'}</span>
                </div>
                {availableVersions.map(version => (
                  <div key={version} className="version-option" onClick={() => toggleVersion(version)}>
                    <input
                      type="checkbox"
                      checked={selectedVersions.includes(version)}
                      readOnly
                    />
                    <span>{version}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="filter-footer">
          <input
            type="text"
            className="search-input"
            placeholder="搜索歌曲..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button className="reset-btn" onClick={resetFilters}>RESET</button>
          <div className="filter-stats">
            显示 {filteredSongs.length} / {selectedRegion === 'CN' 
              ? chartTags.filter(s => s.region === 'cn' || s.region === 'cn_only').length 
              : chartTags.filter(s => s.region !== 'cn_only').length} 曲
          </div>
        </div>
      </div>
      
      <div className="wrapper">
        {/* 排序指示器 */}
        <div className="sort-indicator">
          <div className="sort-label-group">
            <span className="sort-label sort-stamina">地力</span>
            <span className="sort-sub">*高速 体力 节奏难</span>
          </div>
          <div className="sort-arrow-line sort-arrow-left"></div>
          <span className="sort-label sort-balanced">综合</span>
          <div className="sort-arrow-line sort-arrow-right"></div>
          <div className="sort-label-group sort-label-group-right">
            <span className="sort-label sort-technique">手法</span>
            <span className="sort-sub">*指法 设计 锁手 初见杀</span>
          </div>
        </div>

        {/* 合并的 12.0 系列 (12.0++, 12.0+, 12.0) */}
        {(() => {
          const lv12pp = songsByLevel.groups['12.0++'] || { normal: [], kojinsa: [] }
          const lv12p = songsByLevel.groups['12.0+'] || { normal: [], kojinsa: [] }
          const lv12 = songsByLevel.groups['12.0'] || { normal: [], kojinsa: [] }
          
          // 手机端：拆成独立行
          if (isMobile) {
            return (
              <>
                {[
                  { level: '12.0++', data: lv12pp },
                  { level: '12.0+', data: lv12p },
                  { level: '12.0', data: lv12 }
                ].map(({ level, data }) => (
                  <div key={level} className="level-box">
                    <div className="level-sidebar">
                      <div className="level-sidebar-label" style={{ color: getLevelColor(level) }}>{formatLevelDisplay(level)}</div>
                      <div className="level-sidebar-count">{data.normal.length + data.kojinsa.length} 曲</div>
                    </div>
                    <div className="level-body-wrapper">
                      <div className="level-body level-body-normal">
                        {data.normal.map(song => <SongCard key={song.id} song={song} />)}
                      </div>
                      <div className="level-body-kojinsa-wrapper">
                        <div className="kojinsa-title">个人差</div>
                        <div className="level-body level-body-kojinsa">
                          {data.kojinsa.map(song => <SongCard key={song.id} song={song} />)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )
          }
          
          // 桌面端：合并行
          const combinedKojinsa = [...lv12pp.kojinsa, ...lv12p.kojinsa, ...lv12.kojinsa]
          
          return (
            <div className="level-box level-box-combined">
              {/* 12.0++ 小组 */}
              <div className="combined-section">
                <div className="level-sidebar">
                  <div className="level-sidebar-label" style={{ color: getLevelColor('12.0++') }}>{formatLevelDisplay('12.0++')}</div>
                  <div className="level-sidebar-count">{lv12pp.normal.length + lv12pp.kojinsa.length} 曲</div>
                </div>
                <div className="level-body-wrapper">
                  <div className="combined-songs">
                    {lv12pp.normal.map(song => <SongCard key={song.id} song={song} />)}
                  </div>
                </div>
              </div>
              
              {/* 分割线 */}
              <div className="combined-divider"></div>
              
              {/* 12.0+ 小组 */}
              <div className="combined-section">
                <div className="level-sidebar">
                  <div className="level-sidebar-label" style={{ color: getLevelColor('12.0+') }}>{formatLevelDisplay('12.0+')}</div>
                  <div className="level-sidebar-count">{lv12p.normal.length + lv12p.kojinsa.length} 曲</div>
                </div>
                <div className="level-body-wrapper">
                  <div className="combined-songs">
                    {lv12p.normal.map(song => <SongCard key={song.id} song={song} />)}
                  </div>
                </div>
              </div>
              
              {/* 分割线 */}
              <div className="combined-divider"></div>
              
              {/* 12.0 小组 */}
              <div className="combined-section">
                <div className="level-sidebar">
                  <div className="level-sidebar-label" style={{ color: getLevelColor('12.0') }}>{formatLevelDisplay('12.0')}</div>
                  <div className="level-sidebar-count">{lv12.normal.length + lv12.kojinsa.length} 曲</div>
                </div>
                <div className="level-body-wrapper">
                  <div className="combined-songs">
                    {lv12.normal.map(song => <SongCard key={song.id} song={song} />)}
                  </div>
                </div>
              </div>

              {/* 右侧：个人差 */}
              <div className="level-body-wrapper level-body-wrapper-kojinsa">
                <div className="level-body-kojinsa-wrapper">
                  <div className="kojinsa-title">个人差</div>
                  <div className="level-body level-body-kojinsa">
                    {combinedKojinsa.map(song => <SongCard key={song.id} song={song} />)}
                  </div>
                </div>
              </div>
            </div>
          )
        })()}
        
        {/* 其他等级 (排除 12.0++, 12.0+, 12.0 和 10.0, 10.0-, 10.0--) */}
        {songsByLevel.sortedLevels
          .filter(level => !['12.0++', '12.0+', '12.0', '10.0', '10.0-', '10.0--'].includes(level))
          .map(level => {
          const { normal, kojinsa } = songsByLevel.groups[level]
          const totalCount = normal.length + kojinsa.length
          
          return (
            <div key={level} className="level-box">
              {/* 左侧边栏 */}
              <div className="level-sidebar">
                <div className="level-sidebar-label" style={{ color: getLevelColor(level) }}>{formatLevelDisplay(level)}</div>
                <div className="level-sidebar-count">{totalCount} 曲</div>
              </div>

              <div className="level-body-wrapper">
                {/* 左侧：普通谱 */}
                <div className="level-body level-body-normal">
                  {normal.map((song) => (
                    <SongCard key={song.id} song={song} />
                  ))}
                </div>

                {/* 右侧：个人差 */}
                <div className="level-body-kojinsa-wrapper">
                  <div className="kojinsa-title">个人差</div>
                  <div className="level-body level-body-kojinsa">
                    {kojinsa.map((song) => (
                      <SongCard key={song.id} song={song} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {/* 底部合并行: 10.0 / 10.0- / 10.0-- */}
        {(() => {
          const lv10 = songsByLevel.groups['10.0'] || { normal: [], kojinsa: [] }
          const lv10m = songsByLevel.groups['10.0-'] || { normal: [], kojinsa: [] }
          const lv10mm = songsByLevel.groups['10.0--'] || { normal: [], kojinsa: [] }
          
          // 手机端：拆成独立行
          if (isMobile) {
            return (
              <>
                {[
                  { level: '10.0', data: lv10 },
                  { level: '10.0-', data: lv10m },
                  { level: '10.0--', data: lv10mm }
                ].map(({ level, data }) => (
                  <div key={level} className="level-box">
                    <div className="level-sidebar">
                      <div className="level-sidebar-label" style={{ color: getLevelColor(level) }}>{formatLevelDisplay(level)}</div>
                      <div className="level-sidebar-count">{data.normal.length + data.kojinsa.length} 曲</div>
                    </div>
                    <div className="level-body-wrapper">
                      <div className="level-body level-body-normal">
                        {data.normal.map(song => <SongCard key={song.id} song={song} />)}
                      </div>
                      <div className="level-body-kojinsa-wrapper">
                        <div className="kojinsa-title">个人差</div>
                        <div className="level-body level-body-kojinsa">
                          {data.kojinsa.map(song => <SongCard key={song.id} song={song} />)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )
          }
          
          // 桌面端：合并行
          const combinedKojinsa = [...lv10.kojinsa, ...lv10m.kojinsa, ...lv10mm.kojinsa]
          
          return (
            <div className="level-box level-box-combined level-box-combined-bottom">
              {/* 10.0 小组 */}
              <div className="combined-section">
                <div className="level-sidebar">
                  <div className="level-sidebar-label" style={{ color: getLevelColor('10.0') }}>{formatLevelDisplay('10.0')}</div>
                  <div className="level-sidebar-count">{lv10.normal.length + lv10.kojinsa.length} 曲</div>
                </div>
                <div className="level-body-wrapper">
                  <div className="combined-songs">
                    {lv10.normal.map(song => <SongCard key={song.id} song={song} />)}
                  </div>
                </div>
              </div>
              
              {/* 分割线 */}
              <div className="combined-divider"></div>
              
              {/* 10.0- 小组 */}
              <div className="combined-section">
                <div className="level-sidebar">
                  <div className="level-sidebar-label" style={{ color: getLevelColor('10.0-') }}>{formatLevelDisplay('10.0-')}</div>
                  <div className="level-sidebar-count">{lv10m.normal.length + lv10m.kojinsa.length} 曲</div>
                </div>
                <div className="level-body-wrapper">
                  <div className="combined-songs">
                    {lv10m.normal.map(song => <SongCard key={song.id} song={song} />)}
                  </div>
                </div>
              </div>
              
              {/* 分割线 */}
              <div className="combined-divider"></div>
              
              {/* 10.0-- 小组 */}
              <div className="combined-section">
                <div className="level-sidebar">
                  <div className="level-sidebar-label" style={{ color: getLevelColor('10.0--') }}>{formatLevelDisplay('10.0--')}</div>
                  <div className="level-sidebar-count">{lv10mm.normal.length + lv10mm.kojinsa.length} 曲</div>
                </div>
                <div className="level-body-wrapper">
                  <div className="combined-songs">
                    {lv10mm.normal.map(song => <SongCard key={song.id} song={song} />)}
                  </div>
                </div>
              </div>

              {/* 右侧：个人差 */}
              <div className="level-body-wrapper level-body-wrapper-kojinsa">
                <div className="level-body-kojinsa-wrapper">
                  <div className="kojinsa-title">个人差</div>
                  <div className="level-body level-body-kojinsa">
                    {combinedKojinsa.map(song => <SongCard key={song.id} song={song} />)}
                  </div>
                </div>
              </div>
            </div>
          )
        })()}
      </div>

      {/* 注释行 */}
      <div className="table-note">
        <div>*本表综合考虑推SSS所需付出的努力，以及SSS后的稳定性。</div>
        <div>**本表考虑馅蜜，提前松手；不考虑测打，片手天地。对推鸟一般无需手法的歌不考虑手法要素。</div>
      </div>

      {/* Footer 鸣谢 */}
      <footer className="site-footer">
        <div className="footer-line">制表：Baozale、Honoohane　　开发：Honoohane</div>
        <div className="footer-line">鸣谢：cirno919、TDBZ1686、MA马术、xipigu、shiryuru、Zero_wind</div>
        <div className="footer-line">dj baka、ugui、PomeloY、sakuya、fanzhen0019、方丈FangZhang、Niconi等群友</div>
        <div className="footer-link">
          <a href="https://github.com/honoohane/jubeat-difficultiestable" target="_blank" rel="noopener noreferrer">GitHub</a>
        </div>
      </footer>
    </div>
  )
}

export default App
