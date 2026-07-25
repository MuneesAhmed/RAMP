document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const errorAlert = document.getElementById('errorAlert');

    // Check if user is already logged in
    fetch('/api/auth/me', {
        credentials: 'same-origin',
        headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
        }
    })
        .then(async response => {
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    // Not logged in - this is normal, just continue
                    return;
                }
                throw new Error('Server error while checking session');
            }
            const data = await response.json();
            if (data && data.user && data.user.role) {
                redirectBasedOnRole(data.user);
            } else {
                throw new Error('Invalid response data');
            }
        })
        .catch(error => {
            console.error('Session check failed:', error);
            showError('Server error. Please try again later.');
        });

    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;

        if (!username || !password) {
            showError('Please enter both username and password.');
            return;
        }

        // Disable form while processing
        const submitButton = loginForm.querySelector('button[type="submit"]');
        const originalButtonText = submitButton.innerHTML;
        submitButton.disabled = true;
        submitButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Authenticating...';

        fetch('/api/auth/login', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
            },
            body: JSON.stringify({
                username: username,
                password: password
            })
        })
        .then(async response => {
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Authentication failed');
            }
            return data;
        })
        .then(data => {
            // Clear any existing errors
            hideError();
            redirectBasedOnRole(data);
        })
        .catch(error => {
            console.error('Login error:', error);
            showError(error.message || 'Invalid username or password. Please try again.');
            // Reset form state
            submitButton.disabled = false;
            submitButton.innerHTML = originalButtonText;
        });
    });

    function showError(message) {
        errorAlert.textContent = message;
        errorAlert.classList.remove('d-none');
    }

    function hideError() {
        errorAlert.textContent = '';
        errorAlert.classList.add('d-none');
    }

    function redirectBasedOnRole(data) {
        // Debug logging
        console.log('Redirect function called with data:', data);
        
        // Handle both direct role and nested user object formats
        const role = data.role || (data.user && data.user.role);
        
        console.log('Extracted role:', role);
        
        if (!role) {
            console.error('No role found in data:', data);
            showError('User role not found. Please contact your administrator.');
            return;
        }

        // Normalize the role to handle potential case differences
        const normalizedRole = role.toLowerCase();
        
        // Get return URL from query parameters and validate it
        const params = new URLSearchParams(window.location.search);
        let returnUrl = params.get('return');
        
        // Validate return URL
        if (returnUrl) {
            // Only allow relative URLs for security
            if (returnUrl.startsWith('http://') || returnUrl.startsWith('https://')) {
                console.warn('Invalid return URL, using default');
                returnUrl = null;
            }
            // Make sure the URL starts with /
            if (!returnUrl.startsWith('/')) {
                returnUrl = '/' + returnUrl;
            }
        }
        
        if (normalizedRole.startsWith('admin_')) {
            window.location.href = returnUrl || '/admin/dashboard.html';
        } else if (normalizedRole === 'supervisor') {
            window.location.href = returnUrl || '/supervisor/dashboard.html';
        } else {
            console.error('Invalid role:', role);
            showError('Invalid user role. Please contact your administrator.');
        }
    }
});