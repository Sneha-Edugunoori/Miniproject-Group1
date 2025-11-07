// Fixed API base URL - use relative paths for same-origin requests
const API_BASE_URL = '';  // Use empty string for relative URLs

// Navigation functionality
function showContent(sectionId) {
    // Hide all content sections
    const allSections = document.querySelectorAll('.dashboard-content, .manage-accounts');
    allSections.forEach(section => section.classList.remove('active'));

    // Show selected section
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add('active');
    }

    // Update active menu item
    const allMenuItems = document.querySelectorAll('.menu-item');
    allMenuItems.forEach(item => item.classList.remove('active'));

    const activeMenuItem = document.querySelector(`[data-section="${sectionId}"]`);
    if (activeMenuItem) {
        activeMenuItem.classList.add('active');
    }

    // Close sidebar on mobile after selection
    if (window.innerWidth <= 768) {
        toggleSidebar();
    }

    // Load section-specific data
    loadSectionData(sectionId);
}

// Enhanced navigation with route handling
function navigateToPage(page) {
    switch (page) {
        case 'dashboard':
            // Stay on current dashboard page
            showContent('dashboard');
            break;
        case 'loan':
        case 'lrs':
            // Navigate to loan recommendation system
            window.location.href = '/lrs';
            break;
        case 'emi':
            // Navigate to EMI calculator
            window.location.href = '/emi';
            break;
        case 'payments':
            // Navigate to payments page
            window.location.href = '/payments';
            break;
        case 'digilocker':
        case 'digi':
            // Navigate to digilocker
            window.location.href = '/digi';
            break;
        case 'chatbot':
        case 'cb':
            // Navigate to chatbot
            window.location.href = '/cb';
            break;
        case 'profile':
            // Show profile section or navigate to profile page
            if (document.getElementById('profile')) {
                showContent('profile');
            } else {
                window.location.href = '/profile';
            }
            break;
        case 'logout':
            // Call logout function
            logout();
            break;
        default:
            console.warn(`Unknown page: ${page}`);
            break;
    }
}

// Toggle sidebar for mobile
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.toggle('open');
    }
}

// Toggle balance visibility
function toggleBalance(balanceId) {
    const balanceElement = document.getElementById(balanceId);
    if (!balanceElement) return;
    
    const button = balanceElement.nextElementSibling;
    
    if (balanceElement.style.filter === 'blur(5px)') {
        balanceElement.style.filter = 'none';
        if (button) button.textContent = 'Hide';
    } else {
        balanceElement.style.filter = 'blur(5px)';
        if (button) button.textContent = 'Show';
    }
}

// View account details
function viewDetails(bankName) {
    showLoading();
    
    // Simulate API call for account details
    setTimeout(() => {
        hideLoading();
        alert(`Viewing detailed information for ${bankName} account.\n\nThis would typically show:\n• Transaction history\n• Account statements\n• Monthly summaries\n• Download options`);
    }, 1500);
}

// Enhanced chatbot functionality - now connects to actual route
function openChatbot() {
    // Navigate to the actual chatbot page
    window.location.href = '/cb';
}

// Quick access functions for common actions
function quickLoanApplication() {
    window.location.href = '/lrs';
}

function quickEMICalculator() {
    window.location.href = '/emi';
}

function quickPayments() {
    window.location.href = '/payments';
}

function quickDigiLocker() {
    window.location.href = '/digi';
}

