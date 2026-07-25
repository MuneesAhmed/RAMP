// DOM Elements
const requestsTable = document.getElementById('requestsTable');
const requestModal = new bootstrap.Modal(document.getElementById('requestModal'));
const updateStatusForm = document.getElementById('updateStatusForm');

// Charts
let monthlyChart, statusChart;

// Format date for display
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

// Initialize Charts
function initializeCharts() {
    // Monthly Performance Chart
    const monthlyCtx = document.getElementById('performanceChart')?.getContext('2d');
    if (monthlyCtx) {
        monthlyChart = new Chart(monthlyCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Resolved Requests',
                    data: [],
                    borderColor: '#198754',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    // Status Distribution Chart
    const statusCtx = document.getElementById('statusChart')?.getContext('2d');
    if (statusCtx) {
        statusChart = new Chart(statusCtx, {
            type: 'doughnut',
            data: {
                labels: ['Pending', 'Not Operable', 'Resolved', 'Forwarded to Other Department'],
                datasets: [{
                    data: [0, 0, 0, 0],
                    backgroundColor: ['#ffc107', '#6c757d', '#198754', '#17a2b8']
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }
}

// Load Dashboard Statistics
async function loadDashboardStats() {
    try {
        const response = await fetch('/api/supervisor/stats');
        const stats = await response.json();

        // Update stats cards
        document.getElementById('totalAssigned').textContent = stats.totalAssigned;
        document.getElementById('pendingRequests').textContent = stats.pending;
        document.getElementById('resolvedRequests').textContent = stats.resolved;
        document.getElementById('avgResolutionTime').textContent = 
            stats.avgResolutionTime ? `${stats.avgResolutionTime} hours` : 'N/A';

        // Update monthly chart
        if (monthlyChart) {
            monthlyChart.data.labels = stats.monthly.map(m => m.month);
            monthlyChart.data.datasets[0].data = stats.monthly.map(m => m.resolved);
            monthlyChart.update();
        }

        // Update status chart
        if (statusChart) {
            statusChart.data.datasets[0].data = [
                stats.pending,
                stats.notOperable,
                stats.resolved,
                stats.forwarded
            ];
            statusChart.update();
        }

    } catch (error) {
        console.error('Error loading dashboard stats:', error);
        alert('Error loading dashboard statistics');
    }
}

// Load Requests Table with enhanced filtering
async function loadRequests(filters = {}) {
    try {
        const queryParams = new URLSearchParams(filters);
        const response = await fetch(`/api/supervisor/requests?${queryParams}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        const requests = data.requests || [];

        // Update summary
        const summaryDiv = document.getElementById('supervisorRequestsSummary');
        const countSpan = document.getElementById('supervisorRequestsCount');
        const totalSpan = document.getElementById('supervisorRequestsTotal');
        
        if (summaryDiv && countSpan && totalSpan) {
            countSpan.textContent = requests.length;
            totalSpan.textContent = data.total ? ` out of ${data.total} total` : '';
            summaryDiv.classList.remove('d-none');
        }

        const tbody = requestsTable.querySelector('tbody');
        
        if (requests.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No requests found matching the filters</td></tr>';
        } else {
            tbody.innerHTML = requests.map(request => `
                <tr>
                    <td>${request.id}</td>
                    <td>${request.division_name} - ${request.city_name}</td>
                    <td>${request.colony_name}</td>
                    <td class="text-truncate" style="max-width: 200px;" title="${request.description}">${request.description}</td>
                    <td><span class="badge ${getStatusBadgeClass(request.status)}">${request.status}</span></td>
                    <td>${formatDate(request.created_at)}</td>
                    <td>
                        <button class="btn btn-sm btn-primary" onclick="viewRequest('${request.id}')">View</button>
                    </td>
                </tr>
            `).join('');
        }

    } catch (error) {
        console.error('Error loading requests:', error);
        const tbody = requestsTable.querySelector('tbody');
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Error loading requests: ${error.message}</td></tr>`;
    }
}

// Helper function to get status badge class
function getStatusBadgeClass(status) {
    if (!status) return 'bg-secondary';
    switch (status.toLowerCase()) {
        case 'pending': return 'bg-warning text-dark';
        case 'not operable': return 'bg-secondary';
        case 'resolved': return 'bg-success';
        case 'forwarded to other department': return 'bg-info';
        default: return 'bg-secondary';
    }
}

// Load filter options for supervisor
async function loadSupervisorFilterOptions() {
    try {
        const response = await fetch('/api/supervisor/filter-options');
        const options = await response.json();

        // Populate status filter
        const statusSelect = document.getElementById('supervisorStatusFilter');
        if (statusSelect) {
            statusSelect.innerHTML = '<option value="">All Statuses</option>';
            options.statuses.forEach(status => {
                statusSelect.innerHTML += `<option value="${status.value}">${status.label}</option>`;
            });
        }

        // Populate department filter
        const departmentSelect = document.getElementById('supervisorDepartmentFilter');
        if (departmentSelect) {
            departmentSelect.innerHTML = '<option value="">All Departments</option>';
            options.departments.forEach(dept => {
                departmentSelect.innerHTML += `<option value="${dept.id}">${dept.name}</option>`;
            });
        }

        // Populate division filter
        const divisionSelect = document.getElementById('supervisorDivisionFilter');
        if (divisionSelect) {
            divisionSelect.innerHTML = '<option value="">All Divisions</option>';
            options.divisions.forEach(div => {
                divisionSelect.innerHTML += `<option value="${div.id}">${div.name}</option>`;
            });
        }

        // Populate city filter
        const citySelect = document.getElementById('supervisorCityFilter');
        if (citySelect) {
            citySelect.innerHTML = '<option value="">All Cities</option>';
            options.cities.forEach(city => {
                citySelect.innerHTML += `<option value="${city.id}">${city.name} (${city.division_name})</option>`;
            });
        }

        // Update city options when division changes
        if (divisionSelect && citySelect) {
            divisionSelect.addEventListener('change', function() {
                const selectedDivision = this.value;
                citySelect.innerHTML = '<option value="">All Cities</option>';
                
                if (selectedDivision) {
                    options.cities
                        .filter(city => city.division_id == selectedDivision)
                        .forEach(city => {
                            citySelect.innerHTML += `<option value="${city.id}">${city.name}</option>`;
                        });
                } else {
                    options.cities.forEach(city => {
                        citySelect.innerHTML += `<option value="${city.id}">${city.name} (${city.division_name})</option>`;
                    });
                }
            });
        }

    } catch (error) {
        console.error('Error loading filter options:', error);
    }
}

// Apply filters for supervisor
function applySupervisorFilters() {
    const form = document.getElementById('supervisorRequestFilters');
    const formData = new FormData(form);
    const filters = {};
    
    for (let [key, value] of formData.entries()) {
        if (value.trim()) {
            filters[key] = value.trim();
        }
    }
    
    loadRequests(filters);
}

// Clear filters for supervisor
function clearSupervisorFilters() {
    const form = document.getElementById('supervisorRequestFilters');
    form.reset();
    const summaryDiv = document.getElementById('supervisorRequestsSummary');
    if (summaryDiv) {
        summaryDiv.classList.add('d-none');
    }
    loadRequests();
}

// View Request Details
async function viewRequest(id) {
    try {
        const response = await fetch(`/api/supervisor/requests/${id}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();

        // Store request ID for status updates
        updateStatusForm.dataset.requestId = id;

        // Populate modal
        document.getElementById('modalRequestId').textContent = data.request.id;
        document.getElementById('modalLocation').textContent = 
            `${data.request.division} - ${data.request.city} - ${data.request.colony}`;
        document.getElementById('modalAddress').textContent = 
            `Wing/Block: ${data.request.wing || 'N/A'}, Quarter/Flat: ${data.request.flat || 'N/A'}`;
        document.getElementById('modalDescription').textContent = data.request.description;
        document.getElementById('modalStatus').textContent = data.request.status;
        document.getElementById('modalCreated').textContent = 
            formatDate(data.request.created_at);

        // Populate contact if element exists
        const modalContact = document.getElementById('modalContact');
        if (modalContact) {
            modalContact.textContent = data.request.contact || data.request.employee_id || 'N/A';
        }

        // Populate updated if element exists
        const modalUpdated = document.getElementById('modalUpdated');
        if (modalUpdated) {
            modalUpdated.textContent = data.request.updated_at ? 
                formatDate(data.request.updated_at) : 'Not updated';
        }

        // Show image if exists
        const modalImageContainer = document.getElementById('modalImage');
        if (data.request.image_path) {
            modalImageContainer.innerHTML = `<img src="/uploads/${data.request.image_path}" 
                alt="Request Image" class="img-fluid" style="max-width: 200px;">`;
        } else {
            modalImageContainer.innerHTML = '<em>No image attached</em>';
        }

        // Show status history
        const timelineContainer = document.getElementById('modalTimeline');
        if (data.history && data.history.length > 0) {
            timelineContainer.innerHTML = data.history.map(item => `
                <div class="timeline-item ${item.status.toLowerCase().replace(' ', '-')}">
                    <div class="timeline-content">
                        <h6 class="mb-1">${item.status}</h6>
                        <p class="mb-0">${item.remarks || 'No remarks provided'}</p>
                        <small class="timeline-date">${formatDate(item.timestamp)}</small>
                    </div>
                </div>
            `).join('');
        } else {
            timelineContainer.innerHTML = '<p class="text-muted">No status history available</p>';
        }

        // Show/hide update form based on current status
        const currentStatus = data.request.status.toLowerCase();
        updateStatusForm.style.display = 
            ['pending', 'not operable'].includes(currentStatus) ? 'block' : 'none';

        // Load departments for forwarding
        await loadForwardingOptions();

        requestModal.show();

    } catch (error) {
        console.error('Error loading request details:', error);
        alert('Error loading request details: ' + error.message);
    }
}

// Load departments and supervisors for forwarding
async function loadForwardingOptions() {
    try {
        const response = await fetch('/api/supervisor/forwarding-options');
        const data = await response.json();

        // Populate department dropdown
        const departmentSelect = document.getElementById('forwardDepartmentSelect');
        if (departmentSelect && data.departments) {
            departmentSelect.innerHTML = '<option value="">Select Department</option>';
            data.departments.forEach(dept => {
                departmentSelect.innerHTML += `<option value="${dept.id}">${dept.name}</option>`;
            });
        }

        // Set up department change handler to load supervisors
        const statusSelect = document.getElementById('statusSelect');
        const workerField = document.getElementById('workerField');
        const departmentField = document.getElementById('departmentField');
        const supervisorField = document.getElementById('supervisorField');
        const supervisorSelect = document.getElementById('forwardSupervisorSelect');

        // Handle status change
        if (statusSelect) {
            statusSelect.addEventListener('change', function() {
                const selectedStatus = this.value;
                
                if (selectedStatus === 'Forwarded to Other Department') {
                    // Show department field, hide worker field
                    workerField.classList.add('d-none');
                    departmentField.classList.remove('d-none');
                    supervisorField.classList.remove('d-none');
                } else {
                    // Show worker field, hide department/supervisor fields
                    workerField.classList.remove('d-none');
                    departmentField.classList.add('d-none');
                    supervisorField.classList.add('d-none');
                }
            });
        }

        // Handle department change to load supervisors
        if (departmentSelect && supervisorSelect) {
            departmentSelect.addEventListener('change', async function() {
                const selectedDeptId = this.value;
                supervisorSelect.innerHTML = '<option value="">Select Supervisor</option>';
                
                if (selectedDeptId && data.supervisors) {
                    // Filter supervisors by department
                    const deptSupervisors = data.supervisors.filter(sup => 
                        sup.departments && sup.departments.includes(parseInt(selectedDeptId))
                    );
                    
                    deptSupervisors.forEach(supervisor => {
                        supervisorSelect.innerHTML += 
                            `<option value="${supervisor.id}">${supervisor.username} (${supervisor.colony_name || 'No Colony'})</option>`;
                    });
                }
            });
        }

    } catch (error) {
        console.error('Error loading forwarding options:', error);
    }
}

// Update Request Status
updateStatusForm?.addEventListener('submit', async function(e) {
    e.preventDefault();

    const requestId = this.dataset.requestId;
    const formData = new FormData(this);
    
    const status = formData.get('status');
    const assigned_worker = formData.get('assigned_worker');
    const forward_department_id = formData.get('forward_department_id');
    const forward_supervisor_id = formData.get('forward_supervisor_id');
    const remarks = formData.get('remarks');

    // Validation
    if (!status) {
        alert('Please select a status');
        return;
    }

    if (status === 'Forwarded to Other Department') {
        if (!forward_department_id) {
            alert('Please select a department to forward to');
            return;
        }
        if (!forward_supervisor_id) {
            alert('Please select a supervisor to forward to');
            return;
        }
    }

    try {
        const requestBody = {
            status,
            remarks
        };

        // Add relevant fields based on status
        if (status === 'Forwarded to Other Department') {
            requestBody.forward_department_id = forward_department_id;
            requestBody.forward_supervisor_id = forward_supervisor_id;
        } else if (assigned_worker) {
            requestBody.assigned_worker = assigned_worker;
        }

        console.log('Updating request status:', requestBody);

        const response = await fetch(`/api/supervisor/requests/${requestId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Failed to update status');
        }

        alert('Status updated successfully!');
        requestModal.hide();
        loadRequests(); // Reload requests
        loadDashboardStats(); // Reload stats

    } catch (error) {
        console.error('Error updating status:', error);
        alert('Error updating request status: ' + error.message);
    }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 Supervisor dashboard loading...');
    initializeCharts();
    initializeLogout();
    
    // Load filter options
    await loadSupervisorFilterOptions();
    
    // Initialize Bootstrap tabs
    const tabElements = document.querySelectorAll('#supervisorTabs button[data-bs-toggle="tab"]');
    tabElements.forEach(tab => {
        tab.addEventListener('shown.bs.tab', function (event) {
            const targetTab = event.target.getAttribute('data-bs-target');
            console.log('🔄 Tab switched to:', targetTab);
            
            // Load data when switching to requests tab
            if (targetTab === '#requests') {
                loadRequests();
            }
        });
    });
    
    // Add some delay to ensure charts are initialized
    setTimeout(() => {
        loadDashboardStats();
    }, 100);
});

// Check session status (simplified for now)
async function checkSession() {
    // For now, just set a supervisor name if session exists
    const supervisorName = document.getElementById('supervisorName');
    if (supervisorName) {
        supervisorName.textContent = 'Supervisor User';
    }
}

// Handle logout functionality
async function handleLogout() {
    try {
        console.log('🚪 Logging out...');
        
        const response = await fetch('/auth/logout', {
            method: 'POST',
            credentials: 'same-origin'
        });

        if (response.ok) {
            console.log('  Logout successful');
            // Redirect to login page
            window.location.href = '/login.html';
        } else {
            console.error('❌ Logout failed');
            // Still redirect as a fallback
            window.location.href = '/login.html';
        }
    } catch (error) {
        console.error('❌ Logout error:', error);
        // Redirect anyway to ensure user is logged out
        window.location.href = '/login.html';
    }
}

// Initialize logout button
function initializeLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Show confirmation dialog
            if (confirm('Are you sure you want to logout?')) {
                handleLogout();
            }
        });
        console.log('  Logout button initialized');
    } else {
        console.warn('⚠️ Logout button not found');
    }
}

// Check session on page load
checkSession();
