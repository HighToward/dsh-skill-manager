/**
 * dsh-skill-manager / host half
 *
 * Serves the skill manager data source over the profile's web server:
 *
 *   GET  /api/dsh-skill-manager/list      every skill this machine has, plus
 *                                        the roots it was found in
 *   GET  /api/dsh-skill-manager/models    the model routes the user can pick
 *                                        for writing the summaries
 *   POST /api/dsh-skill-manager/describe  let the chosen model write a short
 *                                        plain sentence for each skill
 *   GET  /api/dsh-skill-manager/insight   the local relation graph added to the
 *                                        model's sentences
 *   POST /api/dsh-skill-manager/updates   compare each skill with its upstream
 *                                        and with the other roots on this disk
 *   GET  /api/dsh-skill-manager/read      one SKILL.md, for the detail drawer
 *   GET  /api/dsh-skill-manager/health    mount check
 *
 * The scan is the primary source. A skill only becomes visible to the model
 * once it sits under one of the official roots, so the same roots are what
 * this plugin scans: project, user, and the preset's bundled directory.
 * WorkBuddy's parked and library folders are scanned too, flagged as inactive,
 * because they are the skills this machine actually has.
 */

import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve, sep } from 'node:path'

/** Stable cordis plugin name. */
export const name = 'skill-manager'

/** Services the routes need before they can mount. */
export const inject = ['webServer']

const API = '/api/dsh-skill-manager'

const ROUTES = {
  list: `${API}/list`,
  models: `${API}/models`,
  types: `${API}/types`,
  describe: `${API}/describe`,
  insight: `${API}/insight`,
  updates: `${API}/updates`,
  read: `${API}/read`,
  health: `${API}/health`,
}

/** Largest SKILL.md we read into memory for the detail drawer. */
const READ_LIMIT = 400 * 1024
/** Largest request body accepted on the write routes. */
const BODY_LIMIT = 256 * 1024
/** Model calls per describe batch. */
const DESCRIBE_BATCH = 5
/** Registry that answers for skills installed from a marketplace. */
const REGISTRY_BASE = 'https://api.skillhub.cn/api/v1/skills'
const REGISTRY_SITE = 'https://skillhub.cn/skills'

// ───────────────────────────── frontmatter ─────────────────────────────

/**
 * Parse the small YAML subset a SKILL.md frontmatter actually uses: plain
 * scalars, quoted scalars, single-line arrays, and block scalars. A full YAML
 * parser would be the right tool if one were available inside a bundle, but
 * the subset is fixed by the skill format and stays readable here.
 * @param text - the raw frontmatter, without its `---` fences.
 * @returns the parsed fields.
 */
function parseFrontmatter(text) {
  const out = {}
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    const match = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(line)
    if (match === null) continue
    const key = match[1]
    let rest = match[2]
    if (rest === '|' || rest === '>' || rest === '|-' || rest === '>-' || rest === '|+' || rest === '>+') {
      const folded = rest.startsWith('>')
      const block = []
      const indent = (() => {
        for (let j = i + 1; j < lines.length; j += 1) {
          const next = lines[j]
          if (next.trim() === '') continue
          return (/^\s*/.exec(next) ?? [''])[0].length
        }
        return 0
      })()
      let j = i + 1
      for (; j < lines.length; j += 1) {
        const next = lines[j]
        if (next.trim() === '') { block.push(''); continue }
        const lead = (/^\s*/.exec(next) ?? [''])[0].length
        if (lead < indent) break
        block.push(next.slice(indent))
      }
      i = j - 1
      const joined = folded
        ? block.join(' ').replace(/\s+/g, ' ').trim()
        : block.join('\n').replace(/\n+$/, '')
      out[key] = joined
      continue
    }
    rest = rest.trim()
    if (rest.startsWith('[') && rest.endsWith(']')) {
      out[key] = rest
        .slice(1, -1)
        .split(',')
        .map((part) => unquote(part.trim()))
        .filter((part) => part !== '')
      continue
    }
    out[key] = unquote(rest)
  }
  return out
}

/** Drop one layer of matching quotes. */
function unquote(value) {
  if (value.length >= 2) {
    const first = value[0]
    const last = value[value.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1).replace(/\\n/g, '\n')
    }
  }
  return value
}

/**
 * Split a SKILL.md into its frontmatter and body.
 * @param text - the file's text.
 * @returns the parsed frontmatter and the body that follows it.
 */
function splitSkillFile(text) {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---')) return { frontmatter: {}, body: normalized }
  const end = normalized.indexOf('\n---', 3)
  if (end < 0) return { frontmatter: {}, body: normalized }
  const raw = normalized.slice(3, end).replace(/^\n/, '')
  const after = normalized.indexOf('\n', end + 4)
  const body = after < 0 ? '' : normalized.slice(after + 1)
  return { frontmatter: parseFrontmatter(raw), body }
}

// ───────────────────────────── scanning ─────────────────────────────

/** The official skill-name grammar (mirrors isSkillName in @deepseek-ai/dsh-skill). */
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Whether a string is a name the official registry would load. */
function isSkillName(value) {
  return typeof value === 'string' && SKILL_NAME_PATTERN.test(value)
}

/**
 * Reduce a user-typed shelf name to an id fragment. Chinese labels survive as
 * pinyin-less fallbacks, so the caller substitutes a timestamp when this comes
 * back empty rather than minting an id out of nothing.
 * @param value - the label the user typed.
 * @returns the fragment, possibly empty.
 */
function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
}

/** Precedence per source, lowest wins when two roots offer the same name. */
const SOURCE_RANK = new Map([
  ['project-dsh', 100],
  ['project-agents', 200],
  ['runtime', 250],
  ['custom', 300],
  ['user-dsh', 400],
  ['user-agents', 500],
  ['bundled', 600],
  ['parked', 700],
  ['library', 800],
])

/** Rank of a source (unknown sources last). */
function rankOf(source) {
  return SOURCE_RANK.get(source) ?? 999
}

/**
 * The root conventions this scan reads.
 *
 * The first four mirror what @deepseek-ai/dsh-skill-filesystem mounts; the
 * last two are WorkBuddy's retained folders, which hold skills that are not
 * loaded but are still on this disk.
 * @param cwd - the workspace whose project roots should be included.
 * @returns the roots, in precedence order.
 */
function skillRoots(cwd) {
  const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  const agentsHome = process.env.DSH_AGENTS_HOME ?? join(homedir(), '.agents')
  const roots = [
    { source: 'project-dsh', level: 'project', dir: join(cwd, '.dsh', 'skills'), active: true },
    { source: 'project-agents', level: 'project', dir: join(cwd, '.agents', 'skills'), active: true },
    { source: 'user-dsh', level: 'user', dir: join(dshHome, 'skills'), active: true },
    { source: 'user-agents', level: 'user', dir: join(agentsHome, 'skills'), active: true },
    { source: 'parked', level: 'parked', dir: join(dshHome, 'workbuddy', 'parked-skills'), active: false },
    { source: 'library', level: 'library', dir: join(dshHome, 'workbuddy', 'library'), active: false },
  ]
  return roots.filter((root, index, all) => all.findIndex((other) => other.dir === root.dir) === index)
}

/** Short display form of an absolute path (home collapsed to `~`). */
function displayPath(absolute) {
  const home = homedir()
  return absolute.startsWith(home + sep) ? `~${absolute.slice(home.length)}` : absolute
}

/**
 * Read whatever install provenance a skill directory carries.
 *
 * A skill installed from a registry keeps a small JSON file next to SKILL.md:
 * SkillHub writes `_skillhub_meta.json`, its publisher metadata lands in
 * `_meta.json`, and a few installers only drop `install-source.json`. Those
 * files are the only link between a folder on this disk and the entry it came
 * from, so the update check is built on them.
 * @param dir - the skill directory.
 * @returns the fields worth keeping, empty when the skill was made locally.
 */
