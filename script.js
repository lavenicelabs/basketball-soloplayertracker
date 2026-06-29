// Initialize Supabase Client Connection
const bballDb = supabase.createClient('https://upgfhekhifolcqiudhzy.supabase.co', 'sb_publishable_ToMrCjvcOh8FkABvDwcm4g_jcCA_F-U');

let curData = null;
let updateTimer = null;
let isHome = true;
let curWL = 'W';
let histData = [];
let pendingSync = false;
let currentFamilyId = 'default_family';
let isAppInitialized = false;

// Initialize Event Listeners on DOM Load
document.addEventListener('DOMContentLoaded', () => {
  const today = new Date();
  const dateInput = document.getElementById('gameDate');
  if (dateInput) {
    dateInput.value = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().slice(0, 10);
  }

  // Auto-click Sign-In button when pressing Enter on password/email inputs
  const passwordInput = document.getElementById('auth-password');
  const emailInput = document.getElementById('auth-email');

  const handleEnterKey = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleAuthAction('login');
    }
  };

  if (passwordInput) passwordInput.addEventListener('keydown', handleEnterKey);
  if (emailInput) emailInput.addEventListener('keydown', handleEnterKey);
});

// ==========================================
// AUTHENTICATION CONTROLLER & INTERFACE LOGIC
// ==========================================
bballDb.auth.onAuthStateChange(async (event, session) => {
  if (isAppInitialized) return;
  if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
    if (session) {
      isAppInitialized = true;
      updateStatus("Session active. Fetching profile...", false);
      await fetchUserProfile(session.user.id);
    }
  }
});

function updateStatus(msg, isError) {
  const statusEl = document.getElementById('auth-status');
  if (statusEl) {
    statusEl.innerText = msg;
    statusEl.style.color = isError ? '#e74c3c' : '#2980b9';
  }
}

function togglePasswordVisibility() {
  const passwordInput = document.getElementById('auth-password');
  const toggleBtn = document.getElementById('toggle-password-btn');
  if (!passwordInput || !toggleBtn) return;

  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    toggleBtn.innerText = '🙈';
  } else {
    passwordInput.type = 'password';
    toggleBtn.innerText = '👁️';
  }
}

function smartRegister() {
  const accessKeyInput = document.getElementById('auth-access-key');
  if (accessKeyInput) {
    if (accessKeyInput.style.display === 'none' || accessKeyInput.style.display === '') {
      accessKeyInput.style.display = 'block';
      updateStatus("Enter email, password, and registration Access Key.", false);
    } else {
      handleAuthAction('register');
    }
  }
}

async function handleAuthAction(actionType) {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const accessKey = document.getElementById('auth-access-key').value.trim();

  if (!email || !password) {
    updateStatus("Please enter both Email and Password.", true);
    return;
  }

  try {
    if (actionType === 'login') {
      updateStatus("Signing in...", false);
      const { data, error } = await bballDb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } else if (actionType === 'register') {
      if (!accessKey) {
        updateStatus("Access Key required for registration verification.", true);
        return;
      }
      updateStatus("Validating access and registering...", false);

      const { data, error } = await bballDb.auth.signUp({
        email,
        password,
        options: { data: { registration_key: accessKey } }
      });
      if (error) throw error;
      updateStatus("Registration successful! Check your email for verification.", false);
    }
  } catch (err) {
    console.error("Auth Error Logging Transaction:", err);
    updateStatus(err.message, true);
  }
}

