# dsh-skill-manager

一个给 [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) 用的技能管理面板。它把这台机器上所有能找到的技能扫出来，按类型摆成卡片墙，让你可以自己建类型、把技能挪进去、让模型给每个技能写一句中文说明、给自建类型画一个图标、看清技能之间的关联，还能顺手查一下哪些技能有新版本。

版本 0.3.0，MIT 开源，作者 HighToward。

- 界面语言：简体中文 / English（跟随 DSH 的 locale）
- 运行位置：DSH Web GUI 左侧边栏的一个面板
- 不依赖任何 npm 三方包，纯 ESM + React（由宿主注入）

## 它长什么样

![自建类型图标，22px 与 15px，浅色与深色](docs/shelf-icons.png)

上图是四个自建类型让模型画出来的图标。音效库是喇叭加声波，剪辑素材是剪刀，客户合同是折角文件，我的博客是钢笔。最左边那枚标签形状是兜底图标，新建类型还没画图标时先显示它。

![应用图标](docs/icon-256.png)

## 主要功能

**扫盘**。它会读六类目录：工作区的 `.dsh/skills`、`.agents/skills`，用户目录的 `.dsh/skills`、`.agents/skills`，以及 WorkBuddy 留下的 `parked-skills` 和 `library`（这两个是未启用的存量，也会列出来）。同名技能按来源优先级去重，`duplicates` 告诉你重复了多少。每个技能读 `SKILL.md` 的 frontmatter，拿 name、description、description_zh、category、version 这些字段，还会读安装时留下的 `_skillhub_meta.json` 之类的元数据。

**按类型分好**。内置 15 个类型：剪辑与视频、声音与音乐、设计与图片、文档与表格、写作与文案、浏览器与桌面、检索与调研、开发与部署、数据与地图、安全审查、求职与招聘、技能管理、消息与邮件、本机杂项、其他。归类靠一张显式名字表（`TYPE_BY_NAME`，一百多条）加一组关键词规则（`TYPE_RULES`），两条都不中就落进「其他」。启用和未启用的技能都参加分类，同一个架子里未启用的会带一枚小徽章。

这里要点明一件事：类型识别完全不看 AI 写的那句说明，只读 SKILL.md frontmatter。就算把所有说明清掉，15 个架子照样分得出来。

**自建类型**。卡片墙末尾有一格虚线的「新建类型」。起个名字，创建完会自动跳进这个空架子。点进一个技能，抽屉里有「归属类型」下拉，可以把技能挪到任意自建类型，也可以选「自动分类」让它回到关键词判定的位置。删掉一个自建类型时，里面的技能会退回自动分类，不会凭空消失。空架子也留在墙上，不然刚建完就消失像是按钮坏了。

**让模型写中文说明**。工具栏上有「让模型写说明」，旁边是模型下拉。下拉里是 DSH 当前配置的所有 provider 和模型，你选哪个就用哪个，不另外计费到别的 provider 上。模型按批次给技能写一句 18 到 34 字的中文，必须是纯中文，英文的答复会被判为不合格并重问一次。说明按 SKILL.md 的内容哈希缓存，文件没变就不重写。

**给自建类型画图标**。新建类型后自动画一次，用的就是上面那个说明模型。图标是 24×24 网格上的描边图形，模型只返回 JSON 形状数组，标签和属性都过白名单：只允许 `path`、`circle`、`rect` 这类基础图形和几何属性，`onclick`、`script`、外链这些一律丢掉。store 里存的字符串在渲染前还会再校验一次，因为那是个可以手改的普通 JSON 文件。没画成或还没画的时候，显示那枚「自定义」标签图标。面包屑上有「生成图标 / 重画图标」，随时可以再画。

这里也有个坑值得记下来：第一版提示词太含糊，模型给「音效库」画了个左右括号似的框，看不出是声音。改成「画出名字指的那个东西本身，别画一个框把它装起来」，再把分配到架子上的技能名和描述一起发过去，才对上。

