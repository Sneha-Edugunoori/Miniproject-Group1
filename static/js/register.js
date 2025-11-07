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

// Terms and Privacy functions
function showTerms() {
    alert('Terms of Service will be displayed in a modal or separate page.');
}

function showPrivacy() {
    alert('Privacy Policy will be displayed in a modal or separate page.');
}

// Global variables for OTP
let userEmail = '';
let otpExpiryTime = null;
let resendTimeout = null;

document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('registerForm');
    const registerBtn = document.getElementById('registerBtn');
    const successMessage = document.getElementById('successMessage');

    // Form inputs
    const usernameInput = document.getElementById('username');
    const fullNameInput = document.getElementById('fullName');
    const emailInput = document.getElementById('email');
    const aadharInput = document.getElementById('aadharNumber');
    const mobileInput = document.getElementById('mobileNumber');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const termsCheckbox = document.getElementById('terms');

    // OTP Modal elements
    const otpModal = document.getElementById('otpModal');
    const otpInputs = document.querySelectorAll('.otp-input');
    const verifyOtpBtn = document.getElementById('verifyOtpBtn');
    const resendOtpBtn = document.getElementById('resendOtpBtn');
    const otpError = document.getElementById('otpError');
    const otpEmailDisplay = document.getElementById('otpEmail');
    const otpTimerDisplay = document.getElementById('otpTimer');
    const resendTimerDisplay = document.getElementById('resendTimer');

    // Clear error and success messages
    function clearMessages(fieldId) {
        const errorElement = document.getElementById(fieldId + 'Error');
        const successElement = document.getElementById(fieldId + 'Success');
        const inputElement = document.getElementById(fieldId);
        
        if (errorElement) errorElement.textContent = '';
        if (successElement) successElement.textContent = '';
        
        if (inputElement) {
            inputElement.classList.remove('error', 'valid', 'success');
        }
    }

    // Show error message
    function showError(fieldId, message) {
        const errorElement = document.getElementById(fieldId + 'Error');
        const inputElement = document.getElementById(fieldId);
        
        if (errorElement) errorElement.textContent = message;
        if (inputElement) {
            inputElement.classList.add('error');
            inputElement.classList.remove('valid', 'success');
        }
    }

    // Show success message
    function showSuccess(fieldId, message = '') {
        const successElement = document.getElementById(fieldId + 'Success');
        const inputElement = document.getElementById(fieldId);
        
        if (successElement) {
            successElement.textContent = message;
        }
        if (inputElement) {
            inputElement.classList.add('valid', 'success');
            inputElement.classList.remove('error');
        }
    }

    // Show form success message
    function showFormSuccess() {
        const successMessage = document.getElementById('successMessage');
        if (successMessage) {
            successMessage.style.display = 'block';
            
            setTimeout(() => {
                window.location.href = '/login';
            }, 3000);
        }
    }

    // Set loading state
    function setLoading(isLoading) {
        const registerBtn = document.getElementById('registerBtn');
        
        if (registerBtn) {
            if (isLoading) {
                registerBtn.classList.add('loading');
                registerBtn.disabled = true;
            } else {
                registerBtn.classList.remove('loading');
                registerBtn.disabled = false;
            }
        }
    }

    // Password strength checker
    function checkPasswordStrength(password) {
        const strengthElement = document.getElementById('passwordStrength');
        if (!strengthElement) return;

        let strength = 0;
        let feedback = '';

        if (password.length >= 8) strength++;
        if (/[a-z]/.test(password)) strength++;
        if (/[A-Z]/.test(password)) strength++;
        if (/[0-9]/.test(password)) strength++;
        if (/[^A-Za-z0-9]/.test(password)) strength++;

        switch (strength) {
            case 0:
            case 1:
                feedback = 'Weak password';
                strengthElement.className = 'password-strength strength-weak';
                break;
            case 2:
            case 3:
                feedback = 'Medium strength password';
                strengthElement.className = 'password-strength strength-medium';
                break;
            case 4:
            case 5:
                feedback = 'Strong password';
                strengthElement.className = 'password-strength strength-strong';
                break;
        }

        strengthElement.textContent = password.length > 0 ? feedback : '';
    }

    // Validation functions
    function validateUsername(username) {
        if (!username.trim()) return 'Username is required';
        if (username.length < 3) return 'Username must be at least 3 characters';
        if (username.length > 20) return 'Username must not exceed 20 characters';
        if (!/^[a-zA-Z0-9_]+$/.test(username)) return 'Username can only contain letters, numbers, and underscores';
        return null;
    }

    function validateFullName(name) {
        if (!name.trim()) return 'Full name is required';
        if (name.length < 2) return 'Full name must be at least 2 characters long';
        if (name.length > 100) return 'Full name must be less than 100 characters';
        if (!/^[a-zA-Z\s]+$/.test(name)) return 'Full name should only contain letters and spaces';
        return null;
    }

    function validateEmail(email) {
        if (!email.trim()) return 'Email is required';
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) return 'Please enter a valid email address';
        return null;
    }

    function validateAadhar(aadhar) {
        if (!aadhar.trim()) return 'Aadhar number is required';
        const cleanAadhar = aadhar.replace(/\D/g, '');
        if (cleanAadhar.length !== 12) return 'Aadhar must be exactly 12 digits';
        if (/^(\d)\1{11}$/.test(cleanAadhar)) return 'Please enter a valid Aadhar number';
        return null;
    }

    function validateMobile(mobile) {
        if (!mobile.trim()) return 'Mobile number is required';
        const cleanMobile = mobile.replace(/\D/g, '');
        if (!/^[6-9]\d{9}$/.test(cleanMobile)) return 'Please enter a valid 10-digit Indian mobile number';
        return null;
    }

    function validatePassword(password) {
        if (!password) return 'Password is required';
        if (password.length < 6) return 'Password must be at least 6 characters';
        return null;
    }

    function validateConfirmPassword(password, confirmPassword) {
        if (!confirmPassword) return 'Please confirm your password';
        if (password !== confirmPassword) return 'Passwords do not match';
        return null;
    }

    // Check if user exists (debounced)
    let checkUserTimeout;
    async function checkUserExists(field, value) {
        clearTimeout(checkUserTimeout);
        checkUserTimeout = setTimeout(async () => {
            if (!value.trim()) return;

            try {
                const response = await fetch('/check-user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ credential: value })
                });

                const data = await response.json();
                
                if (data.exists) {
                    const errorMessage = field === 'username' ? 'Username already taken' : 
                                       field === 'email' ? 'Email already registered' : 
                                       field === 'aadharNumber' ? 'Aadhar number already registered' :
                                       'Mobile number already registered';
                    showError(field, errorMessage);
                } else {
                    showSuccess(field, '✓ Available');
                }
            } catch (error) {
                console.error('Error checking user:', error);
            }
        }, 500);
    }

    // OTP Modal Functions
    function showOtpModal(email) {
        userEmail = email;
        
        if (!otpModal || !otpEmailDisplay) {
            console.error('OTP modal elements not found!');
            alert(`OTP has been sent to ${email}. Please check your email.`);
            return;
        }
        
        otpEmailDisplay.textContent = email;
        otpModal.classList.add('active');
        
        if (otpInputs && otpInputs.length > 0) {
            otpInputs.forEach(input => {
                input.value = '';
                input.classList.remove('filled', 'error');
            });
            
            otpInputs[0].focus();
        }
        
        if (otpError) {
            otpError.textContent = '';
        }
        
        startOtpTimer();
        startResendTimer();
    }

    function hideOtpModal() {
        otpModal.classList.remove('active');
        clearInterval(otpExpiryTime);
        clearInterval(resendTimeout);
    }

    function startOtpTimer() {
        let timeLeft = 600;
        
        otpExpiryTime = setInterval(() => {
            timeLeft--;
            
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            otpTimerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            if (timeLeft <= 0) {
                clearInterval(otpExpiryTime);
                otpError.textContent = 'OTP has expired. Please request a new one.';
                verifyOtpBtn.disabled = true;
            }
        }, 1000);
    }

    function startResendTimer() {
        let timeLeft = 60;
        resendOtpBtn.disabled = true;
        
        resendTimeout = setInterval(() => {
            timeLeft--;
            resendTimerDisplay.textContent = `(${timeLeft}s)`;
            
            if (timeLeft <= 0) {
                clearInterval(resendTimeout);
                resendOtpBtn.disabled = false;
                resendTimerDisplay.textContent = '';
            }
        }, 1000);
    }

    // OTP Input handling
    if (otpInputs) {
        otpInputs.forEach((input, index) => {
            input.addEventListener('input', function(e) {
                this.value = this.value.replace(/\D/g, '');
                
                if (this.value) {
                    this.classList.add('filled');
                    this.classList.remove('error');
                    
                    if (index < otpInputs.length - 1) {
                        otpInputs[index + 1].focus();
                    }
                } else {
                    this.classList.remove('filled');
                }
                
                if (otpError.textContent) {
                    otpError.textContent = '';
                }
            });

            input.addEventListener('keydown', function(e) {
                if (e.key === 'Backspace' && !this.value && index > 0) {
                    otpInputs[index - 1].focus();
                    otpInputs[index - 1].value = '';
                    otpInputs[index - 1].classList.remove('filled');
                }
                
                if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    navigator.clipboard.readText().then(text => {
                        const digits = text.replace(/\D/g, '').slice(0, 6);
                        digits.split('').forEach((digit, i) => {
                            if (otpInputs[i]) {
                                otpInputs[i].value = digit;
                                otpInputs[i].classList.add('filled');
                            }
                        });
                        if (digits.length === 6) {
                            otpInputs[5].focus();
                        }
                    });
                }
            });
        });
    }

    // Verify OTP
    if (verifyOtpBtn) {
        verifyOtpBtn.addEventListener('click', async function() {
            const otp = Array.from(otpInputs).map(input => input.value).join('');
            
            if (otp.length !== 6) {
                otpError.textContent = 'Please enter complete OTP';
                otpInputs.forEach(input => input.classList.add('error'));
                return;
            }
            
            verifyOtpBtn.classList.add('loading');
            verifyOtpBtn.disabled = true;
            otpError.textContent = '';
            
            try {
                const response = await fetch('/verify-otp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: userEmail,
                        otp: otp
                    })
                });
                
                const result = await response.json();
                
                if (response.ok && result.success) {
                    hideOtpModal();
                    showFormSuccess();
                } else {
                    otpError.textContent = result.message || 'Invalid OTP. Please try again.';
                    otpInputs.forEach(input => {
                        input.classList.add('error');
                        input.value = '';
                        input.classList.remove('filled');
                    });
                    otpInputs[0].focus();
                }
            } catch (error) {
                console.error('OTP verification error:', error);
                otpError.textContent = 'Network error. Please try again.';
            } finally {
                verifyOtpBtn.classList.remove('loading');
                verifyOtpBtn.disabled = false;
            }
        });
    }

    // Resend OTP
    if (resendOtpBtn) {
        resendOtpBtn.addEventListener('click', async function() {
            if (this.disabled) return;
            
            this.classList.add('loading');
            otpError.textContent = '';
            
            try {
                const response = await fetch('/resend-otp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: userEmail })
                });
                
                const result = await response.json();
                
                if (response.ok && result.success) {
                    otpInputs.forEach(input => {
                        input.value = '';
                        input.classList.remove('filled', 'error');
                    });
                    otpInputs[0].focus();
                    
                    otpError.style.color = '#28a745';
                    otpError.textContent = 'OTP resent successfully!';
                    setTimeout(() => {
                        otpError.style.color = '#dc3545';
                        otpError.textContent = '';
                    }, 3000);
                    
                    clearInterval(otpExpiryTime);
                    clearInterval(resendTimeout);
                    startOtpTimer();
                    startResendTimer();
                } else {
                    otpError.textContent = result.message || 'Failed to resend OTP';
                }
            } catch (error) {
                console.error('Resend OTP error:', error);
                otpError.textContent = 'Network error. Please try again.';
            } finally {
                this.classList.remove('loading');
            }
        });
    }

    // Real-time validation event listeners
    if (usernameInput) {
        usernameInput.addEventListener('input', function() {
            const error = validateUsername(this.value);
            if (error) {
                showError('username', error);
            } else {
                clearMessages('username');
                checkUserExists('username', this.value);
            }
        });
    }

    if (fullNameInput) {
        fullNameInput.addEventListener('input', function() {
            const error = validateFullName(this.value);
            if (error) {
                showError('fullName', error);
            } else {
                clearMessages('fullName');
                if (this.value.trim().length >= 2) {
                    showSuccess('fullName');
                }
            }
        });
    }

    if (emailInput) {
        emailInput.addEventListener('input', function() {
            const error = validateEmail(this.value);
            if (error) {
                showError('email', error);
            } else {
                clearMessages('email');
                checkUserExists('email', this.value);
            }
        });
    }

    if (aadharInput) {
        aadharInput.addEventListener('input', function() {
            this.value = this.value.replace(/\D/g, '').substring(0, 12);
            
            const error = validateAadhar(this.value);
            if (error) {
                showError('aadharNumber', error);
            } else {
                clearMessages('aadharNumber');
                checkUserExists('aadharNumber', this.value);
            }
        });
    }

    if (mobileInput) {
        mobileInput.addEventListener('input', function() {
            this.value = this.value.replace(/\D/g, '').substring(0, 10);
            
            const error = validateMobile(this.value);
            if (error) {
                showError('mobileNumber', error);
            } else {
                clearMessages('mobileNumber');
                checkUserExists('mobileNumber', this.value);
            }
        });
    }

    if (passwordInput) {
        passwordInput.addEventListener('input', function() {
            checkPasswordStrength(this.value);
            const error = validatePassword(this.value);
            if (error) {
                showError('password', error);
            } else {
                clearMessages('password');
            }
            
            if (confirmPasswordInput && confirmPasswordInput.value) {
                const confirmError = validateConfirmPassword(this.value, confirmPasswordInput.value);
                if (confirmError) {
                    showError('confirmPassword', confirmError);
                } else {
                    clearMessages('confirmPassword');
                    showSuccess('confirmPassword');
                }
            }
        });
    }

    if (confirmPasswordInput) {
        confirmPasswordInput.addEventListener('input', function() {
            if (passwordInput) {
                const error = validateConfirmPassword(passwordInput.value, this.value);
                if (error) {
                    showError('confirmPassword', error);
                } else {
                    clearMessages('confirmPassword');
                    showSuccess('confirmPassword');
                }
            }
        });
    }

    // Form submission
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            ['username', 'fullName', 'email', 'aadharNumber', 'mobileNumber', 'password', 'confirmPassword', 'terms'].forEach(field => {
                clearMessages(field);
            });
            
            const formData = new FormData(this);
            const data = Object.fromEntries(formData);
            
            let hasErrors = false;
            
            const usernameError = validateUsername(data.username);
            if (usernameError) {
                showError('username', usernameError);
                hasErrors = true;
            }
            
            const fullNameError = validateFullName(data.fullName);
            if (fullNameError) {
                showError('fullName', fullNameError);
                hasErrors = true;
            }
            
            const emailError = validateEmail(data.email);
            if (emailError) {
                showError('email', emailError);
                hasErrors = true;
            }
            
            const aadharError = validateAadhar(data.aadharNumber);
            if (aadharError) {
                showError('aadharNumber', aadharError);
                hasErrors = true;
            }
            
            const mobileError = validateMobile(data.mobileNumber);
            if (mobileError) {
                showError('mobileNumber', mobileError);
                hasErrors = true;
            }
            
            const passwordError = validatePassword(data.password);
            if (passwordError) {
                showError('password', passwordError);
                hasErrors = true;
            }
            
            const confirmPasswordError = validateConfirmPassword(data.password, data.confirmPassword);
            if (confirmPasswordError) {
                showError('confirmPassword', confirmPasswordError);
                hasErrors = true;
            }
            
            if (!data.terms) {
                showError('terms', 'You must agree to the Terms of Service');
                hasErrors = true;
            }
            
            if (hasErrors) return;
            
            setLoading(true);
            
            try {
                const response = await fetch('/register', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(data)
                });
                
                const contentType = response.headers.get('content-type');
                if (!contentType || !contentType.includes('application/json')) {
                    throw new Error('Server returned non-JSON response');
                }
                
                const result = await response.json();
                
                if (response.ok && result.success !== false) {
                    if (result.requiresOtp) {
                        showOtpModal(data.email);
                    } else {
                        showFormSuccess();
                    }
                } else {
                    if (result.errors) {
                        Object.entries(result.errors).forEach(([field, message]) => {
                            showError(field, message);
                        });
                    } else {
                        showError('username', result.message || result.error || 'Registration failed');
                    }
                }
            } catch (error) {
                console.error('Registration error:', error);
                showError('username', 'Network error. Please check your connection and try again.');
            } finally {
                setLoading(false);
            }
        });
    }

    // Auto-focus on first input
    window.addEventListener('load', function() {
        if (usernameInput) {
            usernameInput.focus();
        }
    });

    // Enhanced UX
    const inputs = document.querySelectorAll('.form-input');
    
    inputs.forEach(input => {
        input.addEventListener('focus', function() {
            this.parentElement.classList.add('focused');
        });
        
        input.addEventListener('blur', function() {
            this.parentElement.classList.remove('focused');
        });
        
        input.addEventListener('input', function() {
            this.parentElement.classList.add('typing');
            setTimeout(() => {
                this.parentElement.classList.remove('typing');
            }, 500);
        });
    });

    // Keyboard navigation for password toggle
    const toggleButtons = document.querySelectorAll('.password-toggle-btn');
    toggleButtons.forEach(button => {
        button.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.click();
            }
        });
    });

    // Close modal on escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && otpModal && otpModal.classList.contains('active')) {
            if (confirm('Are you sure you want to cancel the verification? You will need to register again.')) {
                hideOtpModal();
            }
        }
    });

    // Prevent closing modal by clicking outside
    if (otpModal) {
        otpModal.addEventListener('click', function(e) {
            if (e.target === otpModal) {
                if (confirm('Are you sure you want to cancel the verification? You will need to register again.')) {
                    hideOtpModal();
                }
            }
        });
    }
});