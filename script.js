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
  console.log("Fetching profile for user ID:", userId);
  try {
    let { data: profile, error } = await bballDb
      .from('profiles') 
      .select('family_id')
      .eq('user_id', userId) 
      .maybeSingle();

    if (!error && profile) {
      currentFamilyId = profile.family_id;
    }
    console.log("Profile mapped. Family ID:", currentFamilyId);
    await loadInitialApplicationState();
  } catch (err) {
    console.error("Profile Fetch Warning:", err);
    await loadInitialApplicationState(); 
  }
}

// ==========================================
// INITIAL APPLICATION DATA POPULATION ENGINE
// ==========================================
async function loadInitialApplicationState() {
  console.log("Loading app state for family:", currentFamilyId);
  try {
    let { data: configs, error } = await bballDb
      .from("user_metric_settings")
      .select(`
        visible,
        custom_price,
        global_metric_templates (id, stat_name, section, is_counter, default_price, report_group, report_sort_order, color_theme, formula)
      `)
      .eq("family_id", currentFamilyId)
      .eq("global_metric_templates.app_type", "basketball:solo"); 

    if (error) throw error;

    if (!configs || configs.length === 0) {
      console.log("New account detected. Seeding personal settings from global templates...");
      
      const { error: seedError } = await bballDb.rpc('seed_user_default_settings', {
        target_family_id: currentFamilyId,
        target_app_type: 'basketball:solo'
      });

      if (seedError) throw seedError;
      return await loadInitialApplicationState();
    }

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
      seasons: ["Season 1"],
      stats: formattedStats
    };

    render(curData);

    document.getElementById('auth-overlay').style.display = 'none';
    document.getElementById('main-app-container').style.display = 'block';
    console.log("Application initialization sequence parsed cleanly.");

  } catch (err) {
    console.error("CRITICAL CONFIGURATION MAP LOOP FAILURE:", err);
    updateStatus("Error parsing configuration: " + err.message, true);
  }
}