**关联图**。技能之间的关联看三类信号：正文里有没有点名另一个技能（反引号包起来的名字最可信，带连字符的名字次之，短名字不算，免得 `pdf`、`voice` 这种普通词污染），是不是同一个类型，是不是同一个 category。阈值 0.22，每个技能最多留 6 个邻居。详情抽屉里把邻居列出来，并且标出为什么关联（正文点名 / 同一分类 / 同一类型 / 用词相近）。

**检查更新**。对带安装元数据的技能，批量查 SkillHub 的接口比对版本，没元数据的再试着读 GitHub raw。结果分 `behind`、`current`、`unversioned`、`no-slug`、`gone` 几种状态。只有 slug 能查，skillId 和 canonicalName 都会 404，这点实测过。

**详情抽屉**。点任意一行或一张卡片，右侧抽屉显示来源、路径、版本、本地与上游版本、哈希、文件大小、文件数、正文长度、修改时间，两个可调用徽章，关联技能，以及 SKILL.md 原文。

## 安装

要求 Node 20 以上，DSH Web GUI 在运行。插件是 link 安装的本地 bundle，装完重启或热重载一次生效。

方式一，用 dsh 命令行（收录 dsh-market 后推荐这个）：

```bash
dsh plugin --profile web add github:HighToward/dsh-skill-manager
```

方式二，从 GitHub 克隆后 link 到当前 profile：

```bash
git clone https://github.com/HighToward/dsh-skill-manager.git
cd dsh-skill-manager
# 在 profile 的 package.json 里加一条指向本地克隆的 link 依赖，例如：
#   "dsh-skill-manager": "link:/absolute/path/to/dsh-skill-manager"
```

然后 `plugin_manager` 里把这个 bundle 关掉再打开（enabled false 再 enabled true），两次都返回 applied 就是热重载成功。直接 `install_bundle` 对已装的包会报 already-installed，不会替换运行中的实例。

`cordis.patch.yml` 里只有一行插入：

```yaml
- insert:
    - id: skill-manager
      name: 'dsh-skill-manager'
```

## 代码结构

```
index.js            host 半，扫盘、分类、关联、模型调用、HTTP 路由、状态读写
client.js           client 半，React 组件、卡片墙、抽屉、图标、locale 文案
cordis.patch.yml    bundle 挂载声明
icon.svg            应用图标
locale/zh.json      中文界面标题
locale/en.json      英文界面标题
tests/              测试脚本
docs/               截图和 256px 图标
```

Host 半只声明 `inject: ['webServer']`。这是刻意的：host plane 上的 `skills` 服务读不到用户技能，还会阻塞挂载，所以插件自己扫盘。所有路由在 `ctx.effect(..., 'skill-manager: routes')` 里注册，全是 `kind: 'exact'`。

Client 半通过 `window.__ModuleLoader__.load` 进去，`ctx.slots.inject('sidebar.panellist', ...)` 加左侧入口（order 40），`ctx.slots.inject('main', ...)` 加页面。没有 JSX，全部用 `React.createElement` 写，`h` 是它的别名。

侧边栏图标宿主只给 16 或 18px，所以 `PanelIcon` 是按这个尺寸画的描边图形：一张亮卡片，右后方露出第二张卡片的边，加一颗四角星。

## HTTP 接口

全部只接受本机请求（`::1`、`127.*`、`::ffff:127.*`），其他一律 403。请求体上限 256KB，读 SKILL.md 上限 400KB。

| 路径 | 方法 | 作用 |
| --- | --- | --- |
| `/api/dsh-skill-manager/health` | GET | 健康检查 |
| `/api/dsh-skill-manager/list` | GET | 技能清单、类型架子、关联图、说明、模型 |
| `/api/dsh-skill-manager/models` | GET | provider 与模型目录，含默认选择 |
| `/api/dsh-skill-manager/types` | POST | 自建类型的 create / rename / remove / assign / icon |
| `/api/dsh-skill-manager/describe` | POST | 给技能写中文说明，可带 provider / model / force / names |
| `/api/dsh-skill-manager/insight` | GET | 类型与关联的汇总 |
| `/api/dsh-skill-manager/updates` | POST | 检查更新 |
| `/api/dsh-skill-manager/read` | POST | 读某个技能的 SKILL.md 原文 |

