// auth.js — demo-only localStorage auth (signup/login/logout + forgot/reset)
const Auth = (() => {
    const LS_USERS  = "ai_auth_users";        // [{ name, email, password }]
    const LS_SESSION= "ai_auth_session";      // { email, name }
    const LS_RESET  = "ai_auth_reset_tokens"; // { token: { email, exp } }
  
    // ---------- user store ----------
    function getUsers(){
      try { return JSON.parse(localStorage.getItem(LS_USERS)) || []; }
      catch { return []; }
    }
    function saveUsers(users){ localStorage.setItem(LS_USERS, JSON.stringify(users)); }
  
    // ---------- session ----------
    function isLoggedIn(){ return !!localStorage.getItem(LS_SESSION); }
    function getSession(){ return JSON.parse(localStorage.getItem(LS_SESSION) || "null"); }
    function logout(){ localStorage.removeItem(LS_SESSION); }
  
    // ---------- signup / login ----------
    async function signup({name, email, password}){
      const users = getUsers();
      if (users.find(u => u.email.toLowerCase() === email.toLowerCase()))
        throw new Error("An account with this email already exists.");
    
      const enc = btoa(unescape(encodeURIComponent(password)));
      users.push({ name, email, password: enc });
      saveUsers(users);
    
      // create session immediately after signup
      localStorage.setItem(LS_SESSION, JSON.stringify({ email, name }));
    
      // 🔥 NEW: log a "login" analytics event for this new user
      try {
        await fetch("http://127.0.0.1:8000/api/analytics/log-event/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "login", email }),
        });
      } catch (e) {
        console.warn("Failed to log signup/login analytics:", e);
      }
    }
    
  
    async function login(email, password){
      const users = getUsers();
      const user = users.find(u => u.email.toLowerCase() === (email||"").toLowerCase());
      const enc = btoa(unescape(encodeURIComponent(password)));
      if (!user || user.password !== enc) throw new Error("Invalid email or password.");
      localStorage.setItem(LS_SESSION, JSON.stringify({ email: user.email, name: user.name }));

      try {
        await fetch("http://127.0.0.1:8000/api/analytics/log-event/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "login", email: user.email }),
        });
      } catch (e) {
        console.warn("Failed to log login analytics:", e);
      }
    }
  
    // ---------- reset token store ----------
    function getResetStore(){
      try { return JSON.parse(localStorage.getItem(LS_RESET)) || {}; }
      catch { return {}; }
    }
    function saveResetStore(obj){ localStorage.setItem(LS_RESET, JSON.stringify(obj)); }
    function makeToken(){
      const rnd = crypto.getRandomValues(new Uint8Array(16));
      return Array.from(rnd, b => b.toString(16).padStart(2,'0')).join('');
    }
  
    // ---------- forgot / reset (demo) ----------
    function startPasswordReset(email){
      const users = getUsers();
      const user = users.find(u => u.email.toLowerCase() === (email||"").toLowerCase());
      if(!user) throw new Error("No account found for that email.");
      const token = makeToken();
      const exp = Date.now() + 20*60*1000; // 20 minutes
      const store = getResetStore();
      store[token] = { email: user.email, exp };
      saveResetStore(store);
      return token; // show link in UI for demo
    }
  
    function verifyResetToken(token){
      if(!token) throw new Error("Missing reset token.");
      const store = getResetStore();
      const entry = store[token];
      if(!entry) throw new Error("Invalid or expired link.");
      if(Date.now() > entry.exp){
        delete store[token]; saveResetStore(store);
        throw new Error("Reset link has expired.");
      }
      return { email: entry.email };
    }
  
    function completePasswordReset(token, newPassword){
      const store = getResetStore();
      const entry = store[token];
      if(!entry) throw new Error("Invalid or expired link.");
      if(Date.now() > entry.exp){
        delete store[token]; saveResetStore(store);
        throw new Error("Reset link has expired.");
      }
      const users = getUsers();
      const idx = users.findIndex(u => u.email.toLowerCase() === entry.email.toLowerCase());
      if(idx === -1) throw new Error("Account not found.");
      const enc = btoa(unescape(encodeURIComponent(newPassword)));
      users[idx].password = enc;
      saveUsers(users);
      delete store[token]; // one-time use
      saveResetStore(store);
    }
  
    // ---------- EXPORT everything you need ----------
    return {
      signup, login, logout, isLoggedIn, getSession,
      startPasswordReset, verifyResetToken, completePasswordReset
    };
  })();
  