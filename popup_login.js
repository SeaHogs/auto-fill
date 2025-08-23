
// Get active tab
async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
}

// Inject content script if needed
async function ensureInjected(tabId) {
    try {
        const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => Boolean(window.__AF_CONTENT_READY__)
        });
        if (result) return;
    } catch (_) {}
    
    try {
        await chrome.scripting.executeScript({ 
            target: { tabId }, 
            files: ["crypto.js", "content.js"] 
        });
    } catch (error) {
        console.error("Failed to inject scripts:", error);
        throw error;
    }
}

// Send message to tab
async function sendToTab(type) {
    const tab = await getActiveTab();
    if (!tab?.id) {
        showStatus("No active tab found", "error");
        return;
    }
    
    // Check if it's a restricted URL
    if (tab.url && (
        tab.url.startsWith('chrome://') || 
        tab.url.startsWith('chrome-extension://') ||
        tab.url.startsWith('edge://') ||
        tab.url.startsWith('about:')
    )) {
        showStatus("Cannot run on browser pages. Navigate to a website!", "error");
        return;
    }
    
    try {
        await chrome.tabs.sendMessage(tab.id, { type });
        showStatus("Command sent!", "success");
    } catch (error) {
        console.log("Injecting content script...");
        try {
            await ensureInjected(tab.id);
            await new Promise(resolve => setTimeout(resolve, 100));
            await chrome.tabs.sendMessage(tab.id, { type });
            showStatus("Command sent!", "success");
        } catch (retryError) {
            showStatus("Failed to connect. Try refreshing the page.", "error");
        }
    }
}

// Show status message
function showStatus(message, type = 'info') {
    const statusEl = document.getElementById('statusMessage');
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
    statusEl.style.display = 'block';
    
    setTimeout(() => {
        statusEl.style.display = 'none';
    }, 3000);
}

// ============================================
// LOGIN SYSTEM
// ============================================

async function login(username, password = '') {
    if (!username) {
        showStatus("Please enter a username", "error");
        return;
    }
    
    try {
        showStatus("Logging in...", "info");
        
        // For mock mode, accept any username starting with "mock-"
        if (username.startsWith('mock-')) {
            // Save login state
            await chrome.storage.local.set({
                isLoggedIn: true,
                currentUserId: username,
                loginTime: Date.now()
            });
            
            // Fetch user profile from AWS mock
            await fetchUserProfile(username);
            
            showStatus("Login successful!", "success");
            updateLoginUI();
            
        } else {
            // Real authentication would go here
            showStatus("Use mock-user-123 or mock-user-456 for testing", "error");
        }
        
    } catch (error) {
        console.error("Login error:", error);
        showStatus("Login failed: " + error.message, "error");
    }
}

async function logout() {
    await chrome.storage.local.remove(['isLoggedIn', 'currentUserId', 'loginTime']);
    updateLoginUI();
    showStatus("Logged out", "info");
}

async function fetchUserProfile(userId) {
    console.log(`Fetching profile for ${userId}...`);
    
    // This connects to your AWS mock service
    try {
        // Simulate the AWS service call
        const mockProfiles = {
            'mock-user-123': {
                firstName: 'John',
                lastName: 'Doe',
                fullName: 'John Doe',
                email: 'john.doe@company.com',
                phone: '+1-555-0123',
                birthday: '1990-01-15',
                address1: '123 Tech Street',
                city: 'San Francisco',
                postalCode: '94105',
                country: 'United States',
                university: 'Stanford University',
                degree: 'Bachelor of Science',
                major: 'Computer Science',
                gpa: '3.8',
                gradYear: '2012',
                linkedin: 'https://linkedin.com/in/johndoe',
                github: 'https://github.com/johndoe',
                website: 'https://johndoe.dev',
                summary: 'Senior Software Engineer with expertise in cloud architecture.'
            },
            'mock-user-456': {
                firstName: 'Jane',
                lastName: 'Smith',
                fullName: 'Jane Smith',
                email: 'jane.smith@company.com',
                phone: '+1-555-0456',
                birthday: '1988-05-22',
                address1: '456 Market Street',
                city: 'New York',
                postalCode: '10001',
                country: 'United States',
                university: 'MIT',
                degree: 'Master of Science',
                major: 'Artificial Intelligence',
                gpa: '3.9',
                gradYear: '2010',
                linkedin: 'https://linkedin.com/in/janesmith',
                github: 'https://github.com/janesmith',
                website: 'https://janesmith.io',
                summary: 'AI/ML Engineering Manager with 10+ years experience.'
            }
        };
        
        const profile = mockProfiles[userId] || mockProfiles['mock-user-123'];
        
        // Save the fetched profile to local storage
        await chrome.storage.local.set({
            af_profile: profile,
            lastSyncTime: Date.now(),
            lastSyncSource: 'aws-mock'
        });
        
        console.log('Profile fetched and saved:', profile);
        return profile;
        
    } catch (error) {
        console.error('Failed to fetch profile:', error);
        throw error;
    }
}

