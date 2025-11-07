// Profile Page JavaScript - Corrected Version

// Global variables
let currentEditMode = null;
let originalFormData = {};

// Initialize profile page
document.addEventListener('DOMContentLoaded', function() {
    initializeProfile();
    bindEventListeners();
    loadActiveSessions();
    setActiveMenuItem();
});

// Initialize profile functionality
function initializeProfile() {
    // Set default tab
    showTab('personal-info');
    
    // Load user profile data from database
    loadUserProfile();
    
    // Load user preferences
    loadUserPreferences();
    
    // Initialize form validation
    initializeFormValidation();
    
    console.log('Profile page initialized');
}

// Bind event listeners
function bindEventListeners() {
    // Avatar upload
    const avatarUpload = document.getElementById('avatar-upload');
    const profileAvatar = document.querySelector('.profile-avatar');
    
    if (profileAvatar && avatarUpload) {
        profileAvatar.addEventListener('click', () => avatarUpload.click());
        avatarUpload.addEventListener('change', handleAvatarUpload);
    }
    
    // Form submissions
    const personalInfoForm = document.getElementById('personal-info-form');
    const passwordForm = document.getElementById('password-form');
    const preferencesForm = document.getElementById('preferences-form');
    const documentUploadForm = document.getElementById('document-upload-form');
    
    if (personalInfoForm) {
        personalInfoForm.addEventListener('submit', handlePersonalInfoSubmit);
    }
    
    if (passwordForm) {
        passwordForm.addEventListener('submit', handlePasswordSubmit);
    }
    
    if (preferencesForm) {
        preferencesForm.addEventListener('submit', handlePreferencesSubmit);
    }
    
    if (documentUploadForm) {
        documentUploadForm.addEventListener('submit', handleDocumentUpload);
    }
    
    // Two-factor authentication toggles
    const sms2faToggle = document.getElementById('sms_2fa');
    const email2faToggle = document.getElementById('email_2fa');
    
    if (sms2faToggle) {
        sms2faToggle.addEventListener('change', (e) => handle2FAToggle('sms', e.target.checked));
    }
    
    if (email2faToggle) {
        email2faToggle.addEventListener('change', (e) => handle2FAToggle('email', e.target.checked));
    }
    
    // Preference toggles
    const preferenceToggles = document.querySelectorAll('#preferences-form input[type="checkbox"]');
    preferenceToggles.forEach(toggle => {
        toggle.addEventListener('change', handlePreferenceToggle);
    });
}

// Tab functionality
function showTab(tabName) {
    // Hide all tab contents
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => content.classList.remove('active'));
    
    // Show selected tab
    const selectedTab = document.getElementById(tabName);
    if (selectedTab) {
        selectedTab.classList.add('active');
    }
    
    // Update tab buttons
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => button.classList.remove('active'));
    
    const activeButton = document.querySelector(`[onclick="showTab('${tabName}')"]`);
    if (activeButton) {
        activeButton.classList.add('active');
    }
    
    // Cancel any active edit mode when switching tabs
    if (currentEditMode) {
        cancelEdit(currentEditMode);
    }
    
    console.log(`Switched to tab: ${tabName}`);
}

// Edit mode functionality
function toggleEdit(section) {
    if (currentEditMode === section) {
        cancelEdit(section);
    } else {
        enableEdit(section);
    }
}

function enableEdit(section) {
    currentEditMode = section;
    
    const form = document.getElementById(`${section}-info-form`);
    if (!form) return;
    
    // Store original data
    const formData = new FormData(form);
    originalFormData[section] = Object.fromEntries(formData.entries());
    
    // Enable form fields
    const inputs = form.querySelectorAll('input, select');
    inputs.forEach(input => {
        input.removeAttribute('readonly');
        input.removeAttribute('disabled');
        input.classList.add('editable');
    });
    
    // Show form actions
    const formActions = form.querySelector('.form-actions');
    if (formActions) {
        formActions.style.display = 'flex';
    }
    
    // Update edit button
    const editBtn = document.querySelector(`[onclick="toggleEdit('${section}')"]`);
    if (editBtn) {
        editBtn.innerHTML = '<i class="edit-icon">✖️</i> Cancel';
        editBtn.classList.add('cancel-mode');
    }
    
    console.log(`Edit mode enabled for: ${section}`);
}