async function fetchUserProfile(userId) {
  try {
    let { data: profile, error } = await bballDb
      .from('profiles')
      .select('family_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!error && profile) currentFamilyId = profile.family_id;
    await loadInitialApplicationState();
  } catch (err) {
    await loadInitialApplicationState();
  }
}

// ==========================================
// INITIAL APPLICATION DATA POPULATION ENGINE
// ==========================================
async function loadInitialApplicationState() {
  try {
    let { data: configs, error } = await bballDb
      .from("user_metric_settings")
      .select(`
        visible, custom_price,
        global_metric_templates (id, stat_name, section, is_counter, default_price, report_group, report_sort_order, color_theme, formula)
      `)
      .eq("family_id", currentFamilyId)
      .eq("global_metric_templates.app_type", "basketball:solo");

    if (error) throw error;

    configs.sort((a, b) => a.global_metric_templates.report_sort_order - b.global_metric_templates.report_sort_order);

    const formattedStats = configs.map((c) => ({
      name: c.global_metric_templates.stat_name,
      price: Number(c.custom_price !== null ? c.custom_price : c.global_metric_templates.default_price),
      count: 0,
      visible: c.visible,
      row: c.global_metric_templates.id,
      section: c.global_metric_templates.section,
      isCounter: c.global_metric_templates.is_counter,
      reportGroup: c.global_metric_templates.report_group,
      colorTheme: c.global_metric_templates.color_theme,
      formula: c.global_metric_templates.formula
    }));

    curData = {
      opp: "", su: "", st: "", loc: true, res: "W", pm: "", tm: 32,
      seasons: ["Season 1"], stats: formattedStats
    };

    render(curData);
    document.getElementById('auth-overlay').style.display = 'none';
    document.getElementById('main-app-container').style.display = 'block';
  } catch (err) {
    console.error(err);
  }
}

// ==========================================
// CORE LAYOUT GENERATION & INTERFACE FILTERS
// ==========================================
function render(d) {
  curData = d;
  document.getElementById('opp').value = d.opp || "";
  setLoc(d.loc); setWL(d.res);
  document.getElementById('scoreUs').value = d.su || "";
  document.getElementById('scoreThem').value = d.st || "";
  document.getElementById('pMin').value = d.pm || "";
  document.getElementById('tMin').value = d.tm || "32";

  const dl = document.getElementById('seasonList');
  if (dl) dl.innerHTML = d.seasons.map(s => `<option value="${s}">`).join('');
  if (!document.getElementById('season').value && d.seasons.length > 0) {
    document.getElementById('season').value = d.seasons[d.seasons.length - 1];
  }

  // Filter out calculations fields from rendering on standard tracker input panels
  document.getElementById('board-def').innerHTML = d.stats.filter(s => s.section === 'defense' && s.visible).map(rowHTML).join('');
  document.getElementById('board-off').innerHTML = d.stats.filter(s => s.section === 'offense' && s.visible).map(rowHTML).join('');
  document.getElementById('board-team').innerHTML = d.stats.filter(s => s.section === 'team' && s.visible).map(rowHTML).join('');

  const settingsContainer = document.getElementById('settings-list');
  if (settingsContainer) {
    settingsContainer.innerHTML = d.stats.map(s => `
      <div class="toggle-row">
        <span style="font-weight:bold; color:${s.colorTheme};">${s.name}</span>
        <label><input type="checkbox" ${s.visible ? 'checked' : ''} onchange="toggleVis(${s.row}, this.checked)"> Show</label>
      </div>`).join('');
  }

  ['scoreUs', 'scoreThem', 'pMin', 'tMin', 'opp', 'season', 'gameDate'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.dataset.listenerAttached) {
      el.addEventListener('input', () => checkAchievementsAndProtections());
      el.dataset.listenerAttached = true;
    }
  });

  recalcTotal();
  checkAchievementsAndProtections();
  applyLayoutOrder();
}

