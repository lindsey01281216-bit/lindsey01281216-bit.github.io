// 界面语言：工人看马来文（预设），中文留给 Lindsey / 老板对账和演示。
// 一份词典两边同 key；缺词条直接显示 key，不静默留白。
const I18N = {
  ms: {
    title: 'Imbas Bungkusan',
    list: 'Senarai', missing: 'Tertinggal', export: 'Eksport', close: 'Tutup',
    cDone: 'Siap', cLeft: 'Belum', cDup: 'Ulang', cBad: 'Bukan senarai',

    // 载入
    initBig: 'Muatkan senarai dahulu', initSub: 'Pilih fail Excel yang dihantar bos',
    loadBtn: 'Buka Fail Excel',
    parsing: 'Membaca fail…',
    loaded: 'Senarai dimuatkan', loadedSub: n => n + ' pesanan menunggu',
    parseFail: 'Fail tidak dapat dibaca',
    parseFailSub: 'Pastikan ia fail Excel dari TikTok (To Ship order-….xlsx)',

    // 扫描
    scanHint: 'Halakan kamera ke barcode pada label',
    scanFail: n => 'Tidak dapat baca (' + n + '/3) — cuba lagi',
    scanFailFinal: 'Gagal 3 kali — sila taip nombor',
    typeManual: 'Taip Manual',
    manualTitle: 'Taip nombor penjejakan',
    manualHint: 'Nombor 15 digit di bawah barcode',
    ok: 'OK', cancel: 'Batal',
    dupBig: 'SUDAH DIIMBAS', badBig: 'BUKAN SENARAI HARI INI',

    // 取货核对
    packThis: 'BUNGKUS INI', unit: 'unit',
    orderNo: 'No. pesanan',
    takePhoto: 'Ambil Gambar', retake: 'Ambil Semula', confirmDone: 'Sah & Seterusnya',
    photoNeeded: 'Wajib ambil gambar sebelum tutup kotak',
    doneBig: 'SIAP', doneSub: n => 'Tinggal ' + n + ' pesanan',

    // 清单 / 导出
    paneList: 'Senarai Hari Ini', paneMiss: 'Senarai Tertinggal',
    allDone: 'Semua sudah diimbas. Tiada yang tertinggal.',
    notLoaded: 'Senarai belum dimuat.',
    scannedAt: t => 'Siap ' + t, notScanned: 'Belum dibungkus',
    dueTag: 'tamat',
    restored: 'Kemajuan sebelumnya dipulihkan',
    exporting: 'Menyediakan pakej…',
    exported: 'Pakej disimpan ke Muat Turun',
    exportedSub: 'Hantar fail ini kepada bos melalui WhatsApp / email',
    exportEmpty: 'Belum ada apa-apa untuk dieksport',
    csv: ['Order ID', 'Tracking ID', 'Tarikh Akhir Hantar', 'Status', 'Masa Siap Bungkus', 'Gambar', 'SKU'],
    csvSent: 'Siap dibungkus', csvNot: 'Belum diimbas', csvExtra: 'Bukan senarai',
    purged: n => n + ' gambar lama dipadam (simpan 7 hari)',
  },
  zh: {
    title: '包装扫描',
    list: '清单', missing: '漏发', export: '导出', close: '关闭',
    cDone: '已包', cLeft: '待包', cDup: '重复', cBad: '不在单',

    initBig: '先载入清单', initSub: '选老板发来的 Excel 文件',
    loadBtn: '打开 Excel 文件',
    parsing: '正在读取…',
    loaded: '清单已载入', loadedSub: n => n + ' 单待包',
    parseFail: '这个文件读不了',
    parseFailSub: '确认是 TikTok 导出的 Excel（To Ship order-….xlsx）',

    scanHint: '把摄像头对准面单上的条码',
    scanFail: n => '读不出来（' + n + '/3）——再试一次',
    scanFailFinal: '三次都没读到——请手动输入单号',
    typeManual: '手动输入',
    manualTitle: '输入运单号',
    manualHint: '条码下面那串 15 位数字',
    ok: '确定', cancel: '取消',
    dupBig: '这单已经包过了', badBig: '不在今天清单里',

    packThis: '这单要装', unit: '件',
    orderNo: '订单号',
    takePhoto: '拍照', retake: '重拍', confirmDone: '确认完成',
    photoNeeded: '封箱前必须拍照',
    doneBig: '完成', doneSub: n => '还剩 ' + n + ' 单',

    paneList: '今日清单', paneMiss: '漏发清单',
    allDone: '全部包完了，没有漏发。',
    notLoaded: '还没载入清单。',
    scannedAt: t => '已包 ' + t, notScanned: '还没包',
    dueTag: '截止',
    restored: '已恢复上次进度',
    exporting: '正在打包…',
    exported: '数据包已存到「下载」',
    exportedSub: '用 WhatsApp / email 把这个文件发给老板',
    exportEmpty: '还没有可导出的内容',
    csv: ['订单号', '运单号', '发货截止', '状态', '打包完成时间', '照片', 'SKU'],
    csvSent: '已打包', csvNot: '未扫', csvExtra: '不在清单',
    purged: n => '已清理 ' + n + ' 张过期照片（只留 7 天）',
  },
};

let LANG = (() => { try { return localStorage.getItem('pack-lang') || 'ms'; } catch (e) { return 'ms'; } })();
function t(k, arg) {
  const v = (I18N[LANG] || I18N.ms)[k];
  if (v === undefined) return k;
  return typeof v === 'function' ? v(arg) : v;
}
function setLang(l) { LANG = l; try { localStorage.setItem('pack-lang', l); } catch (e) {} }

if (typeof module !== 'undefined' && module.exports) module.exports = { I18N, t, setLang };
