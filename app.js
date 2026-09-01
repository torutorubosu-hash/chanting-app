/**
 * Chanting Sequence App - Mobile & Desktop Compatible Controller
 */

// Safe Storage fallback for mobile webviews, file:// protocol, and private browsing modes
const memoryStorage = {};
const safeStorage = {
  getItem: (key) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch (e) {
      console.warn('Storage access warning:', e);
    }
    return memoryStorage[key] || null;
  },
  setItem: (key, val) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, val);
      }
    } catch (e) {
      console.warn('Storage write warning:', e);
    }
    memoryStorage[key] = val;
  }
};

let appState = {
  library: [],
  sequences: [],
  activeSequenceId: 'seq_daily',
  currentSequenceItems: [], // [{ id: 'p1', reps: 1 }, { id: 'p2', reps: 3 }]
  currentStepIndex: 0,
  currentRepCount: 0,
  fontSizeScale: 1.0,
  theme: 'dark',
  isAutoScrolling: false,
  scrollSpeed: 1.8,
  activeTab: 'setup'
};

const STORAGE_KEYS = {
  LIBRARY: 'chant_app_library_v10',
  SEQUENCES: 'chant_app_sequences_v10',
  ACTIVE_SEQ: 'chant_app_active_seq_v10',
  ACTIVE_ITEMS: 'chant_app_active_items_v10',
  SETTINGS: 'chant_app_settings_v10'
};

// Web Audio API Bell Synthesizer (Mobile-Safe)
let audioCtx = null;
function playBellSound() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const now = audioCtx.currentTime;
    const freqs = [432, 864, 1296];
    freqs.forEach((freq, idx) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      const gainLevel = 0.25 / (idx + 1);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(gainLevel, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.5);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 2.6);
    });
  } catch (err) {
    console.log('Audio notice:', err);
  }
}

// Unlock audio on first user touch (required on iOS/Safari and Android/Chrome)
function unlockAudioOnMobile() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass && !audioCtx) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  } catch (e) {}
}

// Initialize Application Data
function initData() {
  // Always initialize from latest fresh DEFAULT_PRAYERS
  appState.library = JSON.parse(JSON.stringify(DEFAULT_PRAYERS));

  const savedLibrary = safeStorage.getItem(STORAGE_KEYS.LIBRARY);
  if (savedLibrary) {
    try {
      const parsed = JSON.parse(savedLibrary);
      if (Array.isArray(parsed)) {
        parsed.forEach(p => {
          if (p.id && (p.id.startsWith('custom_') || p.id.startsWith('cloud_'))) {
            if (!appState.library.some(x => x.id === p.id)) {
              appState.library.push(p);
            }
          }
        });
      }
    } catch (e) {}
  }

  const savedSeqs = safeStorage.getItem(STORAGE_KEYS.SEQUENCES);
  if (savedSeqs) {
    try { appState.sequences = JSON.parse(savedSeqs); } catch (e) { appState.sequences = [...DEFAULT_SEQUENCES]; }
  } else {
    appState.sequences = JSON.parse(JSON.stringify(DEFAULT_SEQUENCES));
  }

  const savedActiveSeq = safeStorage.getItem(STORAGE_KEYS.ACTIVE_SEQ);
  if (savedActiveSeq && appState.sequences.some(s => s.id === savedActiveSeq)) {
    appState.activeSequenceId = savedActiveSeq;
  } else if (appState.sequences.length > 0) {
    appState.activeSequenceId = appState.sequences[0].id;
  }

  const savedActiveItems = safeStorage.getItem(STORAGE_KEYS.ACTIVE_ITEMS);
  if (savedActiveItems) {
    try {
      appState.currentSequenceItems = JSON.parse(savedActiveItems);
    } catch (e) {
      loadSequenceItemsFromPreset(appState.activeSequenceId);
    }
  } else {
    loadSequenceItemsFromPreset(appState.activeSequenceId);
  }

  const savedSettings = safeStorage.getItem(STORAGE_KEYS.SETTINGS);
  if (savedSettings) {
    try {
      const parsed = JSON.parse(savedSettings);
      appState.fontSizeScale = parsed.fontSizeScale || 1.0;
      appState.theme = parsed.theme || 'dark';
      appState.scrollSpeed = parsed.scrollSpeed || 1.8;
    } catch (e) {}
  }

  saveAll();
  applyTheme(appState.theme);
  applyFontSize(appState.fontSizeScale);
}

function loadSequenceItemsFromPreset(seqId) {
  const seq = appState.sequences.find(s => s.id === seqId) || appState.sequences[0];
  if (seq && seq.prayerIds) {
    appState.currentSequenceItems = seq.prayerIds.map(pid => {
      const prayer = getPrayerById(pid);
      return {
        id: pid,
        reps: prayer ? (prayer.reps || 1) : 1
      };
    });
  } else {
    appState.currentSequenceItems = [
      { id: 'p1', reps: 1 },
      { id: 'p2', reps: 1 },
      { id: 'p3', reps: 3 },
      { id: 'p4', reps: 1 },
      { id: 'p5', reps: 1 }
    ];
  }
}

function saveAll() {
  safeStorage.setItem(STORAGE_KEYS.LIBRARY, JSON.stringify(appState.library));
  safeStorage.setItem(STORAGE_KEYS.SEQUENCES, JSON.stringify(appState.sequences));
  safeStorage.setItem(STORAGE_KEYS.ACTIVE_SEQ, appState.activeSequenceId);
  safeStorage.setItem(STORAGE_KEYS.ACTIVE_ITEMS, JSON.stringify(appState.currentSequenceItems));
  safeStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({
    fontSizeScale: appState.fontSizeScale,
    theme: appState.theme,
    scrollSpeed: appState.scrollSpeed
  }));
}

