const API_BASE_URL = 'http://localhost:4000';

// Password toggle functionality
function togglePassword(inputId) {
    const passwordInput = document.getElementById(inputId);
    const toggleBtn = passwordInput.nextElementSibling;
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleBtn.textContent = 'Hide';
    } else {
        passwordInput.type = 'password';
        toggleBtn.textContent = 'Show';
    }
}

// Clear error messages
function clearErrors() {
    const credentialError = document.getElementById('credentialError');
    const passwordError = document.getElementById('passwordError');
    
    if (credentialError) {
        credentialError.textContent = '';
        credentialError.style.display = 'none';
    }
    if (passwordError) {
        passwordError.textContent = '';
        passwordError.style.display = 'none';
    }
    
    // Remove error class from inputs
    const loginCredential = document.getElementById('loginCredential');
    const loginPassword = document.getElementById('loginPassword');
    
    if (loginCredential) loginCredential.classList.remove('error');
    if (loginPassword) loginPassword.classList.remove('error');
    
    // Hide all error messages
    const errorElements = document.querySelectorAll('.error-message');
    errorElements.forEach(el => {
        el.style.display = 'none';
    });
}

// Show error message
function showError(fieldId, message) {
    const errorElement = document.getElementById(fieldId + 'Error');
    const inputElement = document.getElementById(fieldId);
    
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
    
    if (inputElement) {
        inputElement.classList.add('error');
    }
    
    console.error(`Error on field ${fieldId}: ${message}`);
}

// Show success message
function showSuccess() {
    const successMessage = document.getElementById('successMessage');
    if (successMessage) {
        successMessage.style.display = 'block';
    }
    
    console.log('Login successful, redirecting to dashboard...');
    
    // Redirect after 1 second
    setTimeout(() => {
        window.location.href = '/dashboard';
    }, 1000);
}

// Set loading state
function setLoading(isLoading) {
    const loginBtn = document.getElementById('loginBtn');
    
    if (loginBtn) {
        if (isLoading) {
            loginBtn.disabled = true;
            loginBtn.innerHTML = '<span class="loading"></span>Signing In...';
        } else {
            loginBtn.disabled = false;
            loginBtn.innerHTML = 'Sign In';
        }
    }
}

// Validate form inputs
function validateForm(formData) {
    let isValid = true;
    
    if (!formData.loginCredential.trim()) {
        showError('loginCredential', 'Email or mobile number is required');
        isValid = false;
    }
    
    if (!formData.loginPassword.trim()) {
        showError('loginPassword', 'Password is required');
        isValid = false;
    }
    
    return isValid;
}

// Handle login form submission
function setupLoginForm() {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) {
        console.error('Login form not found!');
        return;
    }
    
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        console.log('Form submitted, processing login...');
        
        clearErrors();
        
        const loginCredentialInput = document.getElementById('loginCredential');
        const loginPasswordInput = document.getElementById('loginPassword');
        
        if (!loginCredentialInput || !loginPasswordInput) {
            console.error('Login form inputs not found!');
            showError('loginCredential', 'Form inputs not found. Please refresh the page.');
            return;
        }
        
        const formData = {
            loginCredential: loginCredentialInput.value.trim(),
            loginPassword: loginPasswordInput.value
        };
        
        console.log('Form data:', { username: formData.loginCredential, password: '[HIDDEN]' });
        
        // Validate form
        if (!validateForm(formData)) {
            console.log('Form validation failed');
            return;
        }
        
        setLoading(true);
        
        try {
            console.log('Sending login request to /api/login...');
            
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'same-origin',
                body: JSON.stringify({
                    username: formData.loginCredential,
                    password: formData.loginPassword
                })
            });
            
            console.log('Response status:', response.status);
            console.log('Response headers:', Object.fromEntries(response.headers.entries()));
            
            let data;
            try {
                data = await response.json();
                console.log('Response data:', data);
            } catch (parseError) {
                console.error('Failed to parse JSON response:', parseError);
                const textResponse = await response.text();
                console.error('Raw response:', textResponse);
                throw new Error('Invalid JSON response from server');
            }
            
            if (response.ok && data.success !== false) {
                console.log('Login successful!');
                
                // Store user data if available
                if (data.user) {
                    localStorage.setItem('vyomnext_user', JSON.stringify(data.user));
                    console.log('User data stored in localStorage');
                }
                if (data.banking_data) {
                    localStorage.setItem('vyomnext_banking_data', JSON.stringify(data.banking_data));
                    console.log('Banking data stored in localStorage');
                }
                
                showSuccess();
                
            } else {
                console.log('Login failed with response:', data);
                // Handle specific error messages
                const errorMessage = data.message || data.error || 'Login failed. Please try again.';
                
                if (errorMessage.toLowerCase().includes('credential') || 
                    errorMessage.toLowerCase().includes('username') || 
                    errorMessage.toLowerCase().includes('email')) {
                    showError('loginCredential', errorMessage);
                } else if (errorMessage.toLowerCase().includes('password')) {
                    showError('loginPassword', errorMessage);
                } else {
                    showError('loginCredential', errorMessage);
                }
            }
        } catch (error) {
            console.error('Login network/fetch error:', error);
            showError('loginCredential', 'Network error. Please check your connection and try again.');
        } finally {
            setLoading(false);
        }
    });
}

