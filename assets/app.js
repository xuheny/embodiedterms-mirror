/* =========================================================
 * EmbodiedTerms 交互式镜像版
 * 交互：分类卡片网格 + 学习路径 + 词条详情抽屉 + Ctrl+K 命令面板
 * ========================================================= */
(function () {
  'use strict';

  /* ---------- 状态 ---------- */
  const STORE = { zh: null, en: null };
  let lang = localStorage.getItem('et-lang') || 'zh';
  let tier = parseInt(localStorage.getItem('et-tier') || '1', 10);
  let data = null;
  let lastView = { type: 'home' };      // 抽屉底层视图
  let currentList = [];                  // 抽屉上下文中的词条顺序（用于上/下一个）
  let currentTerm = null;
  const seen = {
    zh: new Set(JSON.parse(localStorage.getItem('et-seen-zh') || '[]')),
    en: new Set(JSON.parse(localStorage.getItem('et-seen-en') || '[]'))
  };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  /* 轻量正文渲染：转义 → 反引号 → 裸链接 → 换行 */
  function renderText(s) {
    if (!s) return '';
    let h = esc(s);
    h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
    h = h.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    h = h.replace(/\n/g, '<br>');
    return h;
  }

  /* ---------- 主题 ---------- */
  function initTheme() {
    const saved = localStorage.getItem('et-theme');
    const dark = saved ? saved === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    $('themeBtn').addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('et-theme', next);
    });
  }

  /* ---------- 数据加载 ----------
   * 优先读取 <script src="data/xx.js"> 注入的全局数据（file:// 双击打开可用）；
   * 缺失时回退到 fetch JSON（http 环境）。
   */
  async function loadData() {
    const injected = window.ET_DATA || {};
    async function get(l) {
      if (injected[l]) return injected[l];
      const resp = await fetch('data/' + l + '.json');
      return resp.json();
    }
    STORE.zh = await get('zh');
    STORE.en = await get('en');
    data = STORE[lang];
    // 索引
    STORE.zh.idx = indexTerms(STORE.zh);
    STORE.en.idx = indexTerms(STORE.en);
  }
  function indexTerms(d) {
    const byId = new Map();
    const byCat = {};
    d.terms.forEach((t) => {
      byId.set(t.id, t);
      (byCat[t.category] = byCat[t.category] || []).push(t);
    });
    return { byId, byCat };
  }

  /* ---------- 词条辅助 ---------- */
  function catOf(t) { return data.cats.find((c) => c.key === t.category); }
  function sectionOf(t) {
    const c = catOf(t);
    return c && c.sections[t.sec];
  }
  function termNames(t) {
    const names = [t.name];
    if (t.alt) names.push(t.alt);
    (t.aliases || []).forEach((a) => names.push(a));
    if (t.abbr) names.push(t.abbr);
    return names;
  }

  /* ---------- 路由 ---------- */
  function parseHash() {
    const h = location.hash.slice(1) || '/';
    let m = h.match(/^\/t\/([^/]+)/);
    if (m) return { type: 'term', id: m[1] };
    m = h.match(/^\/c\/([^/]+)/);
    if (m) return { type: 'cat', key: m[1] };
    if (h === '/about') return { type: 'about' };
    return { type: 'home' };
  }
  let prevViewType = null;
  function navigate() {
    const route = parseHash();
    if (route.type === 'term') {
      const t = data.idx.byId.get(route.id);
      if (t) {
        renderView(lastView);
        if (!currentList.length) setCurrentListContext(t);
        openDrawer(t, true);
      } else {
        location.hash = '#/';
      }
    } else {
      const viewChanged = prevViewType !== route.type ||
        (route.type === 'cat' && lastView.key !== route.key);
      lastView = route;
      closeDrawer(true);
      renderView(route);
      if (viewChanged) window.scrollTo(0, 0);
    }
    prevViewType = route.type === 'term' ? prevViewType : route.type;
  }
  function go(hash) { location.hash = hash; }

  /* ---------- 视图渲染 ---------- */
  function renderView(route) {
    const app = $('app');
    if (route.type === 'home') app.innerHTML = renderHome();
    else if (route.type === 'cat') app.innerHTML = renderCategory(route.key);
    else if (route.type === 'about') app.innerHTML = renderAbout();
    bindViewEvents();
  }

  function renderHome() {
    const total = data.terms.length;
    const t1 = data.terms.filter((t) => t.tier === 1).length;
    const seenCount = seen[lang].size;
    const L = lang === 'zh'
      ? { h1: '具身智能新手名词表', sub: '条', cat: '类', asof: '事实截至',
          lede: '给刚入门具身智能的同学查词用。14 类按学习顺序排：先认识机器人本体（形态、零件、怎么动、怎么控制、怎么感知），再看工具和仿真，然后是数据、训练和模型，最后是公司和行业说法；每类内部也分成由浅入深的小节。',
          browse: '按类别浏览', seen: '已学', pick: '点开任意分类，按学习路径由浅入深',
          ph: '搜中文、英文或缩写，如 VLA / 逆运动学 / 宇树' }
      : { h1: 'Embodied AI Glossary', sub: 'terms', cat: 'cats', asof: 'facts as of',
          lede: 'A beginner\'s glossary of embodied AI. The 14 categories follow a learning order: start with the robot body (form, parts, motion, control, perception), then tools and simulation, then data, training and models, and finally companies and industry language. Each category is split into progressive sections.',
          browse: 'Browse by category', seen: 'learned', pick: 'Pick a category and follow the learning path',
          ph: 'Search Chinese, English or abbreviation, e.g. VLA / IK / Unitree' };

    const cards = data.cats.map((c, i) => {
      const n = data.terms.filter((t) => t.category === c.key).length;
      return `<a class="cat-card" href="#/c/${c.key}">
        <span class="n">${n} ${L.sub}</span>
        <h3>${i + 1}. ${esc(c.name)}</h3>
        <p>${esc(c.blurb)}</p>
        <span class="go">→ ${lang === 'zh' ? '进入学习路径' : 'Open learning path'}</span>
      </a>`;
    }).join('');

    return `
    <section class="hero">
      <h1>${esc(L.h1)}</h1>
      <div class="stats">
        <span><b>${total}</b>${L.sub}</span>
        <span><b>${data.cats.length}</b>${L.cat}</span>
        <span><b>${data.today}</b></span>
        <span><b>${seenCount}</b>${L.seen}</span>
      </div>
      <p class="lede">${esc(L.lede)}</p>
      <button class="hero-search" id="heroSearch">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="7" cy="7" r="5.2"/><path d="M11 11l3.6 3.6" stroke-linecap="round"/></svg>
        <span>${esc(L.ph)}</span>
        <kbd>/</kbd>
      </button>
    </section>
    <div class="section-head">
      <h2>${esc(L.browse)}</h2>
      <span class="hint">${esc(L.pick)}</span>
    </div>
    <div class="cat-grid">${cards}</div>`;
  }

  function renderCategory(key) {
    const c = data.cats.find((x) => x.key === key);
    if (!c) return renderHome();
    const idx = data.cats.indexOf(c);
    const terms = data.terms.filter((t) => t.category === key);
    const L = lang === 'zh'
      ? { home: '首页', terms: '个词条', secs: '个小节', shown: '当前显示', hidden: '已被分级过滤，顶部切换「全部」可查看' }
      : { home: 'Home', terms: 'terms', secs: 'sections', shown: 'Showing', hidden: 'hidden by tier filter — switch to "All" on top' };

    const blocks = c.sections.map((sec, si) => {
      const list = terms.filter((t) => t.sec === si && t.tier <= tier);
      const pills = list.length
        ? list.map((t) => pillHTML(t)).join('')
        : `<span class="empty-note">${lang === 'zh' ? '（本小节无当前分级词条）' : '(no terms at this tier)'}</span>`;
      return `<div class="path-block" id="sec-${si}">
        <h2>${esc(sec.title)}</h2>
        <p class="blurb">${esc(sec.blurb)}</p>
        <div class="term-pills">${pills}</div>
      </div>`;
    }).join('');

    const visible = terms.filter((t) => t.tier <= tier).length;

    return `
    <nav class="crumb"><a href="#/">${esc(L.home)}</a> <span>›</span> <span>${idx + 1}. ${esc(c.name)}</span></nav>
    <header class="cat-header">
      <h1>${idx + 1}. ${esc(c.name)}</h1>
      <p>${esc(c.blurb)}</p>
      <div class="cat-meta">${L.shown} <b>${visible}</b> / ${terms.length} ${L.terms} · ${c.sections.length} ${L.secs}${visible < terms.length ? ' · ' + (terms.length - visible) + ' ' + L.hidden : ''}</div>
    </header>
    <div class="path">${blocks}</div>`;
  }

  function pillHTML(t) {
    const isSeen = seen[lang].has(t.id);
    const t1 = t.tier === 1 ? ' t1' : '';
    const star = t.tier === 1 ? '<span class="star">★</span>' : '';
    return `<button class="pill${t1}${isSeen ? ' seen' : ''}" data-id="${esc(t.id)}">
      ${star}<span>${esc(t.name)}</span>${t.alt ? `<span class="en">${esc(t.alt)}</span>` : ''}
    </button>`;
  }

  function renderAbout() {
    const zh = lang === 'zh';
    const rows = data.cats.map((c, i) => `<li>${i + 1} ${esc(c.name)} · ${data.terms.filter((t) => t.category === c.key).length}</li>`).join('');
    return `
    <div class="page">
      <nav class="crumb"><a href="#/">${zh ? '首页' : 'Home'}</a><span>›</span><span>${zh ? '关于' : 'About'}</span></nav>
      <h1>${zh ? '关于这份名词表' : 'About this glossary'}</h1>
      <p>${zh
        ? `给刚入门具身智能的同学查词用：${data.terms.length} 个专有名词，分 ${data.cats.length} 类，按学习顺序排。每条有一句话解释、展开说明、例子、相关词和来源链接。中英双语，英文版按英文读者的习惯改写，不是逐句直译。`
        : `A beginner\'s reference with ${data.terms.length} terms in ${data.cats.length} categories ordered as a learning path. Each term has a one-liner, explanation, example, related terms and sources. Bilingual: the English edition is rewritten for English readers, not translated sentence by sentence.`}</p>

      <h2>${zh ? '这个版本怎么用' : 'How to use this edition'}</h2>
      <ul>
        <li>${zh ? '首页是 14 张分类卡片，点进任一分类即进入「学习路径」，按小节由浅入深。' : 'The home page shows 14 category cards; click one to enter a section-by-section learning path.'}</li>
        <li>${zh ? '点任意词条，从右侧滑出详情抽屉；抽屉底部可上一个 / 下一个切换。' : 'Click any term to slide open a detail drawer, with prev/next navigation at the bottom.'}</li>
        <li>${zh ? '按 Ctrl/⌘ + K（或 /）唤起全局搜索命令面板，支持中文、英文、缩写与别名，搜索不受分级限制。' : 'Press Ctrl/⌘+K (or /) to open the global command palette; it searches Chinese, English, abbreviations and aliases, ignoring tier filters.'}</li>
        <li>${zh ? '顶部可切换「入门必知 / 入门+常用 / 全部」三个分级；可标记「已学」，进度保存在本地。' : 'Switch tiers (Essential / Common / All) on top; mark terms as learned — progress is stored locally.'}</li>
      </ul>

      <h2>${zh ? '内容来源与更新' : 'Content & updates'}</h2>
      <p>${zh
        ? '本站为镜像学习版，数据通过随附的 <code>sync.py</code> 脚本从原站自动同步：脚本会解析原站首页指向的最新数据文件并下载，原站更新后重新运行（或设置定时任务）即可让本站同步更新。'
        : 'This is a mirror edition. The bundled <code>sync.py</code> script resolves and downloads the latest data files from the source site; re-run it (or schedule it) to stay in sync.'}</p>
      <p>${zh ? '当前数据日期：' : 'Current data date: '}<b>${data.today}</b></p>

      <h2>${zh ? '14 个类别' : 'The 14 categories'}</h2>
      <ul>${rows}</ul>

      <h2>${zh ? '许可' : 'License'}</h2>
      <p>${zh
        ? '内容采用 <a href="https://creativecommons.org/licenses/by-nc/4.0/deed.zh-hans" target="_blank" rel="noopener">CC BY-NC 4.0</a> 许可，源自 <a href="https://embodiedterms.com/" target="_blank" rel="noopener">embodiedterms.com</a>。'
        : 'Content is licensed under <a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noopener">CC BY-NC 4.0</a>, sourced from <a href="https://embodiedterms.com/" target="_blank" rel="noopener">embodiedterms.com</a>.'}</p>
    </div>`;
  }

  function bindViewEvents() {
    document.querySelectorAll('.pill[data-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const t = data.idx.byId.get(el.getAttribute('data-id'));
        if (t) { setCurrentListContext(t); go('#/t/' + t.id); }
      });
    });
    const hs = $('heroSearch');
    if (hs) hs.addEventListener('click', openPalette);
  }

  /* 抽屉上下文：分类页内按同分类顺序；首页则全量 */
  function setCurrentListContext(t) {
    if (lastView.type === 'cat') {
      currentList = data.terms.filter((x) => x.category === t.category && x.tier <= tier);
    } else {
      currentList = data.terms.filter((x) => x.tier <= tier);
    }
  }

  /* ---------- 抽屉 ---------- */
  function openDrawer(t, fromRoute) {
    currentTerm = t;
    if (!fromRoute) setCurrentListContext(t);
    const sec = sectionOf(t);
    const c = catOf(t);
    const zh = lang === 'zh';
    const tierLabel = t.tier === 1 ? (zh ? '入门必知' : 'Essential')
      : t.tier === 2 ? (zh ? '常用' : 'Common') : (zh ? '进阶' : 'Advanced');

    $('drawerHead').innerHTML = `
      <button class="iconbtn close" id="drawerClose" title="${zh ? '关闭' : 'Close'}">✕</button>
      <h2>${esc(t.name)}</h2>
      ${t.alt ? `<div class="en-name">${esc(t.alt)}</div>` : ''}
      <div class="badges">
        <span class="badge t${t.tier}">${tierLabel}</span>
        ${c ? `<span class="badge">${esc(c.name)}</span>` : ''}
        ${sec ? `<span class="badge">${esc(sec.title)}</span>` : ''}
        ${t.abbr ? `<span class="badge">${esc(t.abbr)}</span>` : ''}
      </div>`;

    const aliases = (t.aliases && t.aliases.length)
      ? `<div class="dv-block"><h4>${zh ? '别名' : 'Aliases'}</h4><p>${t.aliases.map(esc).join(' · ')}</p></div>` : '';
    const example = t.example
      ? `<div class="dv-block"><h4>${zh ? '例子' : 'Example'}</h4><p>${renderText(t.example)}</p></div>` : '';
    const related = renderRelated(t);
    const sources = (t.sources && t.sources.length)
      ? `<div class="dv-block"><h4>${zh ? '来源' : 'Sources'}</h4>
        <ul class="src-list">${t.sources.map((s, i) =>
          `<li><span class="src-num">[${i + 1}]</span><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || s.url)}</a></li>`).join('')}</ul></div>` : '';

    $('drawerBody').innerHTML = `
      <div class="dv-block"><h4>${zh ? '一句话' : 'One-liner'}</h4><p class="one">${renderText(t.one_liner)}</p></div>
      <div class="dv-block"><h4>${zh ? '展开说明' : 'Explanation'}</h4><p>${renderText(t.explanation)}</p>
      ${t.as_of ? `<div class="asof">${zh ? '信息截至' : 'as of'} ${esc(t.as_of)}</div>` : ''}</div>
      ${aliases}${example}${related}${sources}`;

    const isSeen = seen[lang].has(t.id);
    const st = $('seenToggle');
    st.classList.toggle('on', isSeen);
    st.textContent = isSeen ? (zh ? '✓ 已学' : '✓ Learned') : (zh ? '标记为已学' : 'Mark as learned');

    $('drawer').classList.add('on');
    $('scrim').classList.add('on');
    $('drawer').setAttribute('aria-hidden', 'false');
    $('drawerClose').addEventListener('click', () => go(viewHash()));
  }

  function renderRelated(t) {
    const zh = lang === 'zh';
    const ids = t.related_ids || [];
    const items = ids.map((id) => data.idx.byId.get(id)).filter(Boolean);
    if (!items.length) {
      // 退而用 related 字符串
      if (t.related && t.related.length)
        return `<div class="dv-block"><h4>${zh ? '相关词' : 'Related'}</h4><p>${t.related.map(esc).join(' · ')}</p></div>`;
      return '';
    }
    return `<div class="dv-block"><h4>${zh ? '相关词' : 'Related'}</h4>
      <div class="rel-list">${items.map((r) =>
        `<button class="pill" data-rel="${esc(r.id)}"><span>${esc(r.name)}</span>${r.alt ? `<span class="en">${esc(r.alt)}</span>` : ''}</button>`).join('')}</div></div>`;
  }

  function closeDrawer(silent) {
    $('drawer').classList.remove('on');
    $('scrim').classList.remove('on');
    $('drawer').setAttribute('aria-hidden', 'true');
    currentTerm = null;
  }
  function viewHash() {
    if (lastView.type === 'cat') return '#/c/' + lastView.key;
    if (lastView.type === 'about') return '#/about';
    return '#/';
  }
  function stepDrawer(delta) {
    if (!currentTerm || !currentList.length) return;
    let i = currentList.findIndex((x) => x.id === currentTerm.id);
    if (i < 0) i = 0;
    i = (i + delta + currentList.length) % currentList.length;
    const t = currentList[i];
    go('#/t/' + t.id);
  }

  /* ---------- 搜索 / 命令面板 ---------- */
  let palItems = [];
  let palIndex = 0;

  function openPalette() {
    $('palette').classList.add('on');
    $('paletteInput').value = '';
    runPaletteSearch('');
    setTimeout(() => $('paletteInput').focus(), 20);
  }
  function closePalette() {
    $('palette').classList.remove('on');
  }

  function scoreTerm(t, q, ql) {
    const names = termNames(t);
    let best = 0;
    for (const raw of names) {
      const n = raw.toLowerCase();
      if (n === ql) best = Math.max(best, 100);
      else if (n.startsWith(ql)) best = Math.max(best, 80 + (10 - Math.min(n.length - ql.length, 10)));
      else if (n.includes(ql)) best = Math.max(best, 60 - n.indexOf(ql) * 0.5);
      // 英文按词边界
      if (/[a-z]/.test(ql)) {
        const words = n.split(/[\s/,-]+/);
        for (const w of words) {
          if (w === ql) best = Math.max(best, 90);
          else if (w.startsWith(ql) && ql.length >= 2) best = Math.max(best, 70);
        }
      }
    }
    if ((t.one_liner || '').toLowerCase().includes(ql) && ql.length >= 3) best = Math.max(best, 30);
    return best;
  }

  function runPaletteSearch(q) {
    const ql = q.trim().toLowerCase();
    let results;
    if (!ql) {
      results = data.terms.filter((t) => t.tier === 1);
    } else {
      results = [];
      for (const t of data.terms) {
        const s = scoreTerm(t, q, ql);
        if (s > 0) results.push({ t, s });
      }
      results.sort((a, b) => b.s - a.s || a.t.tier - b.t.tier);
      results = results.map((x) => x.t);
    }
    // 无结果时：简单纠错（取所有名字里 edit 距离最近的）
    if (!results.length && ql.length >= 2) {
      results = fuzzyFallback(ql);
    }
    palItems = results.slice(0, 40);
    palIndex = 0;
    renderPaletteResults(q);
  }

  function fuzzyFallback(ql) {
    const cand = [];
    for (const t of data.terms) {
      for (const raw of termNames(t)) {
        const n = raw.toLowerCase();
        if (Math.abs(n.length - ql.length) > 2) continue;
        const d = levenshtein(n.slice(0, Math.max(n.length, ql.length)), ql);
        if (d <= 2) { cand.push({ t, d }); break; }
      }
    }
    cand.sort((a, b) => a.d - b.d || a.t.tier - b.t.tier);
    return cand.slice(0, 20).map((x) => x.t);
  }
  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = [], cur = [];
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      const tmp = prev; prev = cur; cur = tmp;
    }
    return prev[n];
  }

  function highlight(name, q) {
    const ql = q.trim();
    if (!ql) return esc(name);
    const safe = esc(name);
    const qesc = esc(ql).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      return safe.replace(new RegExp('(' + qesc + ')', 'gi'), '<mark>$1</mark>');
    } catch (e) { return safe; }
  }

  function renderPaletteResults(q) {
    const box = $('paletteResults');
    if (!palItems.length) {
      box.innerHTML = `<div class="palette-empty">${lang === 'zh' ? '没有匹配的词条，试试别的词' : 'No matching terms'}</div>`;
      return;
    }
    box.innerHTML = palItems.map((t, i) => {
      const c = catOf(t);
      return `<button class="presult${i === palIndex ? ' on' : ''}" data-i="${i}">
        <span class="tier-dot t${t.tier}"></span>
        <span class="cn">${highlight(t.name, q)}</span>
        ${t.alt ? `<span class="en">${highlight(t.alt, q)}</span>` : ''}
        <span class="cat-tag">${esc(c ? c.name : '')}</span>
      </button>`;
    }).join('');
    box.querySelectorAll('.presult').forEach((el) => {
      el.addEventListener('click', () => {
        const i = parseInt(el.getAttribute('data-i'), 10);
        pickPalette(i);
      });
    });
  }

  function pickPalette(i) {
    const t = palItems[i];
    if (!t) return;
    closePalette();
    setCurrentListContext(t);
    go('#/t/' + t.id);
  }

  /* ---------- 随机 ---------- */
  function randomTerm() {
    const pool = data.terms.filter((t) => t.tier <= tier);
    const t = pool[Math.floor(Math.random() * pool.length)];
    setCurrentListContext(t);
    go('#/t/' + t.id);
  }

  /* ---------- 语言切换 ---------- */
  function switchLanguage() {
    lang = lang === 'zh' ? 'en' : 'zh';
    localStorage.setItem('et-lang', lang);
    data = STORE[lang];
    $('langLabel').textContent = lang === 'zh' ? 'EN' : '中';
    document.documentElement.setAttribute('lang', lang === 'zh' ? 'zh-CN' : 'en');
    navigate();
  }

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('on'), 2200);
  }

  /* ---------- 事件绑定 ---------- */
  function bindGlobalEvents() {
    // 分级
    $('tierSeg').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-tier]');
      if (!btn) return;
      tier = parseInt(btn.getAttribute('data-tier'), 10);
      localStorage.setItem('et-tier', String(tier));
      document.querySelectorAll('#tierSeg button').forEach((b) =>
        b.classList.toggle('on', b === btn));
      navigate();
    });
    $('randomBtn').addEventListener('click', randomTerm);
    $('langBtn').addEventListener('click', switchLanguage);
    $('scrim').addEventListener('click', () => {
      if ($('drawer').classList.contains('on')) go(viewHash());
      else closePalette();
    });
    $('drawerPrev').addEventListener('click', () => stepDrawer(-1));
    $('drawerNext').addEventListener('click', () => stepDrawer(1));
    $('seenToggle').addEventListener('click', () => {
      if (!currentTerm) return;
      const set = seen[lang];
      if (set.has(currentTerm.id)) {
        set.delete(currentTerm.id);
        toast(lang === 'zh' ? '已取消已学标记' : 'Unmarked');
      } else {
        set.add(currentTerm.id);
        toast(lang === 'zh' ? '已标记为已学 ✓' : 'Marked as learned ✓');
      }
      localStorage.setItem('et-seen-' + lang, JSON.stringify([...set]));
      openDrawer(currentTerm, true);
      renderView(lastView);
    });

    // 命令面板
    $('searchTrigger').addEventListener('click', openPalette);
    $('palette').querySelector('.scrim').addEventListener('click', closePalette);
    $('paletteInput').addEventListener('input', (e) => runPaletteSearch(e.target.value));
    $('palette').addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); movePalette(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); movePalette(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); pickPalette(palIndex); }
      else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
    });

    // 全局快捷键
    document.addEventListener('keydown', (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        $('palette').classList.contains('on') ? closePalette() : openPalette();
      } else if (!typing && e.key === '/' && !$('palette').classList.contains('on')) {
        e.preventDefault();
        openPalette();
      } else if (e.key === 'Escape' && $('drawer').classList.contains('on')) {
        go(viewHash());
      }
    });

    window.addEventListener('hashchange', navigate);
  }

  function movePalette(delta) {
    if (!palItems.length) return;
    palIndex = (palIndex + delta + palItems.length) % palItems.length;
    document.querySelectorAll('.presult').forEach((el, i) =>
      el.classList.toggle('on', i === palIndex));
    const on = document.querySelector('.presult.on');
    if (on) on.scrollIntoView({ block: 'nearest' });
  }

  /* ---------- 启动 ---------- */
  async function boot() {
    initTheme();
    try {
      await loadData();
    } catch (e) {
      $('app').innerHTML = `<div class="page"><p>数据加载失败，请确认 data/ 目录完整（可运行 sync.py 同步）。</p></div>`;
      return;
    }
    $('langLabel').textContent = lang === 'zh' ? 'EN' : '中';
    document.documentElement.setAttribute('lang', lang === 'zh' ? 'zh-CN' : 'en');
    // 同步分级按钮状态
    document.querySelectorAll('#tierSeg button').forEach((b) =>
      b.classList.toggle('on', parseInt(b.getAttribute('data-tier'), 10) === tier));
    bindGlobalEvents();
    navigate();
    // 页脚同步状态
    $('syncState').textContent =
      (lang === 'zh' ? '当前数据版本：' : 'Data version: ') + STORE.zh.today +
      ' / ' + STORE.en.today;
  }

  boot();
})();
