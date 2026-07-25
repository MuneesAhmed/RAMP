// DOM Elements
const trackByIdForm = document.getElementById('trackByIdForm');
const trackByCredentialsForm = document.getElementById('trackByCredentialsForm');
const requestDetailsSection = document.getElementById('requestDetails');
const multipleRequestsSection = document.getElementById('multipleRequests');
const requestTable = document.getElementById('requestTable');
const statusTimeline = document.getElementById('statusHistory');

// Debug: Log if elements are found
console.log('DOM Elements found:', {
    trackByIdForm: !!trackByIdForm,
    trackByCredentialsForm: !!trackByCredentialsForm,
    requestDetailsSection: !!requestDetailsSection,
    multipleRequestsSection: !!multipleRequestsSection,
    requestTable: !!requestTable,
    statusTimeline: !!statusTimeline
});

// Format date to local string
function formatDate(dateString) {
    return new Date(dateString).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

// Create status timeline HTML
function createStatusTimeline(history) {
    return history.map(item => {
        const statusClass = item.status.toLowerCase().replace(' ', '-');
        return `
            <div class="timeline-item ${statusClass}">
                <div class="timeline-content">
                    <h6 class="mb-1">${item.status}</h6>
                    <p class="mb-0">${item.remarks || 'No remarks provided'}</p>
                    <small class="timeline-date">${formatDate(item.timestamp)}</small>
                </div>
            </div>
        `;
    }).join('');
}

// Create request details HTML
function createRequestDetails(request) {
    const statusClass = request.status.toLowerCase().replace(' ', '-');
    return `
        <div class="card mb-4">
            <div class="card-body">
                <h5 class="card-title">Request #${request.request_id || request.id}</h5>
                <div class="row g-3">
                    <div class="col-md-6">
                        <p><strong>Location:</strong> ${request.division} - ${request.city}</p>
                        <p><strong>Colony:</strong> ${request.colony}</p>
                        <p><strong>Wing/Block:</strong> ${request.wing || 'N/A'}</p>
                        <p><strong>Quarter/Flat:</strong> ${request.flat || 'N/A'}</p>
                    </div>
                    <div class="col-md-6">
                        <p><strong>Department:</strong> ${request.department}</p>
                        <p><strong>Location:</strong> ${request.category}</p>
                        <p><strong>Status:</strong> <span class="badge.${statusClass}">${request.status}</span></p>
                        <p><strong>Created:</strong> ${formatDate(request.created_at)}</p>
                    </div>
                </div>
                <div class="mt-3">
                    <p><strong>Description:</strong></p>
                    <p>${request.description}</p>
                </div>
                ${request.image_path ? `
                    <div class="mt-3">
                        <p><strong>Attached Image:</strong></p>
                        <img src="/uploads/${request.image_path}" class="img-fluid rounded" alt="Request Image" style="max-width: 300px">
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

// Create request table row HTML
function createRequestTableRow(request) {
    const statusClass = request.status.toLowerCase().replace(/\s+/g, '-');
    return `
        <tr>
            <td>${request.request_id || request.id}</td>
            <td>${request.category}</td>
            <td>${request.department}</td>
            <td><span class="badge.${statusClass}">${request.status}</span></td>
            <td>${formatDate(request.created_at)}</td>
            <td>
                <button class="btn btn-primary btn-sm" onclick="showRequestDetails('${request.request_id || request.id}')">View Details</button>
            </td>
        </tr>
    `;
}

// Track request by ID
trackByIdForm?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const requestId = document.getElementById('requestIdInput').value.trim();

    // Reset display states
    document.getElementById('requestDetails').classList.remove('d-none');
    document.getElementById('requestLoading').classList.remove('d-none');
    document.getElementById('requestNotFound').classList.add('d-none');
    document.getElementById('singleRequest').classList.add('d-none');
    document.getElementById('multipleRequests').classList.add('d-none');

    try {
        const response = await fetch(`/api/track/${requestId}`);
        document.getElementById('requestLoading').classList.add('d-none');
        
        const data = await response.json();
        
        if (!response.ok) {
            document.getElementById('requestNotFound').classList.remove('d-none');
            throw new Error(data.error || 'Request not found');
        }

        if (!data.request) {
            document.getElementById('requestNotFound').classList.remove('d-none');
            throw new Error('Request details not found');
        }

        document.getElementById('singleRequest').classList.remove('d-none');
        
        // Show request details
        requestDetailsSection.style.display = 'block';
        multipleRequestsSection.style.display = 'none';
        requestDetailsSection.innerHTML = createRequestDetails(data.request);
        
        // Show status timeline
        statusTimeline.innerHTML = createStatusTimeline(data.history);

    } catch (error) {
        console.error('Error tracking request:', error);
        alert('Request not found. Please check the ID and try again.');
    }
});

// Track requests by credentials
console.log('Setting up trackByCredentialsForm event listener...');
console.log('trackByCredentialsForm element:', trackByCredentialsForm);

