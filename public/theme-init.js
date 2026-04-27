(function () {
  try {
    var id = localStorage.getItem('fms-theme');
    if (!id) return;
    var themes = {
      sand:  { dark: false, scale: { '50':'#FFFAF2','100':'#FEF3E5','200':'#FBEDDA','300':'#ECD2B0','400':'#DBB98A','500':'#C7A067','600':'#A8804C','700':'#86633B','800':'#63492B','900':'#3E2E1B' } },
      slate: { dark: false, scale: { '50':'#f8fafc','100':'#f1f5f9','200':'#e2e8f0','300':'#cbd5e1','400':'#94a3b8','500':'#64748b','600':'#475569','700':'#334155','800':'#1e293b','900':'#0f172a' } },
      zinc:  { dark: true,  scale: { '50':'#3f3f46','100':'#27272a','200':'#18181b','300':'#27272a','400':'#3f3f46','500':'#52525b','600':'#71717a','700':'#a1a1aa','800':'#d4d4d8','900':'#f4f4f5' } },
      ocean: { dark: true,  scale: { '50':'#1a3a5c','100':'#0d2137','200':'#0a1929','300':'#0d2137','400':'#1a3a5c','500':'#1e4d8c','600':'#2563ab','700':'#60a5fa','800':'#93c5fd','900':'#dbeafe' } },
    };
    var t = themes[id];
    if (!t) return;
    var r = document.documentElement;
    Object.keys(t.scale).forEach(function (n) {
      r.style.setProperty('--color-sand-' + n, t.scale[n]);
    });
    if (t.dark) r.classList.add('dark');
  } catch (e) {}
})();