// ==========================================
// CORE LAYOUT GENERATION & INTERFACE FILTERS
// ==========================================
function render(d) {
  curData = d;
  document.getElementById('opp').value = d.opp || "";
  setLoc(d.loc); 
  setWL(d.res);
  document.getElementById('scoreUs').value = d.su || "";
  document.getElementById('scoreThem').value = d.st || "";
  document.getElementById('pMin').value = d.pm || "";
  document.getElementById('tMin').value = d.tm || "32";
  if(document.getElementById('defaultTMin')) document.getElementById('defaultTMin').value = d.tm || "32";
  
  const dl = document.getElementById('seasonList');
  if (dl) {
    dl.innerHTML = d.seasons.map(s => `<option value="${s}">`).join('');
  }
  if (!document.getElementById('season').value && d.seasons.length > 0) {
    document.getElementById('season').value = d.seasons[d.seasons.length - 1];
  }

  // Pre-calculate math templates before building innerHTML panels
  calculateDynamicFormulas();

  document.getElementById('board-def').innerHTML = d.stats.filter(s => s.section === 'defense' && s.visible).map(rowHTML).join('');
  document.getElementById('board-off').innerHTML = d.stats.filter(s => s.section === 'offense' && s.visible).map(rowHTML).join('');
  document.getElementById('board-team').innerHTML = d.stats.filter(s => s.section === 'team' && s.visible).map(rowHTML).join('');

  // Dynamically append the advanced evaluation metrics if they are toggled to show
  const advBoard = document.getElementById('board-advanced');
  if (advBoard) {
    advBoard.innerHTML = d.stats.filter(s => s.section === 'advanced' && s.visible).map(rowHTML).join('');
  } else if (d.stats.filter(s => s.section === 'advanced' && s.visible).length > 0) {
    // If wrapping div isn't there, append cleanly beneath team boards wrapper container safely
    let targetWrap = document.getElementById('tracker-boards-container');
    if (targetWrap) {
      let checkExist = document.getElementById('wrap-advanced');
      if (!checkExist) {
        let advContainerHTML = `
          <div id="wrap-advanced">
            <div class="section-title">📊 Advanced Metrics</div>
            <div class="tracker-list list-advanced" id="board-advanced"></div>
          </div>`;
        targetWrap.insertAdjacentHTML('beforeend', advContainerHTML);
        document.getElementById('board-advanced').innerHTML = d.stats.filter(s => s.section === 'advanced' && s.visible).map(rowHTML).join('');
      }
    }
  }

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
  const isTeamOrAdv = s.section === 'team' || s.section === 'advanced';
  const countDisplay = s.section === 'advanced' ? s.count.toFixed(1) + (s.name.includes('%') ? '%' : '') : s.count;
  
  const moneyHTML = isTeamOrAdv ? '' : `
    <div class="t-money">
      <div class="t-price" style="color:${s.colorTheme}; font-weight:bold;" id="price-${s.row}" onclick="editPrice(${s.row},'${s.name.replace(/'/g, "\\'")}',${s.price})">$${s.price.toFixed(2)} ea</div>
      <span class="t-sub" id="sub-${s.row}">$${(s.count * s.price).toFixed(2)}</span>
    </div>`;

  const controlButtonsHTML = !s.isCounter ? `
    <div class="t-controls" style="justify-content:center; width:90px; color:${s.colorTheme}; font-weight:bold; font-size:1.1rem;">📊 Calc</div>` : `
    <div class="t-controls">
      <button class="btn-c btn-m" onclick="tally(${s.row},-1)">-</button>
      <div class="t-count" id="c-${s.row}">${countDisplay}</div>
      <button class="btn-c btn-p" onclick="tally(${s.row},1)">+</button>
    </div>`;

  return `
    <div class="t-row" style="border-left: 4px solid ${s.colorTheme};">
      ${controlButtonsHTML}
      <div class="t-stat" style="font-weight:500;">${s.name}</div>
      ${moneyHTML}
    </div>`;
}

// ==========================================
// SPORT-AGNOSTIC LIVE CALCULATION ENGINE
// ==========================================
function calculateDynamicFormulas() {
  if (!curData) return;

  const formulaStats = curData.stats.filter(s => s.formula !== null);
  const pMin = parseFloat(document.getElementById('pMin')?.value) || 0;
  const tMin = parseFloat(document.getElementById('tMin')?.value) || 32;

  formulaStats.forEach(fStat => {
    let equation = fStat.formula;

    // Substitute specific layout environment parameters
    equation = equation.replaceAll('$pMin', pMin);
    equation = equation.replaceAll('$tMin', tMin);

    // Substitute standard count keys
    curData.stats.forEach(s => {
      equation = equation.replaceAll(`[${s.name}]`, s.count);
    });

    // Safely check for divide by zero markers or format crashes
    if (equation.includes('NULLIF(')) {
      equation = cleanPostgresNullifSyntax(equation);
    }

    try {
      let result = eval(equation);
      fStat.count = isFinite(result) && !isNaN(result) ? result : 0;
    } catch (e) {
      fStat.count = 0;
    }
  });
}

function cleanPostgresNullifSyntax(eq) {
  // Simple regex processor to patch standard SQL NULLIF text mappings to JavaScript evaluations
  // e.g., NULLIF(x, 0) transforms directly into: (x === 0 ? Infinity : x)
  return eq.replace(/NULLIF\(([^,]+),\s*([^)]+)\)/g, '($1 === $2 ? NaN : $1)');
}