`types` 的 `icon` action 会调模型画图标，返回 `{ ok, type, glyph, model }`。`assign` 里 `type` 传空串等于清除分配，技能回到自动分类。

## 状态文件

状态写在 `$DSH_HOME/dsh-skill-manager/store.json`（默认 `~/.dsh/dsh-skill-manager/store.json`），原子写。结构：

```json
{
  "version": 1,
  "descriptions": { "skill-name": { "text": "一句中文", "hash": "…", "at": 0, "model": "provider/model" } },
  "baselines": { "skill-name": { "hash": "…", "version": "…", "at": 0 } },
  "types": { "x-my-shelf": { "label": "我的剪辑", "glyph": "[[\"path\",{\"d\":\"M…\"}]]", "at": 0 } },
  "assignments": { "skill-name": "x-my-shelf" },
  "meta": {}
}
```

自建类型的 id 一律 `x-` 开头，绝不会盖掉内置类型。中文名字 slug 化会得到空串，这时用时间戳兜底。

## 能力声明与安全

这个插件会读本机文件、写自己的状态文件、调用大模型、访问网络查更新。对应 dsh-market 的 capabilities 枚举是 `fs-read`、`fs-write`、`llm`、`network`、`host-runtime`、`dynamic-code`。没有 `shell`，没有 `subagent`，不碰 `env`。

几个边界：

- 路由只放本机，外网访问 403。
- 图标形状用关闭的白名单，不是黑名单过滤。事件处理器、样式、链接天然进不来。store 读出来再验一次。
- 模型说明强制中文，英文答复按不合格处理。
- 说明按内容哈希缓存，SKILL.md 改了才重写。
- 图标生成失败不影响架子本身，架子先建好再去请求模型。
- 扫盘只读技能目录，不执行技能里的任何代码。

## 开发与测试

测试脚本在 `tests/`，用 Node 直接跑，不需要装依赖（渲染类脚本用到全局 playwright 和 chromium）。

```bash
node tests/smoke.mjs      # host 半端到端
node tests/load.mjs       # client 能否注册两个 slot
node tests/render.mjs     # 卡片墙、钻取、自建类型、图标回落
node tests/drawer.mjs     # 详情抽屉与归属类型下拉
node tests/cascade.mjs    # brand 按钮 hover 的 CSS 特异性
node tests/types.mjs      # 自建类型 CRUD、分配、图标白名单
```

`tests/live-icon.mjs` 和 `tests/shot-shelf-icons.mjs` 会对运行中的 GUI 发真实请求，用真实模型画图标并截图，跑完会自己清理现场。中文请求一律用 node fetch 发，不要用 PowerShell 内联 JSON，控制台编码会把中文写成 `????`。

改中文请用 node 的 `fs.readFileSync/writeFileSync(t, 'utf8')`。PowerShell 的 `Set-Content -Encoding utf8` 会写坏中文，导致 `SyntaxError: Invalid or unexpected token`。

## 收录 dsh-market 的准备

dsh-market 的目录来自 `awesome-dsh-plugin/awesome-dsh-plugin` 仓库的 `plugins.json`，收录靠给那个仓库提 PR。本插件对应 `skill` 分类。下面是一个可以直接用的条目草稿，`page`、`stars`、`downloads` 由收录方生成，提交时留空或按对方模板来。