function cancelEdit(section) {
    currentEditMode = null;
    
    const form = document.getElementById(`${section}-info-form`);
    if (!form) return;
    
    // Restore original data
    if (originalFormData[section]) {
        Object.keys(originalFormData[section]).forEach(key => {
            const field = form.querySelector(`[name="${key}"]`);
            if (field) {
                field.value = originalFormData[section][key];
            }
        });
    }
    
    // Disable form fields
    const inputs = form.querySelectorAll('input, select');
    inputs.forEach(input => {
        input.setAttribute('readonly', 'readonly');
        if (input.tagName === 'SELECT') {
            input.setAttribute('disabled', 'disabled');
        }
        input.classList.remove('editable');
    });
    
    // Hide form actions
    const formActions = form.querySelector('.form-actions');
    if (formActions) {
        formActions.style.display = 'none';
    }
    
    // Update edit button
    const editBtn = document.querySelector(`[onclick="toggleEdit('${section}')"]`);
    if (editBtn) {
        editBtn.innerHTML = '<i class="edit-icon">✏️</i> Edit';
        editBtn.classList.remove('cancel-mode');
    }
    
    console.log(`Edit mode cancelled for: ${section}`);
}

// Load user profile data from database
async function loadUserProfile() {
    try {
        showLoading();
        
        const response = await fetch('/api/profile/data', {
            method: 'GET',
            credentials: 'include'
        });
        
        if (response.ok) {
            const profileData = await response.json();
            populateProfileForm(profileData);
            updateProfileHeader(profileData);
        } else {
            console.error('Failed to load profile data');
        }
    } catch (error) {
        console.error('Profile loading error:', error);
    } finally {
        hideLoading();
    }
}

// Populate form with profile data
function populateProfileForm(profileData) {
    // Personal information fields - Fixed field mappings
    const fieldMappings = {
        'first_name': profileData.first_name,
        'last_name': profileData.last_name,
        'email': profileData.email, // from users table
        'phone': profileData.phone_number, // map phone_number to phone
        'date_of_birth': profileData.date_of_birth,
        'gender': profileData.gender,
        'address_line1': profileData.address_line_1, // map address_line_1 to address_line1
        'address_line2': profileData.address_line_2,
        'city': profileData.city,
        'state': profileData.state,
        'pincode': profileData.pin_code, // map pin_code to pincode
        'country': profileData.country || 'India' // Default to India if not set
    };
    
    Object.keys(fieldMappings).forEach(fieldId => {
        const element = document.getElementById(fieldId);
        if (element && fieldMappings[fieldId]) {
            element.value = fieldMappings[fieldId];
        }
    });
    
    // Update profile image if available
    if (profileData.profile_image) {
        const avatarImg = document.getElementById('profile-avatar-img');
        if (avatarImg) {
            avatarImg.src = profileData.profile_image;
        }
    }
}

