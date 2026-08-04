// demo.js —— 官网 live demo 叠加层（?demo=1 时才加载）。
// 母版 app-source 一个字未改：这里以「叠加 / monkeypatch」方式，把需要摄像头 +
// 真实 Excel 的两处换成点击式，让网页访客在浏览器里从头点到尾走真实 UI。
// 依赖：index.html 内联脚本已定义的全局绑定（$ / buildBatch / save / render /
//       setState / say / t / onCode / startScan / takeShot / BATCH / byKey / CUR / curShot / ST）。
// 因同页多个 classic <script> 共享同一顶层词法环境，本文件可直接引用/改写它们。
(function () {
  'use strict';

  // ── 内嵌样本：模拟 TikTok「To Ship order」导出的二维数组 ──────────────
  // rows[0]=表头；rows[1]=字段说明行（代码从 r=2 起读，故意留一行被跳过）；rows[2+]=SKU 级行。
  // Created Time 用 DD/MM/YYYY HH:mm:ss，故意分布不同 SLA 桶（今天=2026-07-31）：
  //   工作日上午下单 → 当天 14:00（今天下的多为 today；更早日期为 overdue）。
  const HDR = ['Order ID', 'Tracking ID', 'Created Time', 'Product Name', 'Variation', 'Quantity', 'Seller SKU'];
  const NOTE = ['Order ID (do not edit)', 'Shipping Provider Tracking Number', 'Order creation time (GMT+8)',
                'Product Name', 'Variation', 'Quantity', 'Seller SKU'];
  // [orderId, tracking, created, name, variation, qty, sku]  —— 一单多行 = 多 SKU
  const RAW = [
    ['5820251001', '631029847100321', '31/07/2026 09:12:44', 'Garlic Bites | Crispy Baked | Ready Stock', 'Original 120g', '2', 'GB-ORI-120'],
    ['5820251002', '631029847100486', '31/07/2026 09:31:07', 'Sambal Ikan Bilis 200g | Homemade | Pedas', 'Extra Pedas', '1', 'SIB-XP-200'],
    ['5820251003', '631029847100731', '30/07/2026 15:48:20', 'Baju Kurung Cotton | Plus Size | Raya', 'Maroon / XL', '1', 'BK-MRN-XL'],
    ['5820251003', '631029847100731', '30/07/2026 15:48:20', 'Baju Kurung Cotton | Plus Size | Raya', 'Cream / L', '1', 'BK-CRM-L'],
    ['5820251004', '631029847101055', '31/07/2026 10:05:59', 'Kerepek Pisang | Rangup | Snek Viral', 'Cheese 150g', '3', 'KP-CHZ-150'],
    ['5820251005', '631029847101298', '29/07/2026 11:20:03', 'Tudung Bawal Cotton | Plain | Basic', 'Dusty Pink', '2', 'TB-DPK-01'],
    ['5820251005', '631029847101298', '29/07/2026 11:20:03', 'Tudung Bawal Cotton | Plain | Basic', 'Black', '2', 'TB-BLK-01'],
    ['5820251005', '631029847101298', '29/07/2026 11:20:03', 'Tudung Bawal Cotton | Plain | Basic', 'Navy', '1', 'TB-NVY-01'],
    ['5820251006', '631029847101533', '31/07/2026 08:44:31', 'Kopi Kampung 2in1 | Sedap | 20 sachet', '20 Sachet', '1', 'KK-2N1-20'],
    ['5820251007', '631029847101877', '30/07/2026 13:02:12', 'Serunding Daging | Homemade | 250g', 'Original 250g', '1', 'SD-ORI-250'],
    ['5820251008', '631029847102104', '31/07/2026 09:58:40', 'Skincare Serum Vitamin C | Glow | 30ml', '30ml', '2', 'SC-VITC-30'],
    ['5820251009', '631029847102390', '30/07/2026 16:37:55', 'Mainan Kanak Blok Bina | Educational | 100pcs', '100 pcs', '1', 'MB-EDU-100'],
    ['5820251010', '631029847102618', '29/07/2026 10:15:26', 'Dodol Durian | Premium | Kotak', 'Kotak 400g', '2', 'DD-DUR-400'],
    ['5820251010', '631029847102618', '29/07/2026 10:15:26', 'Dodol Durian | Premium | Kotak', 'Kotak 200g', '1', 'DD-DUR-200'],
  ];
  const SAMPLE_ROWS = [HDR, NOTE].concat(RAW);
  const BAD_CODE = '999888777666555';   // 不在任何单里，演示 BUKAN SENARAI

  // ── 一张 canvas 画的占位包裹图（替代摄像头截帧）→ JPEG blob ─────────
  function placeholderShot() {
    return new Promise(function (res) {
      var c = document.createElement('canvas');
      c.width = 640; c.height = 480;
      var g = c.getContext('2d');
      g.fillStyle = '#c9a06a'; g.fillRect(0, 0, 640, 480);           // 牛皮纸箱底色
      g.fillStyle = '#b58e57'; g.fillRect(0, 220, 640, 40);          // 封箱胶带阴影
      g.fillStyle = '#e8dcc4'; g.fillRect(0, 226, 640, 28);          // 封箱胶带
      g.strokeStyle = '#8a6a3d'; g.lineWidth = 6;
      g.strokeRect(40, 40, 560, 400);                                 // 箱体轮廓
      g.fillStyle = '#3a2c17';
      g.font = 'bold 30px -apple-system, system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText('DEMO PARCEL', 320, 150);
      g.font = '20px -apple-system, system-ui, sans-serif';
      g.fillText('gambar bungkusan (demo)', 320, 340);
      c.toBlob(function (b) { res(b); }, 'image/jpeg', 0.72);
    });
  }

  // ── 假扫描面板：注入取景区，替代摄像头 ────────────────────────────
  function labels() {
    var ms = (LANG === 'ms');
    return {
      title: ms ? 'Mod Demo — tiada kamera diperlukan' : '演示模式 — 无需摄像头',
      next: ms ? 'Imbas Seterusnya' : '扫描下一单',
      dup: ms ? 'Simulasi Imbas Ulang' : '模拟重复扫',
      bad: ms ? 'Simulasi Bukan Senarai' : '模拟不在单',
      allDone: ms ? 'Semua pesanan sudah dibungkus' : '所有订单已打包',
    };
  }

  function nextUnpacked() {
    if (!BATCH) return null;
    return BATCH.orders.find(function (o) { return !o.packedAt; }) || null;
  }
  function anyPacked() {
    if (!BATCH) return null;
    return BATCH.orders.find(function (o) { return o.packedAt; }) || null;
  }

  // 假取景面板挂在 .cam 里（覆盖 video/aim），只在 scan 态显示
  function ensurePanel() {
    var cam = $('cam');
    var box = document.getElementById('demoScan');
    if (!box) {
      box = document.createElement('div');
      box.id = 'demoScan';
      box.style.cssText = 'position:absolute;inset:0;display:none;flex-direction:column;'
        + 'align-items:center;justify-content:center;gap:14px;padding:18px;text-align:center;'
        + 'background:radial-gradient(circle at 50% 40%,#12161d,#05070a);z-index:2';
      box.innerHTML =
        '<div id="dsTitle" style="color:#8a919c;font-size:13px;letter-spacing:.02em"></div>'
        + '<button id="dsNext" class="btn pri" style="font-size:19px;padding:16px 26px;border-radius:14px"></button>'
        + '<div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:4px">'
        + '<button id="dsDup" class="btn" style="font-size:13px"></button>'
        + '<button id="dsBad" class="btn" style="font-size:13px"></button>'
        + '</div>';
      cam.appendChild(box);
      document.getElementById('dsNext').onclick = function () {
        var o = nextUnpacked();
        if (o) { onCode(o.key); }
        else { var L = labels(); say('ok', L.allDone, ''); }
      };
      document.getElementById('dsDup').onclick = function () {
        var o = anyPacked();
        if (o) { onCode(o.key); }                 // 已 packedAt → 触发 SUDAH DIIMBAS
        else { onCode((nextUnpacked() || {}).key || BAD_CODE); }  // 还没有已包的，先包一单再演示更自然，这里退化为扫下一单
      };
      document.getElementById('dsBad').onclick = function () { onCode(BAD_CODE); };
    }
    var L = labels();
    document.getElementById('dsTitle').textContent = L.title;
    document.getElementById('dsNext').textContent = L.next;
    document.getElementById('dsDup').textContent = L.dup;
    document.getElementById('dsBad').textContent = L.bad;
    return box;
  }
  function showPanel(on) {
    var box = ensurePanel();
    box.style.display = on ? 'flex' : 'none';
    // scan 态时把 next 按钮文案随剩余单数更新
    if (on) {
      var o = nextUnpacked(), L = labels();
      document.getElementById('dsNext').disabled = !o;
      document.getElementById('dsNext').style.opacity = o ? '1' : '.5';
      if (!o) document.getElementById('dsNext').textContent = L.allDone;
    }
  }

  // ── monkeypatch：startScan（不碰摄像头，改成显示假面板）──────────────
  startScan = function () {
    if (!BATCH) { setState('empty'); return; }
    scanning = true;            // onCode 里手动输入路径会读它
    if (ST !== 'scan') say('', t('scanHint'), '');
    setState('scan');
    showPanel(true);
  };

  // ── monkeypatch：takeShot（canvas 占位图替代截帧）────────────────────
  takeShot = function () {
    return placeholderShot().then(function (blob) {
      curShot = blob;
      var img = $('shot');
      img.src = URL.createObjectURL(blob);
      img.style.display = '';
      $('v').style.display = 'none';
      var ds = document.getElementById('demoScan'); if (ds) ds.style.display = 'none';
      try { navigator.vibrate && navigator.vibrate(40); } catch (e) {}
      setState('shot');
    });
  };

  // 进入 pick / shot / done 时收起假面板；回到 scan 由 startScan 重新显示
  var _enterPick = enterPick;
  enterPick = function (o) {
    showPanel(false);
    _enterPick(o);
  };

  // 切语言时把面板文案也刷新
  var _applyLang = applyLang;
  applyLang = function () {
    _applyLang();
    if (document.getElementById('demoScan')) {
      ensurePanel();
      if (ST === 'scan') showPanel(true);
    }
  };

  // ── 启动 demo：清掉母版 boot 留下的旧状态，直接载入样本 ────────────
  function boot() {
    try { localStorage.removeItem('pack-scan-state'); } catch (e) {}
    BATCH = null;
    buildBatch(SAMPLE_ROWS, 'demo-orders.xlsx');
    save();
    render();
    say('ok', t('loaded'), t('loadedSub', BATCH.orders.length));
    startScan();
  }

  // holidays 是异步 fetch 的；等它到位再 buildBatch，SLA tag 才算得出来。
  // 给个短暂轮询兜底（fetch 失败也照常跑，只是 tag 退成 later）。
  var waited = 0;
  (function waitHol() {
    if ((HOL && HOL.size) || waited >= 1500) { boot(); return; }
    waited += 100;
    setTimeout(waitHol, 100);
  })();
})();