```json
{
  "name": "dsh-skill-manager",
  "owner": "HighToward",
  "url": "https://github.com/HighToward/dsh-skill-manager",
  "category": "skill",
  "description": {
    "en": "Browse every skill on the machine by type, make your own shelves, write one-line Chinese descriptions with a model you pick, draw an icon for each custom shelf, see how skills relate, and check for updates.",
    "zh": "按类型浏览本机所有技能，自建类型并分配技能，自选模型写中文说明，给自建类型画图标，查看技能关联，检查更新。"
  },
  "npm": null,
  "version": "0.3.0",
  "capabilities": ["fs-read", "fs-write", "llm", "network", "host-runtime", "dynamic-code"],
  "capabilityRedLines": ["shell", "subagent", "env"],
  "install": "dsh plugin --profile web add github:HighToward/dsh-skill-manager",
  "added": "2026-11-07",
  "icon": "https://raw.githubusercontent.com/HighToward/dsh-skill-manager/HEAD/docs/icon-256.png",
  "screenshots": [
    "https://raw.githubusercontent.com/HighToward/dsh-skill-manager/HEAD/docs/shelf-icons.png"
  ]
}
```

收录前建议先打一个 GitHub Release，把 `npm pack` 出来的 tgz 传上去，这样 `tarball` 字段也有落处。仓库里已经备好 `docs/icon-256.png`（256px PNG）和 `docs/shelf-icons.png`（截图），market 页面直接指 raw.githubusercontent 链接即可。

---

# English

A skill manager panel for [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness). It scans every skill it can find on the machine, lays them out as a wall of type cards, lets you create your own types, move skills into them, have a model write a one-line Simplified Chinese description for each skill, draw an icon for each custom type, see how skills relate, and check whether any of them have a newer version.

Version 0.3.0, MIT licensed, by HighToward.

## What it does

It reads six kinds of roots: the workspace `.dsh/skills` and `.agents/skills`, the user level `.dsh/skills` and `.agents/skills`, plus WorkBuddy's `parked-skills` and `library` (those two hold skills that are on disk but not loaded, and they are listed too). Duplicate names are resolved by source precedence and reported as `duplicates`. Each skill's `SKILL.md` frontmatter is parsed for name, description, `description_zh`, category and version, and install metadata such as `_skillhub_meta.json` is read when present.

Skills land in 15 built-in types: video, audio, design, office, writing, browser, research, dev, data, security, jobs, skillops, comms, system and other. Classification uses an explicit name table (over a hundred entries) plus a set of ordered keyword rules. Anything unmatched goes to `other`. Both active and inactive skills are classified; inactive ones carry a small badge inside the shelf.

One point worth stating plainly: type detection never looks at the AI written description. It reads only the SKILL.md frontmatter. Clear every description and all 15 shelves still fill correctly.

You can create your own types from the dashed "New type" tile at the end of the board, then move any skill onto one from the "Shelf" dropdown in its detail drawer, or pick "Automatic" to send it back to the keyword based shelf. Deleting a custom type returns its skills to automatic classification. An empty custom shelf stays on the board.

"Let a model write descriptions" uses the model picked in the toolbar dropdown, which lists every provider and model DSH currently has configured. Nothing is billed to a provider you did not choose. The model writes one plain Chinese sentence of 18 to 34 characters per skill; English answers are rejected and retried. Descriptions are cached by a hash of the SKILL.md content.

Custom types get an icon drawn by that same description model right after creation. The icon is a set of stroked shapes on a 24 by 24 grid, returned as JSON. A closed whitelist of shape tags and geometric attributes is applied both to the model output and again when the stored string is read back, so event handlers, styles and external links cannot get through. When no icon has been drawn, a generic tag glyph is shown. The breadcrumb offers "Draw icon" or "Redraw icon".

Relations are built from three signals: whether another skill is named in the body text (backticked names are strongest, hyphenated names next, short names are ignored so ordinary words like `pdf` do not create noise), whether two skills share a type, and whether they share a category. The drawer lists neighbours and labels the reason.

The update check queries SkillHub in batches for skills with install metadata and falls back to GitHub raw where possible. Only slugs resolve; skillId and canonicalName both 404.