// Avatar upload handler - Fixed for profiles table
async function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Validate file
    if (!file.type.startsWith('image/')) {
        showMessage('Please select a valid image file', 'error');
        return;
    }
    
    if (file.size > 5 * 1024 * 1024) { // 5MB limit
        showMessage('File size must be less than 5MB', 'error');
        return;
    }
    
    const formData = new FormData();
    formData.append('profile_image', file);
    
    try {
        showLoading();
        
        const response = await fetch('/api/profile/avatar', {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (response.ok) {
            // Update avatar image
            const avatarImg = document.getElementById('profile-avatar-img');
            if (avatarImg) {
                avatarImg.src = result.profile_image_url + '?t=' + new Date().getTime();
            }
            showMessage('Profile picture updated successfully', 'success');
        } else {
            throw new Error(result.message || 'Upload failed');
        }
    } catch (error) {
        console.error('Avatar upload error:', error);
        showMessage('Failed to upload profile picture: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Personal info form submission - Fixed database integration
async function handlePersonalInfoSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    // Validate required fields
    const requiredFields = ['first_name', 'last_name', 'email', 'phone'];
    for (const field of requiredFields) {
        if (!data[field] || data[field].trim() === '') {
            showMessage(`${field.replace('_', ' ')} is required`, 'error');
            return;
        }
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
        showMessage('Please enter a valid email address', 'error');
        return;
    }
    
    // Validate phone format (Indian mobile number)
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(data.phone)) {
        showMessage('Please enter a valid 10-digit mobile number', 'error');
        return;
    }
    
    // Map form fields to database fields correctly
    const profileData = {
        first_name: data.first_name,
        last_name: data.last_name,
        phone_number: data.phone, // form field 'phone' -> DB field 'phone_number'
        date_of_birth: data.date_of_birth || null,
        gender: data.gender || null,
        address_line_1: data.address_line1 || null, // form field 'address_line1' -> DB field 'address_line_1'
        address_line_2: data.address_line2 || null,
        city: data.city || null,
        state: data.state || null,
        pin_code: data.pincode || null, // form field 'pincode' -> DB field 'pin_code'
        country: data.country || 'India'
    };
    
    // Handle email separately (update users table)
    const userData = {
        email: data.email
    };
    
    try {
        showLoading();
        
        // Update profile information
        const profileResponse = await fetch('/api/profile/personal-info', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(profileData),
            credentials: 'include'
        });
        
        if (!profileResponse.ok) {
            const profileResult = await profileResponse.json();
            throw new Error(profileResult.message || 'Profile update failed');
        }
        
        // Update user email if changed
        if (data.email !== getCurrentUserEmail()) {
            const userResponse = await fetch('/api/profile/user-info', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(userData),
                credentials: 'include'
            });
            
            if (!userResponse.ok) {
                const userResult = await userResponse.json();
                throw new Error(userResult.message || 'Email update failed');
            }
        }
        
        showMessage('Personal information updated successfully', 'success');
        cancelEdit('personal');
        updateProfileHeader(data);
        
    } catch (error) {
        console.error('Personal info update error:', error);
        showMessage('Failed to update personal information: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Get current user email (helper function)
function getCurrentUserEmail() {
    const emailField = document.getElementById('email');
    return emailField ? emailField.value : '';
}

// Load user preferences
async function loadUserPreferences() {
    try {
        const response = await fetch('/api/profile/preferences', {
            method: 'GET',
            credentials: 'include'
        });
        
        if (response.ok) {
            const preferences = await response.json();
            updatePreferencesUI(preferences);
        }
    } catch (error) {
        console.error('Failed to load preferences:', error);
    }
}

// Update preferences UI
function updatePreferencesUI(preferences) {
    Object.keys(preferences).forEach(key => {
        const element = document.querySelector(`[name="${key}"]`);
        if (element) {
            if (element.type === 'checkbox') {
                element.checked = preferences[key];
            } else {
                element.value = preferences[key];
            }
        }
    });
}

// Update profile header information
function updateProfileHeader(data) {
    const profileName = document.getElementById('profile-name');
    const profileEmail = document.getElementById('profile-email');
    
    if (profileName && data.first_name && data.last_name) {
        profileName.textContent = `${data.first_name} ${data.last_name}`;
    }
    
    if (profileEmail && data.email) {
        profileEmail.textContent = data.email;
    }
}

// Enhanced form validation - Fixed validation rules
function initializeFormValidation() {
    // Email validation
    const emailInput = document.getElementById('email');
    if (emailInput) {
        emailInput.addEventListener('input', function() {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (this.value && !emailRegex.test(this.value)) {
                this.setCustomValidity('Please enter a valid email address');
            } else {
                this.setCustomValidity('');
            }
        });
    }
    
    // Phone validation (Indian mobile numbers)
    const phoneInput = document.getElementById('phone');
    if (phoneInput) {
        phoneInput.addEventListener('input', function() {
            // Remove any non-digit characters
            this.value = this.value.replace(/\D/g, '');
            
            // Limit to 10 digits
            if (this.value.length > 10) {
                this.value = this.value.slice(0, 10);
            }
            
            const phoneRegex = /^[6-9]\d{9}$/;
            if (this.value && !phoneRegex.test(this.value)) {
                this.setCustomValidity('Please enter a valid 10-digit mobile number starting with 6-9');
            } else {
                this.setCustomValidity('');
            }
        });
    }
    
    // PIN code validation
    const pincodeInput = document.getElementById('pincode');
    if (pincodeInput) {
        pincodeInput.addEventListener('input', function() {
            // Remove any non-digit characters
            this.value = this.value.replace(/\D/g, '');
            
            // Limit to 6 digits
            if (this.value.length > 6) {
                this.value = this.value.slice(0, 6);
            }
            
            const pincodeRegex = /^\d{6}$/;
            if (this.value && !pincodeRegex.test(this.value)) {
                this.setCustomValidity('Please enter a valid 6-digit PIN code');
            } else {
                this.setCustomValidity('');
            }
        });
    }
    
    // Date of birth validation - Fixed age calculation
    const dobInput = document.getElementById('date_of_birth');
    if (dobInput) {
        dobInput.addEventListener('change', function() {
            const selectedDate = new Date(this.value);
            const today = new Date();
            
            // Calculate age more accurately
            let age = today.getFullYear() - selectedDate.getFullYear();
            const monthDiff = today.getMonth() - selectedDate.getMonth();
            
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < selectedDate.getDate())) {
                age--;
            }
            
            if (selectedDate > today) {
                this.setCustomValidity('Date of birth cannot be in the future');
            } else if (age < 18) {
                this.setCustomValidity('You must be at least 18 years old');
            } else if (age > 120) {
                this.setCustomValidity('Please enter a valid date of birth');
            } else {
                this.setCustomValidity('');
            }
        });
    }
    
    // Password validation
    const newPasswordInput = document.getElementById('new_password');
    const confirmPasswordInput = document.getElementById('confirm_password');
    
    if (newPasswordInput) {
        newPasswordInput.addEventListener('input', function() {
            const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
            if (this.value && !passwordRegex.test(this.value)) {
                this.setCustomValidity('Password must be at least 8 characters with uppercase, lowercase, number, and special character');
            } else {
                this.setCustomValidity('');
            }
            
            if (confirmPasswordInput && confirmPasswordInput.value) {
                validatePasswordConfirmation();
            }
        });
    }
    
    if (confirmPasswordInput) {
        confirmPasswordInput.addEventListener('input', validatePasswordConfirmation);
    }
    
    function validatePasswordConfirmation() {
        const newPassword = newPasswordInput ? newPasswordInput.value : '';
        const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : '';
        
        if (confirmPassword && newPassword !== confirmPassword) {
            confirmPasswordInput.setCustomValidity('Passwords do not match');
        } else {
            confirmPasswordInput.setCustomValidity('');
        }
    }
}

// Password change form submission
async function handlePasswordSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    // Validate password strength
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(data.new_password)) {
        showMessage('Password must be at least 8 characters with uppercase, lowercase, number, and special character', 'error');
        return;
    }
    
    // Validate password confirmation
    if (data.new_password !== data.confirm_password) {
        showMessage('New passwords do not match', 'error');
        return;
    }
    
    try {
        showLoading();
        
        const response = await fetch('/api/profile/change-password', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                current_password: data.current_password,
                new_password: data.new_password
            }),
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showMessage('Password updated successfully', 'success');
            form.reset();
        } else {
            throw new Error(result.message || 'Password update failed');
        }
    } catch (error) {
        console.error('Password update error:', error);
        showMessage('Failed to update password: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Preferences form submission
async function handlePreferencesSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    // Convert checkbox values to booleans
    const checkboxFields = ['email_notifications', 'sms_notifications', 'marketing_communications'];
    checkboxFields.forEach(field => {
        data[field] = formData.has(field);
    });
    
    try {
        showLoading();
        
        const response = await fetch('/api/profile/preferences', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data),
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showMessage('Preferences updated successfully', 'success');
        } else {
            throw new Error(result.message || 'Preferences update failed');
        }
    } catch (error) {
        console.error('Preferences update error:', error);
        showMessage('Failed to update preferences: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Handle 2FA toggle
async function handle2FAToggle(type, enabled) {
    try {
        const response = await fetch('/api/profile/2fa', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: type,
                enabled: enabled
            }),
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showMessage(`${type.toUpperCase()} 2FA ${enabled ? 'enabled' : 'disabled'} successfully`, 'success');
        } else {
            // Revert toggle on error
            const toggle = document.getElementById(`${type}_2fa`);
            if (toggle) {
                toggle.checked = !enabled;
            }
            throw new Error(result.message || '2FA update failed');
        }
    } catch (error) {
        console.error('2FA toggle error:', error);
        showMessage(`Failed to update 2FA settings: ${error.message}`, 'error');
    }
}

// Handle preference toggle changes
function handlePreferenceToggle(event) {
    // Auto-save preferences on toggle with debouncing
    const form = document.getElementById('preferences-form');
    if (form) {
        clearTimeout(window.preferencesSaveTimeout);
        window.preferencesSaveTimeout = setTimeout(() => {
            const submitEvent = { preventDefault: () => {}, target: form };
            handlePreferencesSubmit(submitEvent);
        }, 1000);
    }
}

// Document upload functionality
function uploadDocument(type) {
    const modal = document.getElementById('document-modal');
    const modalTitle = document.getElementById('modal-title');
    const documentType = document.getElementById('document-type');
    
    if (modal && modalTitle && documentType) {
        modalTitle.textContent = `Upload ${type.charAt(0).toUpperCase() + type.slice(1)} Document`;
        documentType.value = type;
        modal.style.display = 'flex';
    }
}

function closeDocumentModal() {
    const modal = document.getElementById('document-modal');
    const form = document.getElementById('document-upload-form');
    
    if (modal) {
        modal.style.display = 'none';
    }
    
    if (form) {
        form.reset();
    }
}

// Handle document upload
async function handleDocumentUpload(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    const file = formData.get('document_file');
    const type = formData.get('document_type');
    
    if (!file || !type) {
        showMessage('Please select a file and document type', 'error');
        return;
    }
    
    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
        showMessage('File size must be less than 5MB', 'error');
        return;
    }
    
    try {
        showLoading();
        
        const response = await fetch('/api/profile/documents', {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showMessage(`${type.charAt(0).toUpperCase() + type.slice(1)} document uploaded successfully`, 'success');
            closeDocumentModal();
            // Refresh document status after successful upload
            setTimeout(() => location.reload(), 2000);
        } else {
            throw new Error(result.message || 'Document upload failed');
        }
    } catch (error) {
        console.error('Document upload error:', error);
        showMessage('Failed to upload document: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Load active sessions
async function loadActiveSessions() {
    try {
        const response = await fetch('/api/profile/sessions', {
            method: 'GET',
            credentials: 'include'
        });
        
        if (response.ok) {
            const sessions = await response.json();
            displayActiveSessions(sessions);
        }
    } catch (error) {
        console.error('Failed to load sessions:', error);
    }
}

// Display active sessions
function displayActiveSessions(sessions) {
    const container = document.getElementById('active-sessions');
    if (!container) return;
    
    container.innerHTML = '';
    
    sessions.forEach(session => {
        const sessionElement = document.createElement('div');
        sessionElement.className = `session-item ${session.is_current ? 'session-current' : ''}`;
        
        sessionElement.innerHTML = `
            <div class="session-info">
                <div class="session-device">${session.device || 'Unknown Device'}</div>
                <div class="session-details">
                    ${session.location || 'Unknown Location'} • 
                    ${session.ip_address} • 
                    ${new Date(session.last_active).toLocaleString()}
                    ${session.is_current ? ' (Current Session)' : ''}
                </div>
            </div>
            ${!session.is_current ? `
                <button class="btn btn-secondary btn-sm" onclick="terminateSession('${session.id}')">
                    Terminate
                </button>
            ` : ''}
        `;
        
        container.appendChild(sessionElement);
    });
    
    if (sessions.length === 0) {
        container.innerHTML = '<p>No active sessions found.</p>';
    }
}

// Terminate a specific session
async function terminateSession(sessionId) {
    if (!confirm('Are you sure you want to terminate this session?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/profile/sessions/${sessionId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (response.ok) {
            showMessage('Session terminated successfully', 'success');
            loadActiveSessions(); // Refresh the list
        } else {
            const result = await response.json();
            throw new Error(result.message || 'Failed to terminate session');
        }
    } catch (error) {
        console.error('Session termination error:', error);
        showMessage('Failed to terminate session: ' + error.message, 'error');
    }
}

// Terminate all sessions
async function terminateAllSessions() {
    if (!confirm('Are you sure you want to terminate all other sessions? You will be logged out from all devices except this one.')) {
        return;
    }
    
    try {
        showLoading();
        
        const response = await fetch('/api/profile/sessions/terminate-all', {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (response.ok) {
            showMessage('All other sessions terminated successfully', 'success');
            loadActiveSessions(); // Refresh the list
        } else {
            const result = await response.json();
            throw new Error(result.message || 'Failed to terminate sessions');
        }
    } catch (error) {
        console.error('Sessions termination error:', error);
        showMessage('Failed to terminate sessions: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Message display functions
function showMessage(message, type) {
    const messageContainer = document.getElementById('message-container');
    const successMessage = document.getElementById('success-message');
    const errorMessage = document.getElementById('error-message');
    
    // Hide any existing messages
    if (successMessage) successMessage.style.display = 'none';
    if (errorMessage) errorMessage.style.display = 'none';
    
    const targetMessage = type === 'success' ? successMessage : errorMessage;
    const messageText = targetMessage ? targetMessage.querySelector('.message-text') : null;
    
    if (targetMessage && messageText && messageContainer) {
        messageText.textContent = message;
        targetMessage.style.display = 'flex';
        messageContainer.style.display = 'block';
        
        // Auto-hide success messages after 5 seconds
        if (type === 'success') {
            setTimeout(() => {
                targetMessage.style.display = 'none';
                if (!document.querySelector('#error-message[style*="flex"]')) {
                    messageContainer.style.display = 'none';
                }
            }, 5000);
        }
        
        // Scroll to top to show message
        messageContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function hideMessage() {
    const messageContainer = document.getElementById('message-container');
    if (messageContainer) {
        messageContainer.style.display = 'none';
    }
}

// Loading state functions
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

// Set active menu item
function setActiveMenuItem() {
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-section') === 'profile') {
            item.classList.add('active');
        }
    });
}

// Profile completeness checker - Fixed calculation
function checkProfileCompleteness() {
    const requiredFields = [
        { id: 'first_name', name: 'First Name' },
        { id: 'last_name', name: 'Last Name' },
        { id: 'email', name: 'Email' },
        { id: 'phone', name: 'Phone Number' },
        { id: 'date_of_birth', name: 'Date of Birth' }
    ];
    
    let completedFields = 0;
    const missingFields = [];
    
    requiredFields.forEach(field => {
        const element = document.getElementById(field.id);
        if (element && element.value && element.value.trim() !== '') {
            completedFields++;
        } else {
            missingFields.push(field.name);
        }
    });
    
    const completionPercentage = Math.round((completedFields / requiredFields.length) * 100);
    
    updateProfileCompletionUI(completionPercentage, missingFields);
    
    return { percentage: completionPercentage, missing: missingFields };
}

function updateProfileCompletionUI(percentage, missingFields) {
    const progressBar = document.querySelector('.profile-completion-bar');
    const progressText = document.querySelector('.profile-completion-text');
    const missingFieldsList = document.querySelector('.missing-fields-list');
    
    if (progressBar) {
        progressBar.style.width = `${percentage}%`;
        progressBar.setAttribute('aria-valuenow', percentage);
    }
    
    if (progressText) {
        progressText.textContent = `Profile ${percentage}% complete`;
    }
    
    if (missingFieldsList && missingFields.length > 0) {
        missingFieldsList.innerHTML = missingFields
            .map(field => `<li>${field}</li>`)
            .join('');
    }
}

// Search functionality for settings
function initializeSettingsSearch() {
    const searchInput = document.getElementById('settings-search');
    if (!searchInput) return;
    
    searchInput.addEventListener('input', debounce(function(e) {
        const query = e.target.value.toLowerCase();
        searchSettings(query);
    }, 300));
}

function searchSettings(query) {
    const settingSections = document.querySelectorAll('.settings-section');
    const searchResults = document.getElementById('search-results');
    
    if (!query) {
        // Show all sections when no search query
        settingSections.forEach(section => {
            section.style.display = 'block';
        });
        if (searchResults) {
            searchResults.style.display = 'none';
        }
        return;
    }
    
    const results = [];
    
    settingSections.forEach(section => {
        const sectionTitle = section.querySelector('.section-title')?.textContent.toLowerCase() || '';
        const settingItems = section.querySelectorAll('.setting-item');
        let sectionHasMatch = false;
        
        // Check section title
        if (sectionTitle.includes(query)) {
            sectionHasMatch = true;
        }
        
        // Check individual settings
        settingItems.forEach(item => {
            const label = item.querySelector('label')?.textContent.toLowerCase() || '';
            const description = item.querySelector('.setting-description')?.textContent.toLowerCase() || '';
            
            if (label.includes(query) || description.includes(query)) {
                sectionHasMatch = true;
                results.push({
                    title: item.querySelector('label')?.textContent || '',
                    description: description,
                    section: sectionTitle,
                    element: item
                });
            }
        });
        
        section.style.display = sectionHasMatch ? 'block' : 'none';
    });
    
    // Show search results if needed
    if (searchResults && results.length > 0) {
        displaySearchResults(results);
    }
}

function displaySearchResults(results) {
    const searchResults = document.getElementById('search-results');
    if (!searchResults) return;
    
    searchResults.innerHTML = `
        <h3>Search Results (${results.length})</h3>
        ${results.map(result => `
            <div class="search-result-item" onclick="scrollToSetting('${result.element.id}')">
                <div class="result-title">${result.title}</div>
                <div class="result-section">${result.section}</div>
                <div class="result-description">${result.description}</div>
            </div>
        `).join('')}
    `;
    
    searchResults.style.display = 'block';
}

function scrollToSetting(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('highlight');
        setTimeout(() => element.classList.remove('highlight'), 3000);
    }
}

// Activity log functionality
async function loadActivityLog() {
    try {
        const response = await fetch('/api/profile/activity-log', {
            method: 'GET',
            credentials: 'include'
        });
        
        if (response.ok) {
            const activities = await response.json();
            displayActivityLog(activities);
        }
    } catch (error) {
        console.error('Failed to load activity log:', error);
    }
}

function displayActivityLog(activities) {
    const container = document.getElementById('activity-log');
    if (!container) return;
    
    container.innerHTML = activities.map(activity => `
        <div class="activity-item">
            <div class="activity-icon">
                <i class="${getActivityIcon(activity.type)}"></i>
            </div>
            <div class="activity-content">
                <div class="activity-title">${activity.title}</div>
                <div class="activity-description">${activity.description}</div>
                <div class="activity-time">${formatRelativeTime(activity.timestamp)}</div>
            </div>
        </div>
    `).join('');
}

function getActivityIcon(type) {
    const icons = {
        'login': 'icon-login',
        'password_change': 'icon-key',
        'profile_update': 'icon-edit',
        'document_upload': 'icon-upload',
        '2fa_change': 'icon-shield'
    };
    return icons[type] || 'icon-activity';
}

function formatRelativeTime(timestamp) {
    const now = new Date();
    const time = new Date(timestamp);
    const diff = now - time;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
    return formatDate(timestamp);
}

function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Data export functionality
async function exportUserData(format = 'json') {
    try {
        showLoading();
        
        const response = await fetch(`/api/profile/export?format=${format}`, {
            method: 'GET',
            credentials: 'include'
        });
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `user-data-export-${new Date().toISOString().split('T')[0]}.${format}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            
            showMessage('Data exported successfully', 'success');
        } else {
            throw new Error('Export failed');
        }
    } catch (error) {
        console.error('Export error:', error);
        showMessage('Failed to export data: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Account deletion functionality
async function requestAccountDeletion() {
    const confirmation = prompt('Type "DELETE" to confirm account deletion:');
    
    if (confirmation !== 'DELETE') {
        showMessage('Account deletion cancelled', 'info');
        return;
    }
    
    const finalConfirmation = confirm('This action cannot be undone. Are you absolutely sure you want to delete your account?');
    
    if (!finalConfirmation) {
        showMessage('Account deletion cancelled', 'info');
        return;
    }
    
    try {
        showLoading();
        
        const response = await fetch('/api/profile/delete-account', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ confirmation: 'DELETE' }),
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showMessage('Account deletion request submitted. You will receive a confirmation email.', 'success');
        } else {
            throw new Error(result.message || 'Deletion request failed');
        }
    } catch (error) {
        console.error('Account deletion error:', error);
        showMessage('Failed to process deletion request: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Data backup and restore functionality
function backupProfileData() {
    const profileData = {
        timestamp: new Date().toISOString(),
        personalInfo: getFormData('personal-info-form'),
        preferences: getFormData('preferences-form'),
        version: '1.0'
    };
    
    const dataStr = JSON.stringify(profileData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `profile-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    
    showMessage('Profile data backed up successfully', 'success');
}

function restoreProfileData(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            
            if (data.personalInfo) {
                setFormData('personal-info-form', data.personalInfo);
            }
            
            if (data.preferences) {
                setFormData('preferences-form', data.preferences);
            }
            
            showMessage('Profile data restored successfully', 'success');
        } catch (error) {
            console.error('Restore error:', error);
            showMessage('Failed to restore profile data: Invalid file format', 'error');
        }
    };
    reader.readAsText(file);
}

// Helper functions for form data handling
function getFormData(formId) {
    const form = document.getElementById(formId);
    if (!form) return {};
    
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    // Handle checkboxes separately
    const checkboxes = form.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        data[checkbox.name] = checkbox.checked;
    });
    
    return data;
}

function setFormData(formId, data) {
    const form = document.getElementById(formId);
    if (!form || !data) return;
    
    Object.keys(data).forEach(key => {
        const field = form.querySelector(`[name="${key}"]`);
        if (field) {
            if (field.type === 'checkbox') {
                field.checked = data[key];
            } else {
                field.value = data[key];
            }
        }
    });
}

// Accessibility improvements
function enhanceAccessibility() {
    // Add ARIA labels to toggle switches
    const toggleSwitches = document.querySelectorAll('.toggle-switch input');
    toggleSwitches.forEach(toggle => {
        const label = toggle.closest('.security-option, .preference-item')?.querySelector('.option-title, .preference-title');
        if (label && !toggle.getAttribute('aria-label')) {
            toggle.setAttribute('aria-label', label.textContent);
        }
    });
    
    // Add role and aria-expanded to tab buttons
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
        if (!button.getAttribute('role')) {
            button.setAttribute('role', 'tab');
        }
        button.setAttribute('aria-expanded', button.classList.contains('active'));
    });
    
    // Add focus management for modals
    const modal = document.getElementById('document-modal');
    if (modal) {
        modal.addEventListener('shown', function() {
            const firstInput = modal.querySelector('input, button, textarea, select');
            if (firstInput) {
                firstInput.focus();
            }
        });
    }
}

// Auto-save functionality with debouncing
const autoSavePreferences = debounce(async function() {
    const form = document.getElementById('preferences-form');
    if (form) {
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        
        // Convert checkbox values to booleans
        const checkboxFields = ['email_notifications', 'sms_notifications', 'marketing_communications'];
        checkboxFields.forEach(field => {
            data[field] = formData.has(field);
        });
        
        try {
            const response = await fetch('/api/profile/preferences', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data),
                credentials: 'include'
            });
            
            if (response.ok) {
                console.log('Preferences auto-saved');
            }
        } catch (error) {
            console.error('Auto-save failed:', error);
        }
    }
}, 2000);