function rowHTML(s) {
  const isTeam = s.section === 'team';
  const moneyHTML = isTeam ? '' : `
    <div class="t-money">
      <div class="t-price" style="color:${s.colorTheme}; font-weight:bold;" id="price-${s.row}">$${s.price.toFixed(2)} ea</div>
      <span class="t-sub" id="sub-${s.row}">$${(s.count * s.price).toFixed(2)}</span>
    </div>`;

  return `
    <div class="t-row" style="border-left: 4px solid ${s.colorTheme};">
      <div class="t-controls">
        <button class="btn-c btn-m" onclick="tally(${s.row},-1)">-</button>
        <div class="t-count" id="c-${s.row}">${s.count}</div>
        <button class="btn-c btn-p" onclick="tally(${s.row},1)">+</button>
      </div>
      <div class="t-stat" style="font-weight:500;">${s.name}</div>
      ${moneyHTML}
    </div>`;
}

// ==========================================
// DYNAMIC HISTORY LEDGER ENGINE
// ==========================================
async function loadHistory() {
  const historyBody = document.getElementById('history-body');
  if (historyBody) historyBody.innerHTML = '<tr><td colspan="40" style="padding:20px;text-align:center;">Loading Game Logs...</td></tr>';

  try {
    let { data: games, error } = await bballDb
      .from("game_logs")
      .select(`
        id, game_date, season, opponent, location, result, score_us, score_them,
        player_minutes, team_minutes, total_payout, is_deleted,
        game_stat_values ( template_id, stat_value )
      `)
      .eq("family_id", currentFamilyId)
      .order("game_date", { ascending: false });

    if (error) throw error;

    histData = (games || []).map(g => {
      const statsMap = {};
      (g.game_stat_values || []).forEach(sv => { statsMap[sv.template_id] = sv.stat_value; });
      return {
        sheetRow: g.id, date: g.game_date, season: g.season || "Season 1", opp: g.opponent,
        loc: g.location === "Home" ? "H" : "A", res: g.result, su: g.score_us, st: g.score_them,
        min: g.player_minutes, tmin: g.team_minutes, money: Number(g.total_payout || 0),
        isDel: g.is_deleted || false, rawStats: statsMap
      };
    });

    const seasons = [...new Set(histData.map(x => x.season))];
    const filterSelect = document.getElementById('seasonFilter');
    if (filterSelect) {
      filterSelect.innerHTML = seasons.map(x => `<option value="${x}">${x}</option>`).join('');
      if (seasons.length > 0) filterSelect.value = seasons[seasons.length - 1];
    }
    renderHistory();
  } catch (err) {
    if (historyBody) historyBody.innerHTML = `<tr><td colspan="40" style="color:red;text-align:center;">Error: ${err.message}</td></tr>`;
  }
}

