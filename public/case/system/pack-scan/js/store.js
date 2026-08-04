// 照片仓库 + 数据包导出 —— 零依赖。
//
// 照片为什么不用 localStorage：它只能存字符串、上限 5~10MB，400 张就爆。用 IndexedDB。
// 导出为什么不用 JSZip：照片本来就是 JPEG（已压缩），zip 里直接「存储」不再压一遍，
// 那 zip 格式就只剩「拼头部 + 算 CRC32」，四十来行，没必要为此拖进一个库。

const Store = (() => {
  const DB = 'packscan', VER = 1, PHOTOS = 'photos';
  const KEEP_DAYS = 7;                       // Lindsey 定：照片存一周

  let _db = null;
  function db() {
    if (_db) return Promise.resolve(_db);
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB, VER);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains(PHOTOS)) {
          const s = d.createObjectStore(PHOTOS, { keyPath: 'key' });
          s.createIndex('ts', 'ts');
        }
      };
      r.onsuccess = () => res(_db = r.result);
      r.onerror = () => rej(r.error);
    });
  }
  function tx(mode) { return db().then(d => d.transaction(PHOTOS, mode).objectStore(PHOTOS)); }
  const wrap = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

  // key = 运单号（一单一张）
  const putPhoto = (key, blob) => tx('readwrite').then(s => wrap(s.put({ key, blob, ts: Date.now() })));
  const getPhoto = key => tx('readonly').then(s => wrap(s.get(key))).then(r => r && r.blob);
  const allPhotos = () => tx('readonly').then(s => wrap(s.getAll()));
  const delPhoto = key => tx('readwrite').then(s => wrap(s.delete(key)));

  // 超过一周的自动清掉。每次开 App 跑一次，不然迟早把手机塞满。
  async function purgeOld() {
    const cut = Date.now() - KEEP_DAYS * 86400e3;
    const s = await tx('readwrite');
    const all = await wrap(s.getAll());
    let n = 0;
    for (const r of all) if (r.ts < cut) { s.delete(r.key); n++; }
    return n;
  }
  async function usage() {
    const all = await allPhotos();
    return { count: all.length, bytes: all.reduce((a, r) => a + (r.blob ? r.blob.size : 0), 0) };
  }

  // ── 从取景画面截一帧 → 压成 JPEG ────────────────────────
  // 不调系统相机：入门机上拉起相机 App 要两三秒，而摄像头本来就开着，截帧是瞬间的。
  function grabFrame(video, maxW, quality) {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return Promise.reject(new Error('画面还没准备好'));
    const w = Math.min(maxW || 1080, vw), h = Math.round(vh * w / vw);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(video, 0, 0, w, h);
    return new Promise(res => c.toBlob(res, 'image/jpeg', quality || 0.72));
  }

  // ── ZIP（只用 STORED，不压缩）────────────────────────────
  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; }
    return t;
  })();
  function crc32(u8) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function dosTime(d) {
    return { t: ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF,
             d: (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF };
  }
  // files: [{name, data:Uint8Array}] → Blob
  function makeZip(files, when) {
    const enc = new TextEncoder(), dt = dosTime(when || new Date());
    const chunks = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name), crc = crc32(f.data), n = f.data.length;
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); // UTF-8 文件名
      lh.setUint16(8, 0, true); lh.setUint16(10, dt.t, true); lh.setUint16(12, dt.d, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, n, true); lh.setUint32(22, n, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      chunks.push(new Uint8Array(lh.buffer), name, f.data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, dt.t, true); ch.setUint16(14, dt.d, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, n, true); ch.setUint32(24, n, true);
      ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + n;
    }
    const cs = central.reduce((a, u) => a + u.length, 0);
    const eo = new DataView(new ArrayBuffer(22));
    eo.setUint32(0, 0x06054b50, true);
    eo.setUint16(8, files.length, true); eo.setUint16(10, files.length, true);
    eo.setUint32(12, cs, true); eo.setUint32(16, offset, true);
    return new Blob([...chunks, ...central, new Uint8Array(eo.buffer)], { type: 'application/zip' });
  }

  const u8 = s => new TextEncoder().encode(s);
  const blobBytes = b => b.arrayBuffer().then(a => new Uint8Array(a));

  return { putPhoto, getPhoto, allPhotos, delPhoto, purgeOld, usage, grabFrame, makeZip, u8, blobBytes, KEEP_DAYS };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Store;
