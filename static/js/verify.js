// VyomNext Verification System with Twilio SMS Integration
// This script handles the complete verification flow and integrates with Flask backend and Twilio

// Configuration
const API_BASE_URL = 'http://localhost:5000';

// DOM Elements - Form Controls
const sendOtpBtn = document.getElementById('sendOtpBtn');
const verifyOtpBtn = document.getElementById('verifyOtpBtn');
const backBtn = document.getElementById('backBtn');
const resendOtpBtn = document.getElementById('resendOtpBtn');
const continueBtn = document.getElementById('continueBtn');

// DOM Elements - Input Fields
const aadharInput = document.getElementById('aadharNumber');
const phoneInput = document.getElementById('phoneNumber');
const otpInput = document.getElementById('otpInput');

// DOM Elements - Error Display
const aadharError = document.getElementById('aadharError');
const phoneError = document.getElementById('phoneError');
const otpError = document.getElementById('otpError');

// DOM Elements - Display Elements
const maskedPhone = document.getElementById('maskedPhone');
const countdown = document.getElementById('countdown');
const timerText = document.getElementById('timerText');

// DOM Elements - Steps
const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const successMessage = document.getElementById('successMessage');

// DOM Elements - Account Summary
const accountSummary = document.getElementById('accountSummary');
const accountsList = document.getElementById('accountsList');
const totalBalance = document.getElementById('totalBalance');

// Application State
let currentStep = 1;
let timerInterval = null;
let otpSessionId = '';  // Store OTP session ID from backend
let verifiedAadhar = '';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Validate Aadhar number format (12 digits)
 * @param {string} aadhar - Aadhar number to validate
 * @returns {boolean} - True if valid format
 */
function validateAadhar(aadhar) {
    return /^\d{12}$/.test(aadhar);
}

/**
 * Validate Indian phone number format (10 digits starting with 6-9)
 * @param {string} phone - Phone number to validate
 * @returns {boolean} - True if valid format
 */
function validatePhone(phone) {
    return /^[6-9]\d{9}$/.test(phone);
}

/**
 * Mask phone number for display (show first 2 and last 4 digits)
 * @param {string} phone - Phone number to mask
 * @returns {string} - Masked phone number
 */
function maskPhoneNumber(phone) {
    return `+91 ${phone.substring(0, 2)}****${phone.substring(6)}`;
}

/**
 * Show error message for a specific field
 * @param {HTMLElement} element - Error message element
 * @param {string} message - Error message to display
 */
function showError(element, message) {
    element.textContent = message;
    element.style.display = 'block';
}

/**
 * Hide error message for a specific field
 * @param {HTMLElement} element - Error message element
 */
function hideError(element) {
    element.textContent = '';
    element.style.display = 'none';
}

/**
 * Show specific step in the verification process
 * @param {number} stepNumber - Step number to show (1, 2, or 3)
 */
function showStep(stepNumber) {
    // Hide all steps
    document.querySelectorAll('.step').forEach(step => {
        step.classList.remove('active');
    });
    
    // Show requested step
    if (stepNumber === 1) {
        step1.classList.add('active');
    } else if (stepNumber === 2) {
        step2.classList.add('active');
    } else if (stepNumber === 3) {
        successMessage.classList.add('active');
    }
    
    currentStep = stepNumber;
}

/**
 * Start countdown timer for OTP resend
 */
function startTimer() {
    let timeLeft = 120; // Increased to 2 minutes for SMS delivery
    countdown.textContent = timeLeft;
    resendOtpBtn.disabled = true;
    timerText.style.display = 'inline';
    
    timerInterval = setInterval(() => {
        timeLeft--;
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        countdown.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            timerText.style.display = 'none';
            resendOtpBtn.disabled = false;
        }
    }, 1000);
}

/**
 * Clear any existing timer
 */
function clearTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

// ============================================================================
// API INTEGRATION FUNCTIONS
// ============================================================================

/**
 * Validate Aadhar number with the backend API
 * @param {string} aadhar - Aadhar number to validate
 * @returns {Promise<Object>} - Validation result from API
 */
