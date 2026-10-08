# 具身智能名词表 · 交互式镜像版

原站：[https://embodiedterms.com/](https://embodiedterms.com/)

本项目完整镜像原站的全部内容（中文 2947 条 + 英文版，14 个分类、各小节、
一句话解释 / 展开说明 / 例子 / 相关词 / 来源链接），并采用**全新的交互形式**，
同时具备**原站更新后一键/自动同步**的能力。

## 目录结构

```
embodiedterms/
├── index.html                 # 网站入口（直接用浏览器打开即可）
├── assets/
│   ├── style.css              # 样式（延续原站绿系视觉，深色模式）
│   └── app.js                 # 全部交互逻辑（原生 JS，无依赖）
├── data/
│   ├── zh.js / en.js          # 网站实际加载的数据（<script> 注入，双击打开可用）
│   └── zh.json / en.json      # 同一份数据的 JSON 格式（便于下载/二次使用）
├── sync.py                    # 同步脚本（仅用 Python 标准库，同时更新 .js/.json）
├── com.embodiedterms.sync.plist  # macOS 定时任务模板（每天自动同步）
└── sync.log                   # 定时任务日志（运行后生成）
```

## 如何打开

**直接双击 `index.html`** 即可，无需联网、无需服务器——数据通过
`<script src="data/xx.js">` 加载，不受本地文件跨域限制。

> 也可以起一个静态服务：`python3 -m http.server 8000`，访问
> `http://localhost:8000`（HTTP 下也会自动回退读取 .json）。

## 新交互形式（与原站的区别）

| | 原站 | 本镜像版 |
|---|---|---|
| 首页 | 左栏分类导航 + 词条列表 | **14 张分类卡片网格** + 大搜索入口 + 统计 |
| 分类浏览 | 整页长列表 + 小节筛选 | **学习路径时间线**，小节由浅入深、词条以胶囊卡片排列 |
| 词条详情 | 列表内联展开 | **右侧滑出详情抽屉**，支持上/下一个切换、URL 分享 |
| 搜索 | 页内搜索框过滤列表 | **Ctrl/⌘+K 命令面板**（或按 `/`），模糊匹配 + 错别字纠错 + 全键盘操作 |
| 分级 | 三档按钮 | 保留三档（入门必知 / 入门+常用 / 全部） |
| 增强 | — | 已学标记（本地保存）、随机发现一个词、中英双语、深浅色切换 |

路由（可直接分享/收藏）：
- `#/` 首页
- `#/c/<分类key>` 分类学习路径
- `#/t/<词条id>` 词条详情抽屉
- `#/about` 关于

## 数据同步（原站更新 → 本站更新）

原站数据文件名带内容 hash（如 `zh.4c694bfb26.json`），每次更新都会变化。
`sync.py` 会自动抓取原站首页、解析出最新数据文件并下载，按数据日期判断是否更新。

### 手动同步

```bash
python3 sync.py            # 检查并同步（有更新才写入）
python3 sync.py --force    # 强制重新下载
python3 sync.py --json     # 输出 JSON 结果
```

### macOS 定时自动同步（launchd，推荐）

`com.embodiedterms.sync.plist` 已按本目录路径配置为每天 09:07 同步。加载：

```bash
cp com.embodiedterms.sync.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.embodiedterms.sync.plist
```

停用：

```bash
launchctl unload ~/Library/LaunchAgents/com.embodiedterms.sync.plist
```

> 若移动了项目目录，需同步修改 plist 里的路径。

### 通用方式（cron）

```bash
crontab -e
# 每天 09:07 同步（把路径换成你的实际目录）
7 9 * * * /usr/bin/python3 /path/to/embodiedterms/sync.py >> /path/to/embodiedterms/sync.log 2>&1
```

## 许可说明

原站内容采用 **CC BY-NC 4.0** 许可（可转载/改编，需署名、不可商用）。
本镜像保留了原站链接与许可声明。如需公开传播，按许可要求应保留原作者署名；
若要去除署名，需事先取得原作者授权。
