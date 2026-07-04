// config.example.js - Template Configuration (Safe for GitHub)
const ENV_CONFIG = {
  local: {
    SUPABASE_URL: "http://127.0.0.1:54321", // Baseline Supabase Local Docker Native Port
    SUPABASE_ANON_KEY: "YOUR_LOCAL_DOCKER_ANON_PUBLIC_KEY" // Safe to include local dev keys
  },
  production: {
    SUPABASE_URL: "YOUR_PRODUCTION_SUPABASE_URL",         // Leave blank or as a placeholder
    SUPABASE_ANON_KEY: "YOUR_PRODUCTION_SUPABASE_ANON_KEY" // Leave blank or as a placeholder
  }
};

function getEnvironmentConfig() {
  const isLocalhost = 
    window.location.hostname === "localhost" || 
    window.location.hostname === "127.0.0.1" || 
    window.location.hostname.startsWith("192.168.");

  if (isLocalhost) {
    console.log("🔌 Connected to Local Docker Dev Environment Node");
    return ENV_CONFIG.local;
  }
  
  return ENV_CONFIG.production;
}