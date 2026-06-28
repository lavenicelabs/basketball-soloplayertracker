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
        global_metric_templates (id, stat_name, section, is_counter, default_price)
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

    configs.sort((a, b) => a.global_metric_templates.id - b.global_metric_templates.id);

    const formattedStats = configs.map((c) => ({
      name: c.global_metric_templates.stat_name,
      price: Number(c.custom_price !== null ? c.custom_price : c.global_metric_templates.default_price),
      count: 0,
      visible: c.visible,
      row: c.global_metric_templates.id,
      section: c.global_metric_templates.section
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
  if (document.getElementById('defaultTMin')) document.getElementById('defaultTMin').value = d.tm || "32";

  const dl = document.getElementById('seasonList');
  if (dl) {
    dl.innerHTML = d.seasons.map(s => `<option value="${s}">`).join('');
  }
  if (!document.getElementById('season').value && d.seasons.length > 0) {
    document.getElementById('season').value = d.seasons[d.seasons.length - 1];
  }

  document.getElementById('board-def').innerHTML = d.stats.filter(s => s.section === 'defense' && s.visible).map(rowHTML).join('');
  document.getElementById('board-off').innerHTML = d.stats.filter(s => s.section === 'offense' && s.visible).map(rowHTML).join('');
  document.getElementById('board-team').innerHTML = d.stats.filter(s => s.section === 'team' && s.visible).map(rowHTML).join('');

  const settingsContainer = document.getElementById('settings-list');
  if (settingsContainer) {
    settingsContainer.innerHTML = d.stats.map(s => `
      <div class="toggle-row">
        <span style="font-weight:bold;">${s.name}</span>
        <label><input type="checkbox" ${s.visible ? 'checked' : ''} onchange="toggleVis(${s.row}, this.checked)"> Show</label>
      </div>`).join('');
  }

  recalcTotal();
  checkAchievementsAndProtections();
  applyLayoutOrder();
}

function rowHTML(s) {
  const isTeam = s.section === 'team';
  const moneyHTML = isTeam ? '' : `
    <div class="t-money">
      <div class="t-price" id="price-${s.row}" onclick="editPrice(${s.row},'${s.name.replace(/'/g, "\\'")}',${s.price})">$${s.price.toFixed(2)} ea</div>
      <span class="t-sub" id="sub-${s.row}">$${(s.count * s.price).toFixed(2)}</span>
    </div>`;
  return `
    <div class="t-row">
      <div class="t-controls">
        <button class="btn-c btn-m" onclick="tally(${s.row},-1)">-</button>
        <div class="t-count" id="c-${s.row}">${s.count}</div>
        <button class="btn-c btn-p" onclick="tally(${s.row},1)">+</button>
      </div>
      <div class="t-stat">${s.name}</div>
      ${moneyHTML}
    </div>`;
}

// ==========================================
// APP LOGS HISTORY AND ARCHIVE MANAGER
// ==========================================
async function loadHistory() {
  const historyBody = document.getElementById('history-body');
  if (historyBody) {
    historyBody.innerHTML = '<tr><td colspan="40" style="padding:20px;text-align:center;">Loading Game Logs...</td></tr>';
  }

  try {
    // FIXED: Queries order dynamically using 'game_date' instead of non-existent 'date'
    let { data: games, error } = await bballDb
      .from("app_history")
      .select("*")
      .eq("family_id", currentFamilyId)
      .order("game_date", { ascending: false });

    if (error) throw error;

    histData = (games || []).map(g => ({
      sheetRow: g.id,
      date: g.game_date, // Mapped accurately to column definition
      season: g.season || "Season 1",
      opp: g.opponent,
      loc: g.location === "Home" ? "H" : "A",
      res: g.result,
      su: g.score_us,
      st: g.score_them,
      min: g.player_minutes,
      tmin: g.team_minutes,
      money: Number(g.total_payout || 0),
      reb: g.rebounds || 0,
      stl: g.steals || 0,
      def: g.deflections || 0,
      jmp: g.jump_balls || 0,
      blk: g.blocks || 0,
      cont: g.contested_shots || 0,
      scrn: g.screens_set || 0,
      chg: g.charges_drawn || 0,
      p2m: g.two_pm || 0,
      p2a: g.two_pa || 0,
      ftm: g.ft_m || 0,
      fta: g.ft_a || 0,
      ptm3: g.three_pm || 0,
      pta3: g.three_pa || 0,
      ast: g.assists || 0,
      to: g.turnovers || 0,
      tfga: g.team_fga || 0,
      tfta: g.team_fta || 0,
      tto: g.team_to || 0,
      isDel: g.is_deleted || false
    }));

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

function autoWL() {
  const u = parseInt(document.getElementById('scoreUs').value), t = parseInt(document.getElementById('scoreThem').value);
  if (!isNaN(u) && !isNaN(t)) setWL(u > t ? 'W' : (u < t ? 'L' : 'T'));
  triggerSync();
}

function setLoc(h) { isHome = h; document.getElementById('btnHome').classList.toggle('active', h); document.getElementById('btnAway').classList.toggle('active', !h) }

function setWL(w) {
  curWL = w;
  ['btnWin', 'btnTie', 'btnLoss'].forEach(b => {
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
  document.getElementById(`c-${r}`).innerText = s.count;

  if (a > 0) {
    if (s.name.includes('🎯 2PT Made')) {
      const attRow = curData.stats.find(x => x.name.includes('🏀 2PT Attempt'));
      if (attRow) { attRow.count++; document.getElementById(`c-${attRow.row}`).innerText = attRow.count; }
    } else if (s.name.includes('🥅 FT Made')) {
      const attRow = curData.stats.find(x => x.name.includes('🏀 FT Attempt'));
      if (attRow) { attRow.count++; document.getElementById(`c-${attRow.row}`).innerText = attRow.count; }
    } else if (s.name.includes('👌 3PT Made')) {
      const attRow = curData.stats.find(x => x.name.includes('🏀 3PT Attempt'));
      if (attRow) { attRow.count++; document.getElementById(`c-${attRow.row}`).innerText = attRow.count; }
    }
  }

  if (s.section !== 'team') {
    document.getElementById(`sub-${r}`).innerText = `$${(s.count * s.price).toFixed(2)}`;
    curData.stats.forEach(x => {
      const el = document.getElementById(`sub-${x.row}`);
      if (el && x.section !== 'team') el.innerText = `$${(x.count * x.price).toFixed(2)}`;
    });
  }
  recalcTotal();
  checkAchievementsAndProtections();
}

// ==========================================
// DATA PROTECTION ENGINE & MILESTONE BROADCASTER
// ==========================================
function checkAchievementsAndProtections() {
  if (!curData) return;

  // 1. EXTRACT RAW COUNTS FOR LOGIC VALIDATION
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

  // 2. RESTORED: Core Business Rules Protection Logic Warnings Array
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

  // 3. RESTORED: Comprehensive Multi-Tier Milestone Aggregator Panel
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

function triggerSync() { checkAchievementsAndProtections(); }
function renderHistory() { }