async function syncWithAWS() {
    const { currentUserId } = await chrome.storage.local.get(['currentUserId']);
    if (!currentUserId) {
        showStatus("Please login first", "error");
        return;
    }
    
    try {
        showStatus("Syncing with database...", "info");
        await fetchUserProfile(currentUserId);
        showStatus("Profile synced successfully!", "success");
    } catch (error) {
        showStatus("Sync failed: " + error.message, "error");
    }
}

// ============================================
// UI UPDATES
// ============================================

async function updateLoginUI() {
    const { isLoggedIn, currentUserId } = await chrome.storage.local.get(['isLoggedIn', 'currentUserId']);
    
    if (isLoggedIn && currentUserId) {
        // Show logged in state
        document.body.classList.add('is-logged-in');
        
        // Display current user
        document.getElementById('currentUser').textContent = currentUserId;
        
        // Load and display user details
        const { af_profile } = await chrome.storage.local.get(['af_profile']);
        if (af_profile) {
            const details = `${af_profile.fullName || 'No name'} | ${af_profile.email || 'No email'}`;
            document.getElementById('userDetails').textContent = details;
        }
        
    } else {
        // Show logged out state
        document.body.classList.remove('is-logged-in');
    }
}

// ============================================
// EVENT LISTENERS
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    // Update UI based on login state
    await updateLoginUI();
    
    // Login button
    document.getElementById('loginBtn')?.addEventListener('click', () => {
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        login(username, password);
    });
    
    // Enter key to login
    document.getElementById('username')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('loginBtn').click();
        }
    });
    
    document.getElementById('password')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('loginBtn').click();
        }
    });
    
    // Mock user quick login buttons
    document.querySelectorAll('.mock-user-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const userId = btn.dataset.user;
            document.getElementById('username').value = userId;
            document.getElementById('password').value = 'mock';
            login(userId, 'mock');
        });
    });
    
    // Logout button
    document.getElementById('logoutBtn')?.addEventListener('click', logout);
    
    // Fill page button
    document.getElementById('fillBtn')?.addEventListener('click', () => {
        sendToTab("AF_FILL_NOW");
    });
    
    // Sync button
    document.getElementById('syncBtn')?.addEventListener('click', syncWithAWS);
    
    // List fields button
    document.getElementById('listFieldsBtn')?.addEventListener('click', () => {
        sendToTab("AF_LIST_FIELDS");
    });
    
    // Auto-fill toggle
    const autofillToggle = document.getElementById('autofillToggle');
    if (autofillToggle) {
        // Load current state
        chrome.storage.local.get(['af_autoFillEnabled'], ({ af_autoFillEnabled }) => {
            autofillToggle.checked = !!af_autoFillEnabled;
        });
        
        // Save changes
        autofillToggle.addEventListener('change', async () => {
            await chrome.storage.local.set({ af_autoFillEnabled: autofillToggle.checked });
            showStatus(autofillToggle.checked ? "Auto-fill enabled" : "Auto-fill disabled", "info");
        });
    }
    
    // Options link
    document.getElementById('openOptions')?.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.runtime.openOptionsPage();
    });
});

// ============================================
// CHECK LOGIN STATUS ON LOAD
// ============================================

(async function checkLoginStatus() {
    const { isLoggedIn, loginTime } = await chrome.storage.local.get(['isLoggedIn', 'loginTime']);
    
    // Auto-logout after 24 hours
    if (isLoggedIn && loginTime) {
        const hoursSinceLogin = (Date.now() - loginTime) / (1000 * 60 * 60);
        if (hoursSinceLogin > 24) {
            await logout();
            showStatus("Session expired. Please login again.", "info");
        }
    }
})();