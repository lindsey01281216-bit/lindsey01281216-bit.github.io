// 极简 xlsx 读取器 —— 只认 TikTok Shop「待发货」导出这一种格式，零依赖。
//
// 为什么不用 SheetJS：那种通用库压缩后也要 ~1MB，装进只跑一个已知格式的 App 里不划算。
// xlsx 本质是个 zip 装着几个 XML，而浏览器自带 DecompressionStream('deflate-raw') 能解压，
// 所以整件事就剩「读 zip 目录 + 解压 + 抠 XML」，十几 KB 搞定。
//
// 代价说清楚：它只认这个导出格式。TikTok 改了表结构就要来改这里——
// 但我们本来就得盯着表结构（第 2 行说明行、SKU 级多行这些坑都在它身上）。
//
// 依赖：DecompressionStream（Chrome 80+ / Android WebView 80+）。Node 18+ 也有，所以能在电脑上测。

const XLSX = (() => {

  // ── ZIP：只读中央目录，够用 ───────────────────────────────
  function u16(d, p) { return d[p] | (d[p + 1] << 8); }
  function u32(d, p) { return (d[p] | (d[p + 1] << 8) | (d[p + 2] << 16) | (d[p + 3] << 24)) >>> 0; }

  function zipEntries(buf) {
    const d = new Uint8Array(buf);
    // 从尾部找 End Of Central Directory（0x06054b50）。注释最长 64KB，倒着扫。
    let eocd = -1;
    for (let i = d.length - 22; i >= Math.max(0, d.length - 65558); i--) {
      if (u32(d, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('不是有效的 xlsx（找不到 zip 目录）');
    const count = u16(d, eocd + 10);
    let p = u32(d, eocd + 16);
    const out = new Map();
    for (let i = 0; i < count; i++) {
      if (u32(d, p) !== 0x02014b50) break;
      const method = u16(d, p + 10);
      const csize = u32(d, p + 20);
      const nlen = u16(d, p + 28), elen = u16(d, p + 30), clen = u16(d, p + 32);
      const lho = u32(d, p + 42);
      const name = new TextDecoder().decode(d.subarray(p + 46, p + 46 + nlen));
      out.set(name, { method, csize, lho });
      p += 46 + nlen + elen + clen;
    }
    return { d, entries: out };
  }

  async function readEntry(z, name) {
    const e = z.entries.get(name);
    if (!e) return null;
    const d = z.d;
    // 局部头的 name/extra 长度跟中央目录可能不同，必须按局部头算数据起点
    const nlen = u16(d, e.lho + 26), elen = u16(d, e.lho + 28);
    const start = e.lho + 30 + nlen + elen;
    const raw = d.subarray(start, start + e.csize);
    if (e.method === 0) return new TextDecoder().decode(raw);          // STORED
    if (e.method !== 8) throw new Error('不支持的压缩方式: ' + e.method);
    const ds = new DecompressionStream('deflate-raw');
    const ab = await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer();
    return new TextDecoder().decode(ab);
  }

  // ── XML：不建 DOM，直接扫标签。表可能几万行，DOM 在入门机上会卡 ──
  const unesc = s => s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (m, g) =>
    g === 'lt' ? '<' : g === 'gt' ? '>' : g === 'amp' ? '&' : g === 'quot' ? '"' : g === 'apos' ? "'"
      : String.fromCharCode(g[1] === 'x' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10)));

  // sharedStrings：<si> 里可能是一个 <t>，也可能被拆成多个 <r><t>，要拼起来
  function parseShared(xml) {
    const out = [];
    if (!xml) return out;
    const re = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
    let m;
    while ((m = re.exec(xml))) {
      let s = '';
      const tre = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
      let t;
      while ((t = tre.exec(m[1]))) s += t[1];
      out.push(unesc(s));
    }
    return out;
  }

  const colIdx = ref => {                       // "AB12" → 27
    let n = 0;
    for (let i = 0; i < ref.length; i++) {
      const c = ref.charCodeAt(i);
      if (c < 65 || c > 90) break;
      n = n * 26 + (c - 64);
    }
    return n - 1;
  };

  // ⚠️ TikTok 导出的 xlsx 是畸形的：**每个单元格各自包一个 <row>**，
  //    56 列就写 56 个 <row r="1">，只有 r 属性能认出它们是同一行。
  //    （68 行 × 56 列 = 3808 个 <row> 元素，按元素数会得到 3808 行。）
  //    Excel / openpyxl 都按 r 归并所以看不出来，自己写解析器就必须处理。
  function parseSheet(xml, shared) {
    const byR = new Map();          // r 号 → 该行的单元格数组
    let seq = 0;
    const rre = /<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g;
    let r;
    while ((r = rre.exec(xml))) {
      const attr = r[1] || r[3] || '';
      const body = r[2] || '';
      const rn = +((attr.match(/\br="(\d+)"/) || [])[1] || ++seq);
      let cells = byR.get(rn);
      if (!cells) byR.set(rn, cells = []);
      const cre = /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
      let c;
      while ((c = cre.exec(body))) {
        const attr = c[1], inner = c[2] || '';
        const ref = (attr.match(/r="([A-Z]+\d+)"/) || [])[1];
        const type = (attr.match(/t="([^"]+)"/) || [])[1];
        let v = '';
        if (type === 'inlineStr') {
          const t = inner.match(/<t\b[^>]*>([\s\S]*?)<\/t>/);
          v = t ? unesc(t[1]) : '';
        } else {
          const vv = inner.match(/<v>([\s\S]*?)<\/v>/);
          v = vv ? vv[1] : '';
          if (type === 's') v = shared[+v] || '';
          else v = unesc(v);
        }
        const i = ref ? colIdx(ref) : cells.length;
        cells[i] = v;
      }
    }
    // 按 r 号排好，转成密集数组（空行补空数组，保持行号对应）
    const max = byR.size ? Math.max(...byR.keys()) : 0;
    const rows = [];
    for (let i = 1; i <= max; i++) rows.push(byR.get(i) || []);
    return rows;
  }

  // ── 对外：xlsx → 二维数组 ────────────────────────────────
  // 返回 { sheetName, rows }。rows[0]=表头行，原样返回，不做任何业务处理。
  async function read(arrayBuffer, wantSheet) {
    const z = zipEntries(arrayBuffer);
    const shared = parseShared(await readEntry(z, 'xl/sharedStrings.xml'));

    // 找目标 sheet：优先按名字，找不到就用第一个
    let target = null, sheetName = '';
    const wb = await readEntry(z, 'xl/workbook.xml');
    const rels = await readEntry(z, 'xl/_rels/workbook.xml.rels');
    if (wb && rels) {
      const map = {};
      const rre = /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g;
      let m;
      while ((m = rre.exec(rels))) map[m[1]] = m[2].replace(/^\/?xl\//, '').replace(/^\//, '');
      const sre = /<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g;
      const found = [];
      while ((m = sre.exec(wb))) found.push({ name: unesc(m[1]), path: 'xl/' + (map[m[2]] || '') });
      const hit = (wantSheet && found.find(f => f.name === wantSheet)) || found[0];
      if (hit) { target = hit.path; sheetName = hit.name; }
    }
    if (!target || !z.entries.has(target)) { target = 'xl/worksheets/sheet1.xml'; sheetName = sheetName || 'sheet1'; }

    const xml = await readEntry(z, target);
    if (!xml) throw new Error('读不到工作表：' + target);
    return { sheetName, rows: parseSheet(xml, shared) };
  }

  return { read };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = XLSX;