function renderHistory() {
  const body = document.getElementById('history-body');
  const head = document.getElementById('history-head');
  if (!body || !head) return;

  const showDel = document.getElementById('showDel')?.checked || false;
  const activeSeason = document.getElementById('seasonFilter')?.value;

  const filtered = histData.filter(g => (g.isDel === showDel) && (!activeSeason || g.season === activeSeason));
  const visibleTemplates = curData.stats.filter(s => s.visible);
  
  // Extract report groups in the exact order specified by your database weight identifiers
  const orderedGroups = [];
  visibleTemplates.forEach(s => {
    if (!orderedGroups.includes(s.reportGroup)) orderedGroups.push(s.reportGroup);
  });

  // --- FULLY DYNAMIC DOUBLE-HEADER LAYOUT BUILDER ---
  // FIXED: Changed colspan="7" to colspan="8" to completely account for the universal meta rows
  let topRowHTML = `
    <tr style="background:#2c3e50; color:white;">
      <th rowspan="2" style="vertical-align:middle; padding:8px; z-index:20;" class="sticky-1">Action</th>
      <th colspan="8" style="text-align:center; background:#2980b9; padding:8px;">Universal Match Data</th>`;
      
  let subRowHTML = `
    <tr style="background:#f2f4f4; font-size:0.85rem; color:#2c3e50;">
      <th class="sticky-2" style="background:#f2f4f4;">Date</th>
      <th>Opponent</th>
      <th>Loc</th>
      <th>Res</th>
      <th>Our</th>
      <th>Opp</th>
      <th>MIN</th>`;

  // 2. Append database-driven sport metrics groups and specific subheaders
  orderedGroups.forEach(groupName => {
    const groupStats = visibleTemplates.filter(s => s.reportGroup === groupName);
    if (groupStats.length > 0) {
      topRowHTML += `<th colspan="${groupStats.length}" style="text-align:center; background:${groupStats[0].colorTheme}; border-left:1px solid #fff; padding:8px;">${groupName}</th>`;
      groupStats.forEach(s => {
        subRowHTML += `<th style="color:${s.colorTheme}; border-bottom:2px solid ${s.colorTheme}; font-weight:600; padding:6px; min-width:65px;">${s.name}</th>`;
      });
    }
  });

  // 3. Close out the table headers assembly cleanly
  topRowHTML += `<th rowspan="2" style="background:#27ae60; vertical-align:middle; text-align:center; padding:8px;">Payout</th></tr><tr>`;
  head.innerHTML = topRowHTML + subRowHTML;

  if (filtered.length === 0) {
    body.innerHTML = `<tr><td colspan="50" style="padding:15px;text-align:center;color:#7f8c8d;">No logs found.</td></tr>`;
    return;
  }

  // 4. Populate row data values grid cells matching header indexes
  body.innerHTML = filtered.map(g => {
    let statsColumnsHTML = '';
    const histStatsInstance = curData.stats.map(s => ({
      name: s.name, count: g.rawStats[s.row] !== undefined ? g.rawStats[s.row] : 0, formula: s.formula
    }));

    // Evaluate live dynamic template formulas (e.g., 2PT%, 3PT%, eFG%, USG%)
    histStatsInstance.filter(s => s.formula !== null).forEach(fStat => {
      let equation = fStat.formula.replaceAll('$pMin', g.min).replaceAll('$tMin', g.tmin);
      histStatsInstance.forEach(s => { equation = equation.replaceAll(`[${s.name}]`, s.count); });
      equation = equation.replace(/NULLIF\(([^,]+),\s*([^)]+)\)/g, '($1 === $2 ? NaN : $1)');
      try { let res = eval(equation); fStat.count = isFinite(res) && !isNaN(res) ? res : 0; } catch(e) { fStat.count = 0; }
    });

    orderedGroups.forEach(groupName => {
      visibleTemplates.filter(s => s.reportGroup === groupName).forEach(s => {
        const match = histStatsInstance.find(x => x.name === s.name);
        let displayVal = match ? match.count : 0;
        let formattedStr = s.section === 'advanced' ? displayVal.toFixed(1) + (s.name.includes('%') ? '%' : '') : displayVal;
        statsColumnsHTML += `<td style="font-weight:500; text-align:center; background:#fff; border-left:1px solid #f2f4f4;">${formattedStr}</td>`;
      });
    });

    // FIXED: Adjusted the grid output to ensure values match the subheader columns correctly
    return `
      <tr style="border-bottom:1px solid #e5e8e8; font-size:0.9rem; text-align:center;">
        <td style="padding:4px;" class="sticky-1"><button class="reset-btn" style="padding:3px 6px; font-size:0.8rem;" onclick="openModal('${g.sheetRow}')">✏️</button></td>
        <td style="font-weight:bold; white-space:nowrap; padding:8px;" class="sticky-2">${g.date}</td>
        <td style="text-align:left; font-weight:500; color:#2c3e50;">${g.opp}</td>
        <td><span style="font-weight:bold; padding:2px 6px; border-radius:4px; font-size:0.75rem; background:${g.loc==='H'?'#e8f4f8':'#fcf3cf'}; color:${g.loc==='H'?'#2980b9':'#f39c12'};">${g.loc}</span></td>
        <td><span style="font-weight:bold; color:${g.res==='W'?'#27ae60':(g.res==='L'?'#c0392b':'#7f8c8d')}">${g.res}</span></td>
        <td>${g.su}</td><td>${g.st}</td><td>${g.min}</td>
        ${statsColumnsHTML}
        <td style="font-weight:bold; color:#27ae60; background:#f4fbf7; padding:8px;">$${g.money.toFixed(2)}</td>
      </tr>`;
  }).join('');
}