// ==========================================
// DYNAMIC SPORT-AGNOSTIC DATA LOGS INTERFACE
// ==========================================
async function loadHistory() {
  const historyBody = document.getElementById('history-body');
  if (historyBody) {
    historyBody.innerHTML = '<tr><td colspan="40" style="padding:20px;text-align:center;">Loading Game Logs...</td></tr>';
  }
  
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
      (g.game_stat_values || []).forEach(sv => {
        statsMap[sv.template_id] = sv.stat_value;
      });

      return {
        sheetRow: g.id, 
        date: g.game_date, 
        season: g.season || "Season 1",
        opp: g.opponent,
        loc: g.location === "Home" ? "H" : "A",
        res: g.result,
        su: g.score_us,
        st: g.score_them,
        min: g.player_minutes,
        tmin: g.team_minutes,
        money: Number(g.total_payout || 0),
        isDel: g.is_deleted || false,
        rawStats: statsMap 
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
    console.error("History Loading Error:", err);
    if (historyBody) {
      historyBody.innerHTML = `<tr><td colspan="40" style="color:red;text-align:center;">Error: ${err.message}</td></tr>`;
    }
  }
}

function renderHistory() {
  const body = document.getElementById('history-body');
  const head = document.getElementById('history-head');
  if (!body || !head) return;

  const showDel = document.getElementById('showDel')?.checked || false;
  const activeSeason = document.getElementById('seasonFilter')?.value;

  const filtered = histData.filter(g => {
    if (g.isDel !== showDel) return false;
    if (activeSeason && g.season !== activeSeason) return false;
    return true;
  });

  const visibleTemplates = curData.stats.filter(s => s.visible);
  const reportingGroups = [...new Set(visibleTemplates.map(s => s.reportGroup))];

  let topRowHTML = `<tr style="background:#2c3e50; color:white;"><th rowspan="2" style="vertical-align:middle; padding:10px;">Game Logs</th><th colspan="8" style="text-align:center; background:#2980b9;">Universal Match Data</th>`;
  let subRowHTML = `<tr style="background:#f2f4f4; font-size:0.85rem;"><th>Date</th><th>Season</th><th>Opponent</th><th>Loc</th><th>Res</th><th>Our</th><th>Opp</th><th>MIN</th>`;

  reportingGroups.forEach(groupName => {
    const groupStats = visibleTemplates.filter(s => s.reportGroup === groupName);
    if (groupStats.length > 0) {
      // Pull group thematic coloring cleanly out of database values index
      const groupColor = groupStats[0].colorTheme;
      topRowHTML += `<th colspan="${groupStats.length}" style="text-align:center; background:${groupColor}; border-left:1px solid #fff;">${groupName}</th>`;
      groupStats.forEach(s => {
        subRowHTML += `<th style="color:${s.colorTheme}; border-bottom:2px solid ${s.colorTheme}; font-weight:600; padding:6px; min-width:65px;">${s.name.split(' ')[1] || s.name}</th>`;
      });
    }
  });

  topRowHTML += `<th rowspan="2" style="background:#27ae60; vertical-align:middle; text-align:center;">Payout</th></tr>`;
  subRowHTML += `</tr>`;
  head.innerHTML = topRowHTML + subRowHTML;

  if (filtered.length === 0) {
    body.innerHTML = `<tr><td colspan="50" style="padding:15px;text-align:center;color:#7f8c8d;">No box score logs found.</td></tr>`;
    return;
  }

  body.innerHTML = filtered.map(g => {
    let statsColumnsHTML = '';
    
    // Simulate current state values to resolve calculated formulas dynamically on log histories arrays
    const histStatsInstance = curData.stats.map(s => ({
      name: s.name, count: g.rawStats[s.row] !== undefined ? g.rawStats[s.row] : 0, formula: s.formula
    }));

    // Re-run evaluation processor on historic object snapshots
    const formulaStats = histStatsInstance.filter(s => s.formula !== null);
    formulaStats.forEach(fStat => {
      let equation = fStat.formula.replaceAll('$pMin', g.min).replaceAll('$tMin', g.tmin);
      histStatsInstance.forEach(s => { equation = equation.replaceAll(`[${s.name}]`, s.count); });
      if (equation.includes('NULLIF(')) equation = cleanPostgresNullifSyntax(equation);
      try { let res = eval(equation); fStat.count = isFinite(res) && !isNaN(res) ? res : 0; } catch(e) { fStat.count = 0; }
    });

    reportingGroups.forEach(groupName => {
      const groupStats = visibleTemplates.filter(s => s.reportGroup === groupName);
      groupStats.forEach(s => {
        const matchingInstance = histStatsInstance.find(x => x.name === s.name);
        let displayVal = matchingInstance ? matchingInstance.count : 0;
        let formattedStr = s.section === 'advanced' ? displayVal.toFixed(1) + (s.name.includes('%') ? '%' : '') : displayVal;
        
        statsColumnsHTML += `<td style="font-weight:500; text-align:center; background:#fff; border-left:1px solid #f2f4f4;">${formattedStr}</td>`;
      });
    });

    return `
      <tr style="border-bottom:1px solid #e5e8e8; font-size:0.9rem; text-align:center;">
        <td style="font-weight:bold; white-space:nowrap; text-align:left; padding:8px;">${g.date}</td>
        <td style="color:#7f8c8d;">${g.season}</td>
        <td style="text-align:left; font-weight:500; color:#2c3e50;">${g.opp}</td>
        <td><span style="font-weight:bold; padding:2px 6px; border-radius:4px; font-size:0.75rem; background:${g.loc==='H'?'#e8f4f8':'#fcf3cf'}; color:${g.loc==='H'?'#2980b9':'#f39c12'};">${g.loc}</span></td>
        <td><span style="font-weight:bold; color:${g.res==='W'?'#27ae60':(g.res==='L'?'#c0392b':'#7f8c8d')}">${g.res}</span></td>
        <td>${g.su}</td>
        <td>${g.st}</td>
        <td>${g.min}</td>
        ${statsColumnsHTML}
        <td style="font-weight:bold; color:#27ae60; background:#f4fbf7; padding:8px;">$${g.money.toFixed(2)}</td>
      </tr>`;
  }).join('');
}

