function setDisplay(id, displayValue) {
  const el = document.getElementById(id);
  if (el) {
    el.style.display = displayValue;
  } else {
    console.warn(`Element with id '${id}' not found. Skipping style update.`);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  console.log("DOM fully loaded - safe to look for IDs");
  // Your initialization code here
});

// ==========================================
// 1. GLOBAL INITIALIZATION
// ==========================================
const supabaseUrl = "https://upgfhekhifolcqiudhzy.supabase.co"; // <-- Replace with your Project URL
const supabaseKey = "sb_publishable_ToMrCjvcOh8FkABvDwcm4g_jcCA_F-U"; // <-- Replace with your Anon Public Key

const bballDb = window.supabase.createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'bball-tracker-auth', // Consistent naming
    // ADD THIS: This clears invalid sessions automatically
    persistSession: true
  },
});

// Force sign out if the session is invalid instead of hanging
bballDb.auth.onAuthStateChange((event, session) => {
  if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
    console.log("Auth State Changed: Session active");
  }
  if (event === 'SIGNED_OUT') {
    console.warn("Auth State Changed: User signed out");
    window.location.reload();
  }
});

let authenticatedUser = null;
let currentFamilyId = null;
let curData = null;
let updateTimer = null;
let isHome = true;
let curWL = "W";
let histData = [];
let pendingSync = false;
let isProcessingAuth = false;

document.addEventListener("DOMContentLoaded", () => {
  console.log("🏀 DOM tree fully constructed.");

  // Existing initialization code (e.g., loading themes, checking sessions)
  checkActiveSession();

  const passwordField = document.getElementById("auth-password");
  if (passwordField) {
    passwordField.addEventListener("keypress", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        handleAuthAction("login");
      }
    });
  }
});

// ==========================================
// 2. IDENTITY & SESSION PORTAL LOGIC
// ==========================================
function showRegister() {
  const keyBox = document.getElementById("auth-access-key");
  if (keyBox) {
    keyBox.style.display = "block";
    document.getElementById("auth-message").innerText =
      "Enter your details and Access Key to register.";
  }
}

function smartRegister() {
  const keyBox = document.getElementById("auth-access-key");
  if (keyBox.style.display === "none" || keyBox.style.display === "") {
    showRegister();
  } else {
    handleAuthAction("signup");
  }
}

// Add a variable to prevent double-clicks
let isProcessing = false;

async function handleAuthAction(type) {
  if (isProcessing) return;
  isProcessing = true;

  const email = document.getElementById("auth-email").value;
  const pass = document.getElementById("auth-password").value;
  updateStatus("Processing...");

  try {
    // 1. Sign In
    const { data, error } = await bballDb.auth.signInWithPassword({ email, password: pass });


    if (error) {
      console.error("Login failed:", error.message);
      // STOP HERE so it doesn't try to fetch the profile
      return;
    }

    // FORCE a refresh to ensure the client acknowledges the session immediately
    await bballDb.auth.refreshSession();

    // 2. Define userId AFTER login succeeds
    const userId = data.session?.user?.id;
    console.log("Fetching profile for:", userId);

    if (!userId) throw new Error("Login succeeded but no user ID found.");
    console.log("Fetching profile for:", userId);

    // 3. Setup the race
    const fetchPromise = bballDb
      .from("profiles")
      .select("family_id")
      .eq("user_id", userId)
      .maybeSingle();

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Database request timed out!")), 5000)
    );

    // 4. Race
    const { data: profile, error: profileError } = await Promise.race([fetchPromise, timeoutPromise]);

    if (profileError) throw profileError;
    if (!profile) throw new Error("Profile not found.");

    currentFamilyId = profile.family_id;
    console.log("Profile fetched. Family ID:", currentFamilyId);

    await loadInitialApplicationState();

    //document.getElementById("auth-overlay").style.display = "none";
    // document.getElementById("main-app-content").style.display = "block";

    setDisplay('auth-overlay', 'none');
    setDisplay('main-app-container', 'block');

  } catch (err) {
    console.error("Critical error:", err);
    updateStatus("Error: " + err.message, true);
  } finally {
    isProcessing = false;
  }
}

// ==========================================
// 3. AUTHENTICATION ENGINE
// ==========================================
bballDb.auth.onAuthStateChange(async (event, session) => {
  if (isProcessingAuth) return;
  isProcessingAuth = true;
  if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
    if (session) await checkActiveSession();
  } else if (event === "SIGNED_OUT") {
    location.reload();
  }
  isProcessingAuth = false;
});

async function checkActiveSession() {
  try {
    const {
      data: { session },
    } = await bballDb.auth.getSession();
    if (session) {
      authenticatedUser = session.user;
      const { data: profile } = await bballDb
        .from("profiles")
        .select("family_id")
        .eq("user_id", authenticatedUser.id)
        .maybeSingle();

      currentFamilyId = profile?.family_id || "default_family";

      //document.getElementById("auth-overlay").style.display = "none";
      //document.getElementById("main-app-content").style.display = "block";

      setDisplay('auth-overlay', 'none');
      setDisplay('main-app-container', 'block');

      await loadInitialApplicationState();
    }
  } catch (err) {
    console.error("Session error: ", err);
  }
}