topRowHTML += `<th rowspan="2" style="background:#27ae60; vertical-align:middle; text-align:center; padding:8px;">Payout</th></tr><tr>`;
head.innerHTML = topRowHTML + subRowHTML;

if (filtered.length === 0) {
  body.innerHTML = `<tr><td colspan="50" style="padding:15px;text-align:center;color:#7f8c8d;">No logs found.</td></tr>`;
  return;
}

body.innerHTML = filtered.map(g => {
  let statsColumnsHTML = '';
  const histStatsInstance = curData.stats.map(s => ({
    name: s.name, count: g.rawStats[s.row] !== undefined ? g.rawStats[s.row] : 0, formula: s.formula
  }));

  // Evaluate live dynamic templates calculations for historical rows
  histStatsInstance.filter(s => s.formula !== null).forEach(fStat => {
    let equation = fStat.formula.replaceAll('$pMin', g.min).replaceAll('$tMin', g.tmin);
    histStatsInstance.forEach(s => { equation = equation.replaceAll(`[${s.name}]`, s.count); });
    equation = equation.replace(/NULLIF\(([^,]+),\s*([^)]+)\)/g, '($1 === $2 ? NaN : $1)');
    try { let res = eval(equation); fStat.count = isFinite(res) && !isNaN(res) ? res : 0; } catch (e) { fStat.count = 0; }
  });

  orderedGroups.forEach(groupName => {
    visibleTemplates.filter(s => s.reportGroup === groupName).forEach(s => {
      const match = histStatsInstance.find(x => x.name === s.name);
      let displayVal = match ? match.count : 0;
      let formattedStr = s.section === 'advanced' ? displayVal.toFixed(1) + (s.name.includes('%') ? '%' : '') : displayVal;
      statsColumnsHTML += `<td style="font-weight:500; text-align:center; background:#fff; border-left:1px solid #f2f4f4;">${formattedStr}</td>`;
    });
  });

  return `
      <tr style="border-bottom:1px solid #e5e8e8; font-size:0.9rem; text-align:center;">
        <td style="padding:4px;"><button class="reset-btn" style="padding:3px 6px; font-size:0.8rem;" onclick="openModal('${g.sheetRow}')">✏️</button></td>
        <td style="font-weight:bold; white-space:nowrap; padding:8px;">${g.date}</td>
        <td style="text-align:left; font-weight:500; color:#2c3e50;">${g.opp}</td>
        <td><span style="font-weight:bold; padding:2px 6px; border-radius:4px; font-size:0.75rem; background:${g.loc === 'H' ? '#e8f4f8' : '#fcf3cf'}; color:${g.loc === 'H' ? '#2980b9' : '#f39c12'};">${g.loc}</span></td>
        <td><span style="font-weight:bold; color:${g.res === 'W' ? '#27ae60' : (g.res === 'L' ? '#c0392b' : '#7f8c8d')}">${g.res}</span></td>
        <td>${g.su}</td><td>${g.st}</td><td>${g.min}</td>
        ${statsColumnsHTML}
        <td style="font-weight:bold; color:#27ae60; background:#f4fbf7; padding:8px;">$${g.money.toFixed(2)}</td>
      </tr>`;
}).join('');
}