async function saveGame() {
  const button = document.querySelector('.save-btn');
  if (button) { button.disabled = true; button.innerText = "SAVING..."; }

  try {
    const getI = (id) => document.getElementById(id)?.value || "";
    const totalPayout = curData.stats.reduce((sum, x) => sum + (x.count * x.price), 0);

    const logHeader = {
      family_id: currentFamilyId,
      game_date: getI('gameDate'),
      season: getI('season') || "Season 1",
      opponent: getI('opp') || "Unknown Opponent",
      location: isHome ? "Home" : "Away",
      result: curWL,
      score_us: parseInt(getI('scoreUs')) || 0,
      score_them: parseInt(getI('scoreThem')) || 0,
      player_minutes: parseInt(getI('pMin')) || 0,
      team_minutes: parseInt(getI('tMin')) || 32,
      total_payout: totalPayout,
      is_deleted: false
    };

    const { data: savedHeader, error: headerError } = await bballDb
      .from('game_logs')
      .insert([logHeader])
      .select('id')
      .single();

    if (headerError) throw headerError;
    const generatedLogId = savedHeader.id;

    // Filters out calculation elements since advanced formulas generate dynamically on readings
    const rawCountersOnly = curData.stats.filter(s => s.formula === null);

    const valuesPayload = rawCountersOnly.map(s => ({
      game_log_id: generatedLogId,
      template_id: s.row, 
      stat_value: s.count
    }));

    const { error: valuesError } = await bballDb
      .from('game_stat_values')
      .insert(valuesPayload);

    if (valuesError) throw valuesError;

    alert("Box score logged successfully!");
    resetTracker();
    await loadHistory();
  } catch (err) {
    console.error("Data Write Failure Transaction Aborted:", err);
    alert("Failed to save box score: " + err.message);
  } finally {
    if (button) { button.disabled = false; button.innerText = "SAVE"; }
  }
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

// ==========================================
// NAVIGATION UTILITIES & APP VIEW ENGINE
// ==========================================
function switchTab(t) {
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  
  const targetPage = document.getElementById('page-' + t);
  const targetTab = document.getElementById('tab-' + t);
  
  if (targetPage) targetPage.style.display = 'block';
  if (targetTab) targetTab.classList.add('active');
  
  if (t === 'history' && histData.length === 0) loadHistory();
  if (t === 'history' && histData.length > 0) renderHistory();
}

function autoWL(){
  const u = parseInt(document.getElementById('scoreUs').value), t = parseInt(document.getElementById('scoreThem').value);
  if(!isNaN(u) && !isNaN(t)) setWL(u > t ? 'W' : (u < t ? 'L' : 'T'));
  triggerSync();
}

function setLoc(h){isHome=h;document.getElementById('btnHome').classList.toggle('active',h);document.getElementById('btnAway').classList.toggle('active',!h)}

function setWL(w){
  curWL=w;
  ['btnWin','btnTie','btnLoss'].forEach(b => {
    const el = document.getElementById(b);
    if (el) el.classList.remove('active');
  });
  
  const targetId = w === 'W' ? 'btnWin' : (w === 'T' ? 'btnTie' : 'btnLoss');
  const targetEl = document.getElementById(targetId);
  if (targetEl) targetEl.classList.add('active');
}

function updateDefaultTMin(val) {
  document.getElementById('tMin').value = val;
  triggerSync();
}

function updateLayoutOrder() {
  const order = document.getElementById('layoutOrder').value.split(',');
  localStorage.setItem('hoopStatsLayout', JSON.stringify(order));
  applyLayoutOrder();
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

function recalcTotal() {
  if (!curData) return;
  let t = curData.stats.reduce((s, x) => s + (x.count * x.price), 0);
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

  // Dynamically re-trigger math parser equations values
  calculateDynamicFormulas();
  render(curData);
}

// FIXED: Patch inline template attributes handlers dependencies
function checkAchievementsAndProtections() {
  if (!curData) return;
  
  const p2m = curData.stats.find(x => x.name.includes('🎯 2PT Made'))?.count || 0;
  const p2a = curData.stats.find(x => x.name.includes('🏀 2PT Attempt'))?.count || 0;
  const p3m = curData.stats.find(x => x.name.includes('👌 3PT Made'))?.count || 0;
  const p3a = curData.stats.find(x => x.name.includes('🏀 3PT Attempt'))?.count || 0;
  const ftm = curData.stats.find(x => x.name.includes('🥅 FT Made'))?.count || 0;
  const fta = curData.stats.find(x => x.name.includes('🏀 FT Attempt'))?.count || 0;
  
  const rebounds = curData.stats.find(x => x.name.includes('🏀 Rebounds'))?.count || 0;
  const assists = curData.stats.find(x => x.name.includes('🎁 Assists'))?.count || 0;
  const steals = curData.stats.find(x => x.name.includes('🧤 Steals'))?.count || 0;
  const blocks = curData.stats.find(x => x.name.includes('🚫 Blocks'))?.count || 0;
  const turnovers = curData.stats.find(x => x.name.includes('🤦 Turnovers'))?.count || 0;

  const tfga = curData.stats.find(x => x.name.includes('👥 Team FGA'))?.count || 0;
  const tfta = curData.stats.find(x => x.name.includes('👥 Team FTA'))?.count || 0;
  const tto = curData.stats.find(x => x.name.includes('👥 Team TO'))?.count || 0;

  const pMin = parseInt(document.getElementById('pMin')?.value) || 0;
  const tMin = parseInt(document.getElementById('tMin')?.value) || 32;
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

function toggleVis(row, val) {
  const s = curData.stats.find(x => x.row === row);
  if (s) s.visible = val;
  render(curData);
}

function triggerSync() { calculateDynamicFormulas(); checkAchievementsAndProtections(); }
function editPrice() {}
function commitGameEdit() {}
function closeEditModal() {}