// ==========================================
// 4. APP LOGIC & RENDERING
// ==========================================
async function loadInitialApplicationState() {
  console.log("Loading app state for family:", currentFamilyId);
  try {
    // 1. Correct destructuring to capture the 'error' object
    let { data: configs, error } = await bballDb
      .from("app_configs")
      .select("stat_name, price, visible")
      .eq("family_id", currentFamilyId)
      .order("id", { ascending: true });

    // 2. Now 'error' is defined and safe to check
    if (error) throw error;
    console.log("Configs loaded:", configs);

    if (!configs || configs.length === 0) {
      console.log("No configs found, upserting defaults...");
      const defaults = [
        { stat_name: "Rebounds", price: 0.25, visible: true, family_id: currentFamilyId },
        { stat_name: "Steals", price: 0.5, visible: true, family_id: currentFamilyId },
        { stat_name: "Assists", price: 0.25, visible: true, family_id: currentFamilyId },
      ];
      await bballDb.from("app_configs").upsert(defaults);

      const { data: reFetched, error: refetchError } = await bballDb
        .from("app_configs")
        .select("*")
        .eq("family_id", currentFamilyId);

      if (refetchError) throw refetchError;
      configs = reFetched;
    }

    curData = {
      opp: "", su: "", st: "", loc: true, res: "W", pm: "", tm: 32,
      stats: (configs || []).map((c, i) => ({
        name: c.stat_name,
        price: Number(c.price),
        count: 0,
        visible: c.visible,
        row: i + 2,
      })),
    };

    render(curData);

    // 3. UI switch logic added here to fix your white page issue
    //document.getElementById("auth-overlay").style.display = "none";
    //document.getElementById("main-app-content").style.display = "block";

    setDisplay('auth-overlay', 'none');
    setDisplay('main-app-container', 'block');

    console.log("UI Switched to main content.");

    const mainContent = document.getElementById("main-app-container");
    console.log("Main container found:", mainContent);

  } catch (err) {
    console.error("CRITICAL UI ERROR:", err);
    updateStatus("Error loading data: " + err.message, true);
  }
}

function render(d) {
  const container = document.getElementById("main-app-container");
  if (!container) return;

  // If the container is empty, inject the tracker UI structure first
  if (container.innerHTML === "") {
    container.innerHTML = `
      <div id="tracker-interface">
        <input type="text" id="opp" placeholder="Opponent">
        <input type="number" id="scoreUs" placeholder="Our Score">
        </div>
    `;
  }

  // Now update the values of the fields you just injected
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || "";
  };
  setVal("opp", d.opp);
  setVal("scoreUs", d.su);
  // ... set the rest of your values
}

function updateStatus(msg, err) {
  const el = document.getElementById("auth-status");
  if (el) {
    el.innerText = msg;
    el.style.color = err ? "red" : "green";
  }
}

function togglePasswordVisibility() {
  const pf = document.getElementById("auth-password");
  if (pf) pf.type = pf.type === "password" ? "text" : "password";
}

// ==========================================
// CORE VIEW CONTROLLER ENGINE
// ==========================================
function switchTab(t) {
  // Correctly hide all page containers safely
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  
  const targetPage = document.getElementById('page-' + t);
  const targetTab = document.getElementById('tab-' + t);
  
  if (targetPage) targetPage.style.display = 'block';
  if (targetTab) targetTab.classList.add('active');
  
  if (t === 'history' && histData.length === 0) loadHistory();
  if (t === 'history' && histData.length > 0) renderHistory();
}

// ==========================================
// DYNAMIC APP CONFIGURATION HANDLING
// ==========================================
async function loadInitialApplicationState() {
  console.log("Loading app state for family:", currentFamilyId);
  try {
    // 1. Query individual config mapping matching template parameters
    let { data: configs, error } = await bballDb
      .from("user_metric_settings")
      .select(`
        visible,
        custom_price,
        global_metric_templates (id, stat_name, section, is_counter, default_price)
      `)
      .eq("family_id", currentFamilyId);

    if (error) throw error;

    // 2. FALLBACK SEED ENGINE: Invoke your database RPC routine directly if configuration rows are missing
    if (!configs || configs.length === 0) {
      console.log("New account detected. Seeding personal settings from global templates via Database RPC...");
      
      const { error: seedError } = await bballDb.rpc('seed_user_default_settings', {
        target_family_id: currentFamilyId,
        target_app_type: 'basketball'
      });

      if (seedError) throw seedError;

      // Re-fetch clean states now that tracking is populated
      return await loadInitialApplicationState();
    }

    // 3. Map complex structural joins down into flat data object rules that your legacy render() expects
    const formattedStats = configs.map((c, index) => ({
      name: c.global_metric_templates.stat_name,
      price: Number(c.custom_price !== null ? c.custom_price : c.global_metric_templates.default_price),
      count: 0,
      visible: c.visible,
      row: c.global_metric_templates.id
    }));

    curData = {
      opp: "", su: "", st: "", loc: true, res: "W", pm: "", tm: 32,
      seasons: ["Season 1"], // Fallback placeholder logic
      stats: formattedStats
    };

    // Trigger local layout generators safely
    render(curData);

    setDisplay('auth-overlay', 'none');
    setDisplay('main-app-container', 'block');
    console.log("UI Switched to main content safely.");

  } catch (err) {
    console.error("CRITICAL UI ERROR:", err);
    updateStatus("Error loading user configurations: " + err.message, true);
  }
}