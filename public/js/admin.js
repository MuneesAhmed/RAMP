// DOM Elements
const statsCards = document.querySelectorAll('.stats-card');
const requestsTable = document.getElementById('requestsTable');
const filterForm = document.getElementById('filterForm');
const exportBtn = document.getElementById('exportBtn');
const addSupervisorForm = document.getElementById('addSupervisorForm');
const addLocationForm = document.getElementById('addLocationForm');
const requestModal = new bootstrap.Modal(document.getElementById('requestModal'));

// Charts
let statusChart, departmentChart, performanceChart;

// Format date for inputs
function formatDateForInput(date) {
    return new Date(date).toISOString().split('T')[0];
}

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
    // Status Distribution Chart
    const statusCtx = document.getElementById('statusChart')?.getContext('2d');
    if (statusCtx) {
        statusChart = new Chart(statusCtx, {
            type: 'pie',
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

    // Department-wise Chart
    const deptCtx = document.getElementById('departmentChart')?.getContext('2d');
    if (deptCtx) {
        departmentChart = new Chart(deptCtx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Total Requests',
                    data: [],
                    backgroundColor: '#0d6efd'
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

    // Supervisor Performance Chart
    const perfCtx = document.getElementById('performanceChart')?.getContext('2d');
    if (perfCtx) {
        performanceChart = new Chart(perfCtx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Resolution Rate (%)',
                    data: [],
                    backgroundColor: '#198754'
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });
    }
}

// Load Dashboard Statistics
async function loadDashboardStats() {
    try {
        const response = await fetch('/api/admin/stats', {
            credentials: 'include',
            headers: {
                'Accept': 'application/json'
            }
        });
        let errorText;
        if (!response.ok) {
            try {
                const error = await response.json();
                errorText = error.error;
            } catch (e) {
                // If response is not JSON, try to get text content
                errorText = await response.text();
                // If it's HTML, extract error message or use status
                if (errorText.includes('<!DOCTYPE')) {
                    errorText = `Server error: ${response.status}`;
                }
            }
            throw new Error(errorText || `HTTP error! status: ${response.status}`);
        }
        const { statusCounts, departmentCounts, supervisorStats } = await response.json();

        if (!Array.isArray(statusCounts)) {
            throw new Error('Invalid stats data: missing or invalid status counts');
        }

        // Update stats cards
        const totalRequests = statusCounts.reduce((sum, item) => sum + (Number(item.count) || 0), 0);
        const pendingCount = statusCounts.find(s => s.status === 'Pending')?.count || 0;
        const resolvedCount = statusCounts.find(s => s.status === 'Resolved')?.count || 0;
        const forwardedCount = statusCounts.find(s => s.status === 'Forwarded')?.count || 0;
        
        document.getElementById('totalRequests').textContent = totalRequests;
        document.getElementById('pendingRequests').textContent = pendingCount;
        document.getElementById('resolvedRequests').textContent = resolvedCount;
        document.getElementById('forwardedRequests').textContent = forwardedCount;

        // Update status chart
        if (statusChart) {
            statusChart.data.datasets[0].data = [
                pendingCount,
                statusCounts.find(s => s.status === 'Not Operable')?.count || 0,
                resolvedCount,
                forwardedCount
            ];
            statusChart.update();
        }

        // Update department chart
        if (departmentChart && Array.isArray(departmentCounts)) {
            const deptLabels = departmentCounts.map(d => d.department || 'Unknown');
            const deptData = departmentCounts.map(d => Number(d.count) || 0);
            
            departmentChart.data.labels = deptLabels;
            departmentChart.data.datasets[0].data = deptData;
            departmentChart.update();
        }

        // Update performance chart
        if (performanceChart && Array.isArray(supervisorStats)) {
            const perfLabels = supervisorStats.map(s => s.username || 'Unknown');
            const perfData = supervisorStats.map(s => {
                const total = Number(s.total_assigned) || 0;
                const resolved = Number(s.resolved) || 0;
                if (total === 0) return 0;
                const rate = (resolved / total * 100);
                return parseFloat(rate.toFixed(1));
            });
            
            performanceChart.data.labels = perfLabels;
            performanceChart.data.datasets[0].data = perfData;
            performanceChart.update();
        }

    } catch (error) {
        console.error('Error loading dashboard stats:', error);
        if (error.message.includes('Authentication required') || error.message.includes('Access denied')) {
            window.location.href = '/login.html';
            return;
        }
        const errorDiv = document.createElement('div');
        errorDiv.className = 'alert alert-danger';
        errorDiv.textContent = error.message || 'Failed to load dashboard statistics';
        document.querySelector('.container-fluid').prepend(errorDiv);
    }
}

// Load Requests Table with enhanced filtering
async function loadRequests(filters = {}) {
    try {
        // Show loading state
        const tbody = document.querySelector('#requestsTable tbody') || 
                     document.querySelector('#requestsContent');
        if (tbody) {
            if (tbody.tagName === 'TBODY') {
                tbody.innerHTML = '<tr><td colspan="8" class="text-center">Loading...</td></tr>';
            } else {
                tbody.innerHTML = '<div class="text-center">Loading...</div>';
            }
        }

        const queryParams = new URLSearchParams(filters);
        const response = await fetch(`/api/admin/requests?${queryParams}`, {
            credentials: 'include',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            let errorText;
            try {
                const error = await response.json();
                errorText = error.error;
            } catch (e) {
                errorText = await response.text();
                if (errorText.includes('<!DOCTYPE')) {
                    errorText = `Server error: ${response.status}`;
                }
            }
            throw new Error(errorText || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        const requests = data.requests || [];

        // Update summary
        const summaryDiv = document.getElementById('requestsSummary');
        const countSpan = document.getElementById('requestsCount');
        const totalSpan = document.getElementById('requestsTotal');
        
        if (summaryDiv && countSpan && totalSpan) {
            countSpan.textContent = requests.length;
            totalSpan.textContent = data.total ? ` out of ${data.total} total` : '';
            summaryDiv.classList.remove('d-none');
        }

        // Create table if it doesn't exist
        if (!document.getElementById('requestsTable')) {
            const tableHTML = `
                <div class="table-responsive">
                    <table class="table table-hover" id="requestsTable">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Location</th>
                                <th>Department</th>
                                <th>Description</th>
                                <th>Status</th>
                                <th>Supervisor</th>
                                <th>Created</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>
            `;
            document.getElementById('requestsContent').innerHTML = tableHTML;
        }

        const requestsTable = document.getElementById('requestsTable');
        const tbody2 = requestsTable.querySelector('tbody');
        
        if (requests.length === 0) {
            tbody2.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No requests found matching the filters</td></tr>';
        } else {
            tbody2.innerHTML = requests.map(request => `
                <tr>
                    <td>${request.id}</td>
                    <td>${request.division_name || ''} ${request.city_name ? '- ' + request.city_name : ''}</td>
                    <td>${request.department_name || 'N/A'}</td>
                    <td class="text-truncate" style="max-width: 200px;" title="${request.description || ''}">${request.description || ''}</td>
                    <td><span class="badge ${getStatusBadgeClass(request.status)}">${request.status || 'Pending'}</span></td>
                    <td>${request.supervisor_name || 'Unassigned'}</td>
                    <td>${request.created_at ? formatDate(request.created_at) : 'N/A'}</td>
                    <td>
                        <button class="btn btn-sm btn-primary" onclick="viewRequest('${request.id}')">View</button>
                    </td>
                </tr>
            `).join('');
        }

    } catch (error) {
        console.error('Error loading requests:', error);
        const tbody = document.querySelector('#requestsTable tbody') || 
                     document.querySelector('#requestsContent');
        if (tbody) {
            const errorMsg = `Error loading requests: ${error.message}`;
            if (tbody.tagName === 'TBODY') {
                tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">${errorMsg}</td></tr>`;
            } else {
                tbody.innerHTML = `<div class="alert alert-danger">${errorMsg}</div>`;
            }
        }
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

// Load filter options
async function loadFilterOptions() {
    try {
        console.log('🔄 Loading filter options...');
        const response = await fetch('/api/admin/filter-options', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const options = await response.json();
        console.log('📋 Filter options received:', options);

        // Populate status filter
        const statusSelect = document.getElementById('statusFilter');
        if (statusSelect) {
            statusSelect.innerHTML = '<option value="">All Statuses</option>';
            options.statuses.forEach(status => {
                statusSelect.innerHTML += `<option value="${status.value}">${status.label}</option>`;
            });
            console.log('  Status filter populated with', options.statuses.length, 'options');
        } else {
            console.warn('⚠️ Status filter element not found');
        }

        // Populate department filter
        const departmentSelect = document.getElementById('departmentFilter');
        if (departmentSelect) {
            departmentSelect.innerHTML = '<option value="">All Departments</option>';
            options.departments.forEach(dept => {
                departmentSelect.innerHTML += `<option value="${dept.id}">${dept.name}</option>`;
            });
            console.log('  Department filter populated with', options.departments.length, 'options');
        } else {
            console.warn('⚠️ Department filter element not found');
        }

        // Populate division filter
        const divisionSelect = document.getElementById('divisionFilter');
        if (divisionSelect) {
            divisionSelect.innerHTML = '<option value="">All Divisions</option>';
            options.divisions.forEach(div => {
                divisionSelect.innerHTML += `<option value="${div.id}">${div.name}</option>`;
            });
            console.log('  Division filter populated with', options.divisions.length, 'options');
        } else {
            console.warn('⚠️ Division filter element not found');
        }

        // Populate city filter
        const citySelect = document.getElementById('cityFilter');
        if (citySelect) {
            citySelect.innerHTML = '<option value="">All Cities</option>';
            options.cities.forEach(city => {
                citySelect.innerHTML += `<option value="${city.id}">${city.name} (${city.division_name || 'No Division'})</option>`;
            });
            console.log('  City filter populated with', options.cities.length, 'options');
        } else {
            console.warn('⚠️ City filter element not found');
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
                        citySelect.innerHTML += `<option value="${city.id}">${city.name} (${city.division_name || 'No Division'})</option>`;
                    });
                }
            });
            console.log('  Division-city dependency setup complete');
        }

        console.log('🎉 All filter options loaded successfully');

    } catch (error) {
        console.error('❌ Error loading filter options:', error);
        // Show user-friendly error message
        const filterElements = ['statusFilter', 'departmentFilter', 'divisionFilter', 'cityFilter'];
        filterElements.forEach(elementId => {
            const element = document.getElementById(elementId);
            if (element) {
                element.innerHTML = '<option value="">Error loading options</option>';
            }
        });
    }
}

// Apply filters
function applyFilters() {
    const form = document.getElementById('requestFilters');
    const formData = new FormData(form);
    const filters = {};
    
    for (let [key, value] of formData.entries()) {
        if (value.trim()) {
            filters[key] = value.trim();
        }
    }
    
    loadRequests(filters);
}

// Clear filters
function clearFilters() {
    const form = document.getElementById('requestFilters');
    form.reset();
    document.getElementById('requestsSummary').classList.add('d-none');
    loadRequests();
}

// View Request Details
async function viewRequest(id) {
    try {
        const response = await fetch(`/api/admin/requests/${id}`);
        const data = await response.json();

        // Populate modal
        document.getElementById('modalRequestId').textContent = data.request.id;
        document.getElementById('modalLocation').textContent = 
            `${data.request.division} - ${data.request.city} - ${data.request.colony}`;
        document.getElementById('modalDepartment').textContent = data.request.department;
        document.getElementById('modalDescription').textContent = data.request.description;
        document.getElementById('modalStatus').textContent = data.request.status;
        document.getElementById('modalSupervisor').textContent = 
            data.request.supervisor_name || 'Unassigned';
        document.getElementById('modalCreated').textContent = 
            formatDate(data.request.created_at);

        // Show image if exists
        const modalImage = document.getElementById('modalImage');
        if (data.request.image_path) {
            modalImage.src = `/uploads/${data.request.image_path}`;
            modalImage.parentElement.style.display = 'block';
        } else {
            modalImage.parentElement.style.display = 'none';
        }

        // Show status history
        const timelineContainer = document.getElementById('modalTimeline');
        timelineContainer.innerHTML = data.history.map(item => `
            <div class="timeline-item ${item.status.toLowerCase().replace(' ', '-')}">
                <div class="timeline-content">
                    <h6 class="mb-1">${item.status}</h6>
                    <p class="mb-0">${item.remarks || 'No remarks provided'}</p>
                    <small class="timeline-date">${formatDate(item.timestamp)}</small>
                </div>
            </div>
        `).join('');

        requestModal.show();

    } catch (error) {
        console.error('Error loading request details:', error);
        alert('Error loading request details');
    }
}

// Export Requests
exportBtn?.addEventListener('click', async function() {
    try {
        this.disabled = true;
        this.classList.add('loading');

        const filters = Object.fromEntries(new FormData(filterForm));
        const queryParams = new URLSearchParams(filters);
        
        const response = await fetch(`/api/admin/export?${queryParams}`);
        const blob = await response.blob();

        // Create download link
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `requests_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();

    } catch (error) {
        console.error('Error exporting requests:', error);
        alert('Error exporting requests');
    } finally {
        this.disabled = false;
        this.classList.remove('loading');
    }
});

// Add Supervisor
addSupervisorForm?.addEventListener('submit', async function(e) {
    e.preventDefault();

    try {
        const formData = new FormData(this);
        const response = await fetch('/api/admin/supervisors', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(Object.fromEntries(formData))
        });

        if (!response.ok) {
            throw new Error('Failed to add supervisor');
        }

        alert('Supervisor added successfully');
        this.reset();
        loadDashboardStats(); // Refresh stats

    } catch (error) {
        console.error('Error adding supervisor:', error);
        alert(error.message);
    }
});

// Add Location
addLocationForm?.addEventListener('submit', async function(e) {
    e.preventDefault();

    try {
        const formData = new FormData(this);
        const type = this.querySelector('select[name="type"]').value;
        const endpoint = `/api/admin/${type}s`; // divisions, cities, or colonies

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(Object.fromEntries(formData))
        });

        if (!response.ok) {
            throw new Error(`Failed to add ${type}`);
        }

        alert(`${type.charAt(0).toUpperCase() + type.slice(1)} added successfully`);
        this.reset();
        loadLocations(); // Refresh location dropdowns

    } catch (error) {
        console.error('Error adding location:', error);
        alert(error.message);
    }
});

// Filter form submission
filterForm?.addEventListener('submit', function(e) {
    e.preventDefault();
    const filters = Object.fromEntries(new FormData(this));
    loadRequests(filters);
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', async function() {
    try {
        initializeCharts();
        await loadDashboardStats();
        await loadRequests();
    } catch (error) {
        console.error('Error initializing dashboard:', error);
        alert('Error loading dashboard data. Please try refreshing the page.');
    }
});

// Check session status
async function checkSession() {
    try {
        const response = await fetch('/api/auth/me', {
            credentials: 'include',  // Include cookies
            headers: {
                'Accept': 'application/json'
            }
        });
        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                window.location.href = '/login.html?return=' + encodeURIComponent(window.location.pathname);
            } else {
                let errorText;
                try {
                    const error = await response.json();
                    errorText = error.error;
                } catch (e) {
                    // If response is not JSON, try to get text content
                    errorText = await response.text();
                    // If it's HTML, extract error message or use status
                    if (errorText.includes('<!DOCTYPE')) {
                        errorText = `Server error: ${response.status}`;
                    }
                }
                throw new Error(errorText || 'Server error while checking session');
            }
            return;
        }

        const data = await response.json();
        
        // Check if we have user data in the expected format
        if (!data.user || !data.user.username || !data.user.role) {
            throw new Error('Invalid user data received');
        }

        if (!data.user.role.startsWith('admin')) {
            window.location.href = '/login.html';
            return;
        }

        // Store user info for later use
        window.currentUser = data.user;
        
        // Load filter options after session check
        await loadFilterOptions();

    } catch (error) {
        console.error('Session check error:', error);
        alert('Error checking session: ' + error.message);
        window.location.href = '/login.html';
    }
}

// Check session on page load
checkSession();