async function readInstallMeta(dir) {
  const out = {}
  const hub = await readJsonFile(join(dir, '_skillhub_meta.json'))
  if (hub !== undefined) {
    if (typeof hub.slug === 'string') out.slug = hub.slug
    if (typeof hub.name === 'string') out.registryName = hub.name
    if (typeof hub.version === 'string') out.registryVersion = hub.version
    if (typeof hub.source === 'string') out.registry = hub.source
    if (typeof hub.namespace === 'string') out.namespace = hub.namespace
    if (typeof hub.canonicalName === 'string') out.canonicalName = hub.canonicalName
    if (typeof hub.skillId === 'string') out.skillId = hub.skillId
    if (typeof hub.installedAt === 'number') out.installedAt = hub.installedAt
    if (typeof hub.installedContentHash === 'string') out.installedContentHash = hub.installedContentHash
    if (typeof hub.iconLocalPath === 'string') out.iconPath = hub.iconLocalPath
  }
  const publisher = await readJsonFile(join(dir, '_meta.json'))
  if (publisher !== undefined) {
    if (typeof publisher.slug === 'string' && out.slug === undefined) out.slug = publisher.slug
    if (typeof publisher.version === 'string' && out.registryVersion === undefined) {
      out.registryVersion = publisher.version
    }
    if (typeof publisher.publishedAt === 'number') out.publishedAt = publisher.publishedAt
  }
  const installed = await readJsonFile(join(dir, 'install-source.json'))
  if (installed !== undefined && typeof installed.source === 'string') {
    if (out.registry === undefined) out.registry = installed.source
  }
  return out
}

/**
 * Read a small JSON file, treating every failure as "not there".
 * @param file - absolute path.
 * @returns the parsed object, or undefined.
 */
async function readJsonFile(file) {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'))
    return typeof parsed === 'object' && parsed !== null ? parsed : undefined
  } catch {
    return undefined
  }
}

// ───────────────────────────── types ─────────────────────────────

/**
 * The shelves a skill can sit on. Order is display order, and `other` is last so
 * the shelf nobody fits on stays at the bottom of the page.
 */
const TYPES = [
  'video', 'audio', 'design', 'office', 'writing',
  'browser', 'research', 'dev', 'data', 'security',
  'jobs', 'skillops', 'comms', 'system', 'other',
]

/** Names whose shelf is obvious enough that a keyword scan would only misread it. */
const TYPE_BY_NAME = new Map([
  ['video-gen', 'video'],
  ['video-translation', 'video'],
  ['multicam-sync', 'video'],
  ['lipsync', 'video'],
  ['talking-head-guide', 'video'],
  ['transcription', 'video'],
  ['visual-analysis', 'video'],
  ['storyboard-generator', 'video'],
  ['short-video-copywriting', 'video'],
  ['editing-creativity-library', 'video'],
  ['create-motion-graphics', 'video'],
  ['motion-graphic-gen', 'video'],
  ['motion-graphics', 'video'],
  ['create-pixel-processor', 'video'],
  ['app-promo-guide', 'video'],
  ['ugc-ad-guide', 'video'],
  ['digital-human', 'video'],
  ['chatcut', 'video'],
  ['chatcut-local-setup', 'video'],
  ['chatcut-mg-spec-plate', 'video'],
  ['caption-template-impl', 'video'],
  ['shader-gen', 'video'],
  ['voice', 'audio'],
  ['voice-isolation', 'audio'],
  ['music', 'audio'],
  ['audio-processing-gen', 'audio'],
  ['bgm-prompting', 'audio'],
  ['image-gen', 'design'],
  ['image-gen-codex', 'design'],
  ['nano-banana-pro', 'design'],
  ['openai-image-gen', 'design'],
  ['ardot-poster', 'design'],
  ['miora-brand-design', 'design'],
  ['docx', 'office'],
  ['pdf', 'office'],
  ['pptx', 'office'],
  ['xlsx', 'office'],
  ['html-to-doc', 'office'],
  ['html-to-docx', 'office'],
  ['wpscli', 'office'],
  ['wechat-article-pro', 'writing'],
  ['writing-guidelines', 'writing'],
  ['agent-browser', 'browser'],
  ['playwright-cli', 'browser'],
  ['kimi-webbridge', 'browser'],
  ['kimi-webbridge-runner', 'browser'],
  ['web-browser', 'browser'],
  ['workbuddy-computer-use', 'browser'],
  ['agent-reach', 'research'],
  ['find-skills', 'skillops'],
  ['skill-creator', 'skillops'],
  ['skill-vetter', 'skillops'],
  ['skills-sec-audit', 'security'],
  ['github-skill-audit-install', 'security'],
  ['boss-job-scan', 'jobs'],
  ['boss-zhipin-deliver', 'jobs'],
  ['jd-company-evaluation', 'jobs'],
  ['tencentmap-map-assistant', 'data'],
  ['weather', 'data'],
  ['totorosir-workbuddy-checkin', 'system'],
  ['healthcheck', 'system'],
  ['peekaboo', 'browser'],
  ['known-errors', 'video'],
  ['verification', 'video'],
  ['asset-import', 'video'],
  ['agentmail', 'comms'],
  ['imsg', 'comms'],
  ['blogwatcher', 'comms'],
  ['himalaya', 'comms'],
  ['things-mac', 'system'],
  ['apple-notes', 'system'],
  ['apple-reminders', 'system'],
  ['gifgrep', 'design'],
  ['github', 'dev'],
  ['trello', 'dev'],
  ['sag', 'audio'],
  ['xurl', 'research'],
  ['oracle', 'dev'],
  ['obsidian', 'office'],
  ['qmd', 'office'],
  ['summarize', 'writing'],
  ['humanizer', 'writing'],
  ['video-frames', 'video'],
  ['tmux', 'dev'],
  ['wacli', 'comms'],
  ['cloud-service', 'dev'],
  ['openai-whisper', 'audio'],
  ['mcporter', 'dev'],
  ['viral-video-teardown-remake', 'video'],
  ['vercel-react-best-practices', 'dev'],
  ['vercel-react-view-transitions', 'dev'],
  ['vercel-optimize', 'dev'],
  ['vercel-composition-patterns', 'dev'],
  ['product-help', 'research'],
  ['neodata-financial-search', 'data'],
  ['jinshuju-skill', 'office'],
  ['tencent-docs', 'office'],
  ['tencent-docs-sheet-generation', 'office'],
  ['tencent-docx', 'office'],
  ['workbuddy-docx', 'office'],
  ['workbuddy-sheet-generation', 'office'],
  ['tdoc-orchestrator', 'office'],
  ['format-extract', 'office'],
  ['doc-typeset', 'office'],
  ['tencent-local-office-edit', 'office'],
  ['workbuddy-local-office-edit', 'office'],
  ['html-review', 'dev'],
  ['web-design-guidelines', 'design'],
  ['expert-manager', 'skillops'],
  ['workbuddy-chat-cut-disabled-by-audit', 'system'],
  ['meituan-living-services', 'other'],
  ['recommend-connectors', 'skillops'],
  ['recommend-experts', 'skillops'],
  ['marketplace-skill-installer', 'skillops'],
])

/**
 * Keyword shelves, most specific subject first. The first rule that fires wins,
 * which is why the narrow areas (jobs, security, skills) sit above the broad
 * tool-shaped ones (dev, data).
 */