if (trackByCredentialsForm) {
    console.log('Form found, adding event listener...');
    trackByCredentialsForm.addEventListener('submit', async function(e) {
        console.log('=== FORM SUBMISSION STARTED ===');
        e.preventDefault();
    const email = document.getElementById('emailInput').value.trim();
    const employeeId = document.getElementById('employeeIdInput').value.trim();

    console.log('Form submitted with:', { email, employeeId });

    try {
        // Clear any previous error state
        const errorDiv = document.getElementById('credentialsError');
        if (errorDiv) {
            errorDiv.style.display = 'none';
        }

        // Show loading state
        const submitButton = this.querySelector('button[type="submit"]');
        const originalButtonText = submitButton.innerHTML;
        submitButton.disabled = true;
        submitButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Searching...';

        console.log('Making API request to /api/track-by-credentials');

        const response = await fetch('/api/track-by-credentials', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, employee_id: employeeId })
        });

        console.log('Response status:', response.status);
        const data = await response.json();
        console.log('Response data:', data);

        if (!response.ok) {
            throw new Error(data.error || 'No requests found');
        }

        // Clear any previous error messages
        if (errorDiv) {
            errorDiv.style.display = 'none';
        }

        if (!data.requests || data.requests.length === 0) {
            throw new Error('No requests found for these credentials');
        }

        console.log('Found', data.requests.length, 'requests');

        // Show the main request details container and show multiple requests section
        console.log('Before showing table - requestDetailsSection classes:', requestDetailsSection.className);
        console.log('Before showing table - multipleRequestsSection classes:', multipleRequestsSection.className);
        
        // Show the main container that holds all request results
        requestDetailsSection.classList.remove('d-none');
        requestDetailsSection.style.display = 'block';
        
        // Hide single request view and show multiple requests table
        const singleRequestDiv = document.getElementById('singleRequest');
        if (singleRequestDiv) {
            singleRequestDiv.classList.add('d-none');
        }
        multipleRequestsSection.classList.remove('d-none');
        
        console.log('After showing table - requestDetailsSection classes:', requestDetailsSection.className);
        console.log('After showing table - multipleRequestsSection classes:', multipleRequestsSection.className);
        console.log('multipleRequestsSection style.display:', multipleRequestsSection.style.display);
        console.log('multipleRequestsSection offsetHeight:', multipleRequestsSection.offsetHeight);
        
        // Update table
        const tbody = document.getElementById('requestTable');
        console.log('Tbody element found:', !!tbody);
        console.log('multipleRequestsSection element found:', !!multipleRequestsSection);
        
        if (tbody) {
            const tableRows = data.requests
                .map(request => createRequestTableRow({
                    request_id: request.request_id, // Use the formatted request_id from the API
                    id: request.id,
                    department: request.department_name || request.department || 'N/A',
                    category: request.colony_name || request.location || request.category || 'N/A',
                    status: request.status,
                    created_at: request.created_at
                }))
                .join('');
            
            console.log('Generated table HTML:', tableRows);
            tbody.innerHTML = tableRows;
            console.log('Table updated with', data.requests.length, 'rows');
            
            // Force the table section to be visible
            multipleRequestsSection.style.display = 'block';
            multipleRequestsSection.classList.remove('d-none');
            
            // Also check parent containers
            const parentCard = multipleRequestsSection.closest('.card');
            if (parentCard) {
                parentCard.classList.remove('d-none');
                parentCard.style.display = 'block';
                console.log('Parent card found and made visible');
            }
        } else {
            console.error('Table tbody not found');
            alert('ERROR: Table tbody element not found');
        }

    } catch (error) {
        console.error('Error tracking requests:', error);
        const errorDiv = document.getElementById('credentialsError');
        if (errorDiv) {
            errorDiv.innerHTML = `<div class="alert alert-danger">
                ${error.message || 'No requests found for the provided credentials.'}
            </div>`;
            errorDiv.style.display = 'block';
        }
    } finally {
        // Reset button state
        const submitButton = this.querySelector('button[type="submit"]');
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML = 'Track Requests';
        }
    }
});
} else {
    console.error('trackByCredentialsForm not found! Check if element exists with ID: trackByCredentialsForm');
}

// Show request details when clicking on table row
async function showRequestDetails(requestId) {
    console.log('=== SHOW REQUEST DETAILS CALLED ===');
    console.log('Request ID:', requestId);
    
    try {
        const response = await fetch(`/api/track/${requestId}`);
        console.log('Individual request response status:', response.status);
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('API Error:', errorData);
            throw new Error('Request not found');
        }

        const data = await response.json();
        console.log('Individual request data:', data);
        
        // Show request details
        requestDetailsSection.style.display = 'block';
        
        // Hide the multiple requests table and show single request
        multipleRequestsSection.classList.add('d-none');
        const singleRequestDiv = document.getElementById('singleRequest');
        if (singleRequestDiv) {
            singleRequestDiv.classList.remove('d-none');
        }
        
        requestDetailsSection.innerHTML = createRequestDetails(data.request);
        
        // Show status timeline
        if (statusTimeline && data.history) {
            statusTimeline.innerHTML = createStatusTimeline(data.history);
        }
        
        // Scroll to details
        requestDetailsSection.scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        console.error('Error fetching request details:', error);
        alert('Error loading request details. Please try again.');
    }
}