## Install

Node 20 or newer, DSH Web GUI running. It is a linked local bundle.

```bash
dsh plugin --profile web add github:HighToward/dsh-skill-manager
```

Or clone, `npm link`, add a `link:` dependency in your profile's `package.json`, then toggle the bundle off and on in `plugin_manager` (both calls should return applied). `install_bundle` reports `already-installed` on an existing link and will not replace the running instance.

## Architecture

`index.js` is the host half: scanning, classification, relations, model calls, HTTP routes and state. `client.js` is the client half: React components, board, drawer, glyphs and locale strings. There is no JSX; everything is `React.createElement` behind an `h` alias.

The host half declares only `inject: ['webServer']`. That is deliberate: the host plane `skills` service cannot see user skills and blocks mounting, so the plugin scans the disk itself. All routes are registered in `ctx.effect(..., 'skill-manager: routes')` as `kind: 'exact'`. The client half mounts a `sidebar.panellist` entry at order 40 and a `main` page through `ctx.slots.inject`.

The sidebar icon is rendered by the host at 16 or 18px, so `PanelIcon` is a stroked drawing tuned for that size: a light card, a second card peeking out behind it, and a four point sparkle.

## HTTP API

Local requests only (`::1`, `127.*`, `::ffff:127.*`), everything else 403. Request bodies cap at 256KB, SKILL.md reads at 400KB.

| Path | Method | Purpose |
| --- | --- | --- |
| `/api/dsh-skill-manager/health` | GET | health check |
| `/api/dsh-skill-manager/list` | GET | skills, shelves, relations, descriptions, model |
| `/api/dsh-skill-manager/models` | GET | provider and model catalog, plus default |
| `/api/dsh-skill-manager/types` | POST | create / rename / remove / assign / icon |
| `/api/dsh-skill-manager/describe` | POST | write Chinese descriptions |
| `/api/dsh-skill-manager/insight` | GET | types and relations summary |
| `/api/dsh-skill-manager/updates` | POST | check for updates |
| `/api/dsh-skill-manager/read` | POST | read one SKILL.md |

The `icon` action returns `{ ok, type, glyph, model }`. In `assign`, passing an empty `type` clears the assignment.

## State

State lives in `$DSH_HOME/dsh-skill-manager/store.json` and is written atomically. Custom type ids always start with `x-` so they can never shadow a built-in shelf.

## Security

Icon shapes use a closed whitelist rather than blacklist filtering, and the stored string is validated again before rendering because `store.json` is a plain editable file. Descriptions must be Chinese. Routes are local only. Scanning reads skill folders and never executes code from them.

## Development and tests

Run the scripts in `tests/` with plain Node. They need no installed dependencies; the rendering ones use a global playwright and chromium.

```bash
node tests/smoke.mjs
node tests/load.mjs
node tests/render.mjs
node tests/drawer.mjs
node tests/cascade.mjs
node tests/types.mjs
```

`tests/live-icon.mjs` and `tests/shot-shelf-icons.mjs` talk to a running GUI with a real model and clean up afterwards. Send Chinese request bodies with node fetch, not inline PowerShell JSON, which mangles UTF-8 into `????`. Edit Chinese source with node `fs.writeFileSync(t, 'utf8')`; PowerShell `Set-Content -Encoding utf8` corrupts it.

## dsh-market submission

The dsh-market catalog comes from `plugins.json` in the `awesome-dsh-plugin/awesome-dsh-plugin` repo, and submission is a PR there. This plugin belongs to the `skill` category. A ready to paste entry is in the Chinese section above. `page`, `stars` and `downloads` are generated by the catalog side. Cut a GitHub Release and attach the `npm pack` tarball so the `tarball` field has a target. `docs/icon-256.png` and `docs/shelf-icons.png` are already in the repo for the `icon` and `screenshots` fields.

## License

MIT. See [LICENSE](LICENSE).