// ==========================================
// DATA WRITE BACK ENGINE TRANSACTION HANDLERS
// ==========================================
async function saveGame() {
  const button = document.querySelector('.save-btn');
  if (button) { button.disabled = true; button.innerText = "SAVING..."; }

  try {
    const getI = (id) => document.getElementById(id)?.value || "";
    const totalPayout = curData.stats.filter(s => s.formula === null).reduce((sum, x) => sum + (x.count * x.price), 0);

    const logHeader = {
      family_id: currentFamilyId, game_date: getI('gameDate'), season: getI('season') || "Season 1",
      opponent: getI('opp') || "Unknown Opponent", location: isHome ? "Home" : "Away", result: curWL,
      score_us: parseInt(getI('scoreUs')) || 0, score_them: parseInt(getI('scoreThem')) || 0,
      player_minutes: parseInt(getI('pMin')) || 0, team_minutes: parseInt(getI('tMin')) || 32,
      total_payout: totalPayout, is_deleted: false
    };

    const { data: savedHeader, error: headerError } = await bballDb
      .from('game_logs').insert([logHeader]).select('id').single();

    if (headerError) throw headerError;

    const valuesPayload = curData.stats.filter(s => s.formula === null).map(s => ({
      game_log_id: savedHeader.id, template_id: s.row, stat_value: s.count
    }));

    const { error: valuesError } = await bballDb.from('game_stat_values').insert(valuesPayload);
    if (valuesError) throw valuesError;

    alert("Box score logged successfully!");
    resetTracker();
    await loadHistory();
  } catch (err) {
    alert("Failed to save box score: " + err.message);
  } finally {
    if (button) { button.disabled = false; button.innerText = "SAVE"; }
  }
}

// ==========================================
// DYNAMIC NATIVE EDIT MODAL BUILDER LOOPS
// ==========================================
function openModal(logId) {
  const g = histData.find(x => x.sheetRow === logId);
  if (!g) return;

  document.getElementById('editRow').value = g.sheetRow;
  document.getElementById('editDate').value = g.date;
  document.getElementById('editOpp').value = g.opp;
  document.getElementById('eScoreUs').value = g.su;
  document.getElementById('eScoreThem').value = g.st;
  document.getElementById('editWL').value = g.res;
  document.getElementById('editLoc').value = g.loc === 'H' ? 'Home' : 'Away';
  document.getElementById('eMin').value = g.min;
  document.getElementById('eTMin').value = g.tmin;
  document.getElementById('eMoney').value = g.money.toFixed(2);

  // FIXED: Build the grid form dynamically to support any sport layout and prevent crash triggers
  const modalGrid = document.getElementById('dynamic-modal-stats-grid');
  if (modalGrid) {
    const rawCountersOnly = curData.stats.filter(s => s.formula === null);
    modalGrid.innerHTML = rawCountersOnly.map(s => {
      const currentValue = g.rawStats[s.row] !== undefined ? g.rawStats[s.row] : 0;
      return `
        <div style="display:flex; flex-direction:column;">
          <label style="font-size:0.75rem; font-weight:600; color:${s.colorTheme}; margin-bottom:2px;">${s.name}</label>
          <input type="number" id="modal-input-${s.row}" value="${currentValue}" oninput="recalcEditMoney()" style="padding:6px; border:1px solid #ccc; border-radius:4px;">
        </div>`;
    }).join('');
  }

  document.getElementById('editModal').style.display = 'flex';
}

function closeEdit() {
  document.getElementById('editModal').style.display = 'none';
}

async function saveEdit() {
  const logId = document.getElementById('editRow').value;
  const rawCountersOnly = curData.stats.filter(s => s.formula === null);

  const statPayload = {};
  rawCountersOnly.forEach(s => {
    const targetInput = document.getElementById(`modal-input-${s.row}`);
    if (targetInput) {
      statPayload[s.row] = parseInt(targetInput.value) || 0;
    }
  });

  try {
    const { error } = await bballDb.rpc('update_game_log_with_stats', {
      p_log_id: logId,
      p_game_date: document.getElementById('editDate').value,
      p_opponent: document.getElementById('editOpp').value,
      p_location: document.getElementById('editLoc').value,
      p_result: document.getElementById('editWL').value,
      p_score_us: parseInt(document.getElementById('eScoreUs').value) || 0,
      p_score_them: parseInt(document.getElementById('eScoreThem').value) || 0,
      p_player_minutes: parseInt(document.getElementById('eMin').value) || 0,
      p_team_minutes: parseInt(document.getElementById('eTMin').value) || 32,
      p_total_payout: parseFloat(document.getElementById('eMoney').value) || 0.00,
      p_stat_payload: statPayload
    });

    if (error) throw error;
    closeEdit();
    await loadHistory();
  } catch (err) {
    alert("Error updating database logs: " + err.message);
  }
}