// Enhanced authentication check
async function checkAuthentication() {
    try {
        const response = await fetch(`/check-auth`, {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            console.log('Authentication check failed:', response.status);
            return false;
        }
        
        const data = await response.json();
        return data.authenticated === true;
        
    } catch (error) {
        console.error('Auth check error:', error);
        return false;
    }
}

// Enhanced load user data with better error handling
async function loadUserData() {
    try {
        showLoading();
        hideError();
        
        // First check if user is authenticated
        const isAuth = await checkAuthentication();
        if (!isAuth) {
            console.log('User not authenticated, redirecting to login');
            window.location.href = '/login';
            return;
        }
        
        console.log('Fetching dashboard data...');
        const response = await fetch(`/api/dashboard-data`, {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                console.log('User not authenticated, redirecting to login');
                window.location.href = '/login';
                return;
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('Dashboard data received:', data);
        
        if (data.user && data.banking_data) {
            populateDashboard(data.user, data.banking_data);
        } else {
            console.warn('Incomplete data received:', data);
            showError('Incomplete data received from server');
        }
        
    } catch (error) {
        console.error('Error loading user data:', error);
        showError(`Failed to load dashboard data: ${error.message}`);
    } finally {
        hideLoading();
    }
}

// Enhanced logout with better error handling
async function logout() {
    if (!confirm('Are you sure you want to logout?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/logout`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        // Always redirect regardless of response
        window.location.href = '/';
        
    } catch (error) {
        console.error('Logout error:', error);
        // Force logout even if server request fails
        window.location.href = '/';
    }
}

// Loading state management
function showLoading() {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.style.display = 'block';
    }
}

function hideLoading() {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.style.display = 'none';
    }
}

// Error state management
function showError(message) {
    const errorState = document.getElementById('error-state');
    const errorMessage = document.getElementById('error-message');
    
    if (errorState) {
        errorState.style.display = 'block';
    }
    if (errorMessage) {
        errorMessage.textContent = message;
    }
}

function hideError() {
    const errorState = document.getElementById('error-state');
    if (errorState) {
        errorState.style.display = 'none';
    }
}

// Enhanced dashboard population
function populateDashboard(user, bankingData) {
    try {
        console.log('Populating dashboard with:', { user, bankingData });
        
        // Update welcome message (only if not already set by server-side template)
        const welcomeMessage = document.getElementById('welcome-message');
        if (welcomeMessage && !welcomeMessage.textContent.includes(user.full_name || user.username)) {
            welcomeMessage.textContent = `Hi ${user.full_name || user.username}, Here's a summary of your linked bank accounts`;
        }

        // Calculate total balance
        let totalBalance = 0;
        if (bankingData && bankingData.accounts && Array.isArray(bankingData.accounts)) {
            bankingData.accounts.forEach(account => {
                totalBalance += parseFloat(account.balance) || 0;
            });
        }

        // Update total balance
        const totalBalanceElement = document.getElementById('total-balance');
        if (totalBalanceElement) {
            totalBalanceElement.textContent = `₹${totalBalance.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
        }

        // Populate account cards
        populateAccountCards(bankingData?.accounts || []);

        // Update profile section (only if not already populated by server-side template)
        const profileContent = document.getElementById('profile-content');
        if (profileContent && profileContent.innerHTML.includes('will be displayed here')) {
            updateProfileSection(user);
        }
        
        console.log('Dashboard populated successfully');
        
    } catch (error) {
        console.error('Error populating dashboard:', error);
        showError('Failed to display dashboard data');
    }
}

// Enhanced account cards population
function populateAccountCards(accounts) {
    const accountsGrid = document.getElementById('accounts-grid');
    if (!accountsGrid) return;

    console.log('Populating account cards with:', accounts);

    if (!accounts || accounts.length === 0) {
        accountsGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: #666;">
                <h3>No bank accounts found</h3>
                <p>We couldn't find any bank accounts linked to your Aadhaar number.</p>
                <p>Please ensure your bank accounts are properly linked.</p>
            </div>
        `;
        return;
    }

    // Clear existing content
    accountsGrid.innerHTML = '';

    accounts.forEach((account, index) => {
        try {
            const accountCard = document.createElement('div');
            accountCard.className = 'account-card';
            accountCard.style.animationDelay = `${index * 0.1}s`;
            
            // Safely handle account number masking
            let maskedAccountNumber = '****';
            if (account.account_number && account.account_number.length >= 4) {
                maskedAccountNumber = `**${account.account_number.slice(-4)}`;
            }
            
            // Safely format balance
            const balance = parseFloat(account.balance) || 0;
            const formattedBalance = balance.toLocaleString('en-IN', {minimumFractionDigits: 2});
            
            accountCard.innerHTML = `
                <div class="account-header">
                    <div class="bank-name">${account.bank_name || 'Unknown Bank'}</div>
                    <div class="account-type">${account.account_type || 'Savings'}</div>
                </div>
                <div class="account-details">
                    <div class="account-number">Account Number<br>${maskedAccountNumber}</div>
                </div>
                <div class="balance-section">
                    <div class="balance-label">Current Balance</div>
                    <div class="balance-amount">
                        <span id="balance-${index}">₹${formattedBalance}</span>
                        <button class="hide-balance" onclick="toggleBalance('balance-${index}')">Hide</button>
                    </div>
                </div>
                <button class="view-details-btn" onclick="viewDetails('${account.bank_name || 'Unknown Bank'}')">View Details</button>
            `;
            
            accountsGrid.appendChild(accountCard);
            
        } catch (error) {
            console.error('Error creating account card:', error, account);
        }
    });

    console.log(`Created ${accounts.length} account cards`);
}

// Update profile section
function updateProfileSection(user) {
    const profileContent = document.getElementById('profile-content');
    if (!profileContent || !user) return;
    
    try {
        profileContent.innerHTML = `
            <div style="max-width: 600px; margin: 0 auto; text-align: left;">
                <div style="background: white; padding: 2rem; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.1);">
                    <h3 style="margin-bottom: 1.5rem; color: #333;">Account Information</h3>
                    <div style="display: grid; gap: 1rem;">
                        <div><strong>Full Name:</strong> ${user.full_name || 'Not provided'}</div>
                        <div><strong>Username:</strong> ${user.username || 'Not provided'}</div>
                        <div><strong>Email:</strong> ${user.email || 'Not provided'}</div>
                        <div><strong>Phone:</strong> ${user.mobile || 'Not provided'}</div>
                        <div><strong>Aadhaar:</strong> ${user.aadhar_number ? `****-****-${user.aadhar_number.slice(-4)}` : 'Not provided'}</div>
                    </div>
                    <div style="margin-top: 2rem; display: flex; gap: 1rem; flex-wrap: wrap;">
                        <button onclick="quickLoanApplication()" style="padding: 0.5rem 1rem; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer;">Apply for Loan</button>
                        <button onclick="quickEMICalculator()" style="padding: 0.5rem 1rem; background: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer;">EMI Calculator</button>
                        <button onclick="quickPayments()" style="padding: 0.5rem 1rem; background: #17a2b8; color: white; border: none; border-radius: 5px; cursor: pointer;">Make Payment</button>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error updating profile section:', error);
    }
}

// Load section-specific data
async function loadSectionData(sectionId) {
    switch (sectionId) {
        case 'dashboard':
            // Load dashboard analytics data
            console.log('Loading dashboard analytics...');
            break;
        case 'loan':
            // Redirect to loan page instead of loading inline
            console.log('Redirecting to loan application...');
            window.location.href = '/lrs';
            break;
        case 'payments':
            // Redirect to payments page
            console.log('Redirecting to payments...');
            window.location.href = '/payments';
            break;
        case 'emi':
            // Redirect to EMI calculator
            console.log('Redirecting to EMI calculator...');
            window.location.href = '/emi';
            break;
        case 'profile':
            // Load user profile data if section exists
            if (document.getElementById('profile')) {
                console.log('Loading profile data...');
                // Profile data is already loaded in populateDashboard
            }
            break;
        default:
            break;
    }
}

// Enhanced menu item click handler
function handleMenuClick(event) {
    event.preventDefault();
    
    const menuItem = event.currentTarget;
    const sectionId = menuItem.getAttribute('data-section');
    const href = menuItem.getAttribute('href');
    
    // Handle different types of menu items
    if (href && href !== '#') {
        // External links or specific routes
        window.location.href = href;
    } else if (sectionId) {
        // Section-based navigation
        if (sectionId === 'logout') {
            logout();
        } else {
            navigateToPage(sectionId);
        }
    }
}

// Close sidebar when clicking outside on mobile
document.addEventListener('click', function(event) {
    const sidebar = document.getElementById('sidebar');
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    
    if (window.innerWidth <= 768 && 
        sidebar && sidebar.contains && !sidebar.contains(event.target) && 
        mobileMenuBtn && !mobileMenuBtn.contains(event.target) &&
        sidebar.classList.contains('open')) {
        toggleSidebar();
    }
});

// Handle window resize
window.addEventListener('resize', function() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar && window.innerWidth > 768) {
        sidebar.classList.remove('open');
    }
});

// Add ripple effect to buttons
function addRippleEffect() {
    const buttons = document.querySelectorAll('.view-details-btn, .menu-item');
    buttons.forEach(button => {
        button.addEventListener('click', function(e) {
            try {
                // Handle menu item clicks specially
                if (this.classList.contains('menu-item')) {
                    handleMenuClick(e);
                }
                
                const ripple = document.createElement('span');
                const rect = this.getBoundingClientRect();
                const size = Math.max(rect.width, rect.height);
                const x = e.clientX - rect.left - size / 2;
                const y = e.clientY - rect.top - size / 2;
                
                ripple.style.cssText = `
                    position: absolute;
                    border-radius: 50%;
                    background: rgba(255,255,255,0.3);
                    width: ${size}px;
                    height: ${size}px;
                    left: ${x}px;
                    top: ${y}px;
                    animation: ripple 0.6s linear;
                    pointer-events: none;
                `;
                
                this.style.position = 'relative';
                this.style.overflow = 'hidden';
                this.appendChild(ripple);
                
                setTimeout(() => {
                    if (ripple.parentNode) {
                        ripple.remove();
                    }
                }, 600);
            } catch (error) {
                console.error('Error adding ripple effect:', error);
            }
        });
    });
}

// Enhanced initialization
document.addEventListener('DOMContentLoaded', async function() {
    try {
        console.log('Dashboard initializing...');
        
        // Load user data and populate dashboard
        await loadUserData();
        
        // Setup menu item click handlers
        setTimeout(() => {
            const menuItems = document.querySelectorAll('.menu-item');
            menuItems.forEach(item => {
                // Remove any existing click handlers to avoid duplicates
                item.removeEventListener('click', handleMenuClick);
                item.addEventListener('click', handleMenuClick);
            });
            
            addRippleEffect();
            console.log('Menu handlers and ripple effects added');
        }, 1000);
        
        // Add card entrance animations
        setTimeout(() => {
            const cards = document.querySelectorAll('.account-card');
            cards.forEach((card, index) => {
                setTimeout(() => {
                    if (card) {
                        card.style.opacity = '1';
                        card.style.transform = 'translateY(0)';
                    }
                }, index * 100);
            });
        }, 500);
        
        console.log('Dashboard initialized successfully');
        
    } catch (error) {
        console.error('Dashboard initialization failed:', error);
        showError('Dashboard initialization failed. Please refresh the page.');
    }
});

// Add CSS for ripple animation if not already present
if (!document.querySelector('#ripple-animation-style')) {
    const style = document.createElement('style');
    style.id = 'ripple-animation-style';
    style.textContent = `
        @keyframes ripple {
            to {
                transform: scale(4);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
}