const TYPE_RULES = [
  ['jobs', /求职|招聘|职位|岗位|简历|面试|薪资|直聘|\bjd\b|\boffer\b|resume/i],
  ['security', /安全审计|安全审查|供应链|漏洞|恶意|后门|木马|\bvett|vulnerab|\baudit\b/i],
  ['skillops', /技能管理|技能发现|安装技能|技能安装|创建技能|技能市场|marketplace|插件管理|\bskills?\s+(?:creator|vetter|install)/i],
  ['comms', /邮件|邮箱|短信|\bemail\b|\be-mail\b|\bmail\b|\bimessage\b|\bsms\b|短信|\brss\b|订阅源|订阅更新|收件箱|inbox|聊天记录|群消息|转发/i],
  ['system', /签到|打卡|健康记录|喝水|睡眠记录|记账|环境配置|计划任务/i],
  ['audio', /语音合成|声音克隆|\btts\b|配音|音频|音乐|\bmusic\b|\bbgm\b|音效|降噪|人声隔离|audio.processing|voice.\s?isolation/i],
  ['video', /剪辑|视频|video|motion|动画|分镜|storyboard|lipsync|口播|talking.head|字幕|subtitle|caption|多机位|multicam|像素|pixel|运镜|镜头|成片|拆解|teardown|remake|promo|短片|短剧/i],
  ['design', /图片|图像|\bimage\b|设计|\bdesign\b|海报|poster|配色|palette|色彩|字体|\bfont\b|图标|icon|\bui\b|\bux\b|figma|视觉|排版|brand/i],
  ['office', /文档|\bdocx?\b|\bpdf\b|\bppt|\bxlsx?\b|excel|\bword\b|表格|office|wps|长图|合同|契约|表单/i],
  ['writing', /文案|写作|撰写|文章|稿件|\bwrit|copywrit|公众号|wechat|summar|总结|摘要|润色/i],
  ['browser', /浏览器|browser|playwright|selenium|网页自动化|自动化操作|截图|screenshot|computer.use|桌面控制|webbridge/i],
  ['research', /调研|research|搜索|\bsearch\b|抓取|爬取|scrape|crawl|小红书|xiaohongshu|推特|twitter|bilibili|\bb站\b|reddit|v2ex|youtube|舆情/i],
  ['dev', /部署|deploy|vercel|github|\bgit\b|仓库|\brepo\b|代码|\bcode\b|构建|\bbuild\b|开发|developer|云服务|\bcloud\b|\bssh\b|docker|数据库|database|\bapi\b/i],
  ['data', /数据|\bdata\b|金融|finance|股票|stock|行情|报表|分析|analytic|地图|\bmap\b|天气|weather|坐标|\bgeo\b|统计/i],
]

/**
 * Put one skill on a shelf, without asking the model: an explicit name wins,
 * then the subject keywords in the description and the name.
 * @param skill - the skill record, or just its name and description.
 * @returns one of TYPES.
 */
function classify(skill) {
  const explicit = TYPE_BY_NAME.get(skill.name)
  if (explicit !== undefined) return explicit
  const text = `${skill.name} ${skill.description} ${skill.descriptionAlt ?? ''} ${skill.category ?? ''}`
  for (const [type, pattern] of TYPE_RULES) {
    if (pattern.test(text)) return type
  }
  return 'other'
}

/**
 * True when a string actually carries Chinese characters, so a model that
 * answered in English can be caught and asked again.
 * @param text - the candidate sentence.
 * @returns whether it is Chinese.
 */
function isChinese(text) {
  return /[\u4e00-\u9fff]/.test(text)
}

// ───────────────────────────── reading ─────────────────────────────

/**
 * Lower-cased SKILL.md bodies, keyed by the record they belong to. A skill body
 * is where one skill names another ("use this together with `x`"), which is a
 * far stronger relation signal than two descriptions sharing a word. The map is
 * weak so a scanned catalog does not keep megabytes alive, and it never reaches
 * the wire: the records themselves stay free of the body text.
 * @type {WeakMap<object, string>}
 */
const bodies = new WeakMap()

/**
 * Read one skill candidate.
 * @param root - the root it was found under.
 * @param entry - the directory or `.md` name inside that root.
 * @returns the record, or undefined when the entry is not a loadable skill.
 */
async function readSkill(root, entry) {
  const asFile = entry.endsWith('.md')
  const dir = asFile ? root.dir : join(root.dir, entry)
  const file = asFile ? join(root.dir, entry) : join(dir, 'SKILL.md')
  let info
  try {
    info = await stat(file)
  } catch {
    return undefined
  }
  if (!info.isFile() || info.size > READ_LIMIT) return undefined
  let text
  try {
    text = await readFile(file, 'utf8')
  } catch {
    return undefined
  }
  const { frontmatter, body } = splitSkillFile(text)
  const name = typeof frontmatter.name === 'string' && frontmatter.name !== ''
    ? frontmatter.name
    : entry.replace(/\.md$/, '')
  if (!isSkillName(name)) return undefined
  const description = typeof frontmatter.description === 'string' ? frontmatter.description.trim() : ''
  if (description === '') return undefined

  let fileCount = 0
  let meta = {}
  if (!asFile) {
    try {
      const children = await readdir(dir, { withFileTypes: true })
      fileCount = children.filter((child) => child.isFile() || child.isDirectory()).length
    } catch {
      fileCount = 0
    }
    meta = await readInstallMeta(dir)
  }

  const whenToUse = typeof frontmatter.when_to_use === 'string'
    ? frontmatter.when_to_use
    : typeof frontmatter.whenToUse === 'string' ? frontmatter.whenToUse : ''

  const descriptionAlt = typeof frontmatter.description_zh === 'string' ? frontmatter.description_zh.trim() : ''
  const category = typeof frontmatter.category === 'string' ? frontmatter.category : ''
  const type = classify({ name, description, descriptionAlt, category })

  const record = {
    name,
    description,
    descriptionAlt,
    displayName: typeof frontmatter.display_name === 'string' ? frontmatter.display_name : '',
    whenToUse,
    // Registry installs often leave SKILL.md without a version line, but the
    // install metadata still records exactly what was installed. Fall back to
    // it so the row does not claim a version-less skill next to a known one.
    version: typeof frontmatter.version === 'string' && frontmatter.version !== ''
      ? frontmatter.version
      : (typeof meta.registryVersion === 'string' ? meta.registryVersion : ''),
    category,
    type,
    author: typeof frontmatter.author === 'string' ? frontmatter.author : '',
    gitUrl: typeof frontmatter.git_url === 'string' ? frontmatter.git_url : '',
    source: root.source,
    level: root.level,
    active: root.active,
    dir: asFile ? root.dir : dir,
    path: file,
    displayPath: displayPath(file),
    rootDir: root.dir,
    mtime: info.mtimeMs,
    hash: createHash('sha256').update(text).digest('hex').slice(0, 16),
    bytes: info.size,
    fileCount,
    bodyChars: body.length,
    modelInvocable: frontmatter.disableModelInvocation !== true && frontmatter['disable-model-invocation'] !== true,
    userInvocable: frontmatter.userInvocable !== false && frontmatter['user-invocable'] !== false,
    slug: meta.slug ?? '',
    registry: meta.registry ?? '',
    namespace: meta.namespace ?? '',
    canonicalName: meta.canonicalName ?? '',
    skillId: meta.skillId ?? '',
    registryVersion: meta.registryVersion ?? '',
    installedContentHash: meta.installedContentHash ?? '',
    iconPath: meta.iconPath ?? '',
  }
  bodies.set(record, body.toLowerCase())
  return record
}

/**
 * Scan one root one level deep: `<name>/SKILL.md` or `<name>.md`.
 * @param root - the root to scan.
 * @returns the loadable skills under it.
 */
async function scanRoot(root) {
  let entries
  try {
    entries = await readdir(root.dir, { withFileTypes: true })
  } catch {
    return []
  }
  const found = []
  for (const entry of entries) {
    const isDir = entry.isDirectory() || entry.isSymbolicLink()
    const isMd = entry.isFile() && entry.name.endsWith('.md')
    if (!isDir && !isMd) continue
    if (entry.name.startsWith('.')) continue
    const record = await readSkill(root, entry.name)
    if (record !== undefined) found.push(record)
  }
  return found
}

/**
 * Scan every root and resolve duplicate names by source precedence.
 * @param cwd - the workspace whose project roots should be scanned.
 * @returns the merged skills plus the roots that answered.
 */
async function scanAll(cwd) {
  const roots = skillRoots(cwd)
  const byName = new Map()
  const duplicates = []
  for (const root of roots) {
    const skills = await scanRoot(root)
    for (const skill of skills) {
      const previous = byName.get(skill.name)
      if (previous === undefined) {
        byName.set(skill.name, skill)
        continue
      }
      const winner = rankOf(skill.source) < rankOf(previous.source) ? skill : previous
      const loser = winner === skill ? previous : skill
      byName.set(winner.name, winner)
      duplicates.push({ name: winner.name, kept: winner.source, hidden: loser.source })
    }
  }
  const skills = [...byName.values()].sort((left, right) => {
    if (left.active !== right.active) return left.active ? -1 : 1
    const rank = rankOf(left.source) - rankOf(right.source)
    if (rank !== 0) return rank
    return left.name.localeCompare(right.name)
  })
  return { skills, roots: roots.map((root) => ({ source: root.source, dir: root.dir, active: root.active })), duplicates }
}

