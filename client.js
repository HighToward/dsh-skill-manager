/**
 * dsh-skill-manager / client half
 *
 * Adds one row to the global panel list on the left of the shell and the page
 * that row opens: every skill on this machine, as a list or as cards, with a
 * filter, a model-written one-liner per skill, the relations mined from the
 * catalog, and an update check against each skill's upstream.
 *
 * The page only reads. Everything expensive (scanning the disk, calling the
 * model, reaching the network) happens in the host half behind
 * /api/dsh-skill-manager/*, which is loopback-only.
 */
window.__ModuleLoader__.load({
  id: 'dsh-skill-manager',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const useState = React.useState;
    const useEffect = React.useEffect;
    const useMemo = React.useMemo;
    const useCallback = React.useCallback;

    /** Locale namespace this plugin owns. */
    const NS = 'skill-manager';
    /** Cell key in sidebar.panellist; the same id opens the main panel. */
    const PANEL_ID = 'skill-manager';
    /** Row position: Plugins 0, Schedule 10, task board 20, skill center 40. */
    const PANEL_ORDER = 40;
    /** Route prefix served by the host half. */
    const API = '/api/dsh-skill-manager';

    // ─────────────────────────── text ───────────────────────────

    const MESSAGES = {
      zh: {
        'entry.label': '技能管理',
        'page.title': '技能管理',
        'page.intro': '本机所有技能，装载的和暂存的都在这里。先按类型挑一格，进去看这一类有哪些技能；也能让模型给每个技能写一句说明，查一下有没有新版本。',
        'toolbar.refresh': '重新扫描',
        'toolbar.view.list': '列表',
        'toolbar.view.cards': '卡片',
        'toolbar.describe': '让模型写说明',
        'toolbar.describing': '正在写…',
        'toolbar.updates': '检查更新',
        'toolbar.checking': '正在查…',
        'toolbar.model': '说明模型',
        'board.back': '全部类型',
        'board.all': '全部技能',
        'board.count': '{count} 个',
        'board.intro': '点一格类型，进去看这一类的技能。',
        'board.new': '新建类型',
        'type.create.placeholder': '给这个类型起个名字',
        'type.create.confirm': '创建',
        'type.create.cancel': '取消',
        'type.remove': '删除这个类型',
        'type.remove.hint': '里面的技能会回到自动分类。',
        'type.icon.make': '生成图标',
        'type.icon.redo': '重画图标',
        'type.icon.working': '画图标的模型正在画',
        'assign.title': '归属类型',
        'assign.auto': '自动分类（{type}）',
        'notice.type.created': '已创建类型「{label}」。',
        'notice.type.removed': '已删除这个类型。',
        'notice.assigned': '已把这个技能移到新的类型。',
        'notice.icon.made': '图标画好了。',
        'notice.icon.failed': '图标没画成：{message}',
        'search.placeholder': '搜技能名字或说明',
        'filter.all': '全部',
        'filter.active': '已装载',
        'filter.inactive': '未启用',
        'group.active': '已装载',
        'group.inactive': '本机其它',
        'group.mixed': '含 {parked} 个未启用',
        'meta.count': '{count} 个技能',
        'meta.roots': '扫描了 {count} 个目录',
        'meta.model': '说明由 {model} 生成',
        'meta.no_summaries': '说明还没写过',
        'meta.write_with': '用 {model} 写说明',
        'meta.no_model': '没有可用的默认模型',
        'meta.pick_model': '选一个模型',
        'empty.title': '没有匹配的技能',
        'empty.body': '换个关键词，或者清掉筛选。',
        'state.loading': '正在扫描技能目录…',
        'state.error': '读取失败：{message}',
        'notice.described': '写好了 {count} 个技能的说明。',
        'notice.described.none': '没有需要重新写的说明。',
        'notice.updates': '检查完成：{behind} 个有更新，{changed} 个本地有改动。',
        'notice.updates.none': '检查完成，没有发现更新。',
        'notice.failed': '操作失败：{message}',
        'detail.title': '技能详情',
        'detail.close': '关闭',
        'detail.path': '路径',
        'detail.source': '来源',
        'detail.version': '版本',
        'detail.latest': '上游最新',
        'detail.upstream': '更新状态',
        'detail.hash': '内容指纹',
        'detail.size': '大小',
        'detail.files': '同目录文件',
        'detail.body': '正文长度',
        'detail.updated': '修改时间',
        'detail.relations': '相关技能',
        'detail.no_relations': '没有找到明显关联的技能。',
        'detail.content': 'SKILL.md',
        'detail.loading': '正在读取…',
        'detail.copy': '复制路径',
        'detail.copied': '已复制',
        'detail.invocable.model': '模型可调用',
        'detail.invocable.user': '用户可调用',
        'detail.invocable.off': '已关闭',
        'update.changed': '本地已改动',
        'update.behind': '有新版本 {version}',
        'update.current': '已是最新',
        'update.unversioned': '上游没有版本号',
        'update.local-unversioned': '本地没有版本号',
        'update.no-network': '查不到上游',
        'update.no-slug': '安装记录里没有 slug',
        'update.gone': '注册表里找不到',
        'update.unknown': '',
        'source.project-dsh': '项目 .dsh',
        'source.project-agents': '项目 .agents',
        'source.user-dsh': '用户 .dsh',
        'source.user-agents': '用户 .agents',
        'source.parked': '暂存',
        'source.library': '技能库',
        'source.runtime': '运行时',
        'source.bundled': '内置',
        'source.custom': '自定义',
        'quality.unnamed': '缺少名字',
        'quality.nodesc': '缺少说明',
        'type.all': '全部类型',
        'type.video': '剪辑与视频',
        'type.audio': '声音与音乐',
        'type.design': '设计与图片',
        'type.office': '文档与表格',
        'type.writing': '写作与文案',
        'type.browser': '浏览器与桌面',
        'type.research': '检索与调研',
        'type.dev': '开发与部署',
        'type.data': '数据与地图',
        'type.security': '安全审查',
        'type.jobs': '求职与招聘',
        'type.skillops': '技能管理',
        'type.comms': '消息与邮件',
        'type.system': '本机杂项',
        'type.other': '其他',
        'because.mentions': '正文点名',
        'because.category': '同一分类',
        'because.type': '同一类型',
        'because.terms': '用词相近',
      },
      en: {
        'entry.label': 'Skill manager',
        'page.title': 'Skill manager',
        'page.intro': 'Every skill on this machine, loaded or parked. Pick a type to see what is in it, let a model of your choosing write a one-liner for each skill, and check whether any skill has moved upstream.',
        'toolbar.refresh': 'Rescan',
        'toolbar.view.list': 'List',
        'toolbar.view.cards': 'Cards',
        'toolbar.describe': 'Describe with model',
        'toolbar.describing': 'Writing…',
        'toolbar.updates': 'Check updates',
        'toolbar.checking': 'Checking…',
        'toolbar.model': 'Model',
        'board.back': 'All types',
        'board.all': 'All skills',
        'board.count': '{count}',
        'board.intro': 'Pick a type to see the skills inside it.',
        'board.new': 'New type',
        'type.create.placeholder': 'Name this type',
        'type.create.confirm': 'Create',
        'type.create.cancel': 'Cancel',
        'type.remove': 'Delete this type',
        'type.remove.hint': 'Its skills go back to their automatic shelf.',
        'type.icon.make': 'Draw icon',
        'type.icon.redo': 'Redraw icon',
        'type.icon.working': 'Drawing',
        'assign.title': 'Shelf',
        'assign.auto': 'Automatic ({type})',
        'notice.type.created': 'Created "{label}".',
        'notice.type.removed': 'Deleted that type.',
        'notice.assigned': 'Moved this skill to the new shelf.',
        'notice.icon.made': 'Icon drawn.',
        'notice.icon.failed': 'Could not draw the icon: {message}',
        'search.placeholder': 'Search names and summaries',
        'filter.all': 'All',
        'filter.active': 'Loaded',
        'filter.inactive': 'Not loaded',
        'group.active': 'Loaded',
        'group.inactive': 'Elsewhere on this machine',
        'group.mixed': '{parked} of these are not loaded',
        'meta.count': '{count} skills',
        'meta.roots': 'scanned {count} roots',
        'meta.model': 'summaries by {model}',
        'meta.no_summaries': 'summaries not written yet',
        'meta.write_with': 'write summaries with {model}',
        'meta.no_model': 'no default model',
        'meta.pick_model': 'Pick a model',
        'empty.title': 'Nothing matches',
        'empty.body': 'Try another word, or clear the filter.',
        'state.loading': 'Scanning skill roots…',
        'state.error': 'Could not read: {message}',
        'notice.described': 'Wrote {count} summaries.',
        'notice.described.none': 'Every summary is already up to date.',
        'notice.updates': 'Done: {behind} behind upstream, {changed} changed locally.',
        'notice.updates.none': 'Done, nothing newer upstream.',
        'notice.failed': 'That did not work: {message}',
        'detail.title': 'Skill',
        'detail.close': 'Close',
        'detail.path': 'Path',
        'detail.source': 'Source',
        'detail.version': 'Version',
        'detail.latest': 'Latest upstream',
        'detail.upstream': 'Update state',
        'detail.hash': 'Fingerprint',
        'detail.size': 'Size',
        'detail.files': 'Files beside it',
        'detail.body': 'Body length',
        'detail.updated': 'Modified',
        'detail.relations': 'Related skills',
        'detail.no_relations': 'No clear relation to the rest of the catalog.',
        'detail.content': 'SKILL.md',
        'detail.loading': 'Reading…',
        'detail.copy': 'Copy path',
        'detail.copied': 'Copied',
        'detail.invocable.model': 'Model-invocable',
        'detail.invocable.user': 'User-invocable',
        'detail.invocable.off': 'off',
        'update.changed': 'Changed locally',
        'update.behind': 'Newer upstream: {version}',
        'update.current': 'Up to date',
        'update.unversioned': 'Upstream has no version',
        'update.local-unversioned': 'No local version',
        'update.no-network': 'Upstream unreachable',
        'update.no-slug': 'No slug in the install record',
        'update.gone': 'Missing from the registry',
        'update.unknown': '',
        'source.project-dsh': 'Project .dsh',
        'source.project-agents': 'Project .agents',
        'source.user-dsh': 'User .dsh',
        'source.user-agents': 'User .agents',
        'source.parked': 'Parked',
        'source.library': 'Library',
        'source.runtime': 'Runtime',
        'source.bundled': 'Bundled',
        'source.custom': 'Custom',
        'quality.unnamed': 'no name',
        'quality.nodesc': 'no description',
        'type.all': 'All types',
        'type.video': 'Editing and video',
        'type.audio': 'Voice and music',
        'type.design': 'Design and images',
        'type.office': 'Documents and sheets',
        'type.writing': 'Writing and copy',
        'type.browser': 'Browser and desktop',
        'type.research': 'Search and research',
        'type.dev': 'Development and deploy',
        'type.data': 'Data and maps',
        'type.security': 'Security review',
        'type.jobs': 'Jobs and hiring',
        'type.skillops': 'Skill management',
        'type.comms': 'Messages and mail',
        'type.system': 'Machine odds and ends',
        'type.other': 'Other',
        'because.mentions': 'named in the body',
        'because.category': 'same category',
        'because.type': 'same type',
        'because.terms': 'similar wording',
      },
    };

    /** Locale the page is currently rendering in. */
    let activeLocale = 'zh';
    const localeListeners = new Set();

    /**
     * Translate one key, filling `{name}` placeholders.
     * @param key - the message key.
     * @param vars - the placeholder values.
     * @returns the message, or the key when the message is missing.
     */
    function tr(key, vars) {
      const table = MESSAGES[activeLocale] ?? MESSAGES.zh;
      const template = table[key] ?? MESSAGES.zh[key] ?? key;
      if (vars === undefined) return template;
      return template.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole));
    }

    /** Subscribe a component to locale changes. */
    function useLocale() {
      const [locale, setLocale] = useState(activeLocale);
      useEffect(() => {
        const listener = () => setLocale(activeLocale);
        localeListeners.add(listener);
        return () => {
          localeListeners.delete(listener);
        };
      }, []);
      return locale;
    }

    /** Tell every mounted page that the locale moved. */
    function notifyLocale() {
      for (const listener of [...localeListeners]) {
        try {
          listener();
        } catch (error) {
          /* one broken listener must not stop the others */
        }
      }
    }

    // ─────────────────────────── transport ───────────────────────────

    /**
     * Resolve an API path against the document base, so a reverse-proxy prefix
     * does not turn the call into a 404.
     * @param path - the route path.
     * @param params - optional query parameters.
     * @returns the request URL.
     */
    function apiUrl(path, params) {
      const relative = path.replace(/^\/+/, '');
      if (typeof document === 'undefined') return `/${relative}`;
      const url = new URL(relative, document.baseURI);
      if (params !== undefined) {
        for (const key of Object.keys(params)) url.searchParams.set(key, String(params[key]));
      }
      return `${url.pathname}${url.search}`;
    }

    /**
     * Read one JSON answer, turning a non-2xx status into an error.
     * @param response - the fetch response.
     * @returns the parsed body.
     */
    async function readJson(response) {
      let payload;
      try {
        payload = await response.json();
      } catch {
        payload = undefined;
      }
      if (!response.ok) {
        const message = payload && typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`;
        throw new Error(message);
      }
      return payload ?? {};
    }

    /** GET one route. */
    async function getJson(path, params) {
      const response = await fetch(apiUrl(path, params), { cache: 'no-store', credentials: 'same-origin' });
      return readJson(response);
    }

    /** POST one route. */
    async function postJson(path, body) {
      const response = await fetch(apiUrl(path), {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      return readJson(response);
    }

    // ─────────────────────────── formatting ───────────────────────────

    /**
     * Human-sized file size.
     * @param bytes - the byte count.
     * @returns the formatted size.
     */
    function formatBytes(bytes) {
      if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return '';
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    /**
     * Short local date.
     * @param value - milliseconds since the epoch.
     * @returns the formatted date, or an empty string.
     */
    function formatDate(value) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '';
      const date = new Date(value);
      const pad = (part) => String(part).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    // ─────────────────────────── icons ───────────────────────────

    /**
     * The product mark: a lit card with a second card peeking out behind it.
     * Sidebar rows render it at 16 or 18 pixels, so it has to read as one
     * shape at that size. Keep this and `icon.svg` in the same drawing.
     */
    function PanelIcon(props) {
      const size = typeof props?.size === 'number' ? props.size : 16;
      const stroke = size >= 24 ? 1.15 : 1.35;
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: stroke,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
          focusable: 'false',
        },
        h('rect', { x: 2.6, y: 3.1, width: 9.2, height: 9.8, rx: 2.4 }),
        h('path', { d: 'M13.4 5.6c0-.7-.45-1.3-1.1-1.5M13.4 5.6v5.5c0 1.1-.9 2-2 2H8.2' }),
        h('path', {
          fill: 'currentColor',
          stroke: 'none',
          transform: 'translate(-0.6 0.2) scale(0.66) translate(4.1 3.6)',
          d: 'M8 3.4c.55 2.7 1.9 4.05 4.6 4.6-2.7.55-4.05 1.9-4.6 4.6-.55-2.7-1.9-4.05-4.6-4.6C6.1 7.45 7.45 6.1 8 3.4Z',
        }),
      );
    }

    /**
     * The same mark at listing size, for a row, a card and the drawer head.
     * @param props - the pixel size to draw at.
     * @returns the glyph element.
     */
    function SkillMark(props) {
      return h(PanelIcon, { size: typeof props?.size === 'number' ? props.size : 17 });
    }

    /**
     * Glyph for one skill type. Every built-in type gets its own drawing, so the
     * board can be read by shape alone before any label is. A shelf the user
     * made carries the drawing a model produced for it; until that exists it
     * gets the generic "other" tray, which is the honest answer for a shelf
     * whose subject nobody has described yet.
     * @param props - the type, the pixel size to draw at, and any stored shapes.
     * @returns the glyph element.
     */
    function TypeGlyph(props) {
      const type = typeof props?.type === 'string' ? props.type : 'other';
      const size = typeof props?.size === 'number' ? props.size : 22;
      const drawn = Array.isArray(props?.glyph) && props.glyph.length > 0 ? props.glyph : null;
      const shape = drawn ?? TYPE_SHAPES[type] ?? TYPE_SHAPES.other;
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
          focusable: 'false',
        },
        shape.map((step, index) => h(step[0], { key: index, ...step[1] })),
      );
    }

    /**
     * One drawing per type, as element name plus attributes. Kept as data so a
     * missing type falls back to the "other" drawing instead of rendering
     * nothing.
     */
    const TYPE_SHAPES = {
      // Film strip with a play head: cutting and video.
      video: [
        ['rect', { x: 2.6, y: 5, width: 12.4, height: 14, rx: 2 }],
        ['path', { d: 'M2.6 9.2h12.4M2.6 14.8h12.4M6.4 5v3.1M6.4 15.9V19M11.2 5v3.1M11.2 15.9V19' }],
        ['path', { d: 'M17.6 9.4 21.4 12l-3.8 2.6z' }],
      ],
      // Waveform bars: sound and music.
      audio: [
        ['path', { d: 'M3 10.4v3.2M6.4 7.6v8.8M9.8 4.8v14.4M13.2 8.4v7.2M16.6 6.4v11.2M20 10v4' }],
      ],
      // Overlapping swatches with a pen nib: picture work.
      design: [
        ['rect', { x: 3, y: 3, width: 9.4, height: 9.4, rx: 1.8 }],
        ['circle', { cx: 15.4, cy: 15.4, r: 5 }],
        ['path', { d: 'M12.4 12.4 8.2 8.2' }],
      ],
      // Sheet with a folded corner and ruled lines: documents.
      office: [
        ['path', { d: 'M5.2 3h8.6l5 5v13H5.2z' }],
        ['path', { d: 'M13.4 3v5.4h5.4' }],
        ['path', { d: 'M8.4 13h7.2M8.4 16.6h7.2' }],
      ],
      // Quill over a line: writing and copy.
      writing: [
        ['path', { d: 'M4 20c0-4.6 2.2-8.4 6-11.4C13 6.2 16.4 4.4 20 4c.4 3.6-1.4 7-4.6 10-3 2.8-6.8 4.6-11.4 6z' }],
        ['path', { d: 'M6.4 17.6 12 12' }],
      ],
      // Window with a pointer: browser and desktop work.
      browser: [
        ['rect', { x: 2.8, y: 4.4, width: 18.4, height: 15.2, rx: 2.2 }],
        ['path', { d: 'M2.8 9h18.4' }],
        ['path', { d: 'M11 12.2 15.6 14.4 13.4 15.4 12.4 17.8z' }],
      ],
      // Magnifier over a page: search and research.
      research: [
        ['circle', { cx: 10.4, cy: 10.4, r: 6.4 }],
        ['path', { d: 'M15.2 15.2 21 21' }],
        ['path', { d: 'M7.8 10.4h5.2M10.4 7.8v5.2' }],
      ],
      // Angle brackets on a terminal line: development.
      dev: [
        ['rect', { x: 2.8, y: 4.4, width: 18.4, height: 15.2, rx: 2.2 }],
        ['path', { d: 'M7 10.2 9.8 13 7 15.8M12.6 16h4.2' }],
      ],
      // Stacked discs with a node link: data and maps.
      data: [
        ['ellipse', { cx: 12, cy: 6.2, rx: 7.2, ry: 2.8 }],
        ['path', { d: 'M4.8 6.2v5.6c0 1.55 3.22 2.8 7.2 2.8s7.2-1.25 7.2-2.8V6.2' }],
        ['path', { d: 'M4.8 11.8v5.6c0 1.55 3.22 2.8 7.2 2.8s7.2-1.25 7.2-2.8v-5.6' }],
      ],
      // Shield with a check: security review.
      security: [
        ['path', { d: 'M12 2.8 20 5.6v6.2c0 4.4-3.2 7.6-8 9.4-4.8-1.8-8-5-8-9.4V5.6z' }],
        ['path', { d: 'M8.6 11.8 11 14.2l4.6-4.6' }],
      ],
      // Briefcase: jobs and hiring.
      jobs: [
        ['rect', { x: 2.8, y: 7.2, width: 18.4, height: 12.6, rx: 2.2 }],
        ['path', { d: 'M8.6 7.2V5.4a2 2 0 0 1 2-2h2.8a2 2 0 0 1 2 2v1.8' }],
        ['path', { d: 'M2.8 12.6h18.4' }],
      ],
      // Stacked blocks: managing the skill catalog itself.
      skillops: [
        ['rect', { x: 3, y: 3, width: 7.6, height: 7.6, rx: 1.6 }],
        ['rect', { x: 13.4, y: 3, width: 7.6, height: 7.6, rx: 1.6 }],
        ['rect', { x: 3, y: 13.4, width: 7.6, height: 7.6, rx: 1.6 }],
        ['path', { d: 'M13.4 17.2h7.6M17.2 13.4v7.6' }],
      ],
      // Envelope: messages and mail.
      comms: [
        ['rect', { x: 2.8, y: 5.2, width: 18.4, height: 13.6, rx: 2.2 }],
        ['path', { d: 'm3.6 7 8.4 6.2L20.4 7' }],
      ],
      // Gauge: machine upkeep and the odds and ends.
      system: [
        ['path', { d: 'M3.4 17.6a9 9 0 1 1 17.2 0' }],
        ['path', { d: 'M12 17.2 16 11' }],
        ['circle', { cx: 12, cy: 17.6, r: 1.4 }],
      ],
      // Three dots in a tray: everything that did not fit a shelf.
      // "all" is the same tray with a plus, used on the board's summary line.
      all: [
        ['rect', { x: 3, y: 3, width: 7.4, height: 7.4, rx: 1.8 }],
        ['rect', { x: 13.6, y: 3, width: 7.4, height: 7.4, rx: 1.8 }],
        ['rect', { x: 3, y: 13.6, width: 7.4, height: 7.4, rx: 1.8 }],
        ['rect', { x: 13.6, y: 13.6, width: 7.4, height: 7.4, rx: 1.8 }],
      ],
      // A tag with a hole: the shape of a label the user wrote themselves. It
      // stands for "a shelf I made" until a model has drawn something better
      // for it, and it is deliberately not the "other" tray, because a shelf
      // the user named is not the leftovers.
      custom: [
        ['path', { d: 'M11.4 3.2H20v8.6l-9 9-8.6-8.6z' }],
        ['circle', { cx: 16.2, cy: 6.9, r: 1.15 }],
      ],
      other: [
        ['rect', { x: 3, y: 3, width: 18, height: 18, rx: 4.2 }],
        ['circle', { cx: 8.4, cy: 12, r: 1.05 }],
        ['circle', { cx: 12, cy: 12, r: 1.05 }],
        ['circle', { cx: 15.6, cy: 12, r: 1.05 }],
      ],
    };

    // ─────────────────────────── styles ───────────────────────────

    const CSS = [
      // Page frame: the panel owns the whole main column, so it sets its own
      // inset and scroll port. A drawer can then sit still over the scroll.
      '.sc-page{position:relative;display:flex;flex-direction:column;height:100%;overflow:hidden;--sc-inset:clamp(24px,4vw,48px);color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}',
      '@media (width<=767px){.sc-page{--sc-inset:20px}}',
      '.sc-scroll{flex:1;min-height:0;overflow:hidden auto;padding:0 var(--sc-inset) 56px;scrollbar-color:var(--dsw-alias-scrollbar-bg-l2,transparent) transparent}',
      '.sc-inner{max-width:1080px;margin:0 auto}',

      // Header, mirroring the plugin manager page rhythm. The top clearance is
      // the shell's window chrome; a main panel starts under it.
      '.sc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding-top:calc(28px + var(--dsh-frame-top-clearance,0px))}',
      '.sc-heading{display:flex;align-items:center;gap:9px}',
      '.sc-heading-mark{flex:none;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm,6px);color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1)}',
      '.sc-title{margin:0;font-size:20px;font-weight:500;line-height:28px}',
      '.sc-intro{margin:4px 0 0;max-width:620px;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}',
      '.sc-toolbar{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;flex:none}',

      '.sc-btn{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm,4px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12px;line-height:1;cursor:pointer;white-space:nowrap;transition:background .12s ease,border-color .12s ease}',
      '.sc-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}',
      '.sc-btn:disabled{opacity:.55;cursor:default}',
      // The filled button keeps its own fill and its own text colour on hover.
      // The generic `.sc-btn:hover` rule above is one class heavier than
      // `[data-tone="brand"]`, so without a landing rule here the fill fell
      // back to the hover surface and the light text sat on a light panel.
      '.sc-btn[data-tone="brand"]{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-inverted,var(--dsw-alias-bg-base))}',
      '.sc-btn[data-tone="brand"]:hover:not(:disabled){border-color:transparent;background:color-mix(in oklab,var(--dsw-alias-brand-primary) 86%,var(--dsw-alias-label-primary-inverted,var(--dsw-alias-bg-base)));color:var(--dsw-alias-label-primary-inverted,var(--dsw-alias-bg-base))}',
      '.sc-btn[data-on="1"]{background:var(--dsw-alias-interactive-bg-active,var(--dsw-alias-bg-layer-2));border-color:var(--dsw-alias-border-l2)}',

      '.sc-seg{display:inline-flex;padding:2px;gap:2px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm,4px);background:var(--dsw-alias-bg-layer-2)}',
      '.sc-seg-btn{height:24px;padding:0 9px;border:0;border-radius:3px;background:none;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:12px;line-height:1;cursor:pointer}',
      '.sc-seg-btn[data-on="1"]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 1px 2px rgba(0,0,0,.08)}',

      // Filters.
      '.sc-filters{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:18px}',
      '.sc-search{position:relative;flex:1;min-width:200px;max-width:340px}',
      '.sc-search input{width:100%;height:30px;box-sizing:border-box;padding:0 10px 0 28px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm,4px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12px;outline:none}',
      '.sc-search input::placeholder{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}',
      '.sc-search input:focus{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 var(--dsw-focus-ring-width,2px) color-mix(in oklab,var(--dsw-alias-brand-primary) 22%,transparent)}',
      '.sc-search svg{position:absolute;left:9px;top:50%;transform:translateY(-50%);color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));pointer-events:none}',

      '.sc-chips{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
      '.sc-chips-types{margin-top:6px}',
      '.sc-chip{height:24px;padding:0 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:11.5px;line-height:1;cursor:pointer}',
      '.sc-chip:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}',
      '.sc-chip[data-on="1"]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);background:color-mix(in oklab,var(--dsw-alias-brand-primary) 10%,transparent)}',

      // Type board: one tile per type, icon over name, so the catalog can be
      // read by shape before any label is.
      '.sc-board{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:10px;margin-top:22px}',
      '@media (width<=640px){.sc-board{grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:8px}}',
      '.sc-tile{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;box-sizing:border-box;padding:20px 10px 16px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg,8px);background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;cursor:pointer;transition:border-color .12s ease,background .12s ease,transform .12s ease}',
      '.sc-tile:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);transform:translateY(-1px)}',
      '.sc-tile[data-on="1"]{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}',
      '.sc-tile-glyph{display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:var(--dsw-radius-lg,8px);color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l1);transition:color .12s ease,background .12s ease}',
      '.sc-tile:hover .sc-tile-glyph,.sc-tile[data-on="1"] .sc-tile-glyph{color:var(--dsw-alias-brand-primary);background:color-mix(in oklab,var(--dsw-alias-brand-primary) 9%,transparent);border-color:color-mix(in oklab,var(--dsw-alias-brand-primary) 30%,transparent)}',
      '.sc-tile-name{font-size:12.5px;line-height:18px;font-weight:500;color:var(--dsw-alias-label-primary);text-align:center}',
      '.sc-tile-count{font-size:11px;line-height:15px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-variant-numeric:tabular-nums}',
      '.sc-tile[data-add="1"]{border-style:dashed;background:transparent}',
      '.sc-tile[data-add="1"] .sc-tile-glyph{border-style:dashed;background:transparent}',
      '.sc-tile[data-add="1"] .sc-tile-name{color:var(--dsw-alias-label-secondary)}',

      // Inline "name this shelf" form; it only exists while the user is typing.
      '.sc-newtype{display:flex;align-items:center;gap:8px;margin-top:18px;flex-wrap:wrap}',
      '.sc-input{height:28px;min-width:200px;box-sizing:border-box;padding:0 9px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm,4px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12.5px;outline:none}',
      '.sc-input:focus{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 var(--dsw-focus-ring-width,2px) color-mix(in oklab,var(--dsw-alias-brand-primary) 22%,transparent)}',
      '.sc-input::placeholder{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}',
      '.sc-plus{font-size:15px;line-height:1;color:inherit}',

      // Breadcrumb bar shown once a type is open.
      '.sc-crumb{display:flex;align-items:center;gap:8px;margin-top:20px;flex-wrap:wrap}',
      '.sc-crumb-back{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 9px 0 7px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:11.5px;line-height:1;cursor:pointer}',
      '.sc-crumb-back:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-primary)}',
      '.sc-crumb-title{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:500;line-height:20px}',
      '.sc-crumb-title .sc-tile-glyph{width:26px;height:26px;border-radius:var(--dsw-radius-sm,4px)}',
      '.sc-crumb-note{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:11.5px}',
      '.sc-crumb-act{margin-left:auto;height:26px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:11.5px;line-height:1;cursor:pointer}',
      '.sc-crumb-act:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-primary)}',
      '.sc-crumb-act:disabled{opacity:.5;cursor:default}',
      '.sc-crumb-remove{height:26px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:transparent;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-family:inherit;font-size:11.5px;line-height:1;cursor:pointer}',
      '.sc-crumb-remove:hover:not(:disabled){border-color:color-mix(in oklab,var(--dsw-alias-state-error-primary) 40%,transparent);color:var(--dsw-alias-state-error-primary)}',
      '.sc-crumb-remove:disabled{opacity:.5;cursor:default}',

      // Shelf picker in the drawer: moving a skill between shelves is the one
      // edit this panel makes to the user's own filing.
      '.sc-assign select{width:100%;height:28px;box-sizing:border-box;padding:0 6px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm,4px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12px;cursor:pointer;outline:none}',
      '.sc-assign select:focus{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 var(--dsw-focus-ring-width,2px) color-mix(in oklab,var(--dsw-alias-brand-primary) 22%,transparent)}',

      // Model picker: a native select keeps the shell's own menu behaviour.
      '.sc-model{display:inline-flex;align-items:center;gap:6px}',
      '.sc-model select{height:28px;max-width:230px;box-sizing:border-box;padding:0 6px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm,4px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12px;cursor:pointer;outline:none}',
      '.sc-model select:focus{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 var(--dsw-focus-ring-width,2px) color-mix(in oklab,var(--dsw-alias-brand-primary) 22%,transparent)}',

      '.sc-summary{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:12px;line-height:18px}',
      '.sc-dot{width:2px;height:2px;border-radius:50%;background:currentColor;opacity:.6}',

      '.sc-notice{margin-top:12px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm,4px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}',
      '.sc-notice[data-tone="error"]{color:var(--dsw-alias-state-error-primary)}',

      '.sc-group{margin-top:26px;display:flex;flex-direction:column;gap:8px}',
      '.sc-group-head{display:flex;align-items:baseline;gap:8px}',
      '.sc-group-title{margin:0;font-size:13px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-primary)}',
      '.sc-group-count{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:12px}',
      '.sc-group-note{margin-left:auto;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:11.5px}',

      // List view: one dense row per skill, the same rhythm as the plugin
      // manager's card rows.
      '.sc-list{display:flex;flex-direction:column;gap:2px}',
      '.sc-row{display:flex;align-items:flex-start;gap:12px;width:100%;box-sizing:border-box;padding:9px 10px;border:0;border-radius:var(--dsw-radius-lg,8px);background:none;color:inherit;font:inherit;text-align:left;cursor:pointer;transition:background .1s ease}',
      '.sc-row:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}',
      '.sc-row[data-active="1"]{background:var(--dsw-alias-interactive-bg-active,var(--dsw-alias-bg-layer-2))}',
      '.sc-mark{flex:none;display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm,4px);color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1)}',
      '.sc-row[data-inactive="1"] .sc-mark{opacity:.6}',
      '.sc-row-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}',
      '.sc-row-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.sc-name{font-size:13px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-primary)}',
      '.sc-badge{display:inline-flex;align-items:center;height:17px;padding:0 6px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:10.5px;line-height:1;white-space:nowrap}',
      '.sc-badge[data-tone="brand"]{border-color:color-mix(in oklab,var(--dsw-alias-brand-primary) 40%,transparent);color:var(--dsw-alias-brand-primary)}',
      '.sc-badge[data-tone="warn"]{border-color:color-mix(in oklab,var(--dsw-alias-state-warn-primary) 45%,transparent);color:var(--dsw-alias-state-warn-primary)}',
      '.sc-badge[data-tone="ok"]{border-color:color-mix(in oklab,var(--dsw-alias-state-success-primary) 45%,transparent);color:var(--dsw-alias-state-success-primary)}',
      '.sc-badge[data-tone="mute"]{opacity:.85}',
      '.sc-desc{margin:0;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:12.5px;line-height:18px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
      '.sc-desc[data-model="1"]{color:var(--dsw-alias-label-secondary)}',
      '.sc-rel-inline{display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-top:3px}',
      '.sc-rel-tag{font-size:10.5px;line-height:1;padding:3px 6px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));border:1px solid var(--dsw-alias-border-l1);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',

      // Card view.
      '.sc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(272px,1fr));gap:10px}',
      '.sc-card{display:flex;flex-direction:column;gap:8px;box-sizing:border-box;padding:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg,8px);background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;text-align:left;cursor:pointer;transition:border-color .12s ease,background .12s ease}',
      '.sc-card:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}',
      '.sc-card[data-inactive="1"]{opacity:.8}',
      '.sc-card-head{display:flex;align-items:center;gap:9px}',
      '.sc-card-title{font-size:13px;font-weight:500;line-height:19px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.sc-card-sub{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:11px;line-height:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',

      // Detail drawer.
      '.sc-drawer{position:absolute;top:0;right:0;bottom:0;width:min(540px,94%);display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1);border-left:1px solid var(--dsw-alias-border-l2);box-shadow:-8px 0 24px rgba(0,0,0,.12);z-index:5}',
      '.sc-drawer-head{display:flex;align-items:center;gap:10px;padding:14px 16px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}',
      '.sc-drawer-title{font-size:14px;font-weight:500;line-height:20px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.sc-drawer-body{flex:1;min-height:0;overflow:hidden auto;padding:14px 16px 28px;display:flex;flex-direction:column;gap:16px}',
      '.sc-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;flex:none;padding:0;border:0;border-radius:var(--dsw-radius-sm,4px);background:none;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary));cursor:pointer}',
      '.sc-icon-btn:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-primary)}',
      '.sc-facts{display:grid;grid-template-columns:auto 1fr;gap:5px 12px;font-size:12px;line-height:18px}',
      '.sc-fact-k{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}',
      '.sc-fact-v{color:var(--dsw-alias-label-secondary);word-break:break-all}',
      '.sc-section-title{margin:0;font-size:12px;font-weight:500;letter-spacing:.02em;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}',
      '.sc-rel-list{display:flex;flex-direction:column;gap:5px}',
      '.sc-rel-item{display:flex;align-items:center;gap:8px;padding:7px 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm,4px);background:var(--dsw-alias-bg-layer-2);cursor:pointer;font:inherit;color:inherit;text-align:left}',
      '.sc-rel-item:hover{border-color:var(--dsw-alias-border-l2)}',
      '.sc-rel-name{flex:1;min-width:0;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.sc-rel-why{flex:none;padding:1px 6px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:10.5px;line-height:15px;white-space:nowrap}',
      '.sc-rel-why[data-why="mentions"]{border-color:color-mix(in oklab,var(--dsw-alias-brand-primary) 34%,transparent);color:var(--dsw-alias-label-secondary)}',
      '.sc-rel-score{font-size:11px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-variant-numeric:tabular-nums}',
      '.sc-code{margin:0;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm,4px);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;line-height:17px;white-space:pre-wrap;word-break:break-word;max-height:420px;overflow:auto}',
      '.sc-invoc{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',

      '.sc-state{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:56px 16px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:13px;line-height:20px;text-align:center}',
      '.sc-state b{font-weight:500;color:var(--dsw-alias-label-primary)}',
      '.sc-state[data-tone="error"]{color:var(--dsw-alias-state-error-primary)}',

      '.sc-spin{width:14px;height:14px;border-radius:50%;border:1.5px solid color-mix(in oklab,var(--dsw-alias-label-secondary) 35%,transparent);border-top-color:var(--dsw-alias-label-secondary);animation:scSpin .7s linear infinite;flex:none}',
      '@keyframes scSpin{to{transform:rotate(360deg)}}',
      '.sc-spin[data-on="0"]{display:none}',

      '.sc-hint{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:11.5px;line-height:17px;margin:0}',
    ].join('\n');

    /** Style element rendered inside the panel, so it unmounts with the panel. */
    function StyleTag() {
      return h('style', { dangerouslySetInnerHTML: { __html: CSS } });
    }

    // ─────────────────────────── page ───────────────────────────

    /**
     * The skill center page: filters, list or card listing, and the drawer.
     * @returns the page element.
     */
    function SkillManagerPage() {
      // The locale is also a dependency of the memoised shelf labels, because a
      // built-in shelf's name comes from the dictionary rather than the payload.
      const locale = useLocale();
      const [data, setData] = useState(null);
      const [phase, setPhase] = useState('loading');
      const [failure, setFailure] = useState('');
      const [view, setView] = useState('cards');
      const [query, setQuery] = useState('');
      const [source, setSource] = useState('all');
      const [typeFilter, setTypeFilter] = useState('all');
      const [activeName, setActiveName] = useState('');
      const [busy, setBusy] = useState('');
      const [notice, setNotice] = useState(null);
      const [updates, setUpdates] = useState({});
      // Empty string means "let the host use the user's default route", so the
      // page only pins a route once the user picks one in the dropdown.
      const [model, setModel] = useState('');
      const [catalog, setCatalog] = useState(null);
      // The board's inline "new type" form, open only while the user is typing.
      const [creating, setCreating] = useState(false);
      const [draft, setDraft] = useState('');

      const load = useCallback(async () => {
        setPhase((current) => (current === 'ready' ? 'ready' : 'loading'));
        setFailure('');
        try {
          const next = await getJson(`${API}/list`);
          setData(next);
          setPhase('ready');
        } catch (error) {
          setFailure(error instanceof Error ? error.message : String(error));
          setPhase('error');
        }
      }, []);

      useEffect(() => {
        load();
      }, [load]);

      // The model list is fetched once and kept: it changes only when the user
      // installs a provider, which is not something this page can do.
      useEffect(() => {
        let cancelled = false;
        getJson(`${API}/models`)
          .then((next) => {
            if (cancelled) return;
            setCatalog(next);
            const fallback = typeof next?.default?.provider === 'string' && typeof next?.default?.model === 'string'
              ? `${next.default.provider}/${next.default.model}`
              : '';
            setModel((current) => (current === '' ? fallback : current));
          })
          .catch(() => {
            if (cancelled) return;
            setCatalog({ providers: [], default: null });
          });
        return () => {
          cancelled = true;
        };
      }, []);

      const runDescribe = useCallback(async () => {
        setBusy('describe');
        setNotice(null);
        try {
          const body = { force: false };
          if (model !== '') {
            const cut = model.indexOf('/');
            body.provider = cut === -1 ? model : model.slice(0, cut);
            body.model = cut === -1 ? '' : model.slice(cut + 1);
          }
          const result = await postJson(`${API}/describe`, body);
          const written = typeof result.written === 'number' ? result.written : 0;
          setNotice({
            tone: 'info',
            text: written > 0 ? tr('notice.described', { count: written }) : tr('notice.described.none'),
          });
          if (written > 0) await load();
        } catch (error) {
          setNotice({ tone: 'error', text: tr('notice.failed', { message: error instanceof Error ? error.message : String(error) }) });
        } finally {
          setBusy('');
        }
      }, [load, model]);

      const runUpdates = useCallback(async () => {
        setBusy('updates');
        setNotice(null);
        try {
          const result = await postJson(`${API}/updates`, {});
          const map = {};
          let behind = 0;
          let changed = 0;
          for (const item of Array.isArray(result.skills) ? result.skills : []) {
            map[item.name] = item;
            if (item.upstream === 'behind') behind += 1;
            if (item.local === 'changed') changed += 1;
          }
          setUpdates(map);
          setNotice({
            tone: 'info',
            text: behind + changed > 0 ? tr('notice.updates', { behind, changed }) : tr('notice.updates.none'),
          });
        } catch (error) {
          setNotice({ tone: 'error', text: tr('notice.failed', { message: error instanceof Error ? error.message : String(error) }) });
        } finally {
          setBusy('');
        }
      }, []);

      const runCreateType = useCallback(async () => {
        const label = draft.trim();
        if (label === '') return;
        setBusy('types');
        setNotice(null);
        try {
          const result = await postJson(`${API}/types`, { action: 'create', label });
          setCreating(false);
          setDraft('');
          setNotice({ tone: 'info', text: tr('notice.type.created', { label }) });
          await load();
          // Jump straight onto the shelf that was just made, so creating one
          // and putting a skill on it is a single continuous move.
          if (typeof result.type !== 'string') return;
          setTypeFilter(result.type);
          // The drawing is asked for after the shelf exists, never before it:
          // a model that is slow or down must leave a usable shelf carrying the
          // fallback drawing, not fail a create the user already committed to.
          setBusy('icon');
          try {
            const body = { action: 'icon', type: result.type };
            if (model !== '') {
              const cut = model.indexOf('/');
              if (cut > 0) {
                body.provider = model.slice(0, cut);
                body.model = model.slice(cut + 1);
              }
            }
            await postJson(`${API}/types`, body);
            await load();
          } catch (error) {
            setNotice({ tone: 'error', text: tr('notice.icon.failed', { message: error instanceof Error ? error.message : String(error) }) });
          }
        } catch (error) {
          setNotice({ tone: 'error', text: tr('notice.failed', { message: error instanceof Error ? error.message : String(error) }) });
        } finally {
          setBusy('');
        }
      }, [draft, load, model]);

      const runRemoveType = useCallback(async (type) => {
        setBusy('types');
        setNotice(null);
        try {
          await postJson(`${API}/types`, { action: 'remove', type });
          setNotice({ tone: 'info', text: tr('notice.type.removed') });
          setTypeFilter('all');
          await load();
        } catch (error) {
          setNotice({ tone: 'error', text: tr('notice.failed', { message: error instanceof Error ? error.message : String(error) }) });
        } finally {
          setBusy('');
        }
      }, [load]);

      const runMakeIcon = useCallback(async (type) => {
        setBusy('icon');
        setNotice(null);
        try {
          // The route the page already shows for summaries is sent along, so
          // the drawing comes from the same model the user picked there.
          const body = { action: 'icon', type };
          if (model !== '') {
            const cut = model.indexOf('/');
            if (cut > 0) {
              body.provider = model.slice(0, cut);
              body.model = model.slice(cut + 1);
            }
          }
          await postJson(`${API}/types`, body);
          setNotice({ tone: 'info', text: tr('notice.icon.made') });
          await load();
        } catch (error) {
          setNotice({ tone: 'error', text: tr('notice.icon.failed', { message: error instanceof Error ? error.message : String(error) }) });
        } finally {
          setBusy('');
        }
      }, [load, model]);

      const runAssign = useCallback(async (names, type) => {
        setBusy('assign');
        setNotice(null);
        try {
          await postJson(`${API}/types`, { action: 'assign', names, type });
          setNotice({ tone: 'info', text: tr('notice.assigned') });
          await load();
        } catch (error) {
          setNotice({ tone: 'error', text: tr('notice.failed', { message: error instanceof Error ? error.message : String(error) }) });
        } finally {
          setBusy('');
        }
      }, [load]);

      const skills = Array.isArray(data?.skills) ? data.skills : [];
      const relations = data?.relations ?? {};

      const chips = useMemo(() => {
        const present = new Set(skills.map((skill) => skill.source));
        const order = ['project-dsh', 'project-agents', 'user-dsh', 'user-agents', 'parked', 'library', 'runtime', 'bundled', 'custom'];
        const known = order.filter((key) => present.has(key));
        const extra = [...present].filter((key) => !order.includes(key));
        return [...known, ...extra];
      }, [skills]);

      const filters = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return skills.filter((skill) => {
          if (source === 'active' && skill.active !== true) return false;
          if (source === 'inactive' && skill.active === true) return false;
          if (source !== 'all' && source !== 'active' && source !== 'inactive' && skill.source !== source) return false;
          if (typeFilter !== 'all' && skill.type !== typeFilter) return false;
          if (needle === '') return true;
          const haystack = `${skill.name} ${skill.description} ${skill.summary ?? ''} ${skill.category} ${skill.displayName}`.toLowerCase();
          return haystack.includes(needle);
        });
      }, [skills, query, source, typeFilter]);

      // Every shelf the catalog actually fills, in the order the host declared.
      // An explicit type filter narrows the page to that one shelf, so the same
      // list works whether the user is browsing or has already decided.
      const shelves = useMemo(() => {
        const present = new Set(filters.map((skill) => skill.type));
        const declared = Array.isArray(data?.types) ? data.types : [];
        const info = new Map(declared.map((entry) => [entry.type, entry]));
        const labelFor = (type) => {
          const entry = info.get(type);
          return entry !== undefined && entry.custom === true && typeof entry.label === 'string' && entry.label !== ''
            ? entry.label
            : tr(`type.${type}`);
        };
        const rows = declared
          .filter((entry) => present.has(entry.type))
          .map((entry) => ({
            key: entry.type,
            label: labelFor(entry.type),
            skills: filters.filter((skill) => skill.type === entry.type),
          }));
        const known = new Set(declared.map((entry) => entry.type));
        const stray = [...present].filter((type) => !known.has(type));
        for (const type of stray) {
          rows.push({ key: type, label: labelFor(type), skills: filters.filter((skill) => skill.type === type) });
        }
        return rows.filter((row) => row.skills.length > 0);
      }, [filters, data, locale]);

      // The board is the front door, but it still answers the filter chips:
      // count each type from the filtered skills, so 已装载 / 未启用 / a source
      // updates both the numbers and which tiles are worth showing. A made-up
      // shelf stays on the board while it is still empty, otherwise creating
      // one would look like the button had done nothing.
      const tiles = useMemo(() => {
        const declared = Array.isArray(data?.types) ? data.types : [];
        const counts = new Map();
        for (const skill of filters) counts.set(skill.type, (counts.get(skill.type) ?? 0) + 1);
        return declared
          .map((entry) => ({
            type: entry.type,
            count: counts.get(entry.type) ?? 0,
            custom: entry.custom === true,
            label: typeof entry.label === 'string' ? entry.label : '',
            glyph: Array.isArray(entry.glyph) ? entry.glyph : [],
          }))
          .filter((entry) => entry.count > 0 || entry.custom === true);
      }, [data, filters]);

      /** The name shown for a shelf: the user's own words, or the built-in label. */
      const shelfLabel = (entry) => (entry.custom && entry.label !== '' ? entry.label : tr(`type.${entry.type}`));

      const activeSkill = activeName === '' ? null : skills.find((skill) => skill.name === activeName) ?? null;

      const renderRow = (skill) => {
        const update = updates[skill.name];
        const relCount = Array.isArray(relations[skill.name]) ? relations[skill.name].length : 0;
        return h(
          'button',
          {
            key: `${skill.source}:${skill.name}`,
            type: 'button',
            className: 'sc-row',
            'data-active': activeName === skill.name ? '1' : '0',
            'data-inactive': skill.active === true ? '0' : '1',
            onClick: () => setActiveName(skill.name),
          },
          h('span', { className: 'sc-mark' }, h(SkillMark, { size: 17 })),
          h(
            'span',
            { className: 'sc-row-body' },
            h(
              'span',
              { className: 'sc-row-top' },
              h('span', { className: 'sc-name' }, skill.displayName !== '' ? `${skill.displayName} · ${skill.name}` : skill.name),
              skill.active === true ? null : h('span', { className: 'sc-badge', 'data-tone': 'mute' }, tr('filter.inactive')),
              h('span', { className: 'sc-badge', 'data-tone': 'mute' }, tr(`source.${skill.source}`)),
              skill.version !== '' ? h('span', { className: 'sc-badge', 'data-tone': 'mute' }, `v${skill.version}`) : null,
              update !== undefined && update.upstream === 'behind'
                ? h('span', { className: 'sc-badge', 'data-tone': 'warn' }, tr('update.behind', { version: update.latest }))
                : null,
              update !== undefined && update.local === 'changed'
                ? h('span', { className: 'sc-badge', 'data-tone': 'brand' }, tr('update.changed'))
                : null,
              update !== undefined && update.upstream !== 'behind' && update.upstream !== 'unknown'
                && update.upstream !== 'current'
                ? h('span', { className: 'sc-badge', 'data-tone': 'mute' }, tr(`update.${update.upstream}`))
                : null,
            ),
            h(
              'p',
              { className: 'sc-desc', 'data-model': skill.summary ? '1' : '0' },
              skill.summary ? skill.summary : skill.description,
            ),
            relCount > 0
              ? h(
                'span',
                { className: 'sc-rel-inline' },
                relations[skill.name].slice(0, 3).map((relation) => h(
                  'span',
                  { key: relation.name, className: 'sc-rel-tag' },
                  `${relation.name} · ${Math.round(relation.score * 100)}%`,
                )),
              )
              : null,
          ),
        );
      };

      const renderCard = (skill) => {
        const update = updates[skill.name];
        return h(
          'button',
          {
            key: `${skill.source}:${skill.name}`,
            type: 'button',
            className: 'sc-card',
            'data-inactive': skill.active === true ? '0' : '1',
            onClick: () => setActiveName(skill.name),
          },
          h(
            'span',
            { className: 'sc-card-head' },
            h('span', { className: 'sc-mark' }, h(SkillMark, { size: 17 })),
            h(
              'span',
              { style: { minWidth: 0, flex: 1 } },
              h('span', { className: 'sc-card-title', style: { display: 'block' } }, skill.name),
              h('span', { className: 'sc-card-sub', style: { display: 'block' } }, tr(`source.${skill.source}`)),
            ),
            update !== undefined && update.upstream === 'behind'
              ? h('span', { className: 'sc-badge', 'data-tone': 'warn' }, tr('update.behind', { version: update.latest }))
              : null,
            update !== undefined && update.upstream !== 'behind' && update.upstream !== 'unknown'
              && update.upstream !== 'current'
              ? h('span', { className: 'sc-badge', 'data-tone': 'mute' }, tr(`update.${update.upstream}`))
              : null,
          ),
          h('p', { className: 'sc-desc', 'data-model': skill.summary ? '1' : '0' }, skill.summary ? skill.summary : skill.description),
        );
      };

      // A shelf the user made is drawn by its own icon once a model has drawn
      // one, and by the tag shape until then. A built-in shelf is drawn by its
      // type, which is fixed.
      const glyphType = (entry) => (entry.custom === true ? 'custom' : entry.type ?? 'all');

      const renderTile = (entry) => h(
        'button',
        {
          key: entry.type ?? 'all',
          type: 'button',
          className: 'sc-tile',
          'data-on': entry.type === typeFilter ? '1' : '0',
          onClick: () => {
            setTypeFilter(entry.type ?? 'all');
            setQuery('');
          },
        },
        h('span', { className: 'sc-tile-glyph' }, h(TypeGlyph, { type: glyphType(entry), size: 22, glyph: entry.glyph })),
        h('span', { className: 'sc-tile-name' }, entry.label),
        h('span', { className: 'sc-tile-count' }, tr('board.count', { count: entry.count })),
      );

      const boardTiles = tiles.map((entry) => ({
        type: entry.type,
        label: shelfLabel(entry),
        count: entry.count,
        custom: entry.custom,
        glyph: entry.glyph,
      }));

      // The board is the front door in card view: one tile per type. Switching
      // to list view, opening a type, or searching all fall through to the
      // shelves, which render the filtered skills as rows or cards. This is the
      // fix for the 卡片/列表 toggle doing nothing on the first page.
      const showBoard = typeFilter === 'all' && query.trim() === '' && view === 'cards';
      // A breadcrumb belongs to a shelf the user opened or a search they ran,
      // not to the plain list view of the whole catalog.
      const showCrumb = typeFilter !== 'all' || query.trim() !== '';

      // The shelf currently open, when the user made it themselves. Only those
      // can be renamed or deleted; a built-in shelf is part of the classification.
      const openShelf = Array.isArray(data?.types)
        ? data.types.find((entry) => entry.type === typeFilter) ?? null
        : null;
      const customOpen = openShelf !== null && openShelf.custom === true;
      const openGlyph = Array.isArray(openShelf?.glyph) ? openShelf.glyph : [];
      const crumbLabel = openShelf !== null && openShelf.custom === true && typeof openShelf.label === 'string' && openShelf.label !== ''
        ? openShelf.label
        : tr(`type.${typeFilter}`);

      // Every shelf a skill could be moved to: the ones that already exist, plus
      // whatever the user made, in board order.
      const assignOptions = useMemo(() => {
        const declared = Array.isArray(data?.types) ? data.types : [];
        return declared.map((entry) => ({
          type: entry.type,
          label: entry.custom === true && typeof entry.label === 'string' && entry.label !== ''
            ? entry.label
            : tr(`type.${entry.type}`),
        }));
      }, [data, locale]);

      const body = (() => {
        if (phase === 'loading') {
          return h(
            'div',
            { className: 'sc-state' },
            h('span', { className: 'sc-spin', 'data-on': '1' }),
            h('span', null, tr('state.loading')),
          );
        }
        if (phase === 'error') {
          return h(
            'div',
            { className: 'sc-state', 'data-tone': 'error' },
            h('b', null, tr('state.error', { message: failure })),
            h('button', { type: 'button', className: 'sc-btn', onClick: load, style: { marginTop: 6 } }, tr('toolbar.refresh')),
          );
        }
        if (showBoard) {
          const createForm = h(
            'div',
            { className: 'sc-newtype' },
            h('input', {
              className: 'sc-input',
              type: 'text',
              value: draft,
              placeholder: tr('type.create.placeholder'),
              maxLength: 24,
              onChange: (event) => setDraft(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter') runCreateType();
                if (event.key === 'Escape') {
                  setCreating(false);
                  setDraft('');
                }
              },
            }),
            h('button', {
              type: 'button',
              className: 'sc-btn',
              'data-tone': 'brand',
              disabled: busy !== '' || draft.trim() === '',
              onClick: runCreateType,
            }, tr('type.create.confirm')),
            h('button', {
              type: 'button',
              className: 'sc-btn',
              onClick: () => {
                setCreating(false);
                setDraft('');
              },
            }, tr('type.create.cancel')),
          );
          const newTile = h(
            'button',
            {
              key: '__new__',
              type: 'button',
              className: 'sc-tile',
              'data-add': '1',
              'data-on': creating ? '1' : '0',
              onClick: () => setCreating(true),
            },
            h('span', { className: 'sc-tile-glyph' }, h('span', { className: 'sc-plus' }, '+')),
            h('span', { className: 'sc-tile-name' }, tr('board.new')),
            h('span', { className: 'sc-tile-count' }, '\u00a0'),
          );
          return h(
            'section',
            null,
            h('p', { className: 'sc-hint', style: { marginTop: 18 } }, tr('board.intro')),
            creating ? createForm : null,
            boardTiles.length === 0 && creating === false
              ? h(
                'div',
                { className: 'sc-state' },
                h('b', null, tr('empty.title')),
                h('span', null, tr('empty.body')),
              )
              : h('div', { className: 'sc-board' }, [...boardTiles.map(renderTile), newTile]),
          );
        }
        if (shelves.length === 0) {
          return h(
            'div',
            { className: 'sc-state' },
            h('b', null, tr('empty.title')),
            h('span', null, tr('empty.body')),
            h('button', {
              type: 'button',
              className: 'sc-btn',
              onClick: () => {
                setQuery('');
                setTypeFilter('all');
              },
              style: { marginTop: 6 },
            }, tr('board.back')),
          );
        }
        return shelves.map((shelf) => h(
          'section',
          { key: shelf.key, className: 'sc-group' },
          h(
            'div',
            { className: 'sc-group-head' },
            h('h2', { className: 'sc-group-title' }, shelf.label),
            h('span', { className: 'sc-group-count' }, String(shelf.skills.length)),
            shelf.skills.some((skill) => skill.active !== true)
              ? h('span', { className: 'sc-group-note' }, tr('group.mixed', {
                parked: shelf.skills.filter((skill) => skill.active !== true).length,
              }))
              : null,
          ),
          view === 'cards'
            ? h('div', { className: 'sc-grid' }, shelf.skills.map(renderCard))
            : h('div', { className: 'sc-list' }, shelf.skills.map(renderRow)),
        ));
      })();

      const modelLabel = data?.model && data.model.provider
        ? `${data.model.provider}/${data.model.model}`
        : '';
      const chosen = model !== '' ? model : modelLabel;
      // The summary line is a record of the descriptions currently on screen,
      // not a preview of the dropdown. It must stay put when the user picks a
      // different model, so it reads the model the host says actually wrote
      // them instead of whatever the toolbar happens to be set to now.
      const describedBy = typeof data?.describedBy === 'string' ? data.describedBy : '';

      // One flat option list, provider on the label, so a long catalog stays a
      // single native dropdown instead of nested optgroups.
      const modelOptions = useMemo(() => {
        const providers = Array.isArray(catalog?.providers) ? catalog.providers : [];
        const rows = [];
        for (const provider of providers) {
          for (const entry of Array.isArray(provider.models) ? provider.models : []) {
            rows.push({
              value: `${provider.id}/${entry.id}`,
              label: `${provider.name} · ${entry.name}`,
            });
          }
        }
        return rows;
      }, [catalog]);

      return h(
        'div',
        { className: 'sc-page' },
        h(StyleTag),
        h(
          'div',
          { className: 'sc-scroll' },
          h(
            'div',
            { className: 'sc-inner' },
            h(
              'div',
              { className: 'sc-head' },
              h(
                'div',
                null,
                h(
                  'div',
                  { className: 'sc-heading' },
                  h('span', { className: 'sc-heading-mark' }, h(PanelIcon, { size: 26 })),
                  h('h1', { className: 'sc-title' }, tr('page.title')),
                ),
                h('p', { className: 'sc-intro' }, tr('page.intro')),
              ),
              h(
                'div',
                { className: 'sc-toolbar' },
                h(
                  'div',
                  { className: 'sc-seg', role: 'group' },
                  h('button', {
                    type: 'button',
                    className: 'sc-seg-btn',
                    'data-on': view === 'cards' ? '1' : '0',
                    onClick: () => setView('cards'),
                  }, tr('toolbar.view.cards')),
                  h('button', {
                    type: 'button',
                    className: 'sc-seg-btn',
                    'data-on': view === 'list' ? '1' : '0',
                    onClick: () => setView('list'),
                  }, tr('toolbar.view.list')),
                ),
                h(
                  'label',
                  { className: 'sc-model', title: tr('toolbar.model') },
                  modelOptions.length > 0
                    ? h(
                      'select',
                      {
                        value: model,
                        disabled: busy !== '',
                        'aria-label': tr('toolbar.model'),
                        onChange: (event) => setModel(event.target.value),
                      },
                      modelOptions.map((option) => h('option', { key: option.value, value: option.value }, option.label)),
                    )
                    : h('span', { className: 'sc-hint' }, tr('meta.no_model')),
                ),
                h('button', {
                  type: 'button',
                  className: 'sc-btn',
                  'data-tone': 'brand',
                  disabled: busy !== '' || phase === 'loading',
                  onClick: runDescribe,
                  title: chosen === '' ? tr('meta.no_model') : tr('meta.write_with', { model: chosen }),
                }, busy === 'describe' ? tr('toolbar.describing') : tr('toolbar.describe')),
                h('button', {
                  type: 'button',
                  className: 'sc-btn',
                  disabled: busy !== '' || phase === 'loading',
                  onClick: runUpdates,
                }, busy === 'updates' ? tr('toolbar.checking') : tr('toolbar.updates')),
                h('button', {
                  type: 'button',
                  className: 'sc-btn',
                  disabled: busy !== '' || phase === 'loading',
                  onClick: load,
                }, tr('toolbar.refresh')),
              ),
            ),
            h(
              'div',
              { className: 'sc-filters' },
              h(
                'label',
                { className: 'sc-search' },
                h(
                  'svg',
                  { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, 'aria-hidden': 'true' },
                  h('circle', { cx: 7, cy: 7, r: 4.2 }),
                  h('path', { d: 'M10.2 10.2 14 14' }),
                ),
                h('input', {
                  type: 'search',
                  value: query,
                  placeholder: tr('search.placeholder'),
                  onChange: (event) => setQuery(event.target.value),
                }),
              ),
              h(
                'div',
                { className: 'sc-chips' },
                ['all', 'active', 'inactive'].map((key) => h('button', {
                  key,
                  type: 'button',
                  className: 'sc-chip',
                  'data-on': source === key ? '1' : '0',
                  onClick: () => setSource(key),
                }, tr(`filter.${key}`))),
                chips.map((key) => h('button', {
                  key,
                  type: 'button',
                  className: 'sc-chip',
                  'data-on': source === key ? '1' : '0',
                  onClick: () => setSource(key),
                }, tr(`source.${key}`))),
              ),
            ),
            showCrumb === false
              ? null
              : h(
                'div',
                { className: 'sc-crumb' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'sc-crumb-back',
                    onClick: () => {
                      setTypeFilter('all');
                      setQuery('');
                    },
                  },
                  h('svg', { width: 11, height: 11, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' }, h('path', { d: 'M10 3.5 5 8l5 4.5' })),
                  tr('board.back'),
                ),
                h(
                  'span',
                  { className: 'sc-crumb-title' },
                  h('span', { className: 'sc-tile-glyph' }, h(TypeGlyph, { type: typeFilter === 'all' ? 'all' : customOpen ? 'custom' : typeFilter, size: 15, glyph: openGlyph })),
                  typeFilter === 'all' ? tr('board.all') : crumbLabel,
                ),
                h('span', { className: 'sc-crumb-note' }, tr('meta.count', { count: filters.length })),
                customOpen
                  ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'sc-crumb-act',
                      title: openGlyph.length > 0 ? tr('type.icon.redo') : tr('type.icon.make'),
                      disabled: busy !== '',
                      onClick: () => runMakeIcon(typeFilter),
                    },
                    busy === 'icon' ? tr('type.icon.working') : openGlyph.length > 0 ? tr('type.icon.redo') : tr('type.icon.make'),
                  )
                  : null,
                customOpen
                  ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'sc-crumb-remove',
                      title: tr('type.remove.hint'),
                      disabled: busy !== '',
                      onClick: () => runRemoveType(typeFilter),
                    },
                    tr('type.remove'),
                  )
                  : null,
              ),
            h(
              'div',
              { className: 'sc-summary' },
              h('span', null, tr('meta.count', { count: skills.length })),
              data?.roots ? h('span', { className: 'sc-dot' }) : null,
              data?.roots ? h('span', null, tr('meta.roots', { count: data.roots.length })) : null,
              h('span', { className: 'sc-dot' }),
              h('span', null, describedBy === '' ? tr('meta.no_summaries') : tr('meta.model', { model: describedBy })),
            ),
            notice !== null
              ? h('div', { className: 'sc-notice', 'data-tone': notice.tone === 'error' ? 'error' : 'info' }, notice.text)
              : null,
            body,
          ),
        ),
        activeSkill !== null
          ? h(DetailDrawer, {
            skill: activeSkill,
            update: updates[activeSkill.name],
            relations: Array.isArray(relations[activeSkill.name]) ? relations[activeSkill.name] : [],
            skills,
            assignOptions,
            busy,
            onAssign: runAssign,
            onClose: () => setActiveName(''),
            onPick: (name) => setActiveName(name),
          })
          : null,
      );
    }

    /**
     * The detail drawer: facts, relations, and the raw SKILL.md.
     * @param props - the skill, its relations, the catalog, and the callbacks.
     * @returns the drawer element.
     */
    function DetailDrawer(props) {
      useLocale();
      const { skill, update, relations, skills, assignOptions, busy, onAssign, onClose, onPick } = props;
      const [content, setContent] = useState('');
      const [contentPhase, setContentPhase] = useState('loading');
      const [copied, setCopied] = useState(false);

      useEffect(() => {
        let cancelled = false;
        setContentPhase('loading');
        setContent('');
        getJson(`${API}/read`, { name: skill.name, source: skill.source })
          .then((result) => {
            if (cancelled) return;
            setContent(typeof result.content === 'string' ? result.content : '');
            setContentPhase('ready');
          })
          .catch((error) => {
            if (cancelled) return;
            setContent(error instanceof Error ? error.message : String(error));
            setContentPhase('error');
          });
        return () => {
          cancelled = true;
        };
      }, [skill.name, skill.source]);

      useEffect(() => {
        if (!copied) return undefined;
        const id = window.setTimeout(() => setCopied(false), 1600);
        return () => window.clearTimeout(id);
      }, [copied]);

      const facts = [
        [tr('detail.source'), tr(`source.${skill.source}`)],
        [tr('detail.path'), skill.displayPath],
        skill.version !== '' ? [tr('detail.version'), skill.version] : null,
        update !== undefined && update.latest !== ''
          ? [tr('detail.latest'), update.latest] : null,
        update !== undefined && update.upstream !== 'unknown'
          ? [tr('detail.upstream'), tr(`update.${update.upstream}`)] : null,
        [tr('detail.hash'), skill.hash],
        [tr('detail.size'), formatBytes(skill.bytes)],
        skill.active === true ? [tr('detail.files'), String(skill.fileCount)] : null,
        [tr('detail.body'), String(skill.bodyChars)],
        [tr('detail.updated'), formatDate(skill.mtime)],
      ].filter((entry) => entry !== null && entry !== undefined);

      return h(
        'aside',
        { className: 'sc-drawer', role: 'dialog', 'aria-label': tr('detail.title') },
        h(
          'div',
          { className: 'sc-drawer-head' },
          h('span', { className: 'sc-mark' }, h(SkillMark, { size: 17 })),
          h('span', { className: 'sc-drawer-title' }, skill.name),
          h('button', {
            type: 'button',
            className: 'sc-icon-btn',
            onClick: () => {
              const clipboard = navigator.clipboard;
              if (clipboard === undefined || typeof clipboard.writeText !== 'function') return;
              clipboard.writeText(skill.path).then(() => setCopied(true)).catch(() => setCopied(false));
            },
            title: copied ? tr('detail.copied') : tr('detail.copy'),
            'aria-label': tr('detail.copy'),
          }, copied ? h('svg', { width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }, h('path', { d: 'M3 8.5 6.4 12 13 4.5' })) : h('svg', { width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }, h('rect', { x: 5.5, y: 5.5, width: 8, height: 8, rx: 1.5 }), h('path', { d: 'M10.5 3.5v-.5a1.5 1.5 0 0 0-1.5-1.5H3.5A1.5 1.5 0 0 0 2 3v5.5A1.5 1.5 0 0 0 3.5 10h.5' }))),
          h('button', { type: 'button', className: 'sc-icon-btn', onClick: onClose, title: tr('detail.close'), 'aria-label': tr('detail.close') },
            h('svg', { width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }, h('path', { d: 'M4 4l8 8M12 4l-8 8' }))),
        ),
        h(
          'div',
          { className: 'sc-drawer-body' },
          h('p', { className: 'sc-hint', style: { margin: 0 } }, skill.summary !== '' ? skill.summary : skill.description),
          h('div', { className: 'sc-facts' }, facts.map(([key, value], index) => h(
            Fragment2,
            { key: index },
            h('span', { className: 'sc-fact-k' }, key),
            h('span', { className: 'sc-fact-v' }, value),
          ))),
          h(
            'div',
            { className: 'sc-invoc' },
            h('span', { className: 'sc-badge', 'data-tone': skill.modelInvocable ? 'ok' : 'mute' }, `${tr('detail.invocable.model')}: ${skill.modelInvocable ? '✓' : tr('detail.invocable.off')}`),
            h('span', { className: 'sc-badge', 'data-tone': skill.userInvocable ? 'ok' : 'mute' }, `${tr('detail.invocable.user')}: ${skill.userInvocable ? '✓' : tr('detail.invocable.off')}`),
          ),
          h(
            'div',
            { className: 'sc-assign' },
            h('p', { className: 'sc-section-title', style: { marginBottom: 6 } }, tr('assign.title')),
            h(
              'select',
              {
                className: 'sc-select',
                value: skill.type,
                disabled: busy !== '',
                'aria-label': tr('assign.title'),
                onChange: (event) => {
                  const next = event.target.value;
                  onAssign([skill.name], next === skill.autoType ? '' : next);
                },
              },
              h('option', { key: '__auto__', value: skill.autoType }, tr('assign.auto', { type: tr(`type.${skill.autoType}`) })),
              assignOptions
                .filter((entry) => entry.type !== skill.autoType)
                .map((entry) => h('option', { key: entry.type, value: entry.type }, entry.label)),
            ),
          ),
          h(
            'div',
            null,
            h('p', { className: 'sc-section-title' }, tr('detail.relations')),
            relations.length === 0
              ? h('p', { className: 'sc-hint' }, tr('detail.no_relations'))
              : h('div', { className: 'sc-rel-list' }, relations.map((relation) => h(
                'button',
                {
                  key: relation.name,
                  type: 'button',
                  className: 'sc-rel-item',
                  onClick: () => {
                    if (skills.some((candidate) => candidate.name === relation.name)) onPick(relation.name);
                  },
                },
                h('span', { className: 'sc-rel-name' }, relation.name),
                relation.because !== undefined
                  ? h('span', { className: 'sc-rel-why', 'data-why': relation.because }, tr(`because.${relation.because}`))
                  : null,
                Array.isArray(relation.shared) && relation.shared.length > 0
                  ? h('span', { className: 'sc-rel-score' }, relation.shared.slice(0, 3).join(' · '))
                  : null,
                h('span', { className: 'sc-rel-score' }, `${Math.round(relation.score * 100)}%`),
              ))),
          ),
          h(
            'div',
            null,
            h('p', { className: 'sc-section-title', style: { marginBottom: 6 } }, tr('detail.content')),
            contentPhase === 'loading'
              ? h('p', { className: 'sc-hint' }, tr('detail.loading'))
              : h('pre', { className: 'sc-code' }, content),
          ),
        ),
      );
    }

    /** React fragment without pulling the jsx runtime in. */
    function Fragment2(props) {
      return h(React.Fragment, null, props.children);
    }

    // ─────────────────────────── entry ───────────────────────────

    /** Locale the shell reported at mount time. */
    let mountedLocale = '';

    /**
     * Mount the panel row, the page, and the locale dictionaries.
     * @param ctx - the client plugin context.
     */
    function apply(ctx) {
      ctx.effect(() => {
        const locale = ctx.get('locale');
        if (locale && typeof locale.register === 'function') {
          try {
            locale.register(NS, 'zh', MESSAGES.zh);
            locale.register(NS, 'en', MESSAGES.en);
          } catch (error) {
            /* already registered after a reload */
          }
          const sync = () => {
            let next = 'zh';
            try {
              const snapshot = locale.getLocale ? locale.getLocale() : null;
              if (snapshot && snapshot.active) next = String(snapshot.active).slice(0, 2);
            } catch {
              next = 'zh';
            }
            if (!MESSAGES[next]) next = 'zh';
            if (next === mountedLocale) return;
            mountedLocale = next;
            activeLocale = next;
            notifyLocale();
          };
          sync();
          if (typeof locale.subscribe === 'function') {
            const off = locale.subscribe(sync);
            return () => {
              if (typeof off === 'function') off();
            };
          }
        }
        return undefined;
      }, 'skill-manager: locale');

      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: PANEL_ORDER,
        label: () => tr('entry.label'),
      }, PanelIcon));

      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: PANEL_ID,
      }, SkillManagerPage));
    }

    return {
      inject: ['slots'],
      apply: apply,
    };
  },
});