function getPrayerById(id) {
  return appState.library.find(p => p.id === id);
}

function applyTheme(theme) {
  appState.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  saveAll();
}

function toggleTheme() {
  const themes = ['dark', 'light', 'sepia'];
  const nextIdx = (themes.indexOf(appState.theme) + 1) % themes.length;
  applyTheme(themes[nextIdx]);
}

function applyFontSize(scale) {
  appState.fontSizeScale = Math.max(0.8, Math.min(1.8, scale));
  document.documentElement.style.setProperty('--font-scale', appState.fontSizeScale);
  saveAll();
}

// -------------------------------------------------------------
// UNIFIED SETUP & SEQUENCE MANAGER (หน้าเลือกบท ปรับลำดับ และตั้งจำนวนจบ)
// -------------------------------------------------------------
function renderUnifiedSetupScreen() {
  const select = document.getElementById('select-active-preset');
  if (select) {
    select.innerHTML = '';
    const customOpt = document.createElement('option');
    customOpt.value = 'custom';
    customOpt.innerText = '-- กำหนดและเลือกบทสวดด้วยตนเอง --';
    select.appendChild(customOpt);

    appState.sequences.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.innerText = `ชุด: ${s.name} (${s.prayerIds.length} บท)`;
      if (s.id === appState.activeSequenceId) opt.selected = true;
      select.appendChild(opt);
    });
  }

  const totalPrayers = appState.currentSequenceItems.length;
  const totalReps = appState.currentSequenceItems.reduce((acc, cur) => acc + (parseInt(cur.reps) || 1), 0);
  
  const badge = document.getElementById('setup-total-badge');
  if (badge) badge.innerText = `${totalPrayers} บท`;

  const summary = document.getElementById('setup-total-reps-summary');
  if (summary) summary.innerText = `รวมทั้งสิ้น ${totalReps} จบ`;

  const container = document.getElementById('unified-sequence-list');
  if (!container) return;
  container.innerHTML = '';

  if (totalPrayers === 0) {
    container.innerHTML = `
      <div class="card" style="text-align: center; color: var(--text-muted); padding: 2.5rem 1rem;">
        <div style="font-size: 1.1rem; font-weight: 600; margin-bottom: 0.5rem; color: var(--text-gold);">ยังไม่มีบทสวดในชุดนี้</div>
        <p style="font-size: 0.85rem; margin-bottom: 1.25rem;">แตะปุ่มด้านล่างเพื่อเลือกบทสวดมนต์เข้าชุด</p>
        <button type="button" class="btn btn-primary" onclick="openAddPrayerModal()">+ เลือกบทสวดมนต์จากคลัง</button>
      </div>
    `;
    return;
  }

  appState.currentSequenceItems.forEach((item, index) => {
    const prayer = getPrayerById(item.id);
    if (!prayer) return;

    const reps = item.reps || 1;
    const card = document.createElement('div');
    card.className = 'sequence-item-card';

    card.innerHTML = `
      <div class="sequence-item-header">
        <div style="display: flex; align-items: center; gap: 0.65rem; overflow: hidden; flex: 1;">
          <span style="font-size: 0.95rem; font-weight: bold; color: var(--text-gold); min-width: 24px;">${index + 1}.</span>
          <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            <div style="font-size: 1rem; font-weight: 600; color: var(--text-main);">${prayer.title}</div>
            <div style="font-size: 0.78rem; color: var(--text-muted);">${prayer.subtitle || ''}</div>
          </div>
        </div>

        <div class="item-controls">
          <button type="button" class="btn-action-sm" onclick="openEditPrayerModal('${prayer.id}')" title="แก้ไขคำสวดบทนี้">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
          </button>
          <button type="button" class="btn-action-sm" onclick="moveSequenceItem(${index}, -1)" title="เลื่อนขึ้น" ${index === 0 ? 'disabled style="opacity:0.3;"' : ''}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m18 15-6-6-6 6"/></svg>
          </button>
          <button type="button" class="btn-action-sm" onclick="moveSequenceItem(${index}, 1)" title="เลื่อนลง" ${index === totalPrayers - 1 ? 'disabled style="opacity:0.3;"' : ''}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          <button type="button" class="btn-action-sm" onclick="removeSequenceItem(${index})" title="ลบออกจากชุด" style="color: #ef4444;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>

      <div class="sequence-item-bottom">
        <span style="font-size: 0.82rem; color: var(--text-muted); font-weight: 500;">สวดจำนวน:</span>
        <div style="display: flex; align-items: center; gap: 0.4rem;">
          <div class="rep-stepper">
            <button type="button" class="rep-stepper-btn" onclick="changeItemReps(${index}, -1)" title="ลดจำนวนจบ">−</button>
            <span class="rep-stepper-value">${reps} จบ</span>
            <button type="button" class="rep-stepper-btn" onclick="changeItemReps(${index}, 1)" title="เพิ่มจำนวนจบ">+</button>
          </div>
          <div style="display: flex; gap: 0.2rem;">
            <button type="button" class="btn btn-secondary btn-sm" style="padding: 0.2rem 0.45rem; font-size: 0.72rem;" onclick="setItemRepsQuick(${index}, 1)">1</button>
            <button type="button" class="btn btn-secondary btn-sm" style="padding: 0.2rem 0.45rem; font-size: 0.72rem;" onclick="setItemRepsQuick(${index}, 3)">3</button>
            <button type="button" class="btn btn-secondary btn-sm" style="padding: 0.2rem 0.45rem; font-size: 0.72rem;" onclick="setItemRepsQuick(${index}, 9)">9</button>
            <button type="button" class="btn btn-secondary btn-sm" style="padding: 0.2rem 0.45rem; font-size: 0.72rem;" onclick="setItemRepsQuick(${index}, 108)">108</button>
          </div>
        </div>
      </div>
    `;

    container.appendChild(card);
  });
}