// ───────────────────────────── relations ─────────────────────────────

/** Words that carry no discriminating signal in a skill description. */
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have', 'how', 'in', 'into',
  'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'their', 'them', 'then', 'there', 'these',
  'they', 'this', 'to', 'use', 'used', 'uses', 'using', 'was', 'when', 'where', 'which', 'who',
  'will', 'with', 'you', 'your', 'skill', 'skills', 'can', 'any', 'all', 'not', 'but', 'also',
  'do', 'does', 'must', 'should', 'may', 'if', 'so', 'such', 'than', 'too', 'very', 'just', 'only',
])

/**
 * Tokenize one skill into the terms its identity is made of: name segments,
 * description words, and its category.
 * @param skill - the skill record.
 * @returns the distinct lower-case terms.
 */
function tokenize(skill) {
  const terms = new Set()
  for (const part of skill.name.split('-')) {
    if (part.length > 1) terms.add(part)
  }
  const text = `${skill.description} ${skill.descriptionAlt} ${skill.whenToUse} ${skill.category}`
  for (const word of text.toLowerCase().match(/[a-z][a-z0-9]{2,}|[\u4e00-\u9fff]{2,}/g) ?? []) {
    if (STOP_WORDS.has(word)) continue
    terms.add(word)
  }
  return terms
}

/**
 * Build the relation graph without asking the model. Three signals add up:
 * shared terms weighted by how rare they are, a shared category, and an explicit
 * mention of the other skill's name inside this skill's body, which is the one
 * signal that means "these two are meant to be used together" rather than "these
 * two happen to talk about the same things".
 * @param skills - the catalog.
 * @returns one entry per skill with its strongest neighbours.
 */
function buildRelations(skills) {
  const tokens = new Map()
  const df = new Map()
  for (const skill of skills) {
    const terms = tokenize(skill)
    tokens.set(skill.name, terms)
    for (const term of terms) df.set(term, (df.get(term) ?? 0) + 1)
  }
  const total = Math.max(skills.length, 1)
  const idf = (term) => Math.log(1 + total / Math.max(df.get(term) ?? 1, 1))

  /** Weighted overlap of two term sets. */
  const similarity = (left, right) => {
    let shared = 0
    let unionLeft = 0
    let unionRight = 0
    for (const term of left) {
      const weight = idf(term)
      unionLeft += weight
      if (right.has(term)) shared += weight
    }
    for (const term of right) unionRight += idf(term)
    if (unionLeft === 0 || unionRight === 0) return 0
    return (2 * shared) / (unionLeft + unionRight)
  }

  const relations = {}
  for (const skill of skills) {
    // A short name like "pdf" or "voice" shows up inside unrelated prose, and so
    // does any skill that happens to be called after an ordinary word ("library",
    // "export", "verification"). A backticked name is the author pointing at a
    // specific skill, so only that form is trusted for single-word names; a
    // hyphenated name is specific enough to match as plain text.
    const body = bodies.get(skill) ?? ''
    const mentionScore = (other) => {
      if (other.name.length < 6) return 0
      if (body.includes(`\`${other.name}\``)) return 0.5
      if (other.name.includes('-') && body.includes(other.name)) return 0.42
      return 0
    }
    const left = tokens.get(skill.name) ?? new Set()
    const neighbours = []
    for (const other of skills) {
      if (other.name === skill.name) continue
      const right = tokens.get(other.name) ?? new Set()
      const score = similarity(left, right)
      const mentions = mentionScore(other)
      const sameType = skill.type !== 'other' && skill.type === other.type ? 0.06 : 0
      const categoryMatch = skill.category !== '' && skill.category === other.category ? 0.12 : 0
      const combined = Math.min(0.98, score * 0.78 + mentions + sameType + categoryMatch)
      if (combined < 0.22) continue
      neighbours.push({
        name: other.name,
        score: Math.round(combined * 100) / 100,
        because: mentions > 0 ? 'mentions' : categoryMatch > 0 ? 'category' : sameType > 0 ? 'type' : 'terms',
        shared: [...left].filter((term) => right.has(term)).slice(0, 6),
      })
    }
    neighbours.sort((a, b) => b.score - a.score)
    relations[skill.name] = neighbours.slice(0, 6)
  }
  return relations
}

/**
 * Group the catalog onto shelves. Both halves of the shelf list are kept: the
 * skills this session can load, and the ones parked on disk, because a user
 * looking for "the editing skills" wants to see the parked ones too.
 *
 * Built-in shelves disappear once nothing sits on them, but a shelf the user
 * made by hand stays on the board even while empty: it was created on purpose,
 * and vanishing straight after creation would look like the button failed.
 * @param skills - the catalog, with assignments already applied.
 * @param store - the state that owns the custom shelves.
 * @returns one entry per shelf, in display order.
 */
function buildTypes(skills, store) {
  const custom = store.types ?? {}
  const order = [
    ...TYPES.filter((type) => type !== 'other'),
    ...customTypeIds(store),
    'other',
  ]
  const buckets = new Map(order.map((type) => [type, []]))
  for (const skill of skills) {
    const bucket = buckets.get(skill.type)
    if (bucket === undefined) buckets.get('other').push(skill.name)
    else bucket.push(skill.name)
  }
  return order
    .map((type) => {
      const entry = custom[type]
      return {
        type,
        names: buckets.get(type) ?? [],
        custom: entry !== undefined,
        label: typeof entry?.label === 'string' ? entry.label : '',
        // The drawing is parsed here rather than in the page: one sanitiser,
        // one shape format, and a stored icon that cannot parse simply comes
        // back empty so the page falls back to its own drawing.
        glyph: storedGlyph(entry),
      }
    })
    .filter((entry) => entry.names.length > 0 || entry.custom === true)
}

/**
 * Custom shelf ids, oldest first, so the board keeps the order they were made
 * in rather than the order an object happens to enumerate its keys.
 * @param store - the state that owns the custom shelves.
 * @returns the ids.
 */
function customTypeIds(store) {
  const custom = store.types ?? {}
  return Object.keys(custom)
    .filter((id) => typeof custom[id] === 'object' && custom[id] !== null)
    .sort((left, right) => (custom[left].at ?? 0) - (custom[right].at ?? 0))
}

/**
 * Move skills onto the shelves the user assigned by hand.
 *
 * The record is edited in place rather than copied: `bodies` is a WeakMap keyed
 * by the record object, so a spread copy would silently lose every skill's body
 * text and with it the strongest relation signal.
 *
 * The automatic shelf is kept on the record as `autoType`, so clearing an
 * assignment puts the skill back where the keyword scan had it without a
 * rescan, and the page can show what the automatic answer would have been.
 * @param skills - the scanned catalog, edited in place.
 * @param store - the state that owns the assignments.
 * @returns the same array, for chaining.
 */
function applyAssignments(skills, store) {
  const assignments = store.assignments ?? {}
  const custom = store.types ?? {}
  for (const skill of skills) {
    skill.autoType = skill.type
    const target = assignments[skill.name]
    if (typeof target === 'string' && typeof custom[target] === 'object' && custom[target] !== null) {
      skill.type = target
    }
  }
  return skills
}


// ───────────────────────────── persistence ─────────────────────────────

/** Directory this plugin owns for its own state. */
function storeDir() {
  const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(dshHome, 'dsh-skill-manager')
}

/** Absolute path of the state file. */
function storePath() {
  return join(storeDir(), 'store.json')
}

/**
 * Read the state file, degraded to an empty state when absent or unreadable.
 * @returns the store.
 */
async function readStore() {
  try {
    const text = await readFile(storePath(), 'utf8')
    const parsed = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null) return emptyStore()
    return {
      version: 1,
      descriptions: parsed.descriptions ?? {},
      baselines: parsed.baselines ?? {},
      types: parsed.types ?? {},
      assignments: parsed.assignments ?? {},
      meta: parsed.meta ?? {},
    }
  } catch {
    return emptyStore()
  }
}