// Utility functions
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function validateFileType(file, allowedTypes) {
    return allowedTypes.some(type => file.type.includes(type));
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Enhanced error handling
window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
    showMessage('An unexpected error occurred. Please try again.', 'error');
    hideLoading();
});

window.addEventListener('error', function(event) {
    console.error('JavaScript error:', event.error);
    showMessage('An unexpected error occurred. Please refresh the page.', 'error');
    hideLoading();
});

// Modal event listeners
document.addEventListener('click', function(event) {
    const modal = document.getElementById('document-modal');
    if (modal && event.target === modal) {
        closeDocumentModal();
    }
});

document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const modal = document.getElementById('document-modal');
        if (modal && modal.style.display === 'flex') {
            closeDocumentModal();
        }
    }
    
    // Keyboard shortcuts
    // Ctrl/Cmd + S to save current form
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        
        if (currentEditMode === 'personal') {
            const form = document.getElementById('personal-info-form');
            if (form) {
                form.dispatchEvent(new Event('submit'));
            }
        }
    }
    
    // Escape to cancel edit mode
    if (event.key === 'Escape' && currentEditMode) {
        cancelEdit(currentEditMode);
    }
});

// Initialize additional features after DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    enhanceAccessibility();
    initializeSettingsSearch();
    
    // Check profile completeness when fields change
    const profileForm = document.getElementById('personal-info-form');
    if (profileForm) {
        profileForm.addEventListener('input', debounce(checkProfileCompleteness, 500));
        // Initial check
        setTimeout(checkProfileCompleteness, 1000);
    }
});

// Export functions for global access
window.showTab = showTab;
window.toggleEdit = toggleEdit;
window.cancelEdit = cancelEdit;
window.uploadDocument = uploadDocument;
window.closeDocumentModal = closeDocumentModal;
window.loadActiveSessions = loadActiveSessions;
window.terminateSession = terminateSession;
window.terminateAllSessions = terminateAllSessions;
window.backupProfileData = backupProfileData;
window.exportUserData = exportUserData;
window.requestAccountDeletion = requestAccountDeletion;
window.loadActivityLog = loadActivityLog;
window.hideMessage = hideMessage;

// Development helpers (remove in production)
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    window.profileDebug = {
        getCurrentEditMode: () => currentEditMode,
        getOriginalFormData: () => originalFormData,
        checkProfileCompleteness,
        getFormData,
        setFormData
    };
}

console.log('Profile page JavaScript loaded successfully');