async function validateAadharWithAPI(aadhar) {
    try {
        const response = await fetch(`${API_BASE_URL}/validate/${aadhar}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error validating Aadhar:', error);
        return { 
            exists: false, 
            error: error.message || 'Network error',
            valid_format: validateAadhar(aadhar)
        };
    }
}

/**
 * Send OTP via Twilio SMS through backend API
 * @param {string} aadhar - Aadhar number
 * @param {string} phone - Phone number
 * @returns {Promise<Object>} - OTP send result from API
 */
async function sendOTPViaTwilio(aadhar, phone) {
    try {
        const response = await fetch(`${API_BASE_URL}/send-otp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                aadhar: aadhar,
                phone: phone
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error sending OTP:', error);
        return { 
            success: false, 
            error: error.message || 'Failed to send OTP',
            session_id: null
        };
    }
}

/**
 * Verify OTP through backend API
 * @param {string} sessionId - OTP session ID
 * @param {string} enteredOtp - OTP entered by user
 * @returns {Promise<Object>} - Verification result from API
 */
async function verifyOTPWithAPI(sessionId, enteredOtp) {
    try {
        const response = await fetch(`${API_BASE_URL}/verify-otp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                session_id: sessionId,
                otp: enteredOtp
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error verifying OTP:', error);
        return { 
            success: false, 
            error: error.message || 'Failed to verify OTP'
        };
    }
}

/**
 * Fetch account details for verified Aadhar
 * @param {string} aadhar - Verified Aadhar number
 * @returns {Promise<Object|null>} - Account data from API
 */
async function fetchAccountDetails(aadhar) {
    try {
        const response = await fetch(`${API_BASE_URL}/accounts/${aadhar}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        if (!response.ok) {
            if (response.status === 404) {
                return { accounts: [], total_balance: 0, message: 'No accounts found' };
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching account details:', error);
        return null;
    }
}

/**
 * Check backend health status
 * @returns {Promise<boolean>} - True if backend is healthy
 */
async function checkBackendHealth() {
    try {
        const response = await fetch(`${API_BASE_URL}/health`);
        return response.ok;
    } catch (error) {
        console.error('Backend health check failed:', error);
        return false;
    }
}

// ============================================================================
// UI DISPLAY FUNCTIONS
// ============================================================================

/**
 * Display account summary after successful verification
 * @param {Object} accountData - Account data from API
 */
function displayAccountSummary(accountData) {
    if (!accountData || !accountData.accounts || accountData.accounts.length === 0) {
        accountsList.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #666;">
                <p>No bank accounts found for this Aadhar number.</p>
                <p style="font-size: 14px; margin-top: 10px;">Please contact support if this seems incorrect.</p>
            </div>
        `;
        totalBalance.textContent = '';
        accountSummary.style.display = 'block';
        return;
    }
    
    // Group accounts by bank for better organization
    const accountsByBank = {};
    accountData.accounts.forEach(account => {
        const bankName = account.bank || 'Unknown Bank';
        if (!accountsByBank[bankName]) {
            accountsByBank[bankName] = [];
        }
        accountsByBank[bankName].push(account);
    });
    
    // Generate HTML for account display
    let html = '';
    Object.keys(accountsByBank).sort().forEach(bank => {
        accountsByBank[bank].forEach(account => {
            const accountNumber = account.account_number || 'N/A';
            const accountType = account.account_type || 'Savings';
            const balance = parseFloat(account.balance || 0);
            
            html += `
                <div class="account-item">
                    <h4>${bank} Bank</h4>
                    <p><strong>Account Number:</strong> ${accountNumber}</p>
                    <p><strong>Account Type:</strong> ${accountType}</p>
                    <p class="balance"><strong>Balance:</strong> ₹${balance.toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    })}</p>
                </div>
            `;
        });
    });
    
    accountsList.innerHTML = html;
    
    // Display total balance
    const total = parseFloat(accountData.total_balance || 0);
    totalBalance.textContent = `Total Balance: ₹${total.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
    
    accountSummary.style.display = 'block';
}

/**
 * Show loading state on button
 * @param {HTMLElement} button - Button element
 * @param {string} text - Loading text to display
 */
function showButtonLoading(button, text) {
    button.innerHTML = `<span class="loading"></span> ${text}`;
    button.disabled = true;
}

/**
 * Reset button to normal state
 * @param {HTMLElement} button - Button element
 * @param {string} text - Normal text to display
 */
function resetButton(button, text) {
    button.innerHTML = text;
    button.disabled = false;
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Handle Send OTP button click - Now uses Twilio
 */
async function handleSendOTP() {
    // Clear previous errors
    hideError(aadharError);
    hideError(phoneError);
    
    const aadhar = aadharInput.value.trim();
    const phone = phoneInput.value.trim();
    
    let hasError = false;
    
    // Validate Aadhar
    if (!aadhar) {
        showError(aadharError, 'Aadhar number is required');
        hasError = true;
    } else if (!validateAadhar(aadhar)) {
        showError(aadharError, 'Please enter a valid 12-digit Aadhar number');
        hasError = true;
    }
    
    // Validate Phone
    if (!phone) {
        showError(phoneError, 'Phone number is required');
        hasError = true;
    } else if (!validatePhone(phone)) {
        showError(phoneError, 'Please enter a valid 10-digit mobile number starting with 6-9');
        hasError = true;
    }
    
    if (hasError) return;
    
    // Show loading state
    showButtonLoading(sendOtpBtn, 'Sending OTP...');
    
    try {
        // Check backend health first
        const isHealthy = await checkBackendHealth();
        if (!isHealthy) {
            showError(aadharError, 'Banking system is currently unavailable. Please try again later.');
            resetButton(sendOtpBtn, 'Send OTP');
            return;
        }
        
        // Step 1: Validate Aadhar with backend
        const validation = await validateAadharWithAPI(aadhar);
        
        if (!validation.exists) {
            const errorMsg = validation.error ? 
                'Banking system error. Please try again.' : 
                'Aadhar number not found in our banking system';
            showError(aadharError, errorMsg);
            resetButton(sendOtpBtn, 'Send OTP');
            return;
        }
        
        // Step 2: Send OTP via Twilio
        const otpResult = await sendOTPViaTwilio(aadhar, phone);
        
        if (!otpResult.success) {
            showError(phoneError, otpResult.error || 'Failed to send OTP. Please try again.');
            resetButton(sendOtpBtn, 'Send OTP');
            return;
        }
        
        // Store session ID for OTP verification
        otpSessionId = otpResult.session_id;
        verifiedAadhar = aadhar;
        
        console.log('OTP sent successfully via SMS to +91' + phone);
        
        // Show masked phone and move to step 2
        maskedPhone.textContent = maskPhoneNumber(phone);
        showStep(2);
        startTimer();
        
        // Focus on OTP input
        setTimeout(() => otpInput.focus(), 100);
        
    } catch (error) {
        console.error('Error in send OTP:', error);
        showError(aadharError, 'An unexpected error occurred. Please try again.');
    } finally {
        resetButton(sendOtpBtn, 'Send OTP');
    }
}

/**
 * Handle OTP verification - Now uses backend API
 */
async function handleVerifyOTP() {
    hideError(otpError);
    
    const enteredOtp = otpInput.value.trim();
    
    // Validate OTP format
    if (!enteredOtp) {
        showError(otpError, 'Please enter the OTP');
        return;
    }
    
    if (enteredOtp.length !== 6) {
        showError(otpError, 'OTP must be 6 digits');
        return;
    }
    
    if (!/^\d{6}$/.test(enteredOtp)) {
        showError(otpError, 'OTP must contain only numbers');
        return;
    }
    
    if (!otpSessionId) {
        showError(otpError, 'Invalid session. Please request a new OTP.');
        return;
    }
    
    // Show loading state
    showButtonLoading(verifyOtpBtn, 'Verifying...');
    
    try {
        // Verify OTP with backend API
        const verificationResult = await verifyOTPWithAPI(otpSessionId, enteredOtp);
        
        if (verificationResult.success) {
            // Clear timer
            clearTimer();
            
            // Fetch account details
            const accountData = await fetchAccountDetails(verifiedAadhar);
            
            // Show success step
            showStep(3);
            
            // Display account summary
            displayAccountSummary(accountData);
            
            // Focus on continue button
            setTimeout(() => continueBtn.focus(), 100);
            
        } else {
            showError(otpError, verificationResult.error || 'Invalid OTP. Please check and try again.');
        }
    } catch (error) {
        console.error('Error in OTP verification:', error);
        showError(otpError, 'Verification failed. Please try again.');
    } finally {
        resetButton(verifyOtpBtn, 'Verify OTP');
    }
}

/**
 * Handle back button click
 */
function handleBack() {
    clearTimer();
    showStep(1);
    // Clear OTP input and session
    otpInput.value = '';
    otpSessionId = '';
    hideError(otpError);
}

/**
 * Handle resend OTP - Now uses Twilio
 */
async function handleResendOTP() {
    // Get phone number from the first step
    const phone = phoneInput.value.trim();
    
    if (!phone || !verifiedAadhar) {
        showError(otpError, 'Session expired. Please start over.');
        setTimeout(() => handleBack(), 2000);
        return;
    }
    
    // Show loading state
    resendOtpBtn.innerHTML = '<span class="loading"></span> Sending...';
    resendOtpBtn.disabled = true;
    
    try {
        // Send new OTP via Twilio
        const otpResult = await sendOTPViaTwilio(verifiedAadhar, phone);
        
        if (otpResult.success) {
            // Update session ID
            otpSessionId = otpResult.session_id;
            
            // Clear any existing error
            hideError(otpError);
            
            // Clear OTP input
            otpInput.value = '';
            
            // Restart timer
            startTimer();
            
            // Show user feedback
            otpInput.placeholder = 'New OTP sent! Enter 6-digit OTP';
            setTimeout(() => {
                otpInput.placeholder = 'Enter 6-digit OTP';
            }, 3000);
            
            console.log('New OTP sent successfully via SMS');
        } else {
            showError(otpError, otpResult.error || 'Failed to resend OTP. Please try again.');
            resendOtpBtn.disabled = false;
        }
    } catch (error) {
        console.error('Error in resend OTP:', error);
        showError(otpError, 'Failed to resend OTP. Please try again.');
        resendOtpBtn.disabled = false;
    } finally {
        resendOtpBtn.innerHTML = 'Resend OTP';
    }
}

/**
 * Handle continue button click
 */
function handleContinue() {
    // In a real application, this would redirect to the main banking dashboard
    const message = `Welcome to VyomNext Banking!\n\nYour verification is complete.\nAadhar: ${verifiedAadhar}\n\nThis would now redirect you to your banking dashboard where you can:\n• View detailed account statements\n• Make transactions\n• Access banking services\n• Manage your accounts`;
    
    alert(message);
    
    // Optional: Reset the form for another verification
    // resetForm();
}

/**
 * Reset form to initial state
 */
function resetForm() {
    // Clear all inputs
    aadharInput.value = '';
    phoneInput.value = '';
    otpInput.value = '';
    
    // Hide all errors
    hideError(aadharError);
    hideError(phoneError);
    hideError(otpError);
    
    // Clear timer
    clearTimer();
    
    // Reset state
    currentStep = 1;
    otpSessionId = '';
    verifiedAadhar = '';
    
    // Show first step
    showStep(1);
    
    // Hide account summary
    accountSummary.style.display = 'none';
    
    // Focus on first input
    aadharInput.focus();
}

// ============================================================================
// INPUT FORMATTERS AND VALIDATORS
// ============================================================================

/**
 * Format and validate Aadhar input
 */
function handleAadharInput() {
    // Remove non-digits
    let value = aadharInput.value.replace(/\D/g, '');
    
    // Limit to 12 digits
    if (value.length > 12) {
        value = value.substring(0, 12);
    }
    
    aadharInput.value = value;
    
    // Hide error when user starts typing
    if (value.length > 0) {
        hideError(aadharError);
    }
    
    // Show real-time validation
    if (value.length === 12) {
        aadharInput.style.borderColor = '#27ae60';
    } else if (value.length > 0) {
        aadharInput.style.borderColor = '#e1e5e9';
    }
}

/**
 * Format and validate phone input
 */
function handlePhoneInput() {
    // Remove non-digits
    let value = phoneInput.value.replace(/\D/g, '');
    
    // Limit to 10 digits
    if (value.length > 10) {
        value = value.substring(0, 10);
    }
    
    phoneInput.value = value;
    
    // Hide error when user starts typing
    if (value.length > 0) {
        hideError(phoneError);
    }
    
    // Show real-time validation
    if (value.length === 10 && /^[6-9]/.test(value)) {
        phoneInput.style.borderColor = '#27ae60';
    } else if (value.length > 0) {
        phoneInput.style.borderColor = '#e1e5e9';
    }
}

/**
 * Format and validate OTP input
 */
function handleOtpInput() {
    // Remove non-digits
    let value = otpInput.value.replace(/\D/g, '');
    
    // Limit to 6 digits
    if (value.length > 6) {
        value = value.substring(0, 6);
    }
    
    otpInput.value = value;
    
    // Hide error when user starts typing
    if (value.length > 0) {
        hideError(otpError);
    }
    
    // Show real-time validation
    if (value.length === 6) {
        otpInput.style.borderColor = '#27ae60';
        // Auto-verify if 6 digits are entered
        setTimeout(() => {
            if (!verifyOtpBtn.disabled) {
                handleVerifyOTP();
            }
        }, 500);
    } else if (value.length > 0) {
        otpInput.style.borderColor = '#e1e5e9';
    }
}

// ============================================================================
// EVENT LISTENERS SETUP
// ============================================================================

/**
 * Initialize all event listeners
 */
function initializeEventListeners() {
    // Button click events
    sendOtpBtn.addEventListener('click', handleSendOTP);
    verifyOtpBtn.addEventListener('click', handleVerifyOTP);
    backBtn.addEventListener('click', handleBack);
    resendOtpBtn.addEventListener('click', handleResendOTP);
    continueBtn.addEventListener('click', handleContinue);
    
    // Input formatting and validation
    aadharInput.addEventListener('input', handleAadharInput);
    phoneInput.addEventListener('input', handlePhoneInput);
    otpInput.addEventListener('input', handleOtpInput);
    
    // Enter key support for better UX
    document.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.target.disabled) {
            if (currentStep === 1 && !sendOtpBtn.disabled) {
                e.preventDefault();
                handleSendOTP();
            } else if (currentStep === 2 && !verifyOtpBtn.disabled) {
                e.preventDefault();
                handleVerifyOTP();
            } else if (currentStep === 3) {
                e.preventDefault();
                handleContinue();
            }
        }
    });
    
    // Paste event handling for OTP
    otpInput.addEventListener('paste', function(e) {
        e.preventDefault();
        const pastedText = (e.clipboardData || window.clipboardData).getData('text');
        const otpDigits = pastedText.replace(/\D/g, '').substring(0, 6);
        
        if (otpDigits.length === 6) {
            otpInput.value = otpDigits;
            handleOtpInput();
        }
    });
    
    // Focus management for better accessibility
    aadharInput.addEventListener('focus', function() {
        this.select();
    });
    
    phoneInput.addEventListener('focus', function() {
        this.select();
    });
    
    otpInput.addEventListener('focus', function() {
        this.select();
    });
}

// ============================================================================
// INITIALIZATION AND ERROR HANDLING
// ============================================================================

/**
 * Initialize the application
 */
function initializeApp() {
    console.log('VyomNext Verification System with Twilio SMS Initialized');
    console.log('Backend API:', API_BASE_URL);
    console.log('SMS OTP will be sent via Twilio to the registered mobile number');
    
    // Set up event listeners
    initializeEventListeners();
    
    // Focus on first input
    aadharInput.focus();
    
    // Check backend health on load
    checkBackendHealth().then(isHealthy => {
        if (!isHealthy) {
            console.warn('Backend server appears to be offline. Some features may not work.');
        }
    });
}

/**
 * Global error handler
 */
window.addEventListener('error', function(e) {
    console.error('Global error caught:', e.error);
    
    // Show user-friendly error message
    const errorMsg = 'An unexpected error occurred. Please refresh the page and try again.';
    
    // Try to show error in appropriate place based on current step
    if (currentStep === 1) {
        showError(aadharError, errorMsg);
    } else if (currentStep === 2) {
        showError(otpError, errorMsg);
    } else {
        alert(errorMsg);
    }
});

/**
 * Handle unhandled promise rejections
 */
window.addEventListener('unhandledrejection', function(e) {
    console.error('Unhandled promise rejection:', e.reason);
    e.preventDefault(); // Prevent the default browser error handling
});

// ============================================================================
// UTILITY FUNCTIONS FOR TESTING AND DEBUGGING
// ============================================================================

/**
 * Development helper functions (only available in console)
 */
if (typeof window !== 'undefined') {
    window.VyomNextDebug = {
        // Get current application state
        getState: () => ({
            currentStep,
            otpSessionId,
            verifiedAadhar,
            apiBaseUrl: API_BASE_URL
        }),
        
        // Reset application
        reset: resetForm,
        
        // Skip to success step (for UI testing)
        skipToSuccess: (testAadhar = '123456789012') => {
            verifiedAadhar = testAadhar;
            showStep(3);
            displayAccountSummary({
                accounts: [
                    {
                        bank: 'SBI',
                        account_number: '12345678901',
                        account_type: 'Savings',
                        balance: '50000.00'
                    },
                    {
                        bank: 'HDFC',
                        account_number: '98765432109',
                        account_type: 'Current',
                        balance: '75000.50'
                    }
                ],
                total_balance: '125000.50'
            });
        }
    };
}

// ============================================================================
// APPLICATION ENTRY POINT
// ============================================================================

// Initialize the application when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}