function recalcEditMoney() {
  const rawCountersOnly = curData.stats.filter(s => s.formula === null);
  let newTotal = 0;

  rawCountersOnly.forEach(s => {
    const targetInput = document.getElementById(`modal-input-${s.row}`);
    if (targetInput) {
      let val = parseFloat(targetInput.value) || 0;
      newTotal += val * s.price;
    }
  });
  document.getElementById('eMoney').value = newTotal.toFixed(2);
}

function resetTracker() {
  if (!curData) return;
  curData.stats.forEach(x => x.count = 0);
  ['opp', 'scoreUs', 'scoreThem', 'pMin'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  render(curData);
}

function switchTab(t) {
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  const targetPage = document.getElementById('page-' + t);
  const targetTab = document.getElementById('tab-' + t);

  if (targetPage) targetPage.style.display = 'block';
  if (targetTab) targetTab.classList.add('active');
  if (t === 'history') loadHistory();
}

function autoWL() {
  const u = parseInt(document.getElementById('scoreUs').value), t = parseInt(document.getElementById('scoreThem').value);
  if (!isNaN(u) && !isNaN(t)) setWL(u > t ? 'W' : (u < t ? 'L' : 'T'));
}

function setLoc(h) { isHome = h; document.getElementById('btnHome').classList.toggle('active', h); document.getElementById('btnAway').classList.toggle('active', !h) }
function setWL(w) {
  curWL = w;
  ['btnWin', 'btnTie', 'btnLoss'].forEach(b => document.getElementById(b)?.classList.remove('active'));
  const targetId = w === 'W' ? 'btnWin' : (w === 'T' ? 'btnTie' : 'btnLoss');
  document.getElementById(targetId)?.classList.add('active');
}

function applyLayoutOrder() {
  const order = JSON.parse(localStorage.getItem('hoopStatsLayout')) || ['def', 'off', 'team'];
  const container = document.getElementById('tracker-boards-container');
  if (!container) return;
  order.forEach(id => {
    const wrapper = document.getElementById('wrap-' + id);
    if (wrapper) container.appendChild(wrapper);
  });
}

function updateDefaultTMin(val) {
  document.getElementById('tMin').value = val;
}

function updateLayoutOrder() {
  const order = document.getElementById('layoutOrder').value.split(',');
  localStorage.setItem('hoopStatsLayout', JSON.stringify(order));
  applyLayoutOrder();
}

function toggleVis(row, val) {
  const s = curData.stats.find(x => x.row === row);
  if (s) s.visible = val;
  render(curData);
}

function checkAchievementsAndProtections() {
  if (!curData) return;

  const p2m = curData.stats.find(x => x.name.includes('🎯 2PT Made'))?.count || 0;
  const p2a = curData.stats.find(x => x.name.includes('🏀 2PT Attempt'))?.count || 0;
  const p3m = curData.stats.find(x => x.name.includes('👌 3PT Made'))?.count || 0;
  const p3a = curData.stats.find(x => x.name.includes('🏀 3PT Attempt'))?.count || 0;
  const ftm = curData.stats.find(x => x.name.includes('🥅 FT Made'))?.count || 0;
  const fta = curData.stats.find(x => x.name.includes('🏀 FT Attempt'))?.count || 0;

  const rebounds = curData.stats.find(x => x.name.includes(' Rebounds'))?.count || 0;
  const assists = curData.stats.find(x => x.name.includes('🎁 Assists'))?.count || 0;
  const steals = curData.stats.find(x => x.name.includes('🧤 Steals'))?.count || 0;
  const blocks = curData.stats.find(x => x.name.includes('🚫 Blocks'))?.count || 0;
  const turnovers = curData.stats.find(x => x.name.includes('🤦 Turnovers'))?.count || 0;

  const tfga = curData.stats.find(x => x.name.includes('👥 Team FGA'))?.count || 0;
  const tfta = curData.stats.find(x => x.name.includes('👥 Team FTA'))?.count || 0;
  const tto = curData.stats.find(x => x.name.includes('👥 Team TO'))?.count || 0;

  const pMin = parseInt(document.getElementById('pMin')?.value) || 0;
  const tMin = parseInt(document.getElementById('tMin')) || 32;
  const fga = p2a + p3a;

  let warnings = [];
  if (p2m > p2a) warnings.push("⚠️ 2PT Made exceeds Attempts.");
  if (p3m > p3a) warnings.push("⚠️ 3PT Made exceeds Attempts.");
  if (ftm > fta) warnings.push("⚠️ FT Made exceeds Attempts.");
  if (tfga > 0 && fga > tfga) warnings.push("⚠️ Player FGA exceeds Team FGA.");
  if (tfta > 0 && fta > tfta) warnings.push("⚠️ Player FTA exceeds Team FTA.");
  if (tto > 0 && turnovers > tto) warnings.push("⚠️ Player Turnovers exceed Team Turnovers.");
  if (tMin > 0 && pMin > tMin) warnings.push("⚠️ Player MIN exceeds Team Game MIN.");

  const warnEl = document.getElementById('warnings-container');
  if (warnEl) {
    if (warnings.length > 0) {
      warnEl.innerHTML = warnings.join('<br>');
      warnEl.style.display = "block";
    } else {
      warnEl.style.display = "none";
    }
  }

  const points = (p2m * 2) + (p3m * 3) + ftm;
  const coreCategories = [points, rebounds, assists, steals, blocks];
  const doubleDigitCount = coreCategories.filter(val => val >= 10).length;

  let milestones = [];
  if (doubleDigitCount >= 3) milestones.push("🔥 TRIPLE-DOUBLE COUPLING! 🔥");
  else if (doubleDigitCount === 2) milestones.push("⚡ DOUBLE-DOUBLE RECORDED! ⚡");

  if (points >= 30) milestones.push("🏆 30+ POINT ELITE SCORING TIER! 🏆");
  else if (points >= 20) milestones.push("🎯 20+ POINT SCORING TIER! 🎯");

  const badgeEl = document.getElementById('achievements-container');
  if (badgeEl) {
    if (milestones.length > 0) {
      badgeEl.innerHTML = milestones.join('<br>');
      badgeEl.style.display = "block";
    } else {
      badgeEl.style.display = "none";
    }
  }
}

function recalcTotal() {
  if (!curData) return;
  let t = curData.stats.filter(s => s.formula === null).reduce((s, x) => s + (x.count * x.price), 0);
  document.getElementById('totalVal').innerText = `$${t.toFixed(2)}`;
}

function tally(r, a) {
  const s = curData.stats.find(x => x.row === r);
  if (!s) return;
  s.count = Math.max(0, s.count + a);

  if (a > 0) {
    if (s.name.includes('🎯 2PT Made')) {
      const attRow = curData.stats.find(x => x.name.includes('🏀 2PT Attempt'));
      if (attRow) attRow.count++;
    } else if (s.name.includes('🥅 FT Made')) {
      const attRow = curData.stats.find(x => x.name.includes('🏀 FT Attempt'));
      if (attRow) attRow.count++;
    } else if (s.name.includes('👌 3PT Made')) {
      const attRow = curData.stats.find(x => x.name.includes('🏀 3PT Attempt'));
      if (attRow) attRow.count++;
    }
  }
  render(curData);
}