/** A store with nothing in it. */
function emptyStore() {
  return { version: 1, descriptions: {}, baselines: {}, types: {}, assignments: {}, meta: {} }
}

/**
 * Write the state file atomically.
 * @param store - the state to persist.
 */
async function writeStore(store) {
  await mkdir(storeDir(), { recursive: true })
  const target = storePath()
  const temp = `${target}.${process.pid}.tmp`
  await writeFile(temp, `${JSON.stringify(store, null, 2)}\n`, 'utf8')
  await rename(temp, target)
}

// ───────────────────────────── model ─────────────────────────────

/**
 * Pick the route the describe calls run on. An explicit choice from the page
 * wins, so the user can spend a cheap model on the catalog; otherwise the
 * user's current default model, because the panel must never silently bill a
 * provider the user did not pick.
 * @param ctx - the host plugin context.
 * @param choice - the provider and model the page sent, when it sent one.
 * @returns the provider and model, or undefined when none is available.
 */
function modelRoute(ctx, choice) {
  if (typeof choice?.provider === 'string' && choice.provider !== ''
    && typeof choice?.model === 'string' && choice.model !== '') {
    return { provider: choice.provider, model: choice.model }
  }
  try {
    const selection = ctx.get('agentDefaultModel')?.currentSelection?.()
    if (selection?.provider && selection?.model) {
      return { provider: selection.provider, model: selection.model }
    }
  } catch {
    /* fall through */
  }
  return undefined
}

/**
 * Every model route the user could pick, so the page can offer a real choice
 * instead of hard-coding a model name that may not even be mounted.
 *
 * A provider whose catalog cannot be read is still listed, with an empty model
 * list, because the route itself may work; hiding it would look like the
 * provider is gone.
 * @param ctx - the host plugin context.
 * @returns the providers, their models, and the current default route.
 */
async function modelCatalog(ctx) {
  const llm = ctx.get('llm', false)
  if (llm === undefined || typeof llm.listProviders !== 'function') {
    return { providers: [], default: modelRoute(ctx) ?? null }
  }
  let listed = []
  try {
    listed = await llm.listProviders()
  } catch {
    listed = []
  }
  const providers = []
  for (const provider of Array.isArray(listed) ? listed : []) {
    if (typeof provider?.id !== 'string' || provider.id === '') continue
    let models = []
    try {
      const found = typeof llm.listModels === 'function' ? await llm.listModels(provider.id) : []
      models = (Array.isArray(found) ? found : [])
        .filter((model) => typeof model?.id === 'string' && model.id !== '')
        .map((model) => ({
          id: model.id,
          name: typeof model.name === 'string' && model.name !== '' ? model.name : model.id,
        }))
    } catch {
      models = []
    }
    providers.push({
      id: provider.id,
      name: typeof provider.name === 'string' && provider.name !== '' ? provider.name : provider.id,
      models,
    })
  }
  return { providers, default: modelRoute(ctx) ?? null }
}

/**
 * Lowest reasoning effort the model declares. Descriptions are one-liners, so
 * spending a reasoning budget on them only adds latency and truncation risk.
 * @param llm - the llm service.
 * @param route - the provider and model.
 * @returns the effort id, or undefined when the model declares none.
 */
async function lowestEffort(llm, route) {
  try {
    const info = await llm.resolveModelInfo(route.provider, route.model)
    const efforts = info?.reasoning?.efforts
    if (!Array.isArray(efforts) || efforts.length === 0) return undefined
    return efforts[0]?.id
  } catch {
    return undefined
  }
}

/**
 * Drain one stream into its text.
 * @param stream - the async chunk iterable.
 * @returns the concatenated text.
 */
async function drainText(stream) {
  let text = ''
  for await (const chunk of stream) {
    if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
  }
  return text
}

// ───────────────────────────── icons ─────────────────────────────

/**
 * The drawing vocabulary a generated icon may use.
 *
 * A model writes this markup, so nothing reaches the page unchecked: the tag
 * and attribute lists are closed sets, and every value is coerced to a bounded
 * string. Geometry attributes are the only ones allowed, which rules out event
 * handlers, styles and links by construction rather than by filtering.
 */
const GLYPH_TAGS = new Set(['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon'])
const GLYPH_ATTRS = new Set([
  'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'x1', 'y1', 'x2', 'y2', 'points',
])
/** Longest attribute value kept. A 24-grid path needs far less. */
const GLYPH_VALUE_LIMIT = 400
/** Shapes kept per icon. More than a few stops reading at 22 pixels. */
const GLYPH_SHAPE_LIMIT = 6

/**
 * Reduce a model's drawing to markup this page is willing to render.
 * @param raw - the array the model answered with.
 * @returns the shapes as [tag, attributes] pairs, or null when nothing usable.
 */
function sanitizeGlyph(raw) {
  const list = Array.isArray(raw) ? raw : []
  const shapes = []
  for (const step of list.slice(0, GLYPH_SHAPE_LIMIT)) {
    const tag = typeof step?.tag === 'string' ? step.tag.toLowerCase() : ''
    if (!GLYPH_TAGS.has(tag)) continue
    const source = typeof step?.attrs === 'object' && step.attrs !== null ? step.attrs : step
    const attrs = {}
    for (const [key, value] of Object.entries(source)) {
      if (!GLYPH_ATTRS.has(key)) continue
      if (typeof value !== 'string' && typeof value !== 'number') continue
      const text = String(value)
      if (text === '' || text.length > GLYPH_VALUE_LIMIT) continue
      attrs[key] = text
    }
    if (Object.keys(attrs).length === 0) continue
    shapes.push([tag, attrs])
  }
  return shapes.length === 0 ? null : shapes
}

/**
 * The stored drawing of a shelf, re-checked on the way out.
 *
 * What is stored is already the sanitised pair form, but it is re-checked here
 * rather than trusted: the store is a plain JSON file the user can edit, and a
 * drawing is markup. Validating twice costs nothing and keeps the page's rule
 * ("the page only renders pairs that passed the closed sets") true regardless
 * of how the file got that way.
 * @param entry - the custom shelf record.
 * @returns the shapes, empty when the shelf has none or they do not check out.
 */
function storedGlyph(entry) {
  if (typeof entry?.glyph !== 'string' || entry.glyph === '') return []
  let parsed
  try {
    parsed = JSON.parse(entry.glyph)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const shapes = []
  for (const step of parsed.slice(0, GLYPH_SHAPE_LIMIT)) {
    const tag = Array.isArray(step) && typeof step[0] === 'string' ? step[0].toLowerCase() : ''
    if (!GLYPH_TAGS.has(tag)) continue
    const source = typeof step[1] === 'object' && step[1] !== null ? step[1] : {}
    const attrs = {}
    for (const [key, value] of Object.entries(source)) {
      if (!GLYPH_ATTRS.has(key)) continue
      if (typeof value !== 'string' && typeof value !== 'number') continue
      const text = String(value)
      if (text === '' || text.length > GLYPH_VALUE_LIMIT) continue
      attrs[key] = text
    }
    if (Object.keys(attrs).length === 0) continue
    shapes.push([tag, attrs])
  }
  return shapes
}

/** What the icon model is told. Kept short: the grid does the constraining. */
const ICON_SYSTEM = [
  'You draw one tiny line icon for a shelf in a skill catalog.',
  'The shelf has a name the user typed and a few skill names on it. Draw the thing the name points at: a speaker for sound, scissors for cutting, a book for reading.',
  'Draw that one object large and centred, not a frame around it and not a layout of several boxes.',
  'Draw on a 24 by 24 grid. Stroke only: no fill, no text, no gradients, no background shape.',
  'Keep every coordinate between 2 and 22, and use at most 4 shapes.',
  'The icon must still read at 18 pixels, so prefer a few bold strokes over detail.',
  'Answer with JSON only: {"shapes":[{"tag":"path","d":"M..."}]}.',
  'Allowed tags: path, circle, ellipse, rect, line, polyline, polygon.',
  'Allowed attributes: d, cx, cy, r, rx, ry, x, y, width, height, x1, y1, x2, y2, points.',
  'No prose, no code fence.',
].join(' ')

// ───────────────────────────── http ─────────────────────────────

/** Headers every JSON answer carries. */
const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
}

/**
 * Write one JSON response.
 * @param response - the server response.
 * @param status - the status code.
 * @param payload - the body.
 */
function sendJson(response, status, payload) {
  response.writeHead(status, JSON_HEADERS)
  response.end(JSON.stringify(payload))
}

/**
 * Whether the caller is on this machine. The skill center only reads local
 * files and only spends the local model budget, so loopback is the whole
 * fence; an unidentifiable peer is refused rather than trusted.
 * @param request - the incoming request.
 * @returns whether the call may proceed.
 */
function isLocal(request) {
  const address = request.socket?.remoteAddress ?? ''
  if (address === '') return false
  return address === '::1' || address === '127.0.0.1' || address.startsWith('127.') || address.startsWith('::ffff:127.')
}

/**
 * Read and parse a JSON request body.
 * @param request - the incoming request.
 * @returns the parsed body, or undefined when it is unusable.
 */
async function readBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > BODY_LIMIT) return undefined
    chunks.push(chunk)
  }
  if (size === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return undefined
  }
}

// ───────────────────────────── plugin ─────────────────────────────

/**
 * Mount the skill center routes.
 * @param ctx - the host plugin context.
 */
function applyImpl(ctx) {
  /** Guard: local caller and the expected method. */
  const guard = (request, response, method) => {
    if (!isLocal(request)) {
      sendJson(response, 403, { error: 'local-only' })
      return false
    }
    if (request.method !== method) {
      sendJson(response, 405, { error: `method not allowed: ${request.method}` })
      return false
    }
    return true
  }

  /** Workspace the project roots are resolved against. */
  const currentCwd = () => {
    try {
      const sessions = ctx.get('sessions', false)
      const list = typeof sessions?.list === 'function' ? sessions.list() : []
      for (const session of list) {
        const cwd = session?.header?.cwd
        if (typeof cwd === 'string' && cwd !== '') return cwd
      }
    } catch {
      /* fall through */
    }
    return resolve(process.cwd())
  }

  const handlers = [
    {
      kind: 'exact',
      path: ROUTES.health,
      handler: (request, response) => {
        if (!guard(request, response, 'GET')) return
        sendJson(response, 200, { ok: true, cwd: currentCwd() })
      },
    },
    {
      kind: 'exact',
      path: ROUTES.models,
      handler: async (request, response) => {
        if (!guard(request, response, 'GET')) return
        try {
          sendJson(response, 200, await modelCatalog(ctx))
        } catch (error) {
          sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    },
    {
      kind: 'exact',
      path: ROUTES.list,
      handler: async (request, response) => {
        if (!guard(request, response, 'GET')) return
        try {
          const cwd = currentCwd()
          const { skills: scanned, roots, duplicates } = await scanAll(cwd)
          const store = await readStore()
          // Assignments land before anything reads `type`, so the shelves, the
          // relation graph, and the rows all agree on where a skill sits.
          const skills = applyAssignments(scanned, store)
          const described = skills.map((skill) => {
            const stored = store.descriptions[skill.name]
            // A summary cached before the Chinese rule existed is stale even
            // though the file it describes has not moved: treat it as pending so
            // the next pass rewrites it instead of showing it forever.
            const fresh = stored !== undefined && stored.hash === skill.hash && isChinese(stored.text)
            return { ...skill, summary: fresh ? stored.text : '' }
          })
          // A baseline is recorded the first time a skill is seen, so a later
          // check can say whether the file moved on since this panel looked.
          let touched = false
          for (const skill of skills) {
            if (store.baselines[skill.name] === undefined) {
              store.baselines[skill.name] = { hash: skill.hash, version: skill.version, at: Date.now() }
              touched = true
            }
          }
          if (touched) await writeStore(store)
          sendJson(response, 200, {
            cwd,
            roots,
            duplicates,
            skills: described,
            types: buildTypes(skills, store),
            relations: buildRelations(skills),
            model: modelRoute(ctx),
          })
        } catch (error) {
          sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    },
    {
      kind: 'exact',
      path: ROUTES.describe,
      handler: async (request, response) => {
        if (!guard(request, response, 'POST')) return
        const body = await readBody(request)
        if (body === undefined) {
          sendJson(response, 400, { error: 'unreadable body' })
          return
        }
        const llm = ctx.get('llm', false)
        if (llm === undefined || typeof llm.stream !== 'function') {
          sendJson(response, 503, { error: 'no llm service' })
          return
        }
        const route = modelRoute(ctx, { provider: body?.provider, model: body?.model })
        if (route === undefined) {
          sendJson(response, 503, { error: 'no default model' })
          return
        }
        try {
          const cwd = currentCwd()
          const { skills } = await scanAll(cwd)
          const store = await readStore()
          const wanted = Array.isArray(body?.names) && body.names.length > 0
            ? skills.filter((skill) => body.names.includes(skill.name))
            : skills
          // "Needs a summary" means: never written, written for an older copy of
          // the file, or written in English before the Chinese rule was in place.
          const pending = wanted.filter((skill) => {
            if (body?.force === true) return true
            const stored = store.descriptions[skill.name]
            return stored === undefined || stored.hash !== skill.hash || !isChinese(stored.text)
          })
          const effort = await lowestEffort(llm, route)
          let written = 0
          const failures = []

          /** Turn one accepted answer into a stored entry. */
          const accept = (target, summary) => {
            store.descriptions[target.name] = {
              text: summary,
              hash: target.hash,
              at: Date.now(),
              model: `${route.provider}/${route.model}`,
            }
            written += 1
          }

          /**
           * Ask for one batch. Answers are split into accepted and rejected; a
           * rejected one is either not Chinese, too long, or not JSON at all, and
           * the caller decides whether it is worth a second ask.
           * @param batch - the skills to describe.
           * @param strict - whether this is the retry, which narrows the prompt.
           * @returns the names that came back unusable.
           */
          const ask = async (batch, strict) => {
            const listing = batch.map((skill) => ({
              name: skill.name,
              description: skill.description.slice(0, 600),
              category: skill.category,
            }))
            const system = [
              'You write one-line catalog entries, in Simplified Chinese, for the skills an assistant can load.',
              'For each skill you receive, answer with one plain Chinese sentence of 18 to 34 characters that says what the skill lets the user do.',
              'The sentence must be written in Chinese characters. Do not answer in English, and do not mix an English sentence into a Chinese one.',
              'Lead with the action, name the concrete objects the skill works on, and skip praise, marketing, and any wording that could describe any skill.',
              strict
                ? 'The previous answer for these skills was not acceptable. Answer in Simplified Chinese only this time.'
                : '',
              'Answer with JSON only: {"items":[{"name":"<skill name>","summary":"<the sentence>"}]}. No prose, no code fence.',
            ].filter((line) => line !== '').join(' ')
            const user = JSON.stringify({ skills: listing })
            const rejected = []
            try {
              const chunks = llm.stream({
                provider: route.provider,
                model: route.model,
                messages: [{ role: 'user', content: [{ type: 'text', text: user }] }],
                system,
                maxTokens: 240 * batch.length,
                ...(effort === undefined ? {} : { reasoningEffort: effort }),
                signal: AbortSignal.timeout(60000),
                purpose: 'skill-manager:describe',
              })
              const text = await drainText(chunks)
              const parsed = parseJsonObject(text)
              const items = Array.isArray(parsed?.items) ? parsed.items : []
              for (const item of items) {
                if (typeof item?.name !== 'string' || typeof item?.summary !== 'string') continue
                const target = batch.find((skill) => skill.name === item.name)
                if (target === undefined) continue
                const summary = item.summary.trim()
                // An English sentence is the failure the user actually reported,
                // so it is treated exactly like an empty answer: unusable.
                if (summary === '' || summary.length > 400 || !isChinese(summary)) {
                  rejected.push(target.name)
                  continue
                }
                accept(target, summary)
              }
            } catch (error) {
              failures.push(error instanceof Error ? error.message : String(error))
            }
            return rejected
          }

          const retry = []
          for (let index = 0; index < pending.length; index += DESCRIBE_BATCH) {
            const batch = pending.slice(index, index + DESCRIBE_BATCH)
            const rejected = await ask(batch, false)
            // Only a non-Chinese answer is worth asking again, because the model
            // can plainly do better; an empty or malformed answer usually means
            // the batch was too large or the model refused, and a repeat is waste.
            for (const name of rejected) {
              const target = batch.find((skill) => skill.name === name)
              if (target !== undefined) retry.push(target)
            }
          }
          if (retry.length > 0) {
            for (let index = 0; index < retry.length; index += DESCRIBE_BATCH) {
              await ask(retry.slice(index, index + DESCRIBE_BATCH), true)
            }
          }
          if (written > 0) {
            store.meta.lastDescribeAt = Date.now()
            await writeStore(store)
          }
          sendJson(response, 200, { written, pending: pending.length, retried: retry.length, failures })
        } catch (error) {
          sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    },
    {
      kind: 'exact',
      path: ROUTES.insight,
      handler: async (request, response) => {
        if (!guard(request, response, 'GET')) return
        try {
          const { skills: scanned } = await scanAll(currentCwd())
          const store = await readStore()
          const skills = applyAssignments(scanned, store)
          sendJson(response, 200, { types: buildTypes(skills, store), relations: buildRelations(skills) })
        } catch (error) {
          sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    },
    {
      kind: 'exact',
      path: ROUTES.types,
      handler: async (request, response) => {
        if (!guard(request, response, 'POST')) return
        const body = await readBody(request)
        if (body === undefined) {
          sendJson(response, 400, { error: 'unreadable body' })
          return
        }
        const action = typeof body?.action === 'string' ? body.action : ''
        try {
          const store = await readStore()
          if (action === 'create') {
            const raw = typeof body?.label === 'string' ? body.label.trim() : ''
            if (raw === '') {
              sendJson(response, 400, { error: 'empty label' })
              return
            }
            if (raw.length > 24) {
              sendJson(response, 400, { error: 'label too long' })
              return
            }
            // The id is derived from the label so the store stays readable, but
            // it is namespaced: a custom shelf must never shadow a built-in one,
            // or clearing it later would orphan the skills assigned to it.
            const base = slugify(raw) === '' ? `custom-${Date.now()}` : slugify(raw)
            let id = `x-${base}`
            let suffix = 2
            while (store.types[id] !== undefined || TYPES.includes(id)) {
              id = `x-${base}-${suffix}`
              suffix += 1
            }
            store.types[id] = {
              label: raw,
              glyph: typeof body?.glyph === 'string' ? body.glyph : '',
              at: Date.now(),
            }
            await writeStore(store)
            sendJson(response, 200, { ok: true, type: id, types: store.types })
            return
          }
          if (action === 'rename') {
            const id = typeof body?.type === 'string' ? body.type : ''
            const raw = typeof body?.label === 'string' ? body.label.trim() : ''
            if (store.types[id] === undefined) {
              sendJson(response, 404, { error: 'no such type' })
              return
            }
            if (raw === '' || raw.length > 24) {
              sendJson(response, 400, { error: 'bad label' })
              return
            }
            store.types[id] = { ...store.types[id], label: raw }
            if (typeof body?.glyph === 'string') store.types[id].glyph = body.glyph
            await writeStore(store)
            sendJson(response, 200, { ok: true, types: store.types })
            return
          }
          if (action === 'remove') {
            const id = typeof body?.type === 'string' ? body.type : ''
            if (store.types[id] === undefined) {
              sendJson(response, 404, { error: 'no such type' })
              return
            }
            delete store.types[id]
            // Its skills fall back to their automatic shelf: dropping the shelf
            // must not drop the assignments into a bucket nothing renders.
            for (const [name, target] of Object.entries(store.assignments)) {
              if (target === id) delete store.assignments[name]
            }
            await writeStore(store)
            sendJson(response, 200, { ok: true, types: store.types })
            return
          }
          if (action === 'assign') {
            const names = Array.isArray(body?.names) ? body.names.filter((name) => typeof name === 'string') : []
            const target = typeof body?.type === 'string' ? body.type : ''
            if (names.length === 0) {
              sendJson(response, 400, { error: 'no skills named' })
              return
            }
            // An empty target clears the assignment, which is how a skill goes
            // back to the shelf the keyword scan picked for it.
            if (target !== '' && store.types[target] === undefined) {
              sendJson(response, 404, { error: 'no such type' })
              return
            }
            for (const name of names) {
              if (target === '') delete store.assignments[name]
              else store.assignments[name] = target
            }
            await writeStore(store)
            sendJson(response, 200, { ok: true, assigned: names.length, assignments: store.assignments })
            return
          }
          if (action === 'icon') {
            const id = typeof body?.type === 'string' ? body.type : ''
            const entry = store.types[id]
            if (entry === undefined) {
              sendJson(response, 404, { error: 'no such type' })
              return
            }
            const llm = ctx.get('llm', false)
            if (llm === undefined || typeof llm.stream !== 'function') {
              sendJson(response, 503, { error: 'no llm service' })
              return
            }
            // The icon is drawn by the same model the page uses for summaries:
            // the user picked that route once, and picking it again here would
            // be a second choice they never asked to make.
            const route = modelRoute(ctx, { provider: body?.provider, model: body?.model })
            if (route === undefined) {
              sendJson(response, 503, { error: 'no default model' })
              return
            }
            // What the shelf actually holds is the best hint available, so the
            // names on it go along with the label the user typed. A shelf that
            // is still empty has only its name, which is why the prompt asks for
            // the object the name points at.
            const { skills } = await scanAll(currentCwd())
            const assigned = skills
              .filter((skill) => store.assignments[skill.name] === id)
              .slice(0, 6)
              .map((skill) => ({ name: skill.name, description: skill.description.slice(0, 160) }))
            const subject = JSON.stringify({ label: entry.label, skills: assigned })
            try {
              const effort = await lowestEffort(llm, route)
              const chunks = llm.stream({
                provider: route.provider,
                model: route.model,
                messages: [{ role: 'user', content: [{ type: 'text', text: subject }] }],
                system: ICON_SYSTEM,
                maxTokens: 700,
                ...(effort === undefined ? {} : { reasoningEffort: effort }),
                signal: AbortSignal.timeout(45000),
                purpose: 'skill-manager:icon',
              })
              const text = await drainText(chunks)
              const parsed = parseJsonObject(text)
              const shapes = sanitizeGlyph(parsed?.shapes)
              if (shapes === null) {
                sendJson(response, 502, { error: 'model drew nothing usable' })
                return
              }
              // Stored as JSON text so the store stays plain data; the page is
              // handed the parsed shapes through buildTypes, never this string.
              store.types[id] = { ...entry, glyph: JSON.stringify(shapes), glyphAt: Date.now() }
              await writeStore(store)
              sendJson(response, 200, { ok: true, type: id, glyph: shapes, model: `${route.provider}/${route.model}` })
            } catch (error) {
              sendJson(response, 502, { error: error instanceof Error ? error.message : String(error) })
            }
            return
          }
          sendJson(response, 400, { error: `unknown action: ${action}` })
        } catch (error) {
          sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    },
    {
      kind: 'exact',
      path: ROUTES.updates,
      handler: async (request, response) => {
        if (!guard(request, response, 'POST')) return
        try {
          const { skills } = await scanAll(currentCwd())
          const store = await readStore()
          const web = ctx.get('web', false)
          // The registry answers for a whole batch at once, so ask once and let
          // every skill read its own row out of the answer.
          const published = web === undefined ? new Map() : await fetchRegistry(web, skills)
          const results = []
          for (const skill of skills) {
            const baseline = store.baselines[skill.name]
            const drifted = baseline !== undefined && baseline.hash !== skill.hash
            const item = {
              name: skill.name,
              source: skill.source,
              version: skill.version,
              registryVersion: skill.registryVersion,
              local: drifted ? 'changed' : 'unchanged',
              upstream: 'unknown',
              detail: '',
              latest: '',
              published: '',
              registry: skill.registry,
              canonicalName: skill.canonicalName,
            }
            const entry = published.get(registryKey(skill))
            if (entry !== undefined) {
              item.latest = entry.version
              item.published = entry.publishedAt > 0 ? new Date(entry.publishedAt).toISOString() : ''
              item.detail = entry.url
              const mine = skill.registryVersion !== '' ? skill.registryVersion : skill.version
              if (entry.version === '') item.upstream = 'unversioned'
              else if (mine === '') item.upstream = 'local-unversioned'
              else item.upstream = compareVersions(entry.version, mine) > 0 ? 'behind' : 'current'
            } else if (skill.gitUrl !== '') {
              const fetched = web === undefined
                ? undefined
                : await fetchUpstream(web, skill.gitUrl)
              if (fetched === undefined) {
                item.upstream = web === undefined ? 'no-network' : 'unknown'
                item.detail = skill.gitUrl
              } else {
                const remote = splitSkillFile(fetched).frontmatter
                const remoteVersion = typeof remote.version === 'string' ? remote.version : ''
                item.latest = remoteVersion
                if (remoteVersion === '') item.upstream = 'unversioned'
                else if (skill.version === '') item.upstream = 'local-unversioned'
                else item.upstream = compareVersions(remoteVersion, skill.version) > 0 ? 'behind' : 'current'
                item.detail = skill.gitUrl
              }
            } else if (skill.registry !== '') {
              // Installed from a registry. Without a slug there is nothing to
              // ask about, so say that rather than claim the entry is gone.
              if (web === undefined) item.upstream = 'no-network'
              else if (skill.slug === '') item.upstream = 'no-slug'
              else item.upstream = 'gone'
              item.detail = skill.slug !== '' ? skill.slug : skill.name
            }
            results.push(item)
          }
          store.meta.lastUpdateCheckAt = Date.now()
          await writeStore(store)
          sendJson(response, 200, {
            skills: results,
            checkedAt: store.meta.lastUpdateCheckAt,
            registry: published.size,
          })
        } catch (error) {
          sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    },
    {
      kind: 'exact',
      path: ROUTES.read,
      handler: async (request, response) => {
        if (!guard(request, response, 'GET')) return
        try {
          const url = new URL(request.url ?? '/', 'http://local')
          const name = url.searchParams.get('name') ?? ''
          const source = url.searchParams.get('source') ?? ''
          if (!isSkillName(name)) {
            sendJson(response, 400, { error: 'bad name' })
            return
          }
          const { skills } = await scanAll(currentCwd())
          const skill = skills.find((candidate) => candidate.name === name && (source === '' || candidate.source === source))
            ?? skills.find((candidate) => candidate.name === name)
          if (skill === undefined) {
            sendJson(response, 404, { error: 'not found' })
            return
          }
          const text = await readFile(skill.path, 'utf8')
          sendJson(response, 200, { name: skill.name, path: skill.displayPath, content: text.slice(0, READ_LIMIT) })
        } catch (error) {
          sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    },
  ]

  ctx.effect(() => {
    const disposers = handlers.map((route) => ctx.webServer.register(route))
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'skill-manager: routes')
}

/**
 * Pull the first JSON object out of a model answer, tolerating a code fence or
 * a stray sentence around it.
 * @param text - the model's text.
 * @returns the parsed object, or undefined.
 */
function parseJsonObject(text) {
  const direct = tryParse(text)
  if (direct !== undefined) return direct
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  if (fenced !== null) {
    const inner = tryParse(fenced[1])
    if (inner !== undefined) return inner
  }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) return tryParse(text.slice(start, end + 1))
  return undefined
}

/** Parse JSON without throwing. */
function tryParse(text) {
  try {
    const value = JSON.parse(text)
    return typeof value === 'object' && value !== null ? value : undefined
  } catch {
    return undefined
  }
}

/**
 * The slug a registry knows a skill by.
 *
 * An installer that recorded a slug is authoritative. Everything else falls
 * back to the skill name, which is what a public SkillHub entry is addressed
 * by, so a marketplace install that never stored a slug still resolves.
 * @param skill - the skill record.
 * @returns the lookup key.
 */
function registryKey(skill) {
  return skill.slug !== '' ? skill.slug : skill.name
}

/**
 * Ask SkillHub about every skill that was installed from a registry.
 *
 * The service answers one skill at a time over GET, so this walks the list a
 * few at a time and treats any failure as "this one said nothing".
 * @param web - the web service.
 * @param skills - the catalog.
 * @returns key → the published entry, empty when nothing answered.
 */
async function fetchRegistry(web, skills) {
  const wanted = []
  for (const skill of skills) {
    if (skill.registry === '') continue
    const key = registryKey(skill)
    if (key !== '' && !wanted.includes(key)) wanted.push(key)
  }
  const found = new Map()
  const CONCURRENCY = 4
  for (let index = 0; index < wanted.length; index += CONCURRENCY) {
    const slice = wanted.slice(index, index + CONCURRENCY)
    const answers = await Promise.all(slice.map(async (slug) => {
      const url = `${REGISTRY_BASE}/${encodeURIComponent(slug)}`
      try {
        const result = await web.fetch({ url }, AbortSignal.timeout(12000))
        if (result?.statusCode !== 200 || typeof result.body?.content !== 'string') return null
        const parsed = JSON.parse(result.body.content)
        const version = parsed?.latestVersion?.version
        if (typeof version !== 'string') return null
        return {
          slug,
          version,
          publishedAt: typeof parsed.latestVersion.createdAt === 'number'
            ? parsed.latestVersion.createdAt
            : 0,
          url: `${REGISTRY_SITE}/${slug}`,
        }
      } catch {
        return null
      }
    }))
    for (const answer of answers) {
      if (answer !== null) found.set(answer.slug, answer)
    }
  }
  return found
}

/**
 * Fetch a skill's upstream SKILL.md from the repository its frontmatter names.
 * @param web - the web service.
 * @param gitUrl - the `git_url` frontmatter value.
 * @returns the file text, or undefined when it cannot be reached.
 */
async function fetchUpstream(web, gitUrl) {
  const match = /github\.com\/([^/]+)\/([^/#?]+)/i.exec(gitUrl)
  if (match === null) return undefined
  const owner = match[1]
  const repo = match[2].replace(/\.git$/, '')
  const candidates = [
    `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/SKILL.md`,
    `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/skill/SKILL.md`,
    `https://raw.githubusercontent.com/${owner}/${repo}/main/SKILL.md`,
    `https://raw.githubusercontent.com/${owner}/${repo}/master/SKILL.md`,
  ]
  for (const url of candidates) {
    try {
      const result = await web.fetch({ url }, AbortSignal.timeout(15000))
      if (result?.statusCode === 200 && typeof result.body?.content === 'string') {
        if (result.body.content.startsWith('---')) return result.body.content
      }
    } catch {
      /* try the next candidate */
    }
  }
  return undefined
}

/**
 * Compare two dotted version strings.
 * @param left - candidate version.
 * @param right - reference version.
 * @returns negative when left is older, positive when newer.
 */
function compareVersions(left, right) {
  const parse = (value) => value.replace(/^v/i, '').split(/[.+-]/).map((part) => {
    const number = Number.parseInt(part, 10)
    return Number.isNaN(number) ? 0 : number
  })
  const a = parse(left)
  const b = parse(right)
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

/** Wrap the plugin so a second mount in one process is a no-op. */
const MOUNTED = Symbol.for('dsh.web.mounted-skill-manager')

/**
 * Mount the routes once per process.
 * @param ctx - the host plugin context.
 * @param config - the resolved plugin config.
 */
export function apply(ctx, config) {
  if (config?.enabled === false) return
  const registry = globalThis
  if (registry[MOUNTED] === true) return
  registry[MOUNTED] = true
  ctx.effect(() => () => {
    registry[MOUNTED] = false
  }, 'skill-manager: mount guard')
  applyImpl(ctx)
}

export { ROUTES, buildRelations, parseFrontmatter, splitSkillFile }