// Forgot password functionality
function forgotPassword() {
    const credential = document.getElementById('loginCredential');
    if (!credential) {
        alert("Form not properly loaded. Please refresh the page.");
        return;
    }
    
    const credentialValue = credential.value.trim();
    
    if (!credentialValue) {
        alert("Please enter your email or mobile number first.");
        credential.focus();
        return;
    }

    alert('Forgot password functionality will be implemented soon. Please contact support for password reset.');
}

// Setup input event listeners
function setupInputListeners() {
    const loginCredential = document.getElementById('loginCredential');
    const loginPassword = document.getElementById('loginPassword');
    
    if (loginCredential) {
        // Clear errors when user starts typing
        loginCredential.addEventListener('input', function() {
            if (this.classList.contains('error')) {
                this.classList.remove('error');
                const errorElement = document.getElementById('credentialError');
                if (errorElement) errorElement.style.display = 'none';
            }
        });
        
        // Handle Enter key press to move to next field
        loginCredential.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (loginPassword) {
                    loginPassword.focus();
                }
            }
        });
    }
    
    if (loginPassword) {
        // Clear errors when user starts typing
        loginPassword.addEventListener('input', function() {
            if (this.classList.contains('error')) {
                this.classList.remove('error');
                const errorElement = document.getElementById('passwordError');
                if (errorElement) errorElement.style.display = 'none';
            }
        });
        
        // Handle Enter key to submit form
        loginPassword.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const form = document.getElementById('loginForm');
                if (form) {
                    form.dispatchEvent(new Event('submit'));
                }
            }
        });
    }
}

// Check if user is already logged in
async function checkAuth() {
    try {
        console.log('Checking authentication status...');
        
        const response = await fetch('/api/check-auth', {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        console.log('Auth check response status:', response.status);
        
        if (response.ok) {
            const data = await response.json();
            console.log('Auth check response:', data);
            
            if (data.authenticated) {
                console.log('User already authenticated, redirecting to dashboard...');
                window.location.href = '/dashboard';
                return;
            }
        }
        
        console.log('User not authenticated, staying on login page');
        
    } catch (error) {
        console.error('Auth check error:', error);
        // Don't redirect on error, just log it
    }
}

// Initialize page when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing login page...');
    
    // Check if required elements exist
    const loginForm = document.getElementById('loginForm');
    const loginCredential = document.getElementById('loginCredential');
    const loginPassword = document.getElementById('loginPassword');
    
    if (!loginForm) {
        console.error('Login form not found! Make sure the HTML has id="loginForm"');
        return;
    }
    
    if (!loginCredential) {
        console.error('Login credential input not found! Make sure the HTML has id="loginCredential"');
        return;
    }
    
    if (!loginPassword) {
        console.error('Login password input not found! Make sure the HTML has id="loginPassword"');
        return;
    }
    
    console.log('All required elements found, setting up form...');
    
    // Setup form and input listeners
    setupLoginForm();
    setupInputListeners();
    
    // Auto-focus on first input
    loginCredential.focus();
    
    // Check authentication status
    checkAuth();
});

// Fallback initialization if DOMContentLoaded already fired
if (document.readyState === 'loading') {
    // DOM is still loading, wait for DOMContentLoaded
    console.log('DOM still loading, waiting...');
} else {
    // DOM already loaded
    console.log('DOM already loaded, initializing immediately...');
    document.dispatchEvent(new Event('DOMContentLoaded'));
}