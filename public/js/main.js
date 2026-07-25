// DOM Elements
const requestForm = document.getElementById('requestForm');
const imageInput = document.getElementById('image');
const imagePreview = document.getElementById('imagePreview');
const divisionSelect = document.getElementById('division');
const citySelect = document.getElementById('city');
const colonySelect = document.getElementById('colony');
const successModal = new bootstrap.Modal(document.getElementById('successModal'));

// Initialize tooltips
const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));

// Image preview and validation
imageInput?.addEventListener('change', function() {
    const file = this.files[0];
    if (!file) {
        imagePreview.innerHTML = '';
        return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
        alert('Image size must be less than 5MB');
        this.value = '';
        imagePreview.innerHTML = '';
        return;
    }

    // Validate file type
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
        alert('Only JPEG and PNG images are allowed');
        this.value = '';
        imagePreview.innerHTML = '';
        return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = function(e) {
        imagePreview.innerHTML = `<img src="${e.target.result}" class="img-fluid" alt="Preview">`;
    };
    reader.readAsDataURL(file);
});

// Auto-capitalize input fields
document.querySelectorAll('input[type="text"]:not(#email), textarea').forEach(input => {
    input.addEventListener('input', function() {
        this.value = this.value.toUpperCase();
    });
});

// CUG number validation (only digits, max 10)
document.getElementById('mobile')?.addEventListener('input', function() {
    this.value = this.value.replace(/\D/g, '').slice(0, 10);
});

// Email validation
document.getElementById('email')?.addEventListener('blur', function() {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.value)) {
        this.classList.add('is-invalid');
    } else {
        this.classList.remove('is-invalid');
    }
});

// Load divisions on page load
async function loadDivisions() {
    try {
        const response = await fetch(`/api/divisions?t=${Date.now()}`);
        const divisions = await response.json();
        
        divisionSelect.innerHTML = '<option value="">Select Division</option>';
        divisions.forEach(division => {
            divisionSelect.innerHTML += `<option value="${division.id}">${division.name}</option>`;
        });
    } catch (error) {
        console.error('Error loading divisions:', error);
    }
}

// Load cities based on selected division
divisionSelect?.addEventListener('change', async function() {
    // Clear previous options completely
    citySelect.innerHTML = '<option value="">Select City</option>';
    colonySelect.innerHTML = '<option value="">Select Colony</option>';
    
    if (!this.value) {
        citySelect.disabled = true;
        colonySelect.disabled = true;
        return;
    }

    try {
        citySelect.disabled = false;
        const response = await fetch(`/api/cities/${this.value}?t=${Date.now()}`);
        const cities = await response.json();
        
        // Build options array first to avoid duplicates
        const uniqueCities = [];
        const seenCities = new Set();
        
        cities.forEach(city => {
            // Create a unique key to prevent duplicates
            const uniqueKey = `${city.id}-${city.name}`;
            if (!seenCities.has(uniqueKey)) {
                seenCities.add(uniqueKey);
                uniqueCities.push(city);
            }
        });
        
        // Build complete HTML string at once
        let optionsHtml = '<option value="">Select City</option>';
        uniqueCities.forEach(city => {
            optionsHtml += `<option value="${city.id}">${city.name}</option>`;
        });
        
        // Set all options at once to prevent partial updates
        citySelect.innerHTML = optionsHtml;
        
    } catch (error) {
        console.error('Error loading cities:', error);
        citySelect.innerHTML = '<option value="">Error loading cities</option>';
        citySelect.disabled = true;
    }
});

// Load colonies based on selected city
citySelect?.addEventListener('change', async function() {
    // Clear previous options completely
    colonySelect.innerHTML = '<option value="">Select Colony</option>';
    
    if (!this.value) {
        colonySelect.disabled = true;
        return;
    }

    try {
        colonySelect.disabled = false;
        const response = await fetch(`/api/colonies/${this.value}?t=${Date.now()}`);
        const colonies = await response.json();
        
        // Build options array first to avoid duplicates
        const uniqueColonies = [];
        const seenColonies = new Set();
        
        colonies.forEach(colony => {
            // Create a unique key to prevent duplicates
            const uniqueKey = `${colony.id}-${colony.name}`;
            if (!seenColonies.has(uniqueKey)) {
                seenColonies.add(uniqueKey);
                uniqueColonies.push(colony);
            }
        });
        
        // Build complete HTML string at once
        let optionsHtml = '<option value="">Select Colony</option>';
        uniqueColonies.forEach(colony => {
            optionsHtml += `<option value="${colony.id}">${colony.name}</option>`;
        });
        
        // Set all options at once to prevent partial updates
        colonySelect.innerHTML = optionsHtml;
        
    } catch (error) {
        console.error('Error loading colonies:', error);
        colonySelect.innerHTML = '<option value="">Error loading colonies</option>';
        colonySelect.disabled = true;
    }
});

// Form submission
requestForm?.addEventListener('submit', async function(e) {
    e.preventDefault();

    // Basic form validation
    const requiredFields = this.querySelectorAll('[required]');
    let isValid = true;

    requiredFields.forEach(field => {
        if (!field.value.trim()) {
            field.classList.add('is-invalid');
            isValid = false;
        } else {
            field.classList.remove('is-invalid');
        }
    });

    if (!isValid) {
        alert('Please fill in all required fields');
        return;
    }

    // Disable submit button and show loading state
    const submitButton = this.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.innerHTML;
    submitButton.disabled = true;
    submitButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Submitting...';

    try {
        const formData = new FormData(this);
        
        const response = await fetch('/api/submit-request', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Error submitting request');
        }

        if (!result.requestId) {
            throw new Error('No request ID received from server');
        }

        // Show success message with request ID
        const successMessage = document.getElementById('successMessage');
        const requestIdElement = document.getElementById('requestId');
        
        if (successMessage) {
            successMessage.innerHTML = `
                Your maintenance request has been submitted successfully.
                <div class="text-center mt-3">
                    <h3 class="text-success">Request ID: ${result.requestId}</h3>
                </div>
            `;
        }
        
        if (requestIdElement) {
            requestIdElement.textContent = result.requestId;
        }

        // Show success modal
        successModal.show();

        // Reset form
        this.reset();
        imagePreview.innerHTML = '';
        citySelect.innerHTML = '<option value="">Select City</option>';
        colonySelect.innerHTML = '<option value="">Select Colony</option>';
        citySelect.disabled = true;
        colonySelect.disabled = true;

        // Reset form
        this.reset();
        imagePreview.innerHTML = '';
        
        // Reset dropdowns
        citySelect.innerHTML = '<option value="">Select City</option>';
        colonySelect.innerHTML = '<option value="">Select Colony</option>';

    } catch (error) {
        console.error('Error submitting form:', error);
        alert(error.message || 'An error occurred while submitting your request. Please try again.');
    } finally {
        // Reset submit button state
        submitButton.disabled = false;
        submitButton.innerHTML = originalButtonText;
    }
});

// Load departments
async function loadDepartments() {
    const departmentSelect = document.getElementById('department');
    if (!departmentSelect) return;

    try {
        const response = await fetch(`/api/departments?t=${Date.now()}`);
        const departments = await response.json();
        
        departmentSelect.innerHTML = '<option value="">Select Department</option>';
        departments.forEach(dept => {
            departmentSelect.innerHTML += `<option value="${dept.id}">${dept.name}</option>`;
        });
    } catch (error) {
        console.error('Error loading departments:', error);
    }
}

// Initialize divisions and departments on page load
document.addEventListener('DOMContentLoaded', function() {
    if (divisionSelect) {
        loadDivisions();
    }
    loadDepartments();
});