function changeItemReps(index, delta) {
  if (!appState.currentSequenceItems[index]) return;
  let cur = parseInt(appState.currentSequenceItems[index].reps) || 1;
  cur = Math.max(1, Math.min(1000, cur + delta));
  appState.currentSequenceItems[index].reps = cur;
  saveAll();
  renderUnifiedSetupScreen();
}

function setItemRepsQuick(index, reps) {
  if (!appState.currentSequenceItems[index]) return;
  appState.currentSequenceItems[index].reps = reps;
  saveAll();
  renderUnifiedSetupScreen();
}

function moveSequenceItem(index, direction) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= appState.currentSequenceItems.length) return;

  const temp = appState.currentSequenceItems[index];
  appState.currentSequenceItems[index] = appState.currentSequenceItems[targetIndex];
  appState.currentSequenceItems[targetIndex] = temp;

  saveAll();
  renderUnifiedSetupScreen();
}

function removeSequenceItem(index) {
  appState.currentSequenceItems.splice(index, 1);
  saveAll();
  renderUnifiedSetupScreen();
}

function startChantingFromSetup() {
  if (!appState.currentSequenceItems || appState.currentSequenceItems.length === 0) {
    alert('กรุณาเลือกบทสวดอย่างน้อย 1 บทก่อนเริ่มสวดมนต์');
    return;
  }
  unlockAudioOnMobile();
  appState.currentStepIndex = 0;
  appState.currentRepCount = 0;
  switchTab('chant');
}

// -------------------------------------------------------------
// ADD PRAYER PICKER MODAL
// -------------------------------------------------------------
let pickerSearchQuery = '';

function openAddPrayerModal() {
  pickerSearchQuery = '';
  const searchInput = document.getElementById('modal-picker-search');
  if (searchInput) searchInput.value = '';
  renderAddPrayerPicker();
  openModal('modal-add-prayer-picker');
}

function renderAddPrayerPicker() {
  const container = document.getElementById('modal-picker-list');
  if (!container) return;
  container.innerHTML = '';

  const filtered = appState.library.filter(p => {
    if (!pickerSearchQuery) return true;
    return p.title.toLowerCase().includes(pickerSearchQuery) ||
           (p.subtitle && p.subtitle.toLowerCase().includes(pickerSearchQuery));
  });

  filtered.forEach(p => {
    const isAlreadyInSeq = appState.currentSequenceItems.some(item => item.id === p.id);
    const div = document.createElement('div');
    div.className = 'sequence-item';
    div.style.padding = '0.75rem';

    div.innerHTML = `
      <div style="flex: 1; overflow: hidden;">
        <div style="font-size: 0.95rem; font-weight: 600; color: var(--text-main);">${p.title}</div>
        <div style="font-size: 0.76rem; color: var(--text-muted); text-overflow: ellipsis; white-space: nowrap; overflow: hidden;">
          ${p.subtitle || ''}
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 0.3rem;">
        <button type="button" class="btn btn-secondary btn-sm" onclick="viewPrayerDetails('${p.id}')">ดู</button>
        <button type="button" class="btn ${isAlreadyInSeq ? 'btn-secondary' : 'btn-primary'} btn-sm" onclick="addPrayerToActiveSeq('${p.id}')">
          ${isAlreadyInSeq ? '+ เพิ่มซ้ำ' : '+ เพิ่ม'}
        </button>
      </div>
    `;

    container.appendChild(div);
  });
}

function addPrayerToActiveSeq(prayerId) {
  const prayer = getPrayerById(prayerId);
  const defaultReps = prayer ? (prayer.reps || 1) : 1;
  appState.currentSequenceItems.push({
    id: prayerId,
    reps: defaultReps
  });
  saveAll();
  renderUnifiedSetupScreen();
  renderAddPrayerPicker();
}

// -------------------------------------------------------------
// CHANTING READER MODE (หน้าอ่านสวดมนต์)
// -------------------------------------------------------------
function renderChantingReader() {
  if (!appState.currentSequenceItems || appState.currentSequenceItems.length === 0) {
    switchTab('setup');
    return;
  }

  if (appState.currentStepIndex >= appState.currentSequenceItems.length) {
    appState.currentStepIndex = 0;
  }
  if (appState.currentStepIndex < 0) {
    appState.currentStepIndex = 0;
  }

  const currentItem = appState.currentSequenceItems[appState.currentStepIndex];
  const prayer = getPrayerById(currentItem.id);

  const total = appState.currentSequenceItems.length;
  const current = appState.currentStepIndex + 1;
  const seqNameEl = document.getElementById('chant-sequence-name');
  if (seqNameEl) seqNameEl.innerText = `ลำดับการสวด (${total} บท)`;

  const stepIndEl = document.getElementById('chant-step-indicator');
  if (stepIndEl) stepIndEl.innerText = `บทที่ ${current} / ${total}`;

  const pct = Math.round((current / total) * 100);
  const progFill = document.getElementById('chant-progress-fill');
  if (progFill) progFill.style.width = `${pct}%`;

  if (!prayer) {
    document.getElementById('reader-title').innerText = 'ไม่พบบทสวดนี้';
    document.getElementById('reader-content').innerHTML = '';
    return;
  }

  document.getElementById('reader-title').innerText = prayer.title;
  document.getElementById('reader-subtitle').innerText = prayer.subtitle || '';

  const editBtn = document.getElementById('btn-reader-edit-current');
  if (editBtn) {
    editBtn.onclick = () => openEditPrayerModal(prayer.id);
  }

  const repBox = document.getElementById('repetition-box');
  const targetReps = currentItem.reps || prayer.reps || 1;
  if (targetReps > 1) {
    repBox.style.display = 'flex';
    document.getElementById('target-reps-text').innerText = targetReps;
    document.getElementById('current-rep-status').innerText = `สวดไปแล้ว ${appState.currentRepCount} / ${targetReps} จบ`;
  } else {
    repBox.style.display = 'none';
  }

  let html = '';
  if (prayer.verses && prayer.verses.length > 0) {
    prayer.verses.forEach(v => {
      html += `
        <div class="verse-block">
          <div class="pali-verse">${v.pali.replace(/\n/g, '<br>')}</div>
          ${v.thai ? `<div class="thai-meaning">${v.thai.replace(/\n/g, '<br>')}</div>` : ''}
        </div>
      `;
    });
  } else {
    html = `<div class="pali-verse">ไม่มีเนื้อหาบทสวด</div>`;
  }
  document.getElementById('reader-content').innerHTML = html;

  const prevBtn = document.getElementById('btn-prev-prayer');
  const nextBtn = document.getElementById('btn-next-prayer');
  if (prevBtn) {
    prevBtn.disabled = appState.currentStepIndex === 0;
    prevBtn.style.opacity = appState.currentStepIndex === 0 ? '0.4' : '1';
  }

  if (nextBtn) {
    if (appState.currentStepIndex === total - 1) {
      nextBtn.innerHTML = `<span>สวดจบชุด อนุโมทนา 🙏</span>`;
    } else {
      nextBtn.innerHTML = `<span>บทถัดไป</span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>`;
    }
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function nextPrayer() {
  if (!appState.currentSequenceItems) return;

  if (appState.currentStepIndex < appState.currentSequenceItems.length - 1) {
    appState.currentStepIndex++;
    appState.currentRepCount = 0;
    renderChantingReader();
  } else {
    alert('🎉 ขออนุโมทนาบุญ สาธุ! ท่านได้สวดมนต์ครบตามลำดับเรียบร้อยแล้ว');
    appState.currentStepIndex = 0;
    appState.currentRepCount = 0;
    renderChantingReader();
  }
}

function prevPrayer() {
  if (appState.currentStepIndex > 0) {
    appState.currentStepIndex--;
    appState.currentRepCount = 0;
    renderChantingReader();
  }
}

function incrementCounter() {
  const currentItem = appState.currentSequenceItems[appState.currentStepIndex];
  const prayer = getPrayerById(currentItem.id);
  const target = currentItem.reps || (prayer ? prayer.reps : 1) || 1;

  appState.currentRepCount++;
  document.getElementById('current-rep-status').innerText = `สวดไปแล้ว ${appState.currentRepCount} / ${target} จบ`;
  
  try {
    if (navigator && navigator.vibrate) {
      navigator.vibrate(40);
    }
  } catch (e) {}

  if (appState.currentRepCount >= target) {
    playBellSound();
    if (appState.currentRepCount === target) {
      setTimeout(() => {
        if (confirm(`สวดครบ ${target} จบแล้ว ต้องการไปบทถัดไปหรือไม่?`)) {
          nextPrayer();
        }
      }, 100);
    }
  }
}

function resetCounter() {
  appState.currentRepCount = 0;
  const currentItem = appState.currentSequenceItems[appState.currentStepIndex];
  const prayer = getPrayerById(currentItem.id);
  const target = currentItem.reps || (prayer ? prayer.reps : 1) || 1;
  document.getElementById('current-rep-status').innerText = `สวดไปแล้ว 0 / ${target} จบ`;
}

// Auto Scroll Functions
let autoScrollTimer = null;
function toggleAutoScroll() {
  appState.isAutoScrolling = !appState.isAutoScrolling;
  const btn = document.getElementById('btn-autoscroll');
  const label = document.getElementById('label-autoscroll');
  if (appState.isAutoScrolling) {
    if (btn) {
      btn.style.backgroundColor = 'var(--gold-primary)';
      btn.style.color = '#fff';
    }
    if (label) label.innerText = 'หยุดเลื่อน';
    startAutoScroll();
  } else {
    if (btn) {
      btn.style.backgroundColor = '';
      btn.style.color = '';
    }
    if (label) label.innerText = 'เลื่อนอัตโนมัติ';
    stopAutoScroll();
  }
}

function startAutoScroll() {
  stopAutoScroll();
  const speed = parseFloat(appState.scrollSpeed) || 1.8;
  const interval = Math.max(20, Math.floor(50 / speed));
  autoScrollTimer = setInterval(() => {
    window.scrollBy({ top: 1, behavior: 'auto' });
    if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 80) {
      stopAutoScroll();
      appState.isAutoScrolling = false;
      const btn = document.getElementById('btn-autoscroll');
      const label = document.getElementById('label-autoscroll');
      if (btn) { btn.style.backgroundColor = ''; btn.style.color = ''; }
      if (label) label.innerText = 'เลื่อนอัตโนมัติ';
    }
  }, interval);
}

function stopAutoScroll() {
  if (autoScrollTimer) {
    clearInterval(autoScrollTimer);
    autoScrollTimer = null;
  }
}

// -------------------------------------------------------------
// PRAYER EDITING FUNCTIONALITY (แก้ไขคำสวด)
// -------------------------------------------------------------
function openEditPrayerModal(prayerId) {
  const prayer = getPrayerById(prayerId);
  if (!prayer) return;

  document.getElementById('edit-prayer-id').value = prayer.id;
  document.getElementById('edit-prayer-title').value = prayer.title;
  document.getElementById('edit-prayer-subtitle').value = prayer.subtitle || '';
  document.getElementById('edit-prayer-reps').value = prayer.reps || 1;

  const container = document.getElementById('edit-verses-container');
  if (container) {
    container.innerHTML = '';
    if (prayer.verses && prayer.verses.length > 0) {
      prayer.verses.forEach(v => addEditVerseBlock(v.pali, v.thai));
    } else {
      addEditVerseBlock('', '');
    }
  }

  const originalDefault = DEFAULT_PRAYERS.find(p => p.id === prayer.id) || ONLINE_CLOUD_PRAYERS.find(p => p.id === prayer.id);
  const resetBtn = document.getElementById('btn-reset-default-prayer');
  if (resetBtn) {
    if (originalDefault) {
      resetBtn.style.display = 'inline-flex';
      resetBtn.onclick = () => {
        if (confirm(`คุณต้องการคืนค่าบทสวด "${originalDefault.title}" เป็นข้อความดั้งเดิมหรือไม่?`)) {
          const target = appState.library.find(p => p.id === prayer.id);
          if (target) {
            target.title = originalDefault.title;
            target.subtitle = originalDefault.subtitle;
            target.reps = originalDefault.reps;
            target.verses = JSON.parse(JSON.stringify(originalDefault.verses));
            saveAll();
            alert('คืนค่าข้อความเริ่มต้นเรียบร้อยแล้ว!');
            closeModal('modal-edit-prayer');
            refreshCurrentActiveView();
          }
        }
      };
    } else {
      resetBtn.style.display = 'none';
    }
  }

  openModal('modal-edit-prayer');
}

function addEditVerseBlock(paliText = '', thaiText = '') {
  const container = document.getElementById('edit-verses-container');
  if (!container) return;
  const block = document.createElement('div');
  block.className = 'edit-verse-row card';
  block.style.padding = '0.75rem';
  block.style.marginBottom = '0.75rem';
  block.style.background = 'var(--bg-main)';

  block.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
      <span style="font-size: 0.8rem; font-weight: bold; color: var(--text-gold);">ท่อนบทสวด</span>
      <button type="button" class="btn-action-sm" onclick="this.closest('.edit-verse-row').remove()" title="ลบท่อนนี้" style="width: 24px; height: 24px; color: #ef4444;">✕</button>
    </div>
    <label style="font-size: 0.78rem; color: var(--text-muted);">คำสวดบาลี / บทสวด:</label>
    <textarea class="input-field edit-verse-pali" style="min-height: 70px; margin-bottom: 0.4rem; font-weight: 500;" placeholder="คำสวด...">${paliText}</textarea>
    <label style="font-size: 0.78rem; color: var(--text-muted);">คำแปลไทย (ถ้ามี):</label>
    <textarea class="input-field edit-verse-thai" style="min-height: 50px; margin-bottom: 0;" placeholder="คำแปล...">${thaiText}</textarea>
  `;
  container.appendChild(block);
}

function saveEditedPrayer(e) {
  e.preventDefault();
  const prayerId = document.getElementById('edit-prayer-id').value;
  const prayer = getPrayerById(prayerId);
  if (!prayer) return;

  const newTitle = document.getElementById('edit-prayer-title').value.trim();
  const newSubtitle = document.getElementById('edit-prayer-subtitle').value.trim();
  const newReps = parseInt(document.getElementById('edit-prayer-reps').value) || 1;

  const verseRows = document.querySelectorAll('.edit-verse-row');
  const newVerses = [];

  verseRows.forEach(row => {
    const pali = row.querySelector('.edit-verse-pali').value.trim();
    const thai = row.querySelector('.edit-verse-thai').value.trim();
    if (pali) {
      newVerses.push({ pali: pali, thai: thai });
    }
  });

  if (newVerses.length === 0) {
    alert('กรุณากรอกคำสวดบาลีอย่างน้อย 1 ท่อน');
    return;
  }

  prayer.title = newTitle;
  prayer.subtitle = newSubtitle;
  prayer.reps = newReps;
  prayer.verses = newVerses;

  saveAll();
  closeModal('modal-edit-prayer');
  alert(`บันทึกการแก้ไข "${prayer.title}" เรียบร้อยแล้ว!`);
  refreshCurrentActiveView();
}

function refreshCurrentActiveView() {
  if (appState.activeTab === 'setup') renderUnifiedSetupScreen();
  else if (appState.activeTab === 'chant') renderChantingReader();
  else if (appState.activeTab === 'library') renderLibraryTab();
}

// -------------------------------------------------------------
// TAB 3: LIBRARY
// -------------------------------------------------------------
let currentLibraryCategory = 'all';
let currentLibrarySearch = '';

function renderLibraryTab() {
  const container = document.getElementById('library-list');
  if (!container) return;
  container.innerHTML = '';

  const filtered = appState.library.filter(p => {
    const matchCat = currentLibraryCategory === 'all' || p.category === currentLibraryCategory;
    const matchSearch = !currentLibrarySearch || 
      p.title.toLowerCase().includes(currentLibrarySearch.toLowerCase()) ||
      (p.subtitle && p.subtitle.toLowerCase().includes(currentLibrarySearch.toLowerCase())) ||
      (p.verses && p.verses.some(v => v.pali.toLowerCase().includes(currentLibrarySearch.toLowerCase())));
    return matchCat && matchSearch;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align: center; color: var(--text-muted); padding: 2rem 1rem;">
        ไม่พบบทสวดตามคำค้นหา
      </div>
    `;
    return;
  }

  filtered.forEach(p => {
    const isAlreadyInSeq = appState.currentSequenceItems.some(item => item.id === p.id);
    const card = document.createElement('div');
    card.className = 'card';
    card.style.padding = '1rem 1.15rem';
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.4rem;">
        <h3 style="font-size: 1.05rem; font-weight: 700; color: var(--text-gold);">${p.title}</h3>
        <span class="badge badge-secondary">${getCategoryName(p.category)}</span>
      </div>
      <p style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 0.85rem; line-height: 1.4;">
        ${p.subtitle || (p.verses && p.verses[0] ? p.verses[0].pali.substring(0, 70) + '...' : '')}
      </p>
      <div style="display: flex; gap: 0.35rem;">
        <button type="button" class="btn btn-secondary btn-sm" style="flex: 1;" onclick="viewPrayerDetails('${p.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
          <span>ดูเนื้อหา</span>
        </button>
        <button type="button" class="btn btn-secondary btn-sm" style="flex: 0.9;" onclick="openEditPrayerModal('${p.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
          <span>แก้ไข</span>
        </button>
        <button type="button" class="btn ${isAlreadyInSeq ? 'btn-secondary' : 'btn-primary'} btn-sm" style="flex: 1.1;" onclick="addPrayerToActiveSeq('${p.id}')">
          ${isAlreadyInSeq ? '<span>+ เพิ่มซ้ำ</span>' : '<span>+ เพิ่มเข้าชุด</span>'}
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

function getCategoryName(cat) {
  const map = {
    intro: 'บทเริ่มต้น',
    paritta: 'พระปริตร/ชัยมงคล',
    sacred: 'พระคาถาสำคัญ',
    metta: 'แผ่เมตตา/อุทิศบุญ',
    custom: 'สร้างเอง'
  };
  return map[cat] || 'บทสวดมนต์';
}

function viewPrayerDetails(prayerId) {
  const prayer = getPrayerById(prayerId);
  if (!prayer) return;

  document.getElementById('modal-detail-title').innerText = prayer.title;
  document.getElementById('modal-detail-subtitle').innerText = prayer.subtitle || '';

  let html = '';
  prayer.verses.forEach(v => {
    html += `
      <div class="verse-block">
        <div class="pali-verse">${v.pali.replace(/\n/g, '<br>')}</div>
        ${v.thai ? `<div class="thai-meaning">${v.thai.replace(/\n/g, '<br>')}</div>` : ''}
      </div>
    `;
  });
  document.getElementById('modal-detail-content').innerHTML = html;

  document.getElementById('btn-modal-edit-prayer-direct').onclick = () => {
    closeModal('modal-prayer-details');
    openEditPrayerModal(prayer.id);
  };

  document.getElementById('btn-modal-add-to-active-seq').onclick = () => {
    addPrayerToActiveSeq(prayer.id);
    closeModal('modal-prayer-details');
    switchTab('setup');
  };

  openModal('modal-prayer-details');
}

// -------------------------------------------------------------
// TAB 4: ONLINE SEARCH & CUSTOM PRAYER
// -------------------------------------------------------------
function renderOnlineSearch() {
  const searchInput = document.getElementById('online-search-input');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const container = document.getElementById('online-results-list');
  if (!container) return;
  container.innerHTML = '';

  const results = ONLINE_CLOUD_PRAYERS.filter(p => {
    if (!query) return true;
    return p.title.toLowerCase().includes(query) ||
           (p.subtitle && p.subtitle.toLowerCase().includes(query));
  });

  if (results.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 1.5rem 0.5rem;">
        ไม่พบบทสวดในคลังออนไลน์ตามคำค้นหานี้
      </div>
    `;
    return;
  }

  results.forEach(p => {
    const isAlreadyDownloaded = appState.library.some(local => local.id === p.id || local.title === p.title);
    const div = document.createElement('div');
    div.className = 'sequence-item';
    div.style.padding = '0.85rem';
    div.innerHTML = `
      <div style="flex: 1; overflow: hidden;">
        <div style="font-size: 0.95rem; font-weight: 600; color: var(--text-gold);">${p.title}</div>
        <div style="font-size: 0.78rem; color: var(--text-muted);">${p.subtitle}</div>
      </div>
      <div>
        ${isAlreadyDownloaded 
          ? `<span class="badge" style="background: rgba(34,197,94,0.15); color: #22c55e;">มีในเครื่องแล้ว</span>` 
          : `<button type="button" class="btn btn-primary btn-sm" onclick="downloadOnlinePrayer('${p.id}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span>ดาวน์โหลด</span>
             </button>`
        }
      </div>
    `;
    container.appendChild(div);
  });
}

function downloadOnlinePrayer(cloudId) {
  const prayer = ONLINE_CLOUD_PRAYERS.find(p => p.id === cloudId);
  if (!prayer) return;

  if (appState.library.some(p => p.id === prayer.id)) {
    alert('บทสวดนี้มีอยู่ในเครื่องแล้ว');
    return;
  }

  appState.library.push(JSON.parse(JSON.stringify(prayer)));
  saveAll();
  renderOnlineSearch();
  alert(`ดาวน์โหลด "${prayer.title}" ลงเครื่องเรียบร้อยแล้ว! สามารถเลือกและจัดลำดับสวดแบบออฟไลน์ได้ทันที`);
}

// Drawer Jump Modal
function openSequenceDrawer() {
  const list = document.getElementById('drawer-prayers-list');
  if (!list) return;
  list.innerHTML = '';

  appState.currentSequenceItems.forEach((item, idx) => {
    const prayer = getPrayerById(item.id);
    if (!prayer) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn btn-secondary ${idx === appState.currentStepIndex ? 'btn-primary' : ''}`;
    btn.style.justifyContent = 'flex-start';
    btn.style.textAlign = 'left';
    btn.innerHTML = `<span style="opacity: 0.8; font-weight: bold; margin-right: 0.5rem;">${idx + 1}.</span> <span>${prayer.title} (${item.reps || 1} จบ)</span>`;
    btn.onclick = () => {
      appState.currentStepIndex = idx;
      appState.currentRepCount = 0;
      closeModal('modal-sequence-drawer');
      renderChantingReader();
    };
    list.appendChild(btn);
  });

  openModal('modal-sequence-drawer');
}

function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('open');
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('open');
}

function switchTab(tabId) {
  unlockAudioOnMobile();
  appState.activeTab = tabId;
  document.querySelectorAll('.tab-screen').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const targetTab = document.getElementById(`tab-${tabId}`);
  if (targetTab) targetTab.classList.add('active');

  const navBtn = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  if (navBtn) navBtn.classList.add('active');

  if (tabId === 'setup') renderUnifiedSetupScreen();
  if (tabId === 'chant') renderChantingReader();
  if (tabId === 'library') renderLibraryTab();
  if (tabId === 'online') renderOnlineSearch();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateNetworkStatus() {
  const badge = document.getElementById('network-status');
  if (!badge) return;
  if (navigator && navigator.onLine) {
    badge.className = 'network-badge network-online';
    badge.innerHTML = `<span style="width: 8px; height: 8px; border-radius: 50%; background: currentColor;"></span><span>ออนไลน์ (พร้อมค้นหา)</span>`;
  } else {
    badge.className = 'network-badge network-offline';
    badge.innerHTML = `<span style="width: 8px; height: 8px; border-radius: 50%; background: currentColor;"></span><span>ออฟไลน์ (ใช้งานจากเครื่อง)</span>`;
  }
}

// Setup Event Listeners
function setupEventListeners() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  const bellBtn = document.getElementById('btn-bell');
  if (bellBtn) bellBtn.addEventListener('click', playBellSound);

  const themeBtn = document.getElementById('btn-theme');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

  const fontIncBtn = document.getElementById('btn-font-inc');
  if (fontIncBtn) fontIncBtn.addEventListener('click', () => applyFontSize(appState.fontSizeScale + 0.1));

  const fontDecBtn = document.getElementById('btn-font-dec');
  if (fontDecBtn) fontDecBtn.addEventListener('click', () => applyFontSize(appState.fontSizeScale - 0.1));

  // Unified Setup Events
  const presetSelect = document.getElementById('select-active-preset');
  if (presetSelect) {
    presetSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val !== 'custom') {
        appState.activeSequenceId = val;
        loadSequenceItemsFromPreset(val);
        saveAll();
        renderUnifiedSetupScreen();
      }
    });
  }

  const addPrayerBtn = document.getElementById('btn-open-add-prayer-modal');
  if (addPrayerBtn) addPrayerBtn.addEventListener('click', openAddPrayerModal);

  const startChantBtn = document.getElementById('btn-start-chanting-main');
  if (startChantBtn) startChantBtn.addEventListener('click', startChantingFromSetup);

  const clearAllBtn = document.getElementById('btn-clear-all-seq');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      if (confirm('คุณต้องการล้างรายการบทสวดทั้งหมดในชุดนี้หรือไม่?')) {
        appState.currentSequenceItems = [];
        saveAll();
        renderUnifiedSetupScreen();
      }
    });
  }

  const saveNewSeqBtn = document.getElementById('btn-save-as-new-seq');
  if (saveNewSeqBtn) {
    saveNewSeqBtn.addEventListener('click', () => {
      if (appState.currentSequenceItems.length === 0) {
        alert('ไม่มีบทสวดในรายการ');
        return;
      }
      const name = prompt('ตั้งชื่อชุดบทสวดมนต์นี้:', 'ชุดสวดมนต์ของฉัน');
      if (name && name.trim()) {
        const newSeq = {
          id: `seq_${Date.now()}`,
          name: name.trim(),
          prayerIds: appState.currentSequenceItems.map(it => it.id)
        };
        appState.sequences.push(newSeq);
        appState.activeSequenceId = newSeq.id;
        saveAll();
        alert(`บันทึกชุด "${name.trim()}" เรียบร้อยแล้ว!`);
        renderUnifiedSetupScreen();
      }
    });
  }

  // Modal Picker Search
  const pickerSearch = document.getElementById('modal-picker-search');
  if (pickerSearch) {
    pickerSearch.addEventListener('input', (e) => {
      pickerSearchQuery = e.target.value.toLowerCase().trim();
      renderAddPrayerPicker();
    });
  }

  // Chanting Screen Controls
  const nextBtn = document.getElementById('btn-next-prayer');
  if (nextBtn) nextBtn.addEventListener('click', nextPrayer);

  const prevBtn = document.getElementById('btn-prev-prayer');
  if (prevBtn) prevBtn.addEventListener('click', prevPrayer);

  const countRepBtn = document.getElementById('btn-count-rep');
  if (countRepBtn) countRepBtn.addEventListener('click', incrementCounter);

  const resetRepBtn = document.getElementById('btn-reset-rep');
  if (resetRepBtn) resetRepBtn.addEventListener('click', resetCounter);

  const autoScrollBtn = document.getElementById('btn-autoscroll');
  if (autoScrollBtn) autoScrollBtn.addEventListener('click', toggleAutoScroll);

  const scrollSpeedSelect = document.getElementById('select-scroll-speed');
  if (scrollSpeedSelect) {
    scrollSpeedSelect.addEventListener('change', (e) => {
      appState.scrollSpeed = parseFloat(e.target.value);
      saveAll();
      if (appState.isAutoScrolling) startAutoScroll();
    });
  }

  const drawerBtn = document.getElementById('btn-sequence-drawer');
  if (drawerBtn) drawerBtn.addEventListener('click', openSequenceDrawer);

  // Edit Prayer Form & Add Verse
  const editForm = document.getElementById('form-edit-prayer');
  if (editForm) editForm.addEventListener('submit', saveEditedPrayer);

  const addVerseBtn = document.getElementById('btn-add-edit-verse');
  if (addVerseBtn) addVerseBtn.addEventListener('click', () => addEditVerseBlock('', ''));

  // Library tab events
  const libSearch = document.getElementById('library-search');
  if (libSearch) {
    libSearch.addEventListener('input', (e) => {
      currentLibrarySearch = e.target.value;
      renderLibraryTab();
    });
  }

  document.querySelectorAll('#library-categories .category-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#library-categories .category-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentLibraryCategory = pill.dataset.cat;
      renderLibraryTab();
    });
  });

  // Online search & custom prayer form
  const onlineSearchInput = document.getElementById('online-search-input');
  if (onlineSearchInput) onlineSearchInput.addEventListener('input', renderOnlineSearch);

  const customPrayerForm = document.getElementById('form-custom-prayer');
  if (customPrayerForm) {
    customPrayerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const title = document.getElementById('custom-title').value.trim();
      const cat = document.getElementById('custom-category').value;
      const pali = document.getElementById('custom-pali').value.trim();
      const thai = document.getElementById('custom-thai').value.trim();
      const reps = parseInt(document.getElementById('custom-reps').value) || 1;

      if (!title || !pali) return;

      const newPrayer = {
        id: `custom_${Date.now()}`,
        title: title,
        subtitle: thai ? thai.substring(0, 60) + '...' : 'บทสวดกำหนดเอง',
        category: cat,
        reps: reps,
        verses: [
          { pali: pali, thai: thai }
        ]
      };

      appState.library.push(newPrayer);
      appState.currentSequenceItems.push({ id: newPrayer.id, reps: reps });
      saveAll();

      alert(`บันทึก "${title}" เข้าคลังและเพิ่มในรายการสวดเรียบร้อยแล้ว!`);
      customPrayerForm.reset();
      switchTab('setup');
    });
  }

  // Backup & Restore
  const exportBtn = document.getElementById('btn-export-backup');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const backupData = {
        version: 5,
        date: new Date().toISOString(),
        library: appState.library,
        sequences: appState.sequences,
        currentSequenceItems: appState.currentSequenceItems
      };
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backupData, null, 2));
      const a = document.createElement('a');
      a.setAttribute('href', dataStr);
      a.setAttribute('download', `chanting_backup_${Date.now()}.json`);
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
  }

  const importInput = document.getElementById('input-import-backup');
  if (importInput) {
    importInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target.result);
          if (data.library && data.sequences) {
            appState.library = data.library;
            appState.sequences = data.sequences;
            if (data.currentSequenceItems) appState.currentSequenceItems = data.currentSequenceItems;
            saveAll();
            alert('นำเข้าข้อมูลสำเร็จ!');
            location.reload();
          } else {
            alert('รูปแบบไฟล์ไม่ถูกต้อง');
          }
        } catch (err) {
          alert('เกิดข้อผิดพลาดในการอ่านไฟล์');
        }
      };
      reader.readAsText(file);
    });
  }

  // Close modals
  document.querySelectorAll('.btn-close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
    });
  });

  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', (e) => {
      if (e.target === m) m.classList.remove('open');
    });
  });

  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);
  document.addEventListener('touchstart', unlockAudioOnMobile, { once: true, passive: true });
}

// Service Worker - ONLY registered on valid http/https origins (avoids SecurityError crash on file:// on mobile)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || (location.protocol === 'http:' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')))) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      console.log('ServiceWorker registered:', reg.scope);
    }).catch((err) => {
      console.log('ServiceWorker notice:', err);
    });
  });
}

window.addEventListener('DOMContentLoaded', () => {
  initData();
  setupEventListeners();
  updateNetworkStatus();
  renderUnifiedSetupScreen();
});
