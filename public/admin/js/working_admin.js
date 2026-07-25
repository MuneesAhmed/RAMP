// Working Admin Dashboard JavaScript
console.log('🚀 Loading Working Admin Dashboard...');

let isAuthenticated = false;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('📄 DOM loaded, starting admin dashboard...');
    
    // Auto login and setup
    performLogin().then(async () => {
        setupEventListeners();
        // Load requests tab by default instead of overview
        await loadFilterOptions();
        loadRequests();
        
        // Add a fallback to ensure status cards are updated after everything loads
        setTimeout(() => {
            console.log('🔄 Fallback: Checking if status cards need updating...');
            const totalElement = document.getElementById('totalRequestsCount');
            if (totalElement && (totalElement.textContent === '-' || totalElement.textContent === '')) {
                console.log('🔄 Total card needs updating, calling loadStatusSummary again...');
                loadStatusSummary();
            }
        }, 2000);
    });
});

// Auto login function - Use existing session instead of hardcoded login
async function performLogin() {
    console.log('🔑 Checking existing session...');
    showLoading(true);
    
    try {
        // First, check if user is already logged in
        const sessionResponse = await fetch('/api/auth/me', {
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (sessionResponse.ok) {
            const sessionData = await sessionResponse.json();
            console.log('  Existing session found:', sessionData.user);
            isAuthenticated = true;
            updateAdminInfo(sessionData.user);
            showAlert('success', `Welcome back, ${sessionData.user.username}! (${sessionData.user.role})`);
        } else {
            // If no session, try to auto-login as admin (fallback for demo)
            const response = await fetch('/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: 'admin',
                    password: 'password123'
                }),
                credentials: 'same-origin'
            });
            
            const data = await response.json();
            
            if (data.message) {
                console.log('  Auto-login successful');
                isAuthenticated = true;
                updateAdminInfo(data.user || { username: 'admin', role: 'admin_l1' });
                showAlert('success', 'Welcome to Admin Dashboard!');
            } else {
                throw new Error('Login failed');
            }
        }
    } catch (error) {
        console.error('❌ Authentication failed:', error);
        showAlert('danger', 'Authentication failed. Please login first.');
        // Redirect to login page
        setTimeout(() => {
            window.location.href = '/login.html';
        }, 2000);
    } finally {
        showLoading(false);
    }
}

// Update admin info display
function updateAdminInfo(user) {
    const adminNameElement = document.getElementById('adminName');
    if (adminNameElement) {
        adminNameElement.textContent = `${user.username} (${user.role})`;
    }
    
    // Store current user in sessionStorage for hierarchical access control
    sessionStorage.setItem('currentUser', JSON.stringify(user));
    console.log('📝 Stored current user in sessionStorage:', user);
}

// Setup event listeners
function setupEventListeners() {
    console.log('🔧 Setting up event listeners...');
    
    // Tab click events
    document.getElementById('requests-tab').addEventListener('click', async () => {
        console.log('📋 Requests tab clicked');
        await loadFilterOptions(); // Load filter options first
        await loadStatusSummary(); // Load status summary cards
        loadRequests(); // Then load requests (which will also load status summary again)
    });
    
    document.getElementById('pending-tab').addEventListener('click', () => {
        console.log('⏳ Pending tab clicked');
        loadPendingAssignments();
    });
    
    document.getElementById('supervisors-tab').addEventListener('click', () => {
        console.log('👥 Supervisors tab clicked');
        loadSupervisors();
    });
    
    document.getElementById('locations-tab').addEventListener('click', () => {
        console.log('📍 Locations tab clicked');
        loadLocations();
    });
    
    document.getElementById('analytics-tab').addEventListener('click', () => {
        console.log('📊 Analytics tab clicked');
        loadAnalytics();
    });
    
    // Setup colony collapse animation for chevron icons
    document.addEventListener('shown.bs.collapse', function (e) {
        const collapseElement = e.target;
        const toggleButton = document.querySelector(`[data-bs-target="#${collapseElement.id}"]`);
        if (toggleButton) {
            const chevron = toggleButton.querySelector('.bi-chevron-down, .bi-chevron-up');
            if (chevron) {
                chevron.style.transform = 'rotate(180deg)';
                chevron.classList.remove('bi-chevron-down');
                chevron.classList.add('bi-chevron-up');
            }
        }
    });
    
    document.addEventListener('hidden.bs.collapse', function (e) {
        const collapseElement = e.target;
        const toggleButton = document.querySelector(`[data-bs-target="#${collapseElement.id}"]`);
        if (toggleButton) {
            const chevron = toggleButton.querySelector('.bi-chevron-down, .bi-chevron-up');
            if (chevron) {
                chevron.style.transform = 'rotate(0deg)';
                chevron.classList.remove('bi-chevron-up');
                chevron.classList.add('bi-chevron-down');
            }
        }
    });
    
    // Add supervisor button
    const addSupervisorBtn = document.getElementById('addSupervisorBtn');
    if (addSupervisorBtn) {
        addSupervisorBtn.addEventListener('click', () => {
            const modal = new bootstrap.Modal(document.getElementById('addSupervisorModal'));
            modal.show();
        });
    }
    
    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
}

// Load filter options
async function loadFilterOptions() {
    try {
        console.log('🔄 Loading filter options...');
        // Add cache-busting parameter with version
        const cacheBust = Date.now();
        const version = 'v2.0'; // Update this to force new requests
        const response = await fetch(`/api/admin/filter-options?_=${cacheBust}&v=${version}`, {
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
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
            
            // Create a Set to track unique city names to prevent duplicates on frontend
            const uniqueCityNames = new Set();
            const uniqueCities = [];
            
            options.cities.forEach(city => {
                const cityKey = `${city.name}_${city.division_id || 'null'}`;
                if (!uniqueCityNames.has(cityKey)) {
                    uniqueCityNames.add(cityKey);
                    uniqueCities.push(city);
                }
            });
            
            uniqueCities.forEach(city => {
                citySelect.innerHTML += `<option value="${city.id}">${city.name} (${city.division_name || 'No Division'})</option>`;
            });
            console.log('  City filter populated with', uniqueCities.length, 'unique options (filtered from', options.cities.length, 'total)');
        } else {
            console.warn('⚠️ City filter element not found');
        }

        // Update city options when division changes
        if (divisionSelect && citySelect) {
            // Remove any existing event listeners to avoid duplicates
            const newDivisionSelect = divisionSelect.cloneNode(true);
            divisionSelect.parentNode.replaceChild(newDivisionSelect, divisionSelect);
            
            newDivisionSelect.addEventListener('change', function() {
                const selectedDivision = this.value;
                const newCitySelect = document.getElementById('cityFilter');
                newCitySelect.innerHTML = '<option value="">All Cities</option>';
                
                if (selectedDivision) {
                    // Create a Set to track unique city names to prevent duplicates
                    const uniqueCityNames = new Set();
                    const filteredCities = options.cities
                        .filter(city => city.division_id == selectedDivision)
                        .filter(city => {
                            const cityKey = `${city.name}_${city.division_id}`;
                            if (!uniqueCityNames.has(cityKey)) {
                                uniqueCityNames.add(cityKey);
                                return true;
                            }
                            return false;
                        });
                        
                    filteredCities.forEach(city => {
                        newCitySelect.innerHTML += `<option value="${city.id}">${city.name}</option>`;
                    });
                } else {
                    // Show all cities with deduplication
                    const uniqueCityNames = new Set();
                    const uniqueCities = options.cities.filter(city => {
                        const cityKey = `${city.name}_${city.division_id || 'null'}`;
                        if (!uniqueCityNames.has(cityKey)) {
                            uniqueCityNames.add(cityKey);
                            return true;
                        }
                        return false;
                    });
                    
                    uniqueCities.forEach(city => {
                        newCitySelect.innerHTML += `<option value="${city.id}">${city.name} (${city.division_name || 'No Division'})</option>`;
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
        showAlert('warning', 'Failed to load filter options');
    }
}

// Apply filters
function applyFilters() {
    const form = document.getElementById('requestFilters');
    if (!form) {
        console.warn('⚠️ Request filters form not found');
        return;
    }
    
    const formData = new FormData(form);
    const filters = {};
    
    for (let [key, value] of formData.entries()) {
        if (value.trim()) {
            filters[key] = value.trim();
        }
    }
    
    console.log('🔍 Applying filters:', filters);
    loadRequestsWithFilters(filters, 1); // Reset to page 1 when applying filters
}

// Clear filters
function clearFilters() {
    const form = document.getElementById('requestFilters');
    if (form) {
        form.reset();
    }
    
    const summaryDiv = document.getElementById('requestsSummary');
    if (summaryDiv) {
        summaryDiv.classList.add('d-none');
    }
    
    console.log('🧹 Filters cleared, loading all requests');
    loadRequestsWithFilters({}, 1); // Reset to page 1 when clearing filters
}

// Chart instances for cleanup
let statusBarChart = null;
let statusPieChart = null;

// Load and display status breakdown charts
async function loadStatusBreakdownCharts(filters = {}) {
    console.log('📊 Loading status breakdown charts with filters:', filters);
    
    try {
        const queryString = new URLSearchParams(filters).toString();
        const response = await fetch(`/api/admin/status-breakdown?${queryString}`, {
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        console.log('📊 Status breakdown data received:', data);

        if (data.breakdown && data.breakdown.length > 0) {
            displayStatusCharts(data.breakdown, data.total);
            document.getElementById('statusCharts').classList.remove('d-none');
        } else {
            document.getElementById('statusCharts').classList.add('d-none');
            console.log('📊 No status data to display charts');
        }

    } catch (error) {
        console.error('❌ Error loading status breakdown:', error);
        document.getElementById('statusCharts').classList.add('d-none');
    }
}

// Display status charts using Chart.js
function displayStatusCharts(breakdown, total) {
    console.log('📊 Displaying status charts with data:', breakdown);

    // Prepare data for charts
    const labels = breakdown.map(item => item.status);
    const counts = breakdown.map(item => item.count);
    const percentages = breakdown.map(item => item.percentage);

    // Define colors for different statuses
    const statusColors = {
        'Pending': '#ffc107',
        'Not Operable': '#6c757d',
        'Resolved': '#28a745',
        'Forwarded to Other Department': '#17a2b8',
        'Unknown': '#dc3545'
    };

    const backgroundColors = labels.map(status => statusColors[status] || '#6c757d');
    const borderColors = backgroundColors.map(color => color);

    // Destroy existing charts
    if (statusBarChart) {
        statusBarChart.destroy();
    }
    if (statusPieChart) {
        statusPieChart.destroy();
    }

    // Create Bar Chart
    const barCtx = document.getElementById('statusBarChart').getContext('2d');
    statusBarChart = new Chart(barCtx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Number of Requests',
                data: counts,
                backgroundColor: backgroundColors,
                borderColor: borderColors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: `Request Status Distribution (Total: ${total})`
                },
                legend: {
                    display: false
                }
            }
        }
    });

    // Create Pie Chart
    const pieCtx = document.getElementById('statusPieChart').getContext('2d');
    statusPieChart = new Chart(pieCtx, {
        type: 'pie',
        data: {
            labels: labels.map((label, index) => `${label} (${percentages[index]}%)`),
            datasets: [{
                data: counts,
                backgroundColor: backgroundColors,
                borderColor: borderColors,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: `Status Distribution`
                },
                legend: {
                    display: true,
                    position: 'bottom'
                }
            }
        }
    });

    console.log('  Status charts displayed successfully');
}

// Load requests with filters (enhanced version)
// Global pagination state
let currentPage = 1;
const ITEMS_PER_PAGE = 10;
let currentFilters = {};
let totalRequests = 0;

// Pending assignments pagination state
let currentPendingPage = 1;
let currentPendingFilters = {};
let totalPendingRequests = 0;

async function loadRequestsWithFilters(filters = {}, page = 1) {
    console.log('📋 Loading requests with filters:', filters, 'page:', page);
    showLoading(true);
    
    // Store current state
    currentFilters = filters;
    currentPage = page;
    
    if (!isAuthenticated) {
        showAlert('danger', 'Not authenticated');
        return;
    }

    try {
        // Add pagination parameters
        const paginationParams = {
            ...filters,
            limit: ITEMS_PER_PAGE,
            offset: (page - 1) * ITEMS_PER_PAGE
        };
        
        const queryParams = new URLSearchParams(paginationParams);
        const response = await fetch(`/api/admin/requests?${queryParams}`, {
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json'
            }
        });        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log('📋 Filtered requests data received:', data);
        
        const requests = data.requests || data || [];
        totalRequests = data.total || requests.length;
        const totalPages = Math.ceil(totalRequests / ITEMS_PER_PAGE);
        
        // Update summary
        const summaryDiv = document.getElementById('requestsSummary');
        const countSpan = document.getElementById('requestsCount');
        const totalSpan = document.getElementById('requestsTotal');
        
        if (summaryDiv && countSpan && totalSpan) {
            const startIndex = (currentPage - 1) * ITEMS_PER_PAGE + 1;
            const endIndex = Math.min(currentPage * ITEMS_PER_PAGE, totalRequests);
            countSpan.textContent = `${startIndex}-${endIndex}`;
            totalSpan.textContent = ` of ${totalRequests} total`;
            summaryDiv.classList.remove('d-none');
        }

        const html = `
            <div class="card">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h5 class="mb-0">
                        <i class="bi bi-list-check"></i> Maintenance Requests
                        ${requests.length > 0 ? ` (Page ${currentPage} of ${totalPages})` : ' (No results)'}
                    </h5>
                    <div class="d-flex align-items-center gap-2">
                        <small class="text-muted">Showing ${requests.length} of ${totalRequests} requests</small>
                    </div>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-hover mb-0">
                            <thead class="table-light">
                                <tr>
                                    <th style="width: 5%;">ID</th>
                                    <th style="width: 25%;">Description</th>
                                    <th style="width: 12%;">Status</th>
                                    <th style="width: 15%;">User</th>
                                    <th style="width: 12%;">Date</th>
                                    <th style="width: 18%;">Location</th>
                                    <th style="width: 10%;">Department</th>
                                    <th style="width: 8%;">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${requests.length > 0 ? requests.map(request => `
                                    <tr>
                                        <td><strong>#${request.id}</strong></td>
                                        <td>
                                            <div class="text-truncate" title="${request.description || ''}" style="max-width: 250px;">
                                                ${request.description || 'N/A'}
                                            </div>
                                        </td>
                                        <td>
                                            <span class="badge ${getStatusBadgeClass(request.status)}">
                                                ${request.status || 'Pending'}
                                            </span>
                                        </td>
                                        <td>${request.name || request.user_name || 'Unknown'}</td>
                                        <td>
                                            <small>${request.created_at ? formatDate(request.created_at) : 'N/A'}</small>
                                        </td>
                                        <td>
                                            <div class="text-truncate" title="${request.location || (request.division_name || '') + (request.city_name ? ' - ' + request.city_name : '') || 'N/A'}" style="max-width: 180px;">
                                                ${request.location || (request.division_name || '') + (request.city_name ? ' - ' + request.city_name : '') || 'N/A'}
                                            </div>
                                        </td>
                                        <td>
                                            <small>${request.department_name || 'N/A'}</small>
                                        </td>
                                        <td>
                                            <button class="btn btn-sm btn-outline-primary" onclick="viewRequest('${request.id}')" title="View Details">
                                                <i class="bi bi-eye"></i>
                                            </button>
                                        </td>
                                    </tr>
                                `).join('') : `
                                    <tr>
                                        <td colspan="8" class="text-center text-muted py-4">
                                            <i class="bi bi-inbox"></i><br>
                                            No requests found matching the filters
                                        </td>
                                    </tr>
                                `}
                            </tbody>
                        </table>
                    </div>
                    ${totalPages > 1 ? `<div class="card-footer">${generatePaginationControls(currentPage, totalPages)}</div>` : ''}
                </div>
            </div>
        `;        document.getElementById('requestsContent').innerHTML = html;
        
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE + 1;
        const endIndex = Math.min(currentPage * ITEMS_PER_PAGE, totalRequests);
        showAlert('success', `Loaded requests ${startIndex}-${endIndex} of ${totalRequests} total (Page ${currentPage} of ${Math.ceil(totalRequests / ITEMS_PER_PAGE)})`);
        
        // Load status breakdown charts with the same filters
        await loadStatusBreakdownCharts(currentFilters);
        
    } catch (error) {
        console.error('❌ Error loading requests:', error);
        showAlert('danger', 'Failed to load requests');
        document.getElementById('requestsContent').innerHTML = `
            <div class="alert alert-danger">
                <h6>Error Loading Requests</h6>
                <p>${error.message}</p>
                <button class="btn btn-outline-danger btn-sm" onclick="loadRequestsWithFilters({}, 1)">Try Again</button>
            </div>
        `;
    } finally {
        showLoading(false);
    }
}

// Generate pagination controls
function generatePaginationControls(currentPage, totalPages) {
    if (totalPages <= 1) return '';
    
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    // Adjust startPage if we're near the end
    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    let paginationHtml = `
        <div class="d-flex justify-content-between align-items-center mt-3">
            <div class="d-flex align-items-center">
                <span class="text-muted small">Page ${currentPage} of ${totalPages} (${totalRequests} total requests)</span>
            </div>
            <nav aria-label="Requests pagination">
                <ul class="pagination pagination-sm mb-0">
    `;
    
    // Previous button
    if (currentPage > 1) {
        paginationHtml += `
            <li class="page-item">
                <button class="page-link" onclick="changePage(${currentPage - 1})" aria-label="Previous">
                    <span aria-hidden="true">&laquo;</span>
                </button>
            </li>
        `;
    } else {
        paginationHtml += `
            <li class="page-item disabled">
                <span class="page-link" aria-hidden="true">&laquo;</span>
            </li>
        `;
    }
    
    // First page
    if (startPage > 1) {
        paginationHtml += `
            <li class="page-item">
                <button class="page-link" onclick="changePage(1)">1</button>
            </li>
        `;
        if (startPage > 2) {
            paginationHtml += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }
    }
    
    // Page numbers
    for (let page = startPage; page <= endPage; page++) {
        if (page === currentPage) {
            paginationHtml += `
                <li class="page-item active" aria-current="page">
                    <span class="page-link">${page}</span>
                </li>
            `;
        } else {
            paginationHtml += `
                <li class="page-item">
                    <button class="page-link" onclick="changePage(${page})">${page}</button>
                </li>
            `;
        }
    }
    
    // Last page
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            paginationHtml += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }
        paginationHtml += `
            <li class="page-item">
                <button class="page-link" onclick="changePage(${totalPages})">${totalPages}</button>
            </li>
        `;
    }
    
    // Next button
    if (currentPage < totalPages) {
        paginationHtml += `
            <li class="page-item">
                <button class="page-link" onclick="changePage(${currentPage + 1})" aria-label="Next">
                    <span aria-hidden="true">&raquo;</span>
                </button>
            </li>
        `;
    } else {
        paginationHtml += `
            <li class="page-item disabled">
                <span class="page-link" aria-hidden="true">&raquo;</span>
            </li>
        `;
    }
    
    paginationHtml += `
                </ul>
            </nav>
        </div>
    `;
    
    return paginationHtml;
}

// Change page function
function changePage(page) {
    console.log('🔄 Changing to page:', page);
    loadRequestsWithFilters(currentFilters, page);
}

// Generate pagination controls for pending assignments
function generatePendingPaginationControls(currentPage, totalPages) {
    if (totalPages <= 1) return '';
    
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    // Adjust startPage if we're near the end
    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    let paginationHtml = `
        <div class="d-flex justify-content-between align-items-center mt-3">
            <div class="d-flex align-items-center">
                <span class="text-muted small">Page ${currentPage} of ${totalPages} (${totalPendingRequests} total pending assignments)</span>
            </div>
            <nav aria-label="Pending assignments pagination">
                <ul class="pagination pagination-sm mb-0">
    `;
    
    // Previous button
    if (currentPage > 1) {
        paginationHtml += `
            <li class="page-item">
                <button class="page-link" onclick="changePendingPage(${currentPage - 1})" aria-label="Previous">
                    <span aria-hidden="true">&laquo;</span>
                </button>
            </li>
        `;
    } else {
        paginationHtml += `
            <li class="page-item disabled">
                <span class="page-link" aria-hidden="true">&laquo;</span>
            </li>
        `;
    }
    
    // First page
    if (startPage > 1) {
        paginationHtml += `
            <li class="page-item">
                <button class="page-link" onclick="changePendingPage(1)">1</button>
            </li>
        `;
        if (startPage > 2) {
            paginationHtml += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }
    }
    
    // Page numbers
    for (let page = startPage; page <= endPage; page++) {
        if (page === currentPage) {
            paginationHtml += `
                <li class="page-item active" aria-current="page">
                    <span class="page-link">${page}</span>
                </li>
            `;
        } else {
            paginationHtml += `
                <li class="page-item">
                    <button class="page-link" onclick="changePendingPage(${page})">${page}</button>
                </li>
            `;
        }
    }
    
    // Last page
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            paginationHtml += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }
        paginationHtml += `
            <li class="page-item">
                <button class="page-link" onclick="changePendingPage(${totalPages})">${totalPages}</button>
            </li>
        `;
    }
    
    // Next button
    if (currentPage < totalPages) {
        paginationHtml += `
            <li class="page-item">
                <button class="page-link" onclick="changePendingPage(${currentPage + 1})" aria-label="Next">
                    <span aria-hidden="true">&raquo;</span>
                </button>
            </li>
        `;
    } else {
        paginationHtml += `
            <li class="page-item disabled">
                <span class="page-link" aria-hidden="true">&raquo;</span>
            </li>
        `;
    }
    
    paginationHtml += `
                </ul>
            </nav>
        </div>
    `;
    
    return paginationHtml;
}

// Change pending page function
function changePendingPage(page) {
    console.log('🔄 Changing pending assignments to page:', page);
    loadPendingAssignmentsWithFilters(currentPendingFilters, page);
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

// Helper function to format date
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

// Load requests
async function loadRequests() {
    console.log('📋 Loading requests (calling filtered version)...');
    console.log('📊 About to load status summary...');
    // Load status summary cards first
    await loadStatusSummary();
    console.log('📊 Status summary loaded, now loading requests...');
    // Then call the enhanced version with no filters
    await loadRequestsWithFilters({}, 1);
    console.log('📋 Requests loading completed');
}

// Load status summary for cards
async function loadStatusSummary() {
    console.log('📊 Loading status summary...');
    
    if (!isAuthenticated) {
        console.log('❌ Not authenticated, skipping status summary');
        return;
    }
    
    try {
        const response = await fetch('/api/admin/status-summary', {
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log('📊 Status summary data:', data);
        
        // Update the count cards
        updateStatusCards(data);
        
    } catch (error) {
        console.error('❌ Error loading status summary:', error);
        // Set cards to show error state
        updateStatusCards({
            total: 0,
            statuses: {
                'Pending': 0,
                'Not Operable': 0,
                'Resolved': 0,
                'Forwarded to Other Department': 0
            }
        });
    }
}

// Update status count cards
function updateStatusCards(data) {
    console.log('🔄 Updating status cards with:', data);
    
    // Update total requests
    const totalElement = document.getElementById('totalRequestsCount');
    console.log('📊 Total element found:', !!totalElement);
    if (totalElement) {
        const totalValue = data.total || 0;
        console.log('📊 Setting total to:', totalValue);
        totalElement.textContent = totalValue;
        console.log('📊 Total element content after update:', totalElement.textContent);
    } else {
        console.error('❌ Total element not found!');
    }
    
    // Update individual status counts
    const statusMappings = {
        'Pending': 'pendingRequestsCount',
        'Not Operable': 'notOperableRequestsCount', 
        'Resolved': 'resolvedRequestsCount',
        'Forwarded to Other Department': 'forwardedRequestsCount'
    };
    
    Object.entries(statusMappings).forEach(([status, elementId]) => {
        const element = document.getElementById(elementId);
        if (element) {
            const count = data.statuses?.[status] || 0;
            element.textContent = count;
            console.log(`📊 Updated ${status}: ${count}`);
        } else {
            console.error(`❌ Element not found: ${elementId}`);
        }
    });
}

// Filter requests by status (called when status cards are clicked)
async function filterByStatus(status) {
    console.log('🔍 Filtering by status:', status);
    
    // Remove active class from all status cards
    document.querySelectorAll('.status-card').forEach(card => {
        card.classList.remove('active');
    });
    
    // Add active class to clicked card
    if (status) {
        // Find the card that matches this status
        const statusCardMap = {
            'Pending': 1,
            'Not Operable': 2,
            'Resolved': 3,
            'Forwarded to Other Department': 4
        };
        const cardIndex = statusCardMap[status];
        if (cardIndex !== undefined) {
            const cards = document.querySelectorAll('.status-card');
            if (cards[cardIndex]) {
                cards[cardIndex].classList.add('active');
            }
        }
    } else {
        // Total card is at index 0
        const cards = document.querySelectorAll('.status-card');
        if (cards[0]) {
            cards[0].classList.add('active');
        }
    }
    
    // Clear other filters and set status filter
    const form = document.getElementById('requestFilters');
    if (form) {
        form.reset();
        
        // Set the status filter dropdown
        const statusFilter = document.getElementById('statusFilter');
        if (statusFilter) {
            statusFilter.value = status || '';
        }
    }
    
    // Apply the filter
    const filters = status ? { status: status } : {};
    await loadRequestsWithFilters(filters, 1);
    
    // Show success message
    const statusText = status || 'All';
    showAlert('success', `Showing ${statusText} requests`);
}

// Load pending assignments
async function loadPendingAssignments() {
    console.log('⏳ Loading pending assignments...');
    // Call with pagination support
    await loadPendingAssignmentsWithFilters({}, 1);
}

// Update pending summary cards
function updatePendingSummary(summary) {
    // Only update the Total Pending card since other cards were removed
    const totalPendingElement = document.getElementById('totalPendingCount');
    if (totalPendingElement) {
        totalPendingElement.textContent = summary.totalPending || 0;
    }
}

// Display pending assignments content - requests that have been sent but not accepted
function displayPendingContent(data) {
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
    
    if (!data.pendingRequests || data.pendingRequests.length === 0) {
        document.getElementById('pendingContent').innerHTML = `
            <div class="alert alert-success text-center">
                <i class="bi bi-check-circle display-4 text-success"></i>
                <h4 class="mt-3">All Requests Handled!</h4>
                <p>There are no pending requests awaiting assignment or acceptance at this time.</p>
                <div class="mt-3">
                    <span class="badge bg-success">No Pending Assignments</span>
                </div>
            </div>
        `;
        return;
    }
    
    let html = `
        <div class="mb-3">
            <div class="d-flex justify-content-between align-items-center">
                <h5 class="text-primary mb-0">
                    <i class="bi bi-clock-history"></i> Pending Request Assignments
                </h5>
                <span class="badge bg-primary">${data.pendingRequests.length} Requests</span>
            </div>
            <p class="text-muted small mb-0">Requests that have been sent but no supervisor has accepted them yet</p>
        </div>
    `;
    
    // Group requests by status/assignment type
    const unassigned = data.pendingRequests.filter(req => !req.supervisor_id);
    const assignedButNotAccepted = data.pendingRequests.filter(req => req.supervisor_id && req.assignment_status === 'Assigned');
    
    // Show unassigned requests first
    if (unassigned.length > 0) {
        html += `
            <div class="card mb-4">
                <div class="card-header bg-warning text-dark">
                    <h6 class="mb-0">
                        <i class="bi bi-clock"></i> Unassigned Requests (${unassigned.length})
                        <small class="text-muted">- Need supervisor assignment</small>
                    </h6>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-hover mb-0">
                            <thead class="table-light">
                                <tr>
                                    <th>Request ID</th>
                                    <th>Location</th>
                                    <th>Description</th>
                                    <th>Requester</th>
                                    <th>Created</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
        `;
        
        unassigned.forEach(request => {
            html += generateRequestRow(request, 'unassigned');
        });
        
        html += `
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Show assigned but not accepted requests
    if (assignedButNotAccepted.length > 0) {
        html += `
            <div class="card mb-4">
                <div class="card-header bg-info text-white">
                    <h6 class="mb-0">
                        <i class="bi bi-person-check"></i> Assigned But Not Accepted (${assignedButNotAccepted.length})
                        <small class="text-light">- Waiting for supervisor acceptance</small>
                    </h6>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-hover mb-0">
                            <thead class="table-light">
                                <tr>
                                    <th>Request ID</th>
                                    <th>Location</th>
                                    <th>Description</th>
                                    <th>Requester</th>
                                    <th>Assigned To</th>
                                    <th>Created</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
        `;
        
        assignedButNotAccepted.forEach(request => {
            html += generateRequestRow(request, 'assigned');
        });
        
        html += `
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }
    
    document.getElementById('pendingContent').innerHTML = html;
}

// Generate table row for a pending request
function generateRequestRow(request, type) {
    const createdDate = new Date(request.created_at).toLocaleDateString();
    const statusBadgeClass = getStatusBadgeClass(request.status);
    
    let assignedColumn = '';
    if (type === 'assigned') {
        assignedColumn = `<td><span class="badge bg-secondary">${request.assigned_supervisor || 'Unknown'}</span></td>`;
    }
    
    return `
        <tr>
            <td>
                <strong>${request.request_id}</strong>
            </td>
            <td>
                <div class="small">
                    <div><strong>${request.division_name || 'N/A'}</strong></div>
                    <div class="text-muted">${request.city_name || 'N/A'} → ${request.colony_name || 'N/A'}</div>
                    <div class="text-muted">${request.location || 'No specific location'}</div>
                </div>
            </td>
            <td>
                <div class="text-truncate" style="max-width: 200px;" title="${request.description}">
                    ${request.description || 'No description'}
                </div>
                <div class="small text-muted">${request.department_name || 'No department'}</div>
            </td>
            <td>
                <div class="small">
                    <div><strong>${request.requester_name || 'N/A'}</strong></div>
                    <div class="text-muted">${request.designation || ''}</div>
                    <div class="text-muted">${request.mobile || ''}</div>
                    <div class="text-muted">${request.employee_id || ''}</div>
                </div>
            </td>
            ${assignedColumn}
            <td>${createdDate}</td>
            <td><span class="badge ${statusBadgeClass}">${request.status}</span></td>
            <td>
                <div class="btn-group-vertical btn-group-sm">
                    <button class="btn btn-outline-primary btn-sm" onclick="viewRequest(${request.id})">
                        <i class="bi bi-eye"></i> View
                    </button>
                    ${type === 'unassigned' ? `
                        <button class="btn btn-outline-success btn-sm" onclick="assignRequest(${request.id})">
                            <i class="bi bi-person-plus"></i> Assign
                        </button>
                    ` : `
                        <button class="btn btn-outline-warning btn-sm" onclick="reassignRequest(${request.id})">
                            <i class="bi bi-arrow-repeat"></i> Reassign
                        </button>
                    `}
                </div>
            </td>
        </tr>
    `;
}

// Assign request to supervisor
async function assignRequest(requestId) {
    console.log('assignRequest called with ID:', requestId);
    
    // Set the request ID in the modal
    document.getElementById('requestId').value = requestId;
    
    // Load supervisors for selection first
    console.log('About to load supervisors...');
    await loadSupervisorsForAssignment();
    
    // Show the assignment modal after supervisors are loaded
    const assignmentModal = new bootstrap.Modal(document.getElementById('assignmentModal'));
    assignmentModal.show();
}

// Load supervisors for assignment dropdown
async function loadSupervisorsForAssignment() {
    console.log('loadSupervisorsForAssignment called');
    try {
        console.log('Making fetch request to /api/admin/supervisors');
        const response = await fetch('/api/admin/supervisors');
        console.log('Response status:', response.status);
        console.log('Response ok:', response.ok);
        
        if (response.ok) {
            const data = await response.json();
            console.log('Received data:', data);
            const supervisors = data.supervisors; // Use the flat supervisors array
            console.log('Supervisors array:', supervisors);
            console.log('Number of supervisors:', supervisors ? supervisors.length : 'undefined');
            
            const supervisorSelect = document.getElementById('supervisorSelect');
            console.log('supervisorSelect element:', supervisorSelect);
            
            // Clear existing options except the first one
            supervisorSelect.innerHTML = '<option value="">Choose a supervisor...</option>';
            
            // Add supervisor options (only active supervisors)
            const activeSupervisors = supervisors.filter(supervisor => supervisor.active === 1);
            console.log('Active supervisors:', activeSupervisors.length);
            
            activeSupervisors.forEach(supervisor => {
                console.log('Adding supervisor:', supervisor);
                const option = document.createElement('option');
                option.value = supervisor.id;
                // Use username since email doesn't exist in the database
                option.textContent = supervisor.username;
                if (supervisor.department_name) {
                    option.textContent += ` - ${supervisor.department_name}`;
                }
                supervisorSelect.appendChild(option);
            });
            
            console.log('Final dropdown HTML:', supervisorSelect.innerHTML);
        } else {
            console.error('Failed to load supervisors:', response.status, response.statusText);
            const errorText = await response.text();
            console.error('Error response:', errorText);
            showAlert('error', 'Failed to load supervisors');
        }
    } catch (error) {
        console.error('Error loading supervisors:', error);
        showAlert('error', 'Error loading supervisors');
    }
}

// Handle assignment confirmation
document.addEventListener('DOMContentLoaded', function() {
    const confirmAssignmentBtn = document.getElementById('confirmAssignment');
    if (confirmAssignmentBtn) {
        confirmAssignmentBtn.addEventListener('click', async function() {
            const requestId = document.getElementById('requestId').value;
            const supervisorId = document.getElementById('supervisorSelect').value;
            const notes = document.getElementById('assignmentNotes').value;
            
            if (!supervisorId) {
                showAlert('error', 'Please select a supervisor');
                return;
            }
            
            try {
                const response = await fetch('/api/admin/assign-request', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        requestId: requestId,
                        supervisorId: supervisorId,
                        notes: notes
                    })
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    showAlert('success', result.message);
                    
                    // Close the modal
                    const assignmentModal = bootstrap.Modal.getInstance(document.getElementById('assignmentModal'));
                    assignmentModal.hide();
                    
                    // Clear the form
                    document.getElementById('assignmentForm').reset();
                    
                    // Refresh the current tab to show updated data
                    const activeTab = document.querySelector('.tab-pane.active');
                    if (activeTab) {
                        const tabId = activeTab.id;
                        if (tabId === 'pending') {
                            loadPendingRequests();
                        } else if (tabId === 'assignments') {
                            loadPendingAssignments();
                        }
                    }
                } else {
                    showAlert('error', result.error || 'Failed to assign request');
                }
            } catch (error) {
                console.error('Error assigning request:', error);
                showAlert('error', 'Error assigning request');
            }
        });
    }
});

// Reassign request to different supervisor
function reassignRequest(requestId) {
    // Implementation for reassigning request
    console.log('Reassigning request ID:', requestId);
    showAlert('info', `Reassignment functionality for request ID: ${requestId} - Coming soon`);
}

// ====================== PENDING ASSIGNMENTS FILTER SYSTEM ======================

// Global variable to store pending assignments data
let currentPendingData = null;

// Filter pending assignments by type (from summary cards)
function filterPendingByType(type) {
    console.log('Filtering pending assignments by type:', type);
    
    // Update active card styling
    document.querySelectorAll('.status-card').forEach(card => {
        card.classList.remove('active');
    });
    event.target.closest('.status-card').classList.add('active');
    
    // Set the filter and apply
    currentPendingFilters = { assignment_status: type };
    
    // Update the dropdown
    const statusFilter = document.getElementById('pendingStatusFilter');
    if (statusFilter) {
        if (type === 'all') {
            statusFilter.value = '';
        } else {
            statusFilter.value = type;
        }
    }
    
    // Apply the filter
    applyPendingFilters();
}

// Apply pending assignment filters
async function applyPendingFilters() {
    console.log('Applying pending assignment filters...');
    showLoading(true);
    
    try {
        // Get filter values from form
        const filters = getPendingFilterValues();
        currentPendingFilters = { ...currentPendingFilters, ...filters };
        
        console.log('Applied filters:', currentPendingFilters);
        
        // Reset to page 1 when applying new filters
        await loadPendingAssignmentsWithFilters(currentPendingFilters, 1);
        
        // Show active filters
        displayActivePendingFilters(currentPendingFilters);
        
    } catch (error) {
        console.error('Error applying pending filters:', error);
        showAlert('danger', 'Error applying filters');
    } finally {
        showLoading(false);
    }
}

// Get filter values from the pending filters form
function getPendingFilterValues() {
    const form = document.getElementById('pendingFilters');
    const formData = new FormData(form);
    const filters = {};
    
    for (let [key, value] of formData.entries()) {
        if (value && value.trim() !== '') {
            filters[key] = value.trim();
        }
    }
    
    return filters;
}

// Load pending assignments with filters
async function loadPendingAssignmentsWithFilters(filters = {}, page = 1) {
    console.log('Loading pending assignments with filters:', filters, 'page:', page);
    showLoading(true);
    
    // Store current state
    currentPendingFilters = filters;
    currentPendingPage = page;
    
    if (!isAuthenticated) {
        showAlert('danger', 'Not authenticated');
        return;
    }
    
    try {
        // Initialize filters first
        if (page === 1) {
            await initializePendingFilters();
        }
        
        // Add pagination parameters
        const paginationParams = {
            ...filters,
            limit: ITEMS_PER_PAGE,
            offset: (page - 1) * ITEMS_PER_PAGE
        };
        
        // Build query string
        const queryParams = new URLSearchParams(paginationParams);
        const url = `/api/admin/pending-assignments${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        
        console.log('Fetching from URL:', url);
        
        const response = await fetch(url, {
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Filtered pending assignments data received:', data);
        
        // Store the filtered data
        currentPendingData = data;
        
        const requests = data.pendingRequests || data || [];
        totalPendingRequests = data.total || requests.length;
        const totalPages = Math.ceil(totalPendingRequests / ITEMS_PER_PAGE);
        
        // Update summary cards with filtered counts
        updatePendingSummaryFiltered(data.summary, requests);
        
        // Display filtered content with pagination
        displayPendingContentFiltered(data, filters, page, totalPages);
        
        // Update results summary
        updatePendingResultsSummary(requests, filters);
        
        showAlert('success', 'Pending assignments loaded successfully');
        
    } catch (error) {
        console.error('Error loading filtered pending assignments:', error);
        showAlert('danger', 'Failed to load filtered pending assignments');
        document.getElementById('pendingContent').innerHTML = `
            <div class="alert alert-danger">
                <h6>Error Loading Filtered Pending Assignments</h6>
                <p>${error.message}</p>
                <button class="btn btn-outline-danger btn-sm" onclick="loadPendingAssignments()">Try Again</button>
            </div>
        `;
    } finally {
        showLoading(false);
    }
}

// Update pending summary cards with filtered data
function updatePendingSummaryFiltered(summary, requests) {
    // Calculate filtered counts
    const totalPending = requests.length;
    const unassigned = requests.filter(req => !req.supervisor_id).length;
    const assigned = requests.filter(req => req.supervisor_id && req.assignment_status === 'Assigned').length;
    
    // Calculate overdue (over 24 hours)
    const now = new Date();
    const overdue = requests.filter(req => {
        const createdDate = new Date(req.created_at);
        const hoursDiff = (now - createdDate) / (1000 * 60 * 60);
        return hoursDiff > 24;
    }).length;
    
    // Update counts
    document.getElementById('totalPendingCount').textContent = totalPending;
    document.getElementById('unassignedCount').textContent = unassigned;
    document.getElementById('assignedCount').textContent = assigned;
    document.getElementById('overdueCount').textContent = overdue;
}

// Display pending content with filters applied
function displayPendingContentFiltered(data, filters, page = 1, totalPages = 1) {
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
    const requests = data.pendingRequests || [];
    
    if (requests.length === 0) {
        const filterText = Object.keys(filters).length > 0 ? ' matching the applied filters' : '';
        document.getElementById('pendingContent').innerHTML = `
            <div class="alert alert-info text-center">
                <i class="bi bi-search display-4 text-info"></i>
                <h4 class="mt-3">No Pending Assignments Found</h4>
                <p>There are no pending requests${filterText} at this time.</p>
                <div class="mt-3">
                    <button class="btn btn-outline-primary" onclick="clearPendingFilters()">
                        <i class="bi bi-x-circle"></i> Clear Filters
                    </button>
                </div>
            </div>
        `;
        return;
    }
    
    // Generate HTML with pagination info
    const startIndex = (page - 1) * ITEMS_PER_PAGE + 1;
    const endIndex = Math.min(page * ITEMS_PER_PAGE, totalPendingRequests);
    
    let html = `
        <div class="card">
            <div class="card-header d-flex justify-content-between align-items-center">
                <h5 class="mb-0">
                    <i class="bi bi-clock-history"></i> Pending Assignments
                    ${requests.length > 0 ? ` (Page ${page} of ${totalPages})` : ' (No results)'}
                </h5>
                <div class="d-flex align-items-center gap-2">
                    <small class="text-muted">Showing ${startIndex}-${endIndex} of ${totalPendingRequests} pending assignments</small>
                </div>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-hover mb-0">
                        <thead class="table-light">
                            <tr>
                                <th style="width: 8%;">ID</th>
                                <th style="width: 20%;">Description</th>
                                <th style="width: 15%;">Requester</th>
                                <th style="width: 12%;">Date</th>
                                <th style="width: 15%;">Location</th>
                                <th style="width: 12%;">Department</th>
                                <th style="width: 10%;">Status</th>
                                <th style="width: 8%;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
    `;
    
    requests.forEach(request => {
        html += `
            <tr>
                <td><strong>#${request.id}</strong></td>
                <td>
                    <div class="text-truncate" title="${request.description || ''}" style="max-width: 200px;">
                        ${request.description || 'N/A'}
                    </div>
                </td>
                <td>${request.name || request.user_name || 'Unknown'}</td>
                <td>
                    <small>${request.created_at ? formatDate(request.created_at) : 'N/A'}</small>
                </td>
                <td>
                    <div class="text-truncate" title="${request.location || ''}" style="max-width: 150px;">
                        ${request.location || 'N/A'}
                    </div>
                </td>
                <td>
                    <span class="badge bg-secondary">${request.department_name || 'N/A'}</span>
                </td>
                <td>
                    <span class="badge ${request.supervisor_id ? 'bg-info' : 'bg-warning text-dark'}">
                        ${request.supervisor_id ? 'Assigned' : 'Unassigned'}
                    </span>
                </td>
                <td>
                    <div class="btn-group" role="group">
                        <button class="btn btn-sm btn-outline-primary" onclick="viewRequest(${request.id})" title="View Details">
                            <i class="bi bi-eye"></i>
                        </button>
                        ${!request.supervisor_id ? `
                        <button class="btn btn-sm btn-outline-success" onclick="showAssignmentModal(${request.id})" title="Assign Supervisor">
                            <i class="bi bi-person-plus"></i>
                        </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    });
    
    html += `
                        </tbody>
                    </table>
                </div>
            </div>
            ${totalPages > 1 ? `<div class="card-footer">${generatePendingPaginationControls(page, totalPages)}</div>` : ''}
        </div>
    `;
    
    document.getElementById('pendingContent').innerHTML = html;
}

// Display pending content from filtered requests array
function displayPendingContentFromRequests(requests, currentUser, filters = {}) {
    let html = `
        <div class="mb-3">
            <div class="d-flex justify-content-between align-items-center">
                <h5 class="text-primary mb-0">
                    <i class="bi bi-clock-history"></i> Filtered Pending Request Assignments
                </h5>
                <span class="badge bg-primary">${requests.length} Requests</span>
            </div>
            <p class="text-muted small mb-0">Requests that match your filter criteria</p>
        </div>
    `;
    
    // Group requests by status/assignment type
    const unassigned = requests.filter(req => !req.supervisor_id);
    const assignedButNotAccepted = requests.filter(req => req.supervisor_id && req.assignment_status === 'Assigned');
    const overdue = requests.filter(req => {
        const now = new Date();
        const createdDate = new Date(req.created_at);
        const hoursDiff = (now - createdDate) / (1000 * 60 * 60);
        return hoursDiff > 24;
    });
    
    // Show sections based on what's available and filters
    if (unassigned.length > 0 && (!filters.assignment_status || filters.assignment_status === 'unassigned' || filters.assignment_status === 'all')) {
        html += generatePendingSection(unassigned, 'unassigned', 'Unassigned Requests', 'bg-warning text-dark', 'bi-clock', 'Need supervisor assignment');
    }
    
    if (assignedButNotAccepted.length > 0 && (!filters.assignment_status || filters.assignment_status === 'assigned' || filters.assignment_status === 'all')) {
        html += generatePendingSection(assignedButNotAccepted, 'assigned', 'Assigned But Not Accepted', 'bg-info text-white', 'bi-person-check', 'Waiting for supervisor acceptance');
    }
    
    if (overdue.length > 0 && (!filters.assignment_status || filters.assignment_status === 'overdue' || filters.assignment_status === 'all')) {
        html += generatePendingSection(overdue, 'overdue', 'Overdue Requests (>24hrs)', 'bg-danger text-white', 'bi-exclamation-triangle', 'Require immediate attention');
    }
    
    document.getElementById('pendingContent').innerHTML = html;
}

// Generate a pending section (unassigned, assigned, overdue)
function generatePendingSection(requests, type, title, headerClass, icon, subtitle) {
    let html = `
        <div class="card mb-4">
            <div class="card-header ${headerClass}">
                <h6 class="mb-0">
                    <i class="bi ${icon}"></i> ${title} (${requests.length})
                    <small class="opacity-75">- ${subtitle}</small>
                </h6>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-hover mb-0">
                        <thead class="table-light">
                            <tr>
                                <th>Request ID</th>
                                <th>Location</th>
                                <th>Description</th>
                                <th>Requester</th>
                                ${type === 'assigned' ? '<th>Assigned To</th>' : ''}
                                <th>Created</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
    `;
    
    requests.forEach(request => {
        html += generateRequestRow(request, type);
    });
    
    html += `
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    
    return html;
}

// Update pending results summary
function updatePendingResultsSummary(requests, filters) {
    const summaryDiv = document.getElementById('pendingResultsSummary');
    const countSpan = document.getElementById('pendingResultsCount');
    const totalSpan = document.getElementById('pendingResultsTotal');
    const filtersSpan = document.getElementById('pendingActiveFilters');
    
    if (!summaryDiv) return;
    
    // Update pagination summary
    const startIndex = (currentPendingPage - 1) * ITEMS_PER_PAGE + 1;
    const endIndex = Math.min(currentPendingPage * ITEMS_PER_PAGE, totalPendingRequests);
    
    if (countSpan) {
        countSpan.textContent = `${startIndex}-${endIndex}`;
    }
    
    if (totalSpan) {
        totalSpan.textContent = ` of ${totalPendingRequests} total`;
    }
    
    // Show active filters
    const activeFilters = Object.keys(filters).filter(key => filters[key] && filters[key] !== '').length;
    if (filtersSpan) {
        if (activeFilters > 0) {
            filtersSpan.innerHTML = `<span class="badge bg-secondary ms-2">${activeFilters} filter(s) active</span>`;
        } else {
            filtersSpan.innerHTML = '';
        }
    }
    
    summaryDiv.classList.remove('d-none');
}

// Display active pending filters
function displayActivePendingFilters(filters) {
    const activeFiltersDiv = document.getElementById('pendingActiveFilters');
    if (!activeFiltersDiv) return;
    
    const filterLabels = {
        assignment_status: 'Assignment Status',
        department_id: 'Department',
        division_id: 'Division',
        city_id: 'City',
        supervisor_id: 'Supervisor',
        priority: 'Priority',
        date_from: 'From Date',
        date_to: 'To Date',
        search: 'Search',
        sort: 'Sort'
    };
    
    const activeFilters = Object.keys(filters)
        .filter(key => filters[key] && filters[key] !== '')
        .map(key => {
            let value = filters[key];
            if (key === 'supervisor_id' && value === 'null') value = 'Unassigned';
            return `${filterLabels[key] || key}: ${value}`;
        });
    
    if (activeFilters.length > 0) {
        activeFiltersDiv.innerHTML = activeFilters.map(filter => 
            `<span class="badge bg-primary me-1">${filter}</span>`
        ).join('');
    } else {
        activeFiltersDiv.innerHTML = '';
    }
}

// Clear pending assignment filters
function clearPendingFilters() {
    console.log('Clearing pending assignment filters...');
    
    // Reset the form
    document.getElementById('pendingFilters').reset();
    
    // Clear current filters
    currentPendingFilters = {};
    
    // Remove active styling from cards
    document.querySelectorAll('.status-card').forEach(card => {
        card.classList.remove('active');
    });
    
    // Hide results summary
    document.getElementById('pendingResultsSummary').classList.add('d-none');
    
    // Reload all pending assignments
    loadPendingAssignments();
}

// Initialize pending filters when page loads
async function initializePendingFilters() {
    console.log('Initializing pending assignment filters...');
    
    try {
        // Load filter options
        await loadPendingFilterOptions();
        
    } catch (error) {
        console.error('Error initializing pending filters:', error);
    }
}

// Load filter options for pending assignments
async function loadPendingFilterOptions() {
    try {
        // Load departments
        const deptResponse = await fetch('/api/admin/departments');
        if (deptResponse.ok) {
            const deptData = await deptResponse.json();
            populateSelectOptions('pendingDepartmentFilter', deptData.departments || [], 'id', 'name');
        }
        
        // Load divisions
        const divResponse = await fetch('/api/admin/divisions');
        if (divResponse.ok) {
            const divData = await divResponse.json();
            populateSelectOptions('pendingDivisionFilter', divData.divisions || [], 'id', 'name');
        }
        
        // Load cities
        const cityResponse = await fetch('/api/admin/cities');
        if (cityResponse.ok) {
            const cityData = await cityResponse.json();
            populateSelectOptions('pendingCityFilter', cityData.cities || [], 'id', 'name');
        }
        
        // Load supervisors
        const supResponse = await fetch('/api/admin/supervisors');
        if (supResponse.ok) {
            const supData = await supResponse.json();
            const supervisors = supData.supervisors || [];
            populateSelectOptions('pendingSupervisorFilter', supervisors, 'id', 'username');
        }
        
    } catch (error) {
        console.error('Error loading pending filter options:', error);
    }
}

// Helper function to populate select options
function populateSelectOptions(selectId, options, valueField, textField) {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    // Keep the first option (All...)
    const firstOption = select.querySelector('option');
    select.innerHTML = '';
    if (firstOption) {
        select.appendChild(firstOption);
    }
    
    // Add options
    options.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option[valueField];
        optionElement.textContent = option[textField];
        select.appendChild(optionElement);
    });
}

// Helper function to populate select options
function populateSelectOptions(selectId, options, valueField, textField) {
    const selectElement = document.getElementById(selectId);
    if (!selectElement) {
        console.warn(`Select element with ID '${selectId}' not found`);
        return;
    }
    
    // Keep the first option (usually "All [something]")
    const firstOption = selectElement.querySelector('option');
    selectElement.innerHTML = '';
    if (firstOption) {
        selectElement.appendChild(firstOption);
    }
    
    // Add options from the data
    options.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option[valueField];
        optionElement.textContent = option[textField];
        selectElement.appendChild(optionElement);
    });
}

// ====================== END PENDING ASSIGNMENTS FILTER SYSTEM ======================

// Generate Level 1 Admin hierarchical pending view (Division → City → Colony → Department → Items)
function generateLevel1PendingHierarchy(data, currentUser) {
    let html = `
        <div class="mb-3">
            <div class="d-flex justify-content-between align-items-center">
                <h5 class="text-primary mb-0">
                    <i class="bi bi-diagram-3"></i> Hierarchical Pending Assignments
                </h5>
                <span class="badge bg-primary">Level 1 Admin View</span>
            </div>
            <p class="text-muted small mb-0">Organizational hierarchy: Division → City → Colony → Department → Supervisor Assignment</p>
        </div>
    `;
    
    // Create organizational hierarchy structure
    html += generateOrganizationalHierarchy(data, currentUser);
    
    return html;
}

// Generate Level 2 Admin hierarchical pending view (Division → City → Colony → Department → Items)
function generateLevel2PendingHierarchy(data, currentUser) {
    let html = `
        <div class="mb-3">
            <div class="d-flex justify-content-between align-items-center">
                <h5 class="text-primary mb-0">
                    <i class="bi bi-diagram-2"></i> Division-Level Pending Assignments
                </h5>
                <span class="badge bg-info">Level 2 Admin View</span>
            </div>
            <p class="text-muted small mb-0">Hierarchy within your division: City → Colony → Department → Supervisor Assignment</p>
        </div>
    `;
    
    // Show division context
    html += `
        <div class="alert alert-light border-info mb-4">
            <i class="bi bi-building text-info me-2"></i>
            <strong>Your Division:</strong> ${currentUser.division_name || 'Unknown Division'}
        </div>
    `;
    
    // Filter data by division for Level 2 admin
    const divisionFilteredData = filterDataByDivision(data, currentUser.division_id);
    
    // Generate organizational hierarchy for this division
    html += generateOrganizationalHierarchy(divisionFilteredData, currentUser, currentUser.division_id);
    
    return html;
}

// Generate Level 3 Admin hierarchical pending view (City → Colony → Department → Items)
function generateLevel3PendingHierarchy(data, currentUser) {
    let html = `
        <div class="mb-3">
            <div class="d-flex justify-content-between align-items-center">
                <h5 class="text-primary mb-0">
                    <i class="bi bi-geo-alt"></i> City-Level Pending Assignments
                </h5>
                <span class="badge bg-success">Level 3 Admin View</span>
            </div>
            <p class="text-muted small mb-0">Hierarchy within your city: Colony → Department → Supervisor Assignment</p>
        </div>
    `;
    
    // Show city context
    html += `
        <div class="alert alert-light border-success mb-4">
            <i class="bi bi-geo-alt text-success me-2"></i>
            <strong>Your City:</strong> ${currentUser.city_name || 'Unknown City'}
            <br>
            <i class="bi bi-building text-muted me-2"></i>
            <strong>Your Division:</strong> ${currentUser.division_name || 'Unknown Division'}
        </div>
    `;
    
    // Filter data by city for Level 3 admin
    const cityFilteredData = filterDataByCity(data, currentUser.city_id);
    
    // Generate organizational hierarchy for this city
    html += generateOrganizationalHierarchy(cityFilteredData, currentUser, null, currentUser.city_id);
    
    return html;
}

// Generate organizational hierarchy: Division → City → Colony → Department → Items
function generateOrganizationalHierarchy(data, currentUser, divisionFilter = null, cityFilter = null) {
    console.log('🏢 Generating organizational hierarchy...', { divisionFilter, cityFilter });
    
    // Combine all data sources and organize by hierarchy
    const hierarchyData = organizeDataByHierarchy(data, divisionFilter, cityFilter);
    
    if (!hierarchyData || Object.keys(hierarchyData).length === 0) {
        return `
            <div class="alert alert-success text-center">
                <i class="bi bi-check-circle display-4 text-success"></i>
                <h4 class="mt-3">All Assignments Complete!</h4>
                <p>No pending assignments found for supervisor assignment.</p>
                <div class="mt-3">
                    <span class="badge bg-primary">Organizational Hierarchy View</span>
                </div>
            </div>
        `;
    }
    
    let html = '';
    
    // Level 1: Divisions
    Object.keys(hierarchyData).sort().forEach(divisionName => {
        const divisionData = hierarchyData[divisionName];
        const divisionId = `org_div_${divisionName.replace(/\s+/g, '_')}_${Date.now()}`;
        
        // Count total items in this division
        const totalItems = countItemsInDivision(divisionData);
        
        html += `
            <div class="mb-4">
                <div class="card border-primary">
                    <div class="card-header bg-primary text-white" data-bs-toggle="collapse" data-bs-target="#${divisionId}" style="cursor: pointer;" aria-expanded="false">
                        <div class="d-flex justify-content-between align-items-center">
                            <h5 class="mb-0">
                                <i class="bi bi-building me-2"></i>
                                📁 ${divisionName} Division
                            </h5>
                            <span class="badge bg-light text-dark">${totalItems} pending assignments</span>
                        </div>
                        <small class="d-block mt-1 opacity-75">Expand to view cities, colonies, departments, and supervisor assignments</small>
                    </div>
                    <div class="collapse" id="${divisionId}">
                        <div class="card-body ps-4">
                            ${generateCityLevel(divisionData, divisionName)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    return html;
}

// Organize all data by hierarchical structure
function organizeDataByHierarchy(data, divisionFilter = null, cityFilter = null) {
    const hierarchy = {};
    
    // Helper function to ensure hierarchy structure exists
    function ensureHierarchy(divisionName, cityName, colonyName, departmentName) {
        if (!hierarchy[divisionName]) {
            hierarchy[divisionName] = { 
                cities: {},
                unassignedItems: { divisions: [], cities: [], workers: [], colonies: [], departments: [] }
            };
        }
        if (!hierarchy[divisionName].cities[cityName]) {
            hierarchy[divisionName].cities[cityName] = { 
                colonies: {},
                unassignedItems: { cities: [], workers: [], colonies: [], departments: [] }
            };
        }
        if (!hierarchy[divisionName].cities[cityName].colonies[colonyName]) {
            hierarchy[divisionName].cities[cityName].colonies[colonyName] = { 
                departments: {},
                unassignedItems: { workers: [], colonies: [], departments: [] }
            };
        }
        if (!hierarchy[divisionName].cities[cityName].colonies[colonyName].departments[departmentName]) {
            hierarchy[divisionName].cities[cityName].colonies[colonyName].departments[departmentName] = { 
                workers: [],
                unassignedItems: { workers: [], departments: [] }
            };
        }
    }
    
    // 1. Process unassigned divisions
    if (data.unassignedDivisions) {
        data.unassignedDivisions.forEach(division => {
            const divisionName = division.name || 'Unknown Division';
            ensureHierarchy(divisionName, 'Unassigned Cities', 'Unassigned Colonies', 'Unassigned Departments');
            hierarchy[divisionName].unassignedItems.divisions.push(division);
        });
    }
    
    // 2. Process unassigned cities
    if (data.unassignedCities) {
        data.unassignedCities.forEach(city => {
            if (cityFilter && city.id !== cityFilter) return;
            if (divisionFilter && city.division_id !== divisionFilter) return;
            
            const divisionName = city.division_name || 'Unknown Division';
            const cityName = city.name || 'Unknown City';
            ensureHierarchy(divisionName, cityName, 'Unassigned Colonies', 'Unassigned Departments');
            hierarchy[divisionName].cities[cityName].unassignedItems.cities.push(city);
        });
    }
    
    // 3. Process unassigned workers (supervisors)
    if (data.unassignedWorkers) {
        data.unassignedWorkers.forEach(worker => {
            if (cityFilter && worker.city_id !== cityFilter) return;
            if (divisionFilter && worker.division_id !== divisionFilter) return;
            
            const divisionName = worker.division_name || 'Unknown Division';
            const cityName = worker.city_name || 'Unknown City';
            // Group workers by their assigned colony if they have one, otherwise use pending assignment
            const colonyName = worker.colony_name || 'Pending Colony Assignment';
            const departmentName = worker.department_name || 'Unknown Department';
            
            ensureHierarchy(divisionName, cityName, colonyName, departmentName);
            hierarchy[divisionName].cities[cityName].colonies[colonyName].departments[departmentName].workers.push(worker);
        });
    }
    
    // 4. Process unassigned colonies - treat as colonies that need department assignments
    if (data.unassignedColonies) {
        // Group colonies by name first to avoid duplicates
        const coloniesByName = {};
        
        data.unassignedColonies.forEach(colony => {
            if (cityFilter && colony.city_id !== cityFilter) return;
            if (divisionFilter && colony.division_id !== divisionFilter) return;
            
            const divisionName = colony.division_name || 'Unknown Division';
            const cityName = colony.city_name || 'Unknown City';
            const colonyName = colony.name || 'Unknown Colony';
            const key = `${divisionName}|${cityName}|${colonyName}`;
            
            if (!coloniesByName[key]) {
                coloniesByName[key] = {
                    divisionName,
                    cityName,
                    colonyName,
                    colonies: []
                };
            }
            coloniesByName[key].colonies.push(colony);
        });
        
        // Create single entry per colony name group
        Object.values(coloniesByName).forEach(group => {
            // Create colony structure - this will be directly assignable
            ensureHierarchy(group.divisionName, group.cityName, group.colonyName, 'Ready for Assignment');
            
            // Mark this colony group as ready for department assignment
            hierarchy[group.divisionName].cities[group.cityName].colonies[group.colonyName].departments['Ready for Assignment'].unassignedItems.departments.push({
                type: 'colony_group_ready',
                colony_name: group.colonyName,
                colony_count: group.colonies.length,
                colony_ids: group.colonies.map(c => c.id),
                division_name: group.divisionName,
                city_name: group.cityName,
                display_name: `${group.colonyName} Colony`
            });
        });
    }
    
    // 5. Process unassigned departments - treat as departments that need supervisor assignments
    if (data.unassignedDepartments) {
        data.unassignedDepartments.forEach(department => {
            // These are departments without colony assignment, so put them in a general category
            const divisionName = 'Unassigned Departments';
            const cityName = 'All Cities';
            const colonyName = 'Pending Colony Assignment';
            const departmentName = department.name || 'Unknown Department';
            
            ensureHierarchy(divisionName, cityName, colonyName, departmentName);
            hierarchy[divisionName].cities[cityName].colonies[colonyName].departments[departmentName].unassignedItems.departments.push(department);
        });
    }
    
    // Consolidate colonies by name to ensure proper grouping
    consolidateColoniesByName(hierarchy);
    
    return hierarchy;
}

// Consolidate colonies by name within each city to ensure proper grouping
function consolidateColoniesByName(hierarchy) {
    Object.keys(hierarchy).forEach(divisionName => {
        const divisionData = hierarchy[divisionName];
        
        Object.keys(divisionData.cities).forEach(cityName => {
            const cityData = divisionData.cities[cityName];
            const colonies = cityData.colonies;
            const consolidatedColonies = {};
            
            // Group colonies by their actual name (case-insensitive)
            Object.keys(colonies).forEach(colonyKey => {
                const colonyData = colonies[colonyKey];
                
                // Skip special placeholder colonies
                if (colonyKey === 'Pending Colony Assignment' || 
                    colonyKey === 'Unassigned Colonies' || 
                    colonyKey === 'All Colonies') {
                    consolidatedColonies[colonyKey] = colonyData;
                    return;
                }
                
                // Normalize colony name for grouping
                const normalizedName = colonyKey.toLowerCase().trim();
                
                // Find existing colony with same normalized name
                let existingKey = null;
                Object.keys(consolidatedColonies).forEach(existingColony => {
                    if (existingColony.toLowerCase().trim() === normalizedName && 
                        existingColony !== 'Pending Colony Assignment' &&
                        existingColony !== 'Unassigned Colonies' &&
                        existingColony !== 'All Colonies') {
                        existingKey = existingColony;
                    }
                });
                
                if (existingKey) {
                    // Merge with existing colony
                    const existingData = consolidatedColonies[existingKey];
                    
                    // Merge departments
                    Object.keys(colonyData.departments).forEach(deptName => {
                        if (!existingData.departments[deptName]) {
                            existingData.departments[deptName] = colonyData.departments[deptName];
                        } else {
                            // Merge workers and unassigned items
                            existingData.departments[deptName].workers = [
                                ...existingData.departments[deptName].workers,
                                ...colonyData.departments[deptName].workers
                            ];
                            
                            Object.keys(colonyData.departments[deptName].unassignedItems).forEach(itemType => {
                                existingData.departments[deptName].unassignedItems[itemType] = [
                                    ...existingData.departments[deptName].unassignedItems[itemType],
                                    ...colonyData.departments[deptName].unassignedItems[itemType]
                                ];
                            });
                        }
                    });
                    
                    // Merge unassigned items
                    Object.keys(colonyData.unassignedItems).forEach(itemType => {
                        existingData.unassignedItems[itemType] = [
                            ...existingData.unassignedItems[itemType],
                            ...colonyData.unassignedItems[itemType]
                        ];
                    });
                } else {
                    // Add as new colony
                    consolidatedColonies[colonyKey] = colonyData;
                }
            });
            
            // Replace the colonies with consolidated version
            cityData.colonies = consolidatedColonies;
        });
    });
}

// Count total items in a division
function countItemsInDivision(divisionData) {
    let count = 0;
    
    // Count division-level items
    count += (divisionData.unassignedItems.divisions || []).length;
    
    // Count city-level items
    Object.values(divisionData.cities).forEach(cityData => {
        count += (cityData.unassignedItems.cities || []).length;
        
        // Count colony-level items
        Object.values(cityData.colonies).forEach(colonyData => {
            count += (colonyData.unassignedItems.colonies || []).length;
            
            // Count department-level items
            Object.values(colonyData.departments).forEach(departmentData => {
                count += (departmentData.workers || []).length;
                count += (departmentData.unassignedItems.departments || []).length;
            });
        });
    });
    
    return count;
}

// Generate city level in hierarchy
function generateCityLevel(divisionData, divisionName) {
    let html = '';
    
    // Show division-level unassigned items first
    if (divisionData.unassignedItems.divisions.length > 0) {
        html += generateUnassignedItemsList('Unassigned Divisions', divisionData.unassignedItems.divisions, 'division', 'building', 'danger');
    }
    
    // Generate cities
    Object.keys(divisionData.cities).sort().forEach(cityName => {
        const cityData = divisionData.cities[cityName];
        const cityId = `org_city_${divisionName.replace(/\s+/g, '_')}_${cityName.replace(/\s+/g, '_')}_${Date.now()}`;
        
        // Count total items in this city
        const totalItems = countItemsInCity(cityData);
        
        if (totalItems === 0) return; // Skip empty cities
        
        html += `
            <div class="mb-3">
                <div class="card border-info">
                    <div class="card-header bg-info text-white" data-bs-toggle="collapse" data-bs-target="#${cityId}" style="cursor: pointer;" aria-expanded="false">
                        <div class="d-flex justify-content-between align-items-center">
                            <h6 class="mb-0">
                                <i class="bi bi-geo-alt me-2"></i>
                                📁 ${cityName} City
                            </h6>
                            <span class="badge bg-light text-dark">${totalItems} pending assignments</span>
                        </div>
                        <small class="d-block mt-1 opacity-75">Expand to view colonies, departments, and supervisors</small>
                    </div>
                    <div class="collapse" id="${cityId}">
                        <div class="card-body ps-4">
                            ${generateColonyLevel(cityData, divisionName, cityName)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    return html;
}

// Count total items in a city
function countItemsInCity(cityData) {
    let count = 0;
    
    // Count city-level items
    count += (cityData.unassignedItems.cities || []).length;
    
    // Count colony-level items
    Object.values(cityData.colonies).forEach(colonyData => {
        count += (colonyData.unassignedItems.colonies || []).length;
        
        // Count department-level items
        Object.values(colonyData.departments).forEach(departmentData => {
            count += (departmentData.workers || []).length;
            count += (departmentData.unassignedItems.departments || []).length;
        });
    });
    
    return count;
}

// Generate colony level in hierarchy - locations-style grouped display
function generateColonyLevel(cityData, divisionName, cityName) {
    let html = '';
    
    // Show city-level unassigned items first
    if (cityData.unassignedItems.cities.length > 0) {
        html += generateUnassignedItemsList('Unassigned Cities', cityData.unassignedItems.cities, 'city', 'geo-alt', 'warning');
    }
    
    // Generate colonies - group by colony name (locations-style)
    const colonyNames = Object.keys(cityData.colonies).sort();
    
    colonyNames.forEach(colonyName => {
        const colonyData = cityData.colonies[colonyName];
        
        // Count total items in this colony
        const totalItems = countItemsInColony(colonyData);
        
        if (totalItems === 0) return; // Skip empty colonies
        
        // Count departments and workers for better display
        const departmentCount = Object.keys(colonyData.departments).length;
        const workerCount = Object.values(colonyData.departments)
            .reduce((sum, dept) => sum + (dept.workers || []).length, 0);
        const unassignedColonyItems = (colonyData.unassignedItems.colonies || []).length;
        
        // Generate unique ID for collapse functionality
        const colonyId = `colony_${divisionName.replace(/\s+/g, '_')}_${cityName.replace(/\s+/g, '_')}_${colonyName.replace(/\s+/g, '_')}_${Date.now()}`;
        
        // Get colony group information for direct assignment
        let colonyGroupInfo = null;
        Object.values(colonyData.departments).forEach(dept => {
            dept.unassignedItems.departments.forEach(item => {
                if (item.type === 'colony_group_ready') {
                    colonyGroupInfo = item;
                }
            });
        });
        
        // Colony header (like locations style with direct assignment button)
        html += `
            <div class="mb-4">
                <div class="d-flex align-items-center mb-3 p-3 bg-success text-white rounded">
                    <i class="bi bi-houses me-3"></i>
                    <div class="flex-grow-1">
                        <h6 class="mb-0">${colonyName}</h6>
                        ${colonyGroupInfo ? `<small class="opacity-75">${colonyGroupInfo.colony_count} locations</small>` : ''}
                    </div>
                    <div class="text-end">
                        ${colonyGroupInfo ? `
                            <button class="btn btn-light btn-sm me-2" onclick="assignColonyGroup('${colonyGroupInfo.colony_name}', [${colonyGroupInfo.colony_ids.join(',')}], '${colonyGroupInfo.division_name}', '${colonyGroupInfo.city_name}')">
                                <i class="bi bi-check-circle me-1"></i> Assign Colony
                            </button>
                        ` : ''}
                        <span class="badge bg-light text-success">${totalItems} assignments</span>
                    </div>
                </div>
            </div>
        `;
    });
    
    if (!html) {
        html = '<div class="text-muted small">No colonies with pending assignments</div>';
    }
    
    return html;
}

// Generate colony items list (locations-style individual item display)
function generateColonyItemsList(colonyData, divisionName, cityName, colonyName) {
    let html = '';
    
    // Show departments and their supervisors directly (no nested colonies)
    Object.keys(colonyData.departments).sort().forEach(departmentName => {
        const departmentData = colonyData.departments[departmentName];
        
        // Show department-level unassigned items (departments that need supervisor assignment)
        if (departmentData.unassignedItems.departments.length > 0) {
            departmentData.unassignedItems.departments.forEach(department => {
                // Handle special case for colony groups ready for assignment
                if (department.type === 'colony_group_ready') {
                    html += `
                        <div class="d-flex align-items-center py-2 border-bottom">
                            <div class="me-3">
                                <i class="bi bi-houses text-success"></i>
                            </div>
                            <div class="flex-grow-1">
                                <div class="fw-medium">${department.colony_name} Colony</div>
                                <small class="text-muted">${department.colony_count} locations → ${department.division_name} → ${department.city_name}</small>
                            </div>
                            <div>
                                <button class="btn btn-primary btn-sm" onclick="assignColonyGroup('${department.colony_name}', [${department.colony_ids.join(',')}], '${department.division_name}', '${department.city_name}')">
                                    <i class="bi bi-check-circle me-1"></i> Assign Colony
                                </button>
                            </div>
                        </div>
                    `;
                } else {
                    // Regular department needing supervisor assignment
                    html += `
                        <div class="d-flex align-items-center py-2 border-bottom">
                            <div class="me-3">
                                <i class="bi bi-diagram-3 text-info"></i>
                            </div>
                            <div class="flex-grow-1">
                                <div class="fw-medium">${departmentName}</div>
                                <small class="text-muted">Department ID: ${department.id} → ${divisionName} → ${cityName} → ${colonyName}</small>
                            </div>
                            <div>
                                <button class="btn btn-outline-primary btn-sm" onclick="assignSupervisorToDepartment(${department.id}, '${departmentName}', '${colonyName}')">
                                    <i class="bi bi-person-plus-fill me-1"></i> Assign Supervisor
                                </button>
                            </div>
                        </div>
                    `;
                }
            });
        }
        
        // Show supervisors that need assignment to this department
        if (departmentData.workers.length > 0) {
            departmentData.workers.forEach(worker => {
                html += `
                    <div class="d-flex align-items-center py-2 border-bottom">
                        <div class="me-3">
                            <i class="bi bi-person-badge text-primary"></i>
                        </div>
                        <div class="flex-grow-1">
                            <div class="fw-medium">${worker.first_name || ''} ${worker.last_name || ''}</div>
                            <small class="text-muted">Supervisor ID: ${worker.id} → ${departmentName} Department</small>
                        </div>
                        <div>
                            <button class="btn btn-outline-success btn-sm" onclick="confirmSupervisorAssignment(${worker.id}, '${departmentName}', '${colonyName}')">
                                <i class="bi bi-check-circle me-1"></i> Confirm Assignment
                            </button>
                        </div>
                    </div>
                `;
            });
        }
    });
    
    if (!html) {
        html = '<div class="text-muted small py-3">No pending assignments in this colony</div>';
    }
    
    return html;
}

// Count total items in a colony
function countItemsInColony(colonyData) {
    let count = 0;
    
    // Count department-level items (departments needing supervisors and supervisors needing assignment)
    Object.values(colonyData.departments).forEach(departmentData => {
        count += (departmentData.workers || []).length;
        count += (departmentData.unassignedItems.departments || []).length;
    });
    
    return count;
}

// Generate department level in hierarchy
function generateDepartmentLevel(colonyData, divisionName, cityName, colonyName) {
    let html = '';
    
    // Show colony-level unassigned items first
    if (colonyData.unassignedItems.colonies.length > 0) {
        html += generateUnassignedItemsList('Unassigned Colonies', colonyData.unassignedItems.colonies, 'colony', 'houses', 'info');
    }
    
    // Generate departments
    Object.keys(colonyData.departments).sort().forEach(departmentName => {
        const departmentData = colonyData.departments[departmentName];
        const departmentId = `org_dept_${divisionName.replace(/\s+/g, '_')}_${cityName.replace(/\s+/g, '_')}_${colonyName.replace(/\s+/g, '_')}_${departmentName.replace(/\s+/g, '_')}_${Date.now()}`;
        
        // Count total items in this department
        const totalItems = (departmentData.workers || []).length + (departmentData.unassignedItems.departments || []).length;
        
        if (totalItems === 0) return; // Skip empty departments
        
        html += `
            <div class="mb-3">
                <div class="card border-secondary">
                    <div class="card-header bg-secondary text-white" data-bs-toggle="collapse" data-bs-target="#${departmentId}" style="cursor: pointer;">
                        <div class="d-flex justify-content-between align-items-center">
                            <h6 class="mb-0">
                                <i class="bi bi-briefcase me-2"></i>
                                📁 ${departmentName} Department
                            </h6>
                            <span class="badge bg-light text-dark">${totalItems} supervisors to assign</span>
                        </div>
                        <small class="d-block mt-1 opacity-75">Supervisors requiring assignment to this department</small>
                    </div>
                    <div class="collapse" id="${departmentId}">
                        <div class="card-body ps-4">
                            ${generateSupervisorAssignments(departmentData, divisionName, cityName, colonyName, departmentName)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    return html;
}

// Generate supervisor assignments (final level)
function generateSupervisorAssignments(departmentData, divisionName, cityName, colonyName, departmentName) {
    let html = '';
    
    // Show unassigned workers/supervisors
    if (departmentData.workers && departmentData.workers.length > 0) {
        html += `
            <div class="mb-3">
                <h6 class="text-warning mb-3">
                    <i class="bi bi-person-exclamation me-2"></i>
                    Supervisors Requiring Assignment
                </h6>
                ${departmentData.workers.map(worker => generateSupervisorCard(worker, divisionName, cityName, colonyName, departmentName)).join('')}
            </div>
        `;
    }
    
    // Show unassigned departments
    if (departmentData.unassignedItems.departments && departmentData.unassignedItems.departments.length > 0) {
        html += generateUnassignedItemsList('Unassigned Departments', departmentData.unassignedItems.departments, 'department', 'briefcase', 'secondary');
    }
    
    if (!html) {
        html = '<div class="text-muted small">No pending supervisor assignments</div>';
    }
    
    return html;
}

// Generate supervisor assignment card
function generateSupervisorCard(worker, divisionName, cityName, colonyName, departmentName) {
    const assignBtn = `<button class="btn btn-warning btn-sm" onclick="assignSupervisorToHierarchy('${worker.id}', '${divisionName}', '${cityName}', '${colonyName}', '${departmentName}')" title="Assign supervisor to this organizational unit">
        <i class="bi bi-person-plus-fill"></i> Assign Supervisor
    </button>`;
    
    return `
        <div class="card mb-2 border-warning">
            <div class="card-body py-2">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <strong class="text-dark">${worker.username}</strong>
                        <span class="badge ${getRoleBadgeClass(worker.role)} ms-2">${getRoleDisplayName(worker.role)}</span>
                        <div class="small text-muted mt-1">
                            <i class="bi bi-person-badge"></i> ID: ${worker.id} |
                            <i class="bi bi-building"></i> Current Division: ${worker.division_name || 'Unassigned'} |
                            <i class="bi bi-geo-alt"></i> Current City: ${worker.city_name || 'Unassigned'} |
                            <i class="bi bi-briefcase"></i> Current Department: ${worker.department_name || 'Unassigned'}
                        </div>
                        <div class="small text-success mt-1">
                            <i class="bi bi-arrow-right"></i> 
                            <strong>Assignment Target:</strong> ${divisionName} → ${cityName} → ${colonyName} → ${departmentName}
                        </div>
                    </div>
                    <div class="text-end">
                        ${assignBtn}
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Generate unassigned items list
function generateUnassignedItemsList(title, items, type, icon, color) {
    if (!items || items.length === 0) return '';
    
    return `
        <div class="mb-3">
            <h6 class="text-${color} mb-2">
                <i class="bi bi-${icon} me-2"></i>
                ${title} (${items.length})
            </h6>
            <div class="ps-3">
                ${items.map(item => generateUnassignedItemCard(item, type, color)).join('')}
            </div>
        </div>
    `;
}

// Generate unassigned item card
function generateUnassignedItemCard(item, type, color) {
    const assignBtn = `<button class="btn btn-outline-${color} btn-sm" onclick="assignItem('${type}', ${item.id}, '${(item.name || item.username || '').replace(/'/g, '\\\'')}')" title="Assign this ${type}">
        <i class="bi bi-person-plus"></i> Assign
    </button>`;
    
    return `
        <div class="d-flex justify-content-between align-items-center border-bottom py-2">
            <div>
                <strong>${item.name || item.username}</strong>
                <small class="text-muted d-block">ID: ${item.id}</small>
            </div>
            <div>${assignBtn}</div>
        </div>
    `;
}

// Generate default pending view for other roles
function generateDefaultPendingView(data, currentUser) {
    let html = `
        <div class="mb-3">
            <div class="d-flex justify-content-between align-items-center">
                <h5 class="text-primary mb-0">
                    <i class="bi bi-list-task"></i> Pending Assignments
                </h5>
                <span class="badge bg-secondary">${currentUser.role || 'Unknown Role'}</span>
            </div>
            <p class="text-muted small mb-0">Available pending assignments for your role</p>
        </div>
    `;
    
    // Show available assignments based on role
    if (data.unassignedDepartments && data.unassignedDepartments.length > 0) {
        html += generateHierarchicalSection('Unassigned Departments', data.unassignedDepartments, 'department', 'briefcase', 'secondary', 'These departments need assignment');
    }
    
    return html;
}

// Generate hierarchical section with collapsible cards
function generateHierarchicalSection(title, items, type, icon, color, description) {
    const sectionId = `pending_${type}_${Date.now()}`;
    
    return `
        <div class="mb-4">
            <div class="card border-${color}">
                <div class="card-header bg-${color} text-white" data-bs-toggle="collapse" data-bs-target="#${sectionId}" style="cursor: pointer;">
                    <div class="d-flex justify-content-between align-items-center">
                        <h6 class="mb-0">
                            <i class="bi bi-${icon} me-2"></i>
                            📁 ${title}
                        </h6>
                        <span class="badge bg-light text-dark">${items.length} items</span>
                    </div>
                    <small class="d-block mt-1 opacity-75">${description}</small>
                </div>
                <div class="collapse" id="${sectionId}">
                    <div class="card-body">
                        ${generateHierarchicalItems(items, type, color)}
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Generate hierarchical items within sections
function generateHierarchicalItems(items, type, color) {
    if (items.length === 0) {
        return `<div class="alert alert-info">No ${type}s found</div>`;
    }
    
    // Group items hierarchically if applicable
    if (type === 'worker') {
        return generateWorkerHierarchy(items, color);
    } else if (type === 'city') {
        return generateCityHierarchy(items, color);
    } else if (type === 'colony') {
        return generateColonyHierarchy(items, color);
    } else {
        return generateSimpleItemList(items, type, color);
    }
}

// Generate worker hierarchy (grouped by division and city)
function generateWorkerHierarchy(workers, color) {
    const groups = {};
    
    workers.forEach(worker => {
        const divisionName = worker.division_name || 'Unassigned Division';
        const cityName = worker.city_name || 'Unassigned City';
        
        if (!groups[divisionName]) {
            groups[divisionName] = {};
        }
        if (!groups[divisionName][cityName]) {
            groups[divisionName][cityName] = [];
        }
        groups[divisionName][cityName].push(worker);
    });
    
    let html = '';
    Object.keys(groups).sort().forEach(divisionName => {
        const divisionId = `worker_div_${divisionName.replace(/\s+/g, '_')}_${Date.now()}`;
        const cityGroups = groups[divisionName];
        const totalWorkers = Object.values(cityGroups).reduce((sum, workers) => sum + workers.length, 0);
        
        html += `
            <div class="mb-3">
                <div class="card border-secondary">
                    <div class="card-header bg-light" data-bs-toggle="collapse" data-bs-target="#${divisionId}" style="cursor: pointer;">
                        <div class="d-flex justify-content-between align-items-center">
                            <h6 class="mb-0">
                                <i class="bi bi-building text-secondary me-2"></i>
                                ${divisionName}
                            </h6>
                            <span class="badge bg-secondary">${totalWorkers} workers</span>
                        </div>
                    </div>
                    <div class="collapse" id="${divisionId}">
                        <div class="card-body ps-4">
                            ${Object.keys(cityGroups).sort().map(cityName => {
                                const cityId = `worker_city_${divisionName.replace(/\s+/g, '_')}_${cityName.replace(/\s+/g, '_')}_${Date.now()}`;
                                const cityWorkers = cityGroups[cityName];
                                
                                return `
                                    <div class="mb-2">
                                        <div class="card border-info">
                                            <div class="card-header bg-light" data-bs-toggle="collapse" data-bs-target="#${cityId}" style="cursor: pointer;">
                                                <div class="d-flex justify-content-between align-items-center">
                                                    <h6 class="mb-0">
                                                        <i class="bi bi-geo-alt text-info me-2"></i>
                                                        ${cityName}
                                                    </h6>
                                                    <span class="badge bg-info">${cityWorkers.length} workers</span>
                                                </div>
                                            </div>
                                            <div class="collapse" id="${cityId}">
                                                <div class="card-body ps-4">
                                                    ${generateWorkerList(cityWorkers)}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    return html;
}

// Generate city hierarchy (grouped by division)
function generateCityHierarchy(cities, color) {
    const divisionGroups = {};
    
    cities.forEach(city => {
        const divisionName = city.division_name || 'Unassigned Division';
        if (!divisionGroups[divisionName]) {
            divisionGroups[divisionName] = [];
        }
        divisionGroups[divisionName].push(city);
    });
    
    let html = '';
    Object.keys(divisionGroups).sort().forEach(divisionName => {
        const divisionId = `city_div_${divisionName.replace(/\s+/g, '_')}_${Date.now()}`;
        const divisionCities = divisionGroups[divisionName];
        
        html += `
            <div class="mb-3">
                <div class="card border-secondary">
                    <div class="card-header bg-light" data-bs-toggle="collapse" data-bs-target="#${divisionId}" style="cursor: pointer;">
                        <div class="d-flex justify-content-between align-items-center">
                            <h6 class="mb-0">
                                <i class="bi bi-building text-secondary me-2"></i>
                                ${divisionName}
                            </h6>
                            <span class="badge bg-secondary">${divisionCities.length} cities</span>
                        </div>
                    </div>
                    <div class="collapse" id="${divisionId}">
                        <div class="card-body ps-4">
                            ${generateSimpleItemList(divisionCities, 'city', color)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    return html;
}

// Generate colony hierarchy (grouped by city and division)
function generateColonyHierarchy(colonies, color) {
    const groups = {};
    
    colonies.forEach(colony => {
        const divisionName = colony.division_name || 'Unassigned Division';
        const cityName = colony.city_name || 'Unassigned City';
        
        if (!groups[divisionName]) {
            groups[divisionName] = {};
        }
        if (!groups[divisionName][cityName]) {
            groups[divisionName][cityName] = [];
        }
        groups[divisionName][cityName].push(colony);
    });
    
    let html = '';
    Object.keys(groups).sort().forEach(divisionName => {
        const divisionId = `colony_div_${divisionName.replace(/\s+/g, '_')}_${Date.now()}`;
        const cityGroups = groups[divisionName];
        const totalColonies = Object.values(cityGroups).reduce((sum, colonies) => sum + colonies.length, 0);
        
        html += `
            <div class="mb-3">
                <div class="card border-secondary">
                    <div class="card-header bg-light" data-bs-toggle="collapse" data-bs-target="#${divisionId}" style="cursor: pointer;">
                        <div class="d-flex justify-content-between align-items-center">
                            <h6 class="mb-0">
                                <i class="bi bi-building text-secondary me-2"></i>
                                ${divisionName}
                            </h6>
                            <span class="badge bg-secondary">${totalColonies} colonies</span>
                        </div>
                    </div>
                    <div class="collapse" id="${divisionId}">
                        <div class="card-body ps-4">
                            ${Object.keys(cityGroups).sort().map(cityName => {
                                const cityId = `colony_city_${divisionName.replace(/\s+/g, '_')}_${cityName.replace(/\s+/g, '_')}_${Date.now()}`;
                                const cityColonies = cityGroups[cityName];
                                
                                return `
                                    <div class="mb-2">
                                        <div class="card border-info">
                                            <div class="card-header bg-light" data-bs-toggle="collapse" data-bs-target="#${cityId}" style="cursor: pointer;">
                                                <div class="d-flex justify-content-between align-items-center">
                                                    <h6 class="mb-0">
                                                        <i class="bi bi-geo-alt text-info me-2"></i>
                                                        ${cityName}
                                                    </h6>
                                                    <span class="badge bg-info">${cityColonies.length} colonies</span>
                                                </div>
                                            </div>
                                            <div class="collapse" id="${cityId}">
                                                <div class="card-body ps-4">
                                                    ${generateSimpleItemList(cityColonies, 'colony', color)}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    return html;
}

// Generate simple item list for basic types
function generateSimpleItemList(items, type, color) {
    return items.map(item => {
        const assignBtn = `<button class="btn btn-outline-${color} btn-sm" onclick="assignItem('${type}', ${item.id}, '${(item.name || item.username || '').replace(/'/g, '\\\'')}')" title="Assign this ${type}">
            <i class="bi bi-person-plus"></i> Assign
        </button>`;
        
        switch(type) {
            case 'division':
                return `
                    <div class="d-flex justify-content-between align-items-center border-bottom py-2">
                        <div>
                            <strong>${item.name}</strong>
                            <small class="text-muted d-block">ID: ${item.id}</small>
                        </div>
                        <div>${assignBtn}</div>
                    </div>
                `;
            case 'city':
                return `
                    <div class="d-flex justify-content-between align-items-center border-bottom py-2">
                        <div>
                            <strong>${item.name}</strong>
                            <small class="text-muted d-block">ID: ${item.id}</small>
                        </div>
                        <div>${assignBtn}</div>
                    </div>
                `;
            case 'colony':
                return `
                    <div class="d-flex justify-content-between align-items-center border-bottom py-2">
                        <div>
                            <strong>${item.name}</strong>
                            <small class="text-muted d-block">ID: ${item.id}</small>
                        </div>
                        <div>${assignBtn}</div>
                    </div>
                `;
            case 'department':
                return `
                    <div class="d-flex justify-content-between align-items-center border-bottom py-2">
                        <div>
                            <strong>${item.name}</strong>
                            <small class="text-muted d-block">ID: ${item.id}</small>
                        </div>
                        <div>${assignBtn}</div>
                    </div>
                `;
            default:
                return `
                    <div class="d-flex justify-content-between align-items-center border-bottom py-2">
                        <div>
                            <strong>${item.name || item.username}</strong>
                            <small class="text-muted d-block">ID: ${item.id}</small>
                        </div>
                        <div>${assignBtn}</div>
                    </div>
                `;
        }
    }).join('');
}

// Generate worker list with detailed information
function generateWorkerList(workers) {
    return workers.map(worker => {
        const assignBtn = `<button class="btn btn-outline-warning btn-sm" onclick="assignItem('worker', ${worker.id}, '${(worker.username || '').replace(/'/g, '\\\'')}')" title="Assign this worker">
            <i class="bi bi-person-plus"></i> Assign
        </button>`;
        
        return `
            <div class="d-flex justify-content-between align-items-center border-bottom py-2">
                <div>
                    <strong>${worker.username}</strong>
                    <span class="badge ${getRoleBadgeClass(worker.role)} ms-2">${getRoleDisplayName(worker.role)}</span>
                    <div class="small text-muted">
                        <i class="bi bi-person-badge"></i> ID: ${worker.id} | 
                        <i class="bi bi-building"></i> Division: ${worker.division_name || 'Unassigned'} | 
                        <i class="bi bi-geo-alt"></i> City: ${worker.city_name || 'Unassigned'} | 
                        <i class="bi bi-briefcase"></i> Department: ${worker.department_name || 'Unassigned'}
                    </div>
                </div>
                <div>${assignBtn}</div>
            </div>
        `;
    }).join('');
}

// Filter data by division for Level 2 admin
function filterDataByDivision(data, divisionId) {
    return {
        unassignedCities: (data.unassignedCities || []).filter(city => 
            !city.division_id || city.division_id == divisionId
        ),
        unassignedWorkers: (data.unassignedWorkers || []).filter(worker => 
            !worker.division_id || worker.division_id == divisionId
        ),
        unassignedColonies: (data.unassignedColonies || []).filter(colony => 
            !colony.division_id || colony.division_id == divisionId
        ),
        unassignedDepartments: data.unassignedDepartments
    };
}

// Filter data by city for Level 3 admin
function filterDataByCity(data, cityId) {
    return {
        unassignedWorkers: (data.unassignedWorkers || []).filter(worker => 
            !worker.city_id || worker.city_id == cityId
        ),
        unassignedColonies: (data.unassignedColonies || []).filter(colony => 
            !colony.city_id || colony.city_id == cityId
        ),
        unassignedDepartments: data.unassignedDepartments
    };
}

// Assign item function
async function assignItem(type, id, name) {
    console.log(`🔄 Assigning ${type} with ID ${id}: ${name}`);
    showAlert('info', `Assignment functionality for ${type} will be implemented next`);
}

// Assign supervisor to hierarchical structure
async function assignSupervisorToHierarchy(workerId, division, city, colony, department) {
    console.log(`🔄 Assigning supervisor ${workerId} to organizational hierarchy:`, {
        division, city, colony, department
    });
    
    showAlert('info', `Hierarchical supervisor assignment will be implemented next\n\nTarget: ${division} → ${city} → ${colony} → ${department}`, 'Supervisor Assignment');
}

// Assign department to colony
async function assignDepartmentToColony(colonyId, colonyName) {
    console.log(`🏢 Assigning department to colony ${colonyId}: ${colonyName}`);
    showAlert('info', `Department assignment to colony "${colonyName}" will be implemented next`, 'Department Assignment');
}

// Assign entire colony group (multiple colony locations with same name)
async function assignColonyGroup(colonyName, colonyIds, divisionName, cityName) {
    console.log(`🏘️ Assigning colony group "${colonyName}" with ${colonyIds.length} locations:`, colonyIds);
    
    // Show supervisor selection modal
    await showSupervisorSelectionModal(colonyName, colonyIds, divisionName, cityName);
}

// Show supervisor selection modal for colony assignment
async function showSupervisorSelectionModal(colonyName, colonyIds, divisionName, cityName) {
    console.log(`👥 Loading supervisors for ${cityName} city...`);
    
    try {
        // Fetch supervisors from the same city
        const response = await fetch(`/api/admin/supervisors?city=${encodeURIComponent(cityName)}`, {
            credentials: 'same-origin'
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch supervisors');
        }
        
        const supervisors = await response.json();
        
        // Create modal HTML
        const modalHtml = `
            <div class="modal fade" id="supervisorSelectionModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header bg-primary text-white">
                            <h5 class="modal-title">
                                <i class="bi bi-person-plus me-2"></i>
                                Assign Supervisor to ${colonyName}
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-3">
                                <p class="text-muted">
                                    <strong>Colony:</strong> ${colonyName} (${colonyIds.length} locations)<br>
                                    <strong>City:</strong> ${cityName}, ${divisionName}
                                </p>
                            </div>
                            
                            <div class="mb-4">
                                <h6 class="fw-bold">Choose an option:</h6>
                                
                                <!-- Option 1: Select existing supervisor -->
                                <div class="card mb-3">
                                    <div class="card-header">
                                        <div class="form-check">
                                            <input class="form-check-input" type="radio" name="assignmentOption" id="existingSupervisor" value="existing" checked>
                                            <label class="form-check-label fw-bold" for="existingSupervisor">
                                                Select Existing Supervisor from ${cityName}
                                            </label>
                                        </div>
                                    </div>
                                    <div class="card-body" id="existingSupervisorList">
                                        ${generateSupervisorOptions(supervisors)}
                                    </div>
                                </div>
                                
                                <!-- Option 2: Create new supervisor -->
                                <div class="card">
                                    <div class="card-header">
                                        <div class="form-check">
                                            <input class="form-check-input" type="radio" name="assignmentOption" id="newSupervisor" value="new">
                                            <label class="form-check-label fw-bold" for="newSupervisor">
                                                Create New Supervisor
                                            </label>
                                        </div>
                                    </div>
                                    <div class="card-body" id="newSupervisorForm" style="display: none;">
                                        ${generateNewSupervisorForm(colonyName, cityName, divisionName)}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" onclick="processColonyAssignment('${colonyName}', [${colonyIds.join(',')}], '${divisionName}', '${cityName}')">
                                <i class="bi bi-check-circle me-1"></i> Assign Supervisor
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if any
        const existingModal = document.getElementById('supervisorSelectionModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Add modal to DOM
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Setup event listeners
        setupSupervisorModalEventListeners();
        
        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('supervisorSelectionModal'));
        modal.show();
        
    } catch (error) {
        console.error('Error loading supervisors:', error);
        showAlert('danger', 'Failed to load supervisors. Please try again.');
    }
}

// Generate supervisor options HTML
function generateSupervisorOptions(supervisors) {
    if (!supervisors || supervisors.length === 0) {
        return `
            <div class="text-muted text-center py-3">
                <i class="bi bi-info-circle me-2"></i>
                No existing supervisors found in this city
            </div>
        `;
    }
    
    return supervisors.map(supervisor => `
        <div class="form-check mb-2">
            <input class="form-check-input" type="radio" name="selectedSupervisor" id="supervisor_${supervisor.id}" value="${supervisor.id}">
            <label class="form-check-label" for="supervisor_${supervisor.id}">
                <strong>${supervisor.first_name} ${supervisor.last_name}</strong>
                <br>
                <small class="text-muted">
                    ID: ${supervisor.id} | Role: ${supervisor.role || 'Supervisor'} 
                    ${supervisor.department_name ? `| Department: ${supervisor.department_name}` : ''}
                </small>
            </label>
        </div>
    `).join('');
}

// Generate new supervisor form HTML
function generateNewSupervisorForm(colonyName, cityName, divisionName) {
    return `
        <div class="row">
            <div class="col-md-6">
                <div class="mb-3">
                    <label for="newFirstName" class="form-label">First Name *</label>
                    <input type="text" class="form-control" id="newFirstName" required>
                </div>
            </div>
            <div class="col-md-6">
                <div class="mb-3">
                    <label for="newLastName" class="form-label">Last Name *</label>
                    <input type="text" class="form-control" id="newLastName" required>
                </div>
            </div>
        </div>
        <div class="row">
            <div class="col-md-6">
                <div class="mb-3">
                    <label for="newUsername" class="form-label">Username *</label>
                    <input type="text" class="form-control" id="newUsername" required>
                </div>
            </div>
            <div class="col-md-6">
                <div class="mb-3">
                    <label for="newEmail" class="form-label">Email</label>
                    <input type="email" class="form-control" id="newEmail">
                </div>
            </div>
        </div>
        <div class="row">
            <div class="col-md-6">
                <div class="mb-3">
                    <label for="newPhone" class="form-label">Phone</label>
                    <input type="text" class="form-control" id="newPhone">
                </div>
            </div>
            <div class="col-md-6">
                <div class="mb-3">
                    <label for="newDepartment" class="form-label">Department</label>
                    <input type="text" class="form-control" id="newDepartment" placeholder="e.g., Maintenance, Security">
                </div>
            </div>
        </div>
        <div class="alert alert-info">
            <i class="bi bi-info-circle me-2"></i>
            <strong>Assignment Details:</strong><br>
            This supervisor will be assigned to <strong>${colonyName}</strong> in ${cityName}, ${divisionName}
        </div>
    `;
}

// Setup event listeners for supervisor modal
function setupSupervisorModalEventListeners() {
    // Handle option selection
    document.querySelectorAll('input[name="assignmentOption"]').forEach(radio => {
        radio.addEventListener('change', function() {
            const existingList = document.getElementById('existingSupervisorList');
            const newForm = document.getElementById('newSupervisorForm');
            
            if (this.value === 'existing') {
                existingList.style.display = 'block';
                newForm.style.display = 'none';
            } else {
                existingList.style.display = 'none';
                newForm.style.display = 'block';
            }
        });
    });
}

// Process colony assignment based on selected option
async function processColonyAssignment(colonyName, colonyIds, divisionName, cityName) {
    const selectedOption = document.querySelector('input[name="assignmentOption"]:checked').value;
    
    if (selectedOption === 'existing') {
        // Assign existing supervisor
        const selectedSupervisor = document.querySelector('input[name="selectedSupervisor"]:checked');
        
        if (!selectedSupervisor) {
            showAlert('warning', 'Please select a supervisor to assign');
            return;
        }
        
        await assignExistingSupervisorToColony(selectedSupervisor.value, colonyName, colonyIds, divisionName, cityName);
        
    } else {
        // Create new supervisor and assign
        await createAndAssignNewSupervisor(colonyName, colonyIds, divisionName, cityName);
    }
    
    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('supervisorSelectionModal'));
    modal.hide();
}

// Assign existing supervisor to colony
async function assignExistingSupervisorToColony(supervisorId, colonyName, colonyIds, divisionName, cityName) {
    console.log(`👤 Assigning existing supervisor ${supervisorId} to ${colonyName}`);
    
    try {
        const response = await fetch('/api/admin/assign-supervisor-to-colony', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'same-origin',
            body: JSON.stringify({
                supervisorId: supervisorId,
                colonyName: colonyName,
                colonyIds: colonyIds,
                divisionName: divisionName,
                cityName: cityName
            })
        });
        
        if (response.ok) {
            showAlert('success', `Supervisor successfully assigned to ${colonyName}!`);
            // Refresh pending assignments
            loadPendingAssignments();
        } else {
            throw new Error('Assignment failed');
        }
    } catch (error) {
        console.error('Error assigning supervisor:', error);
        showAlert('danger', 'Failed to assign supervisor. Please try again.');
    }
}

// Create new supervisor and assign to colony
async function createAndAssignNewSupervisor(colonyName, colonyIds, divisionName, cityName) {
    // Get form data
    const firstName = document.getElementById('newFirstName').value.trim();
    const lastName = document.getElementById('newLastName').value.trim();
    const username = document.getElementById('newUsername').value.trim();
    const email = document.getElementById('newEmail').value.trim();
    const phone = document.getElementById('newPhone').value.trim();
    const department = document.getElementById('newDepartment').value.trim();
    
    // Validate required fields
    if (!firstName || !lastName || !username) {
        showAlert('warning', 'Please fill in all required fields (First Name, Last Name, Username)');
        return;
    }
    
    console.log(`👤 Creating new supervisor for ${colonyName}:`, { firstName, lastName, username });
    
    try {
        const response = await fetch('/api/admin/create-supervisor-for-colony', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'same-origin',
            body: JSON.stringify({
                firstName: firstName,
                lastName: lastName,
                username: username,
                email: email,
                phone: phone,
                department: department,
                colonyName: colonyName,
                colonyIds: colonyIds,
                divisionName: divisionName,
                cityName: cityName
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            showAlert('success', `New supervisor "${firstName} ${lastName}" created and assigned to ${colonyName}!`);
            // Refresh pending assignments
            loadPendingAssignments();
        } else {
            throw new Error('Creation failed');
        }
    } catch (error) {
        console.error('Error creating supervisor:', error);
        showAlert('danger', 'Failed to create new supervisor. Please try again.');
    }
}

// Confirm supervisor assignment
async function confirmSupervisorAssignment(workerId, departmentName, colonyName) {
    console.log(`  Confirming supervisor assignment ${workerId} to ${departmentName} in ${colonyName}`);
    showAlert('success', `Confirming assignment of supervisor to "${departmentName}" department in "${colonyName}" colony`, 'Assignment Confirmation');
}

// Load supervisors with filtering support
let allSupervisors = []; // Store all supervisors data
let showOnlyActive = false; // Filter state

async function loadSupervisors(activeOnly = false) {
    console.log(`👥 Loading supervisors${activeOnly ? ' (active only)' : ''}...`);
    showLoading(true);
    
    if (!isAuthenticated) {
        showAlert('danger', 'Not authenticated');
        return;
    }
    
    try {
        const response = await fetch('/api/admin/supervisors', {
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log('👥 Supervisors data received:', data);
        
        // Use the new hierarchical structure
        allSupervisors = data.supervisors || [];
        const hierarchy = data.hierarchy || [];
        const summary = data.summary || {};
        showOnlyActive = activeOnly;
        
        // Get hierarchical access info
        const accessLevel = data.access_level || 'admin_l1'; // Default to level 1 admin
        const currentUser = data.current_user || {};
        
        // Update statistics using summary data
        updateSupervisorStatsFromSummary(summary);
        
        // Filter supervisors if needed
        const supervisorsToShow = activeOnly ? 
            allSupervisors.filter(sup => sup.active) : 
            allSupervisors;
        
        // Create hierarchical access info display
        let hierarchyInfo = '';
        if (accessLevel === 'admin_l1') {
            hierarchyInfo = '<span class="badge bg-primary">Level 1 Admin - Global Access (All Supervisors)</span>';
        } else if (accessLevel === 'admin_l2') {
            hierarchyInfo = `<span class="badge bg-warning">Level 2 Admin - Division Access (${currentUser.division_name || 'Unknown Division'})</span>`;
        } else if (accessLevel === 'admin_l3') {
            hierarchyInfo = `<span class="badge bg-info">Level 3 Admin - City Access (${currentUser.city_name || 'Unknown City'})</span>`;
        }
        
        // Generate new hierarchical display using the hierarchy data
        let supervisorContent = '';
        if (hierarchy && hierarchy.length > 0) {
            supervisorContent = generateNewHierarchicalDisplay(hierarchy, activeOnly);
        } else {
            // Fallback to original table view
            supervisorContent = generateOriginalTableView(supervisorsToShow, accessLevel, currentUser);
        }
        
        const html = `
            <!-- Summary Cards -->
            <div class="row mb-4">
                <div class="col-md-4">
                    <div class="card bg-success text-white">
                        <div class="card-body text-center">
                            <i class="bi bi-person-check display-4"></i>
                            <h3 class="mt-2">${summary.activeSupervisors || 0}</h3>
                            <p class="mb-0">Active Supervisors</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card bg-secondary text-white">
                        <div class="card-body text-center">
                            <i class="bi bi-person-x display-4"></i>
                            <h3 class="mt-2">${summary.inactiveSupervisors || 0}</h3>
                            <p class="mb-0">Inactive Supervisors</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card bg-primary text-white">
                        <div class="card-body text-center">
                            <i class="bi bi-people display-4"></i>
                            <h3 class="mt-2">${summary.totalSupervisors || 0}</h3>
                            <p class="mb-0">Total Supervisors</p>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="card">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <div>
                        <h5>
                            Supervisors & Admins (${summary.totalSupervisors || 0} total)
                        </h5>
                        ${hierarchyInfo}
                    </div>
                    <div>
                        ${activeOnly ? '<span class="badge bg-success">Active Only</span>' : '<span class="badge bg-secondary">All Users</span>'}
                    </div>
                </div>
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <div class="btn-group" role="group">
                            <button type="button" class="btn btn-outline-success btn-sm" onclick="showActiveSupervisors()">
                                <i class="bi bi-person-check"></i> Active Only
                            </button>
                            <button type="button" class="btn btn-outline-secondary btn-sm" onclick="showAllSupervisors()">
                                <i class="bi bi-people"></i> Show All
                            </button>
                        </div>
                        <div class="btn-group" role="group">
                            <button type="button" class="btn btn-outline-info btn-sm" onclick="expandAllSections()">
                                <i class="bi bi-arrows-expand"></i> Expand All
                            </button>
                            <button type="button" class="btn btn-outline-warning btn-sm" onclick="collapseAllSections()">
                                <i class="bi bi-arrows-collapse"></i> Collapse All
                            </button>
                            <button type="button" class="btn btn-primary btn-sm" data-bs-toggle="modal" data-bs-target="#addSupervisorModal">
                                <i class="bi bi-person-plus"></i> Add User
                            </button>
                        </div>
                    </div>
                    ${supervisorContent}
                </div>
            </div>
        `;
        
        document.getElementById('supervisorsContent').innerHTML = html;
        console.log('  Supervisors loaded successfully');
        
    } catch (error) {
        console.error('❌ Error loading supervisors:', error);
        document.getElementById('supervisorsContent').innerHTML = `
            <div class="alert alert-danger">
                <i class="bi bi-exclamation-triangle"></i> Error loading supervisors: ${error.message}
            </div>
        `;
    } finally {
        showLoading(false);
    }
}

// Generate the new hierarchical display using the hierarchy data structure
function generateNewHierarchicalDisplay(hierarchy, activeOnly = false) {
    console.log('🏗️ Generating new hierarchical display...', hierarchy);
    
    if (!hierarchy || hierarchy.length === 0) {
        return '<p class="text-center text-muted">No supervisors found.</p>';
    }
    
    return `
        <div class="hierarchy-container">
            ${hierarchy.map((division, divIndex) => `
                <div class="division-item mb-3">
                    <div class="card">
                        <div class="card-header p-2 cursor-pointer" data-bs-toggle="collapse" data-bs-target="#division-${divIndex}" aria-expanded="false">
                            <div class="d-flex align-items-center">
                                <i class="bi bi-building text-primary me-2"></i>
                                <h6 class="mb-0 flex-grow-1">${division.division_name}</h6>
                                <span class="badge bg-primary me-2">${division.totalSupervisors} users</span>
                                <i class="bi bi-chevron-down"></i>
                            </div>
                        </div>
                        <div class="collapse" id="division-${divIndex}">
                            <div class="card-body p-2">
                                ${division.cities.map((city, cityIndex) => `
                                    <div class="city-item mb-2">
                                        <div class="card border-info">
                                            <div class="card-header p-2 cursor-pointer" data-bs-toggle="collapse" data-bs-target="#city-${divIndex}-${cityIndex}" aria-expanded="false">
                                                <div class="d-flex align-items-center">
                                                    <i class="bi bi-geo-alt text-info me-2"></i>
                                                    <h6 class="mb-0 flex-grow-1">${city.city_name}</h6>
                                                    <span class="badge bg-info me-2">${city.totalSupervisors} users</span>
                                                    <i class="bi bi-chevron-down"></i>
                                                </div>
                                            </div>
                                            <div class="collapse" id="city-${divIndex}-${cityIndex}">
                                                <div class="card-body p-2">
                                                    ${city.colonies.map((colony, colonyIndex) => `
                                                        <div class="colony-item mb-2">
                                                            <div class="card border-warning">
                                                                <div class="card-header p-2 cursor-pointer" data-bs-toggle="collapse" data-bs-target="#colony-${divIndex}-${cityIndex}-${colonyIndex}" aria-expanded="false">
                                                                    <div class="d-flex align-items-center">
                                                                        <i class="bi bi-house text-warning me-2"></i>
                                                                        <h6 class="mb-0 flex-grow-1">${colony.colony_name}</h6>
                                                                        <span class="badge bg-warning text-dark me-2">${colony.totalSupervisors} users</span>
                                                                        <i class="bi bi-chevron-down"></i>
                                                                    </div>
                                                                </div>
                                                                <div class="collapse" id="colony-${divIndex}-${cityIndex}-${colonyIndex}">
                                                                    <div class="card-body p-2">
                                                                        ${colony.supervisors.filter(supervisor => !activeOnly || supervisor.active).map(supervisor => `
                                                                            <div class="supervisor-item d-flex align-items-center p-2 border-start border-3 border-success bg-white mb-1 rounded">
                                                                                <i class="bi bi-person-badge text-success me-2"></i>
                                                                                <div class="flex-grow-1">
                                                                                    <div class="d-flex align-items-center">
                                                                                        <strong>${supervisor.username}</strong>
                                                                                        <span class="badge bg-secondary ms-2">${supervisor.role}</span>
                                                                                        <span class="badge ${supervisor.active ? 'bg-success' : 'bg-secondary'} ms-1">
                                                                                            ${supervisor.active ? 'Active' : 'Inactive'}
                                                                                        </span>
                                                                                    </div>
                                                                                    <small class="text-muted">
                                                                                        ${supervisor.department_name || 'No Department'} • 
                                                                                        ${supervisor.active_assignments || 0} active assignments
                                                                                    </small>
                                                                                </div>
                                                                                <div class="btn-group btn-group-sm">
                                                                                    <button class="btn btn-outline-primary" onclick="editSupervisor(${supervisor.id}, '${supervisor.username.replace(/'/g, '\\\'')}')" title="Edit">
                                                                                        <i class="bi bi-pencil"></i>
                                                                                    </button>
                                                                                    <button class="btn btn-outline-info" onclick="showSupervisorPassword(${supervisor.id}, '${supervisor.username.replace(/'/g, '\\\'')}')" title="Show Password">
                                                                                        <i class="bi bi-eye"></i>
                                                                                    </button>
                                                                                    <button class="btn btn-outline-warning" onclick="toggleSupervisorStatus(${supervisor.id}, ${supervisor.active}, '${supervisor.username.replace(/'/g, '\\\'')}')" title="${supervisor.active ? 'Deactivate' : 'Activate'}">
                                                                                        <i class="bi bi-${supervisor.active ? 'person-x' : 'person-check'}"></i>
                                                                                    </button>
                                                                                    <div class="btn-group" role="group">
                                                                                        <button type="button" class="btn btn-outline-danger dropdown-toggle dropdown-toggle-split" data-bs-toggle="dropdown" aria-expanded="false" title="Delete Options">
                                                                                            <i class="bi bi-trash"></i>
                                                                                        </button>
                                                                                        <ul class="dropdown-menu">
                                                                                            <li><a class="dropdown-item" href="#" onclick="openSafeSupervisorDeletion(${supervisor.id}, '${supervisor.username.replace(/'/g, '\\\'')}')" title="Safe deletion with assignment transfer">
                                                                                                <i class="bi bi-shield-check text-success me-2"></i>Safe Delete (Recommended)
                                                                                            </a></li>
                                                                                            <li><a class="dropdown-item text-danger" href="#" onclick="quickDeleteSupervisor(${supervisor.id}, '${supervisor.username.replace(/'/g, '\\\'')}')" title="Quick delete for supervisors with no assignments">
                                                                                                <i class="bi bi-lightning-fill text-warning me-2"></i>Quick Delete
                                                                                            </a></li>
                                                                                        </ul>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        `).join('')}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    `).join('')}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// Update supervisor statistics using summary data
function updateSupervisorStatsFromSummary(summary) {
    console.log('📊 Updating supervisor stats from summary:', summary);
    
    const active = summary.activeSupervisors || 0;
    const inactive = summary.inactiveSupervisors || 0;
    const total = summary.totalSupervisors || 0;
    
    // Static stats cards were removed - they're now created dynamically in the content area
    console.log(`📊 Supervisor Stats Updated: ${active} active, ${inactive} inactive, ${total} total`);
}

// Update supervisor statistics
function updateSupervisorStats(supervisors) {
    const active = supervisors.filter(sup => sup.is_active).length;
    const inactive = supervisors.length - active;
    const total = supervisors.length;
    
    document.getElementById('activeSupervisorCount').textContent = active;
    document.getElementById('inactiveSupervisorCount').textContent = inactive;
    document.getElementById('totalSupervisorCount').textContent = total;
    
    console.log(`📊 Supervisor Stats: ${active} active, ${inactive} inactive, ${total} total`);
}

// Show only active supervisors
function showActiveSupervisors() {
    console.log('🟢 Showing active supervisors only...');
    loadSupervisors(true);
}

// Show all supervisors
function showAllSupervisors() {
    console.log('👥 Showing all supervisors...');
    loadSupervisors(false);
}

// Expand all hierarchical sections
function expandAllSections() {
    console.log('📖 Expanding all sections...');
    const collapseElements = document.querySelectorAll('.hierarchy-container .collapse');
    collapseElements.forEach(element => {
        if (!element.classList.contains('show')) {
            const collapse = new bootstrap.Collapse(element, { show: true });
        }
    });
    // Update chevron icons
    const chevrons = document.querySelectorAll('.hierarchy-container .bi-chevron-down');
    chevrons.forEach(chevron => {
        chevron.style.transform = 'rotate(180deg)';
    });
}

// Collapse all hierarchical sections
function collapseAllSections() {
    console.log('📕 Collapsing all sections...');
    const collapseElements = document.querySelectorAll('.hierarchy-container .collapse');
    collapseElements.forEach(element => {
        if (element.classList.contains('show')) {
            const collapse = new bootstrap.Collapse(element, { hide: true });
        }
    });
    // Reset chevron icons
    const chevrons = document.querySelectorAll('.hierarchy-container .bi-chevron-down');
    chevrons.forEach(chevron => {
        chevron.style.transform = 'rotate(0deg)';
    });
}

// Show supervisor password
async function showSupervisorPassword(id, username) {
    console.log(`🔐 Showing password for supervisor ID: ${id} (${username})`);
    
    // Confirm before showing password for security
    if (!confirm(`Are you sure you want to view the password for "${username}"?`)) {
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch(`/api/admin/supervisors/${id}/password`, {
            method: 'GET',
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        // Show password in a modal or alert
        showPasswordModal(username, data.password);
        
    } catch (error) {
        console.error('❌ Error fetching supervisor password:', error);
        showAlert('danger', `Failed to retrieve password for ${username}: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// Show password in a modal
function showPasswordModal(username, password) {
    // Check if password is hashed (bcrypt format)
    const isHashed = password.startsWith('$2a$') || password.startsWith('$2b$');
    
    const modalHTML = `
        <div class="modal fade password-modal" id="passwordModal" tabindex="-1" aria-labelledby="passwordModalLabel" aria-hidden="true">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="passwordModalLabel">
                            <i class="bi bi-key"></i> Password for ${username}
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        ${isHashed ? `
                            <div class="alert alert-info">
                                <i class="bi bi-shield-lock"></i>
                                <strong>Security Notice:</strong> This password is encrypted and cannot be displayed in plain text for security reasons.
                            </div>
                            <div class="alert alert-warning">
                                <i class="bi bi-exclamation-triangle"></i>
                                <strong>Password Hash:</strong> The password is securely stored using bcrypt encryption.
                            </div>
                            <div class="form-group">
                                <label for="passwordDisplay" class="form-label">Encrypted Password Hash:</label>
                                <div class="input-group">
                                    <input type="text" class="form-control" id="passwordDisplay" value="${password}" readonly style="font-size: 12px; font-family: monospace;">
                                    <button class="btn btn-outline-primary" type="button" id="copyPassword" title="Copy hash to clipboard">
                                        <i class="bi bi-clipboard"></i>
                                    </button>
                                </div>
                                <small class="form-text text-muted mt-1">This is the encrypted hash. The original password cannot be retrieved.</small>
                            </div>
                            <div class="mt-3">
                                <button class="btn btn-warning w-100" onclick="resetSupervisorPassword('${username}', ${password.includes("'") ? `"${password}"` : `'${password}'`})">
                                    <i class="bi bi-arrow-clockwise"></i> Generate New Password
                                </button>
                                <small class="form-text text-muted text-center d-block mt-1">Click to generate a new password that can be shared</small>
                            </div>
                        ` : `
                            <div class="alert alert-warning">
                                <i class="bi bi-exclamation-triangle"></i>
                                <strong>Security Notice:</strong> This password is sensitive information. Do not share it with unauthorized users.
                            </div>
                            <div class="form-group">
                                <label for="passwordDisplay" class="form-label">Password:</label>
                                <div class="input-group">
                                    <input type="password" class="form-control" id="passwordDisplay" value="${password}" readonly>
                                    <button class="btn btn-outline-secondary" type="button" id="togglePassword">
                                        <i class="bi bi-eye" id="toggleIcon"></i>
                                    </button>
                                    <button class="btn btn-outline-primary" type="button" id="copyPassword" title="Copy to clipboard">
                                        <i class="bi bi-clipboard"></i>
                                    </button>
                                </div>
                                <small class="form-text text-muted mt-1">Click the eye icon to show/hide password, or the clipboard icon to copy.</small>
                            </div>
                        `}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                            <i class="bi bi-x-circle"></i> Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
    const existingModal = document.getElementById('passwordModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Add modal to DOM
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('passwordModal'));
    modal.show();
    
    // Add event listeners
    const toggleButton = document.getElementById('togglePassword');
    if (toggleButton) {
        toggleButton.addEventListener('click', function() {
            const passwordInput = document.getElementById('passwordDisplay');
            const toggleIcon = document.getElementById('toggleIcon');
            
            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                toggleIcon.className = 'bi bi-eye-slash';
            } else {
                passwordInput.type = 'password';
                toggleIcon.className = 'bi bi-eye';
            }
        });
    }
    
    document.getElementById('copyPassword').addEventListener('click', function() {
        const passwordInput = document.getElementById('passwordDisplay');
        passwordInput.select();
        passwordInput.setSelectionRange(0, 99999); // For mobile devices
        
        try {
            document.execCommand('copy');
            showAlert('success', isHashed ? 'Password hash copied to clipboard!' : 'Password copied to clipboard!');
        } catch (err) {
            console.error('Could not copy password: ', err);
            showAlert('danger', 'Failed to copy to clipboard.');
        }
    });
    
    // Clean up modal when closed
    document.getElementById('passwordModal').addEventListener('hidden.bs.modal', function () {
        this.remove();
    });
}

// Reset supervisor password with a new readable password
async function resetSupervisorPassword(username, currentHashedPassword) {
    console.log(`🔄 Resetting password for supervisor: ${username}`);
    
    if (!confirm(`Generate a new password for "${username}"? This will replace their current password.`)) {
        return;
    }
    
    showLoading(true);
    
    try {
        // Generate a simple readable password
        const newPassword = generateReadablePassword();
        
        const response = await fetch(`/api/admin/supervisors/reset-password`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                username: username,
                newPassword: newPassword
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        // Close the current modal
        const currentModal = bootstrap.Modal.getInstance(document.getElementById('passwordModal'));
        if (currentModal) {
            currentModal.hide();
        }
        
        // Show new password modal
        showNewPasswordModal(username, newPassword);
        
        showAlert('success', `New password generated for ${username}`);
        
    } catch (error) {
        console.error('❌ Error resetting supervisor password:', error);
        showAlert('danger', `Failed to reset password for ${username}: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// Generate a readable password
function generateReadablePassword() {
    const adjectives = ['Quick', 'Smart', 'Bright', 'Swift', 'Bold', 'Cool', 'Fast', 'Strong'];
    const nouns = ['Tiger', 'Eagle', 'Lion', 'Wolf', 'Bear', 'Fox', 'Hawk', 'Star'];
    const numbers = Math.floor(Math.random() * 100) + 10;
    
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    
    return `${adjective}${noun}${numbers}`;
}

// Show new password modal
function showNewPasswordModal(username, newPassword) {
    const modalHTML = `
        <div class="modal fade password-modal" id="newPasswordModal" tabindex="-1" aria-labelledby="newPasswordModalLabel" aria-hidden="true">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header bg-success text-white">
                        <h5 class="modal-title" id="newPasswordModalLabel">
                            <i class="bi bi-check-circle"></i> New Password Generated for ${username}
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-success">
                            <i class="bi bi-check-circle"></i>
                            <strong>Success!</strong> A new readable password has been generated.
                        </div>
                        <div class="form-group">
                            <label for="newPasswordDisplay" class="form-label">New Password:</label>
                            <div class="input-group">
                                <input type="text" class="form-control" id="newPasswordDisplay" value="${newPassword}" readonly style="font-size: 16px; font-weight: bold; text-align: center; background-color: #e8f5e8;">
                                <button class="btn btn-success" type="button" id="copyNewPassword" title="Copy new password">
                                    <i class="bi bi-clipboard"></i>
                                </button>
                            </div>
                            <small class="form-text text-muted mt-1">Share this password with the supervisor. They should change it after first login.</small>
                        </div>
                        <div class="alert alert-info mt-3">
                            <i class="bi bi-info-circle"></i>
                            <strong>Note:</strong> This password is now active and the old password is no longer valid.
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                            <i class="bi bi-x-circle"></i> Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
    const existingModal = document.getElementById('newPasswordModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Add modal to DOM
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('newPasswordModal'));
    modal.show();
    
    // Add copy functionality
    document.getElementById('copyNewPassword').addEventListener('click', function() {
        const passwordInput = document.getElementById('newPasswordDisplay');
        passwordInput.select();
        passwordInput.setSelectionRange(0, 99999);
        
        try {
            document.execCommand('copy');
            showAlert('success', 'New password copied to clipboard!');
        } catch (err) {
            console.error('Could not copy password: ', err);
            showAlert('danger', 'Failed to copy password to clipboard.');
        }
    });
    
    // Clean up modal when closed
    document.getElementById('newPasswordModal').addEventListener('hidden.bs.modal', function () {
        this.remove();
    });
}

// Toggle supervisor status (activate/deactivate)
async function toggleSupervisorStatus(id, currentStatus, name) {
    const action = currentStatus ? 'deactivate' : 'activate';
    
    if (!confirm(`Are you sure you want to ${action} supervisor "${name}"?`)) {
        return;
    }
    
    console.log(`🔄 ${action} supervisor ID: ${id}`);
    showLoading(true);
    
    try {
        // Use the new deactivation/activation endpoints
        const endpoint = currentStatus ? `/api/admin/supervisor/${id}/deactivate` : `/api/admin/supervisor/${id}/activate`;
        
        const response = await fetch(endpoint, {
            method: 'PUT',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            
            // Handle specific error cases
            if (response.status === 400 && errorData.activeAssignments > 0) {
                const assignmentList = errorData.assignments.map(a => 
                    `• Request #${a.request_id} (${a.status})`
                ).join('\n');
                
                const confirmTransfer = confirm(
                    `Cannot deactivate supervisor "${name}" because they have ${errorData.activeAssignments} active assignments:\n\n${assignmentList}\n\n${errorData.suggestion}\n\nWould you like to open the Safe Supervisor Deletion tool to transfer these assignments?`
                );
                
                if (confirmTransfer) {
                    // Open the safe deletion tool
                    window.open('/safe-supervisor-deletion.html', '_blank');
                }
                return;
            }
            
            throw new Error(errorData.error || `HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log(`  Supervisor ${action}d successfully:`, data);
        showAlert('success', data.message || `Supervisor "${name}" ${action}d successfully`);
        
        // Refresh supervisors list maintaining current filter
        loadSupervisors(showOnlyActive);
        
    } catch (error) {
        console.error(`❌ Error ${action}ing supervisor:`, error);
        showAlert('danger', `Failed to ${action} supervisor: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// Open safe supervisor deletion modal
function openSafeSupervisorDeletion(supervisorId, supervisorName) {
    console.log(`🗑️ Opening safe deletion modal for supervisor: ${supervisorName} (ID: ${supervisorId})`);
    
    // Store supervisor info globally for the modal
    window.modalSupervisorId = supervisorId;
    window.modalSupervisorName = supervisorName;
    window.modalSafetyData = null;
    
    // Reset modal state
    resetModalState();
    
    // Set supervisor info
    document.getElementById('supervisorInfo').innerHTML = `
        <div class="d-flex align-items-center">
            <i class="bi bi-person-circle text-primary me-3" style="font-size: 3rem;"></i>
            <div>
                <h5 class="mb-1">${supervisorName}</h5>
                <p class="text-muted mb-0">Supervisor ID: ${supervisorId}</p>
                <small class="text-info">Click "Check Safety" to analyze deletion safety</small>
            </div>
        </div>
    `;
    
    // Update modal title
    document.getElementById('safeDeletionModalLabel').innerHTML = `
        <i class="bi bi-shield-exclamation text-warning"></i> Safe Deletion: ${supervisorName}
    `;
    
    // Show the modal
    const modal = new bootstrap.Modal(document.getElementById('safeDeletionModal'));
    modal.show();
    
    showAlert('info', `Safe deletion process started for "${supervisorName}"`);
}

// Reset modal state
function resetModalState() {
    // Reset step indicator
    updateModalStepIndicator(1);
    
    // Show only step 1
    document.querySelectorAll('.step-content').forEach(content => {
        content.style.display = 'none';
    });
    document.getElementById('modalStep1').style.display = 'block';
    
    // Reset buttons
    document.getElementById('modalCheckSafetyBtn').style.display = 'inline-block';
    document.getElementById('modalTransferBtn').style.display = 'none';
    document.getElementById('modalDeleteBtn').style.display = 'none';
}

// Update modal step indicator
function updateModalStepIndicator(currentStep) {
    for (let i = 1; i <= 4; i++) {
        const step = document.getElementById(`step${i}`);
        if (i < currentStep) {
            step.className = 'step completed';
        } else if (i === currentStep) {
            step.className = 'step active';
        } else {
            step.className = 'step pending';
        }
    }
}

// Modal safety check
async function modalCheckSafety() {
    console.log(`🔍 Running safety check for supervisor ID: ${window.modalSupervisorId}`);
    
    // Show loading state
    document.getElementById('modalCheckSafetyBtn').disabled = true;
    document.getElementById('modalCheckSafetyBtn').innerHTML = '<i class="bi bi-hourglass-split"></i> Checking...';
    
    try {
        const response = await fetch(`/api/admin/supervisor/${window.modalSupervisorId}/deletion-safety`, {
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const safetyData = await response.json();
        window.modalSafetyData = safetyData;
        
        // Display results
        displayModalSafetyResults(safetyData);
        
        // Move to step 2
        document.getElementById('modalStep1').style.display = 'none';
        document.getElementById('modalStep2').style.display = 'block';
        updateModalStepIndicator(2);
        
    } catch (error) {
        console.error('❌ Error checking supervisor safety:', error);
        
        let errorMessage = 'Failed to check supervisor safety.';
        if (error.message.includes('404')) {
            errorMessage = 'Supervisor not found. May have been already deleted.';
        } else if (error.message.includes('401')) {
            errorMessage = 'Authentication required. Please refresh and try again.';
        }
        
        document.getElementById('modalSafetyResults').innerHTML = `
            <div class="alert alert-danger">
                <h6><i class="bi bi-exclamation-triangle"></i> Error</h6>
                <p>${errorMessage}</p>
                <button class="btn btn-outline-primary btn-sm" onclick="modalCheckSafety()">
                    <i class="bi bi-arrow-clockwise"></i> Try Again
                </button>
            </div>
        `;
        
        document.getElementById('modalStep1').style.display = 'none';
        document.getElementById('modalStep2').style.display = 'block';
        updateModalStepIndicator(2);
    } finally {
        // Reset button
        document.getElementById('modalCheckSafetyBtn').disabled = false;
        document.getElementById('modalCheckSafetyBtn').innerHTML = '<i class="bi bi-shield-check"></i> Check Safety';
    }
}

// Display safety results in modal
function displayModalSafetyResults(safetyData) {
    const resultsDiv = document.getElementById('modalSafetyResults');
    
    if (safetyData.canDelete && safetyData.activeAssignments === 0) {
        // Safe to delete
        resultsDiv.innerHTML = `
            <div class="alert alert-success">
                <h6><i class="bi bi-check-circle"></i> Safe to Delete</h6>
                <p><strong>${window.modalSupervisorName}</strong> has no active assignments and can be safely deleted.</p>
                <ul class="mb-0">
                    <li>No active assignments found</li>
                    <li>No data dependencies</li>
                    <li>Safe for immediate deletion</li>
                </ul>
            </div>
        `;
        
        // Show delete button, hide others
        document.getElementById('modalCheckSafetyBtn').style.display = 'none';
        document.getElementById('modalTransferBtn').style.display = 'none';
        document.getElementById('modalDeleteBtn').style.display = 'inline-block';
        
        // Move to step 4 (skip transfer step)
        updateModalStepIndicator(4);
        
    } else {
        // Has assignments - need transfer
        const assignmentList = safetyData.assignments.map(assignment => `
            <div class="assignment-card">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <strong>Request #${assignment.request_id}</strong>
                        <span class="badge bg-secondary ms-2">${assignment.status}</span>
                    </div>
                    <small class="text-muted">${assignment.created_at}</small>
                </div>
                <small class="text-muted">${assignment.subject || 'No subject'}</small>
            </div>
        `).join('');
        
        resultsDiv.innerHTML = `
            <div class="alert alert-warning">
                <h6><i class="bi bi-exclamation-triangle"></i> Cannot Delete - Has Active Assignments</h6>
                <p><strong>${window.modalSupervisorName}</strong> has <strong>${safetyData.activeAssignments}</strong> active assignments that must be transferred first.</p>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <h6><i class="bi bi-list-task"></i> Active Assignments (${safetyData.activeAssignments})</h6>
                </div>
                <div class="card-body" style="max-height: 300px; overflow-y: auto;">
                    ${assignmentList}
                </div>
            </div>
        `;
        
        // Load supervisors for transfer
        loadModalTransferSupervisors();
        
        // Show transfer button, hide others
        document.getElementById('modalCheckSafetyBtn').style.display = 'none';
        document.getElementById('modalTransferBtn').style.display = 'inline-block';
        document.getElementById('modalDeleteBtn').style.display = 'none';
        
        // Move to step 3
        updateModalStepIndicator(3);
    }
}

// Load supervisors for transfer dropdown
async function loadModalTransferSupervisors() {
    try {
        const response = await fetch('/api/admin/supervisors', {
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        const select = document.getElementById('modalTransferToSupervisor');
        
        // Clear existing options
        select.innerHTML = '<option value="">-- Select new supervisor --</option>';
        
        // Add supervisors (exclude the one being deleted)
        if (data.supervisors && Array.isArray(data.supervisors)) {
            data.supervisors
                .filter(sup => sup.id != window.modalSupervisorId && sup.active)
                .forEach(supervisor => {
                    const locationInfo = [
                        supervisor.division_name,
                        supervisor.city_name,
                        supervisor.colony_name
                    ].filter(Boolean).join(' - ');
                    
                    const option = new Option(
                        `${supervisor.username} (${locationInfo || 'No Location'})`,
                        supervisor.id
                    );
                    select.add(option);
                });
        }
        
    } catch (error) {
        console.error('Error loading transfer supervisors:', error);
        showAlert('danger', 'Failed to load supervisors for transfer');
    }
}

// Show transfer step (step 3)
async function showTransferStep() {
    console.log('📋 Showing transfer step...');
    
    try {
        // Hide step 2 and show step 3
        document.getElementById('modalStep2').style.display = 'none';
        document.getElementById('modalStep3').style.display = 'block';
        updateModalStepIndicator(3);
        
        // Hide the transfer button since we're now in step 3
        document.getElementById('modalTransferBtn').style.display = 'none';
        
        // Load supervisors for transfer dropdown
        await loadSupervisorsForTransfer();
        
        // Show the assignment list
        showAssignmentListForTransfer();
        
    } catch (error) {
        console.error('❌ Error showing transfer step:', error);
        showAlert('danger', `Failed to show transfer step: ${error.message}`);
    }
}

// Load supervisors for transfer dropdown
async function loadSupervisorsForTransfer() {
    try {
        const response = await fetch('/api/admin/supervisors', {
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const supervisors = await response.json();
        const select = document.getElementById('modalTransferToSupervisor');
        
        // Clear existing options except the first two (default and create new)
        select.innerHTML = `
            <option value="">-- Select new supervisor --</option>
            <option value="CREATE_NEW">+ Create New Supervisor</option>
        `;
        
        // Add all supervisors except the current one being deleted
        supervisors.forEach(supervisor => {
            if (supervisor.id !== window.modalSupervisorId) {
                select.innerHTML += `
                    <option value="${supervisor.id}">
                        ${supervisor.username} - ${supervisor.division_name || 'N/A'} / ${supervisor.city_name || 'N/A'}
                    </option>
                `;
            }
        });
        
        console.log(`  Loaded ${supervisors.length - 1} supervisors for transfer`);
        
    } catch (error) {
        console.error('❌ Error loading supervisors for transfer:', error);
        showAlert('danger', 'Failed to load supervisors for transfer');
    }
}

// Show assignment list for transfer
function showAssignmentListForTransfer() {
    const assignmentsList = document.getElementById('assignmentsList');
    const assignments = window.modalSafetyData.assignments;
    
    if (!assignments || assignments.length === 0) {
        assignmentsList.innerHTML = '<p class="text-muted">No assignments to display</p>';
        return;
    }
    
    assignmentsList.innerHTML = `
        <div class="alert alert-info">
            <h6><i class="bi bi-list-check"></i> Assignments to Transfer (${assignments.length})</h6>
            <p class="mb-0">The following assignments will be transferred to the selected supervisor:</p>
        </div>
        <div class="list-group">
            ${assignments.map(assignment => `
                <div class="list-group-item">
                    <div class="d-flex justify-content-between align-items-start">
                        <div>
                            <h6 class="mb-1">Request #${assignment.request_id}</h6>
                            <p class="mb-1">${assignment.description || 'No description'}</p>
                            <small class="text-muted">Status: ${assignment.status}</small>
                        </div>
                        <span class="badge bg-primary">Assignment ${assignment.id}</span>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// Transfer assignments in modal
async function modalTransferAssignments() {
    const toSupervisorId = document.getElementById('modalTransferToSupervisor').value;
    
    if (!toSupervisorId) {
        showAlert('warning', 'Please select a supervisor to transfer assignments to');
        return;
    }
    
    // Show loading state
    document.getElementById('modalTransferBtn').disabled = true;
    document.getElementById('modalTransferBtn').innerHTML = '<i class="bi bi-hourglass-split"></i> Transferring...';
    
    try {
        const assignmentIds = window.modalSafetyData.assignments.map(a => a.id);
        
        const response = await fetch('/api/admin/transfer-assignments', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                fromSupervisorId: window.modalSupervisorId,
                toSupervisorId: toSupervisorId,
                assignmentIds: assignmentIds
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        // Show success and move to confirmation
        document.getElementById('modalConfirmationContent').innerHTML = `
            <div class="alert alert-success mb-3">
                <h6><i class="bi bi-check-circle"></i> Assignments Transferred Successfully</h6>
                <p>All ${assignmentIds.length} assignments have been transferred to the new supervisor.</p>
            </div>
            
            <div class="alert alert-danger">
                <h6><i class="bi bi-exclamation-triangle"></i> Final Confirmation Required</h6>
                <p>You are about to permanently delete supervisor <strong>${window.modalSupervisorName}</strong>.</p>
                <p><strong>This action cannot be undone.</strong></p>
                
                <div class="form-check mt-3">
                    <input class="form-check-input" type="checkbox" id="finalConfirmCheck">
                    <label class="form-check-label" for="finalConfirmCheck">
                        I understand that this will permanently delete the supervisor and this action cannot be undone.
                    </label>
                </div>
            </div>
        `;
        
        // Move to step 4
        document.getElementById('modalStep2').style.display = 'none';
        document.getElementById('modalStep3').style.display = 'none';
        document.getElementById('modalStep4').style.display = 'block';
        updateModalStepIndicator(4);
        
        // Show delete button
        document.getElementById('modalTransferBtn').style.display = 'none';
        document.getElementById('modalDeleteBtn').style.display = 'inline-block';
        
        showAlert('success', 'Assignments transferred successfully. Ready for final deletion.');
        
    } catch (error) {
        console.error('❌ Error transferring assignments:', error);
        showAlert('danger', `Failed to transfer assignments: ${error.message}`);
    } finally {
        // Reset button
        document.getElementById('modalTransferBtn').disabled = false;
        document.getElementById('modalTransferBtn').innerHTML = '<i class="bi bi-arrow-right"></i> Transfer Assignments';
    }
}

// Final deletion confirmation
async function modalConfirmDeletion() {
    // Check if confirmation checkbox is checked (if it exists)
    const confirmCheck = document.getElementById('finalConfirmCheck');
    if (confirmCheck && !confirmCheck.checked) {
        showAlert('warning', 'Please confirm that you understand this action cannot be undone');
        return;
    }
    
    // Show loading state
    document.getElementById('modalDeleteBtn').disabled = true;
    document.getElementById('modalDeleteBtn').innerHTML = '<i class="bi bi-hourglass-split"></i> Deleting...';
    
    try {
        const response = await fetch(`/api/admin/supervisor/${window.modalSupervisorId}/safe-delete`, {
            method: 'DELETE',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ forceDelete: false })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        // Show success message
        showAlert('success', `Supervisor "${window.modalSupervisorName}" has been successfully deleted`);
        
        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('safeDeletionModal'));
        modal.hide();
        
        // Refresh supervisors list
        loadSupervisors(showOnlyActive);
        
        console.log('  Supervisor deleted successfully:', result);
        
    } catch (error) {
        console.error('❌ Error deleting supervisor:', error);
        showAlert('danger', `Failed to delete supervisor: ${error.message}`);
    } finally {
        // Reset button
        document.getElementById('modalDeleteBtn').disabled = false;
        document.getElementById('modalDeleteBtn').innerHTML = '<i class="bi bi-trash"></i> Delete Supervisor';
    }
}

// Quick safety check inline (for quick delete button)
async function quickSafetyCheck(supervisorId, supervisorName) {
    console.log(`🔍 Running quick safety check for supervisor: ${supervisorName}`);
    showLoading(true);
    
    try {
        const response = await fetch(`/api/admin/supervisor/${supervisorId}/deletion-safety`, {
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const safetyData = await response.json();
        
        if (safetyData.activeAssignments === 0) {
            // Safe to delete
            const proceed = confirm(
                `  Safe to Delete: "${supervisorName}"\n\n` +
                `• No active assignments found\n` +
                `• Safe for immediate deletion\n\n` +
                `Proceed with deletion?`
            );
            
            if (proceed) {
                quickDeleteSupervisor(supervisorId, supervisorName);
            }
        } else {
            // Has assignments - open modal for proper handling
            const openModal = confirm(
                `⚠️ Cannot Delete: "${supervisorName}"\n\n` +
                `Has ${safetyData.activeAssignments} active assignments\n\n` +
                `Click OK to open the Safe Deletion Tool to handle assignments properly.`
            );
            
            if (openModal) {
                openSafeSupervisorDeletion(supervisorId, supervisorName);
            }
        }
        
    } catch (error) {
        console.error('❌ Error in quick safety check:', error);
        showAlert('danger', `Failed to check supervisor safety: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// Quick delete supervisor (for supervisors with no assignments)
async function quickDeleteSupervisor(supervisorId, supervisorName) {
    console.log(`⚡ Quick delete for supervisor: ${supervisorName} (ID: ${supervisorId})`);
    
    if (!confirm(`Are you sure you want to permanently delete supervisor "${supervisorName}"?\n\nThis action cannot be undone. The supervisor will be removed from the system immediately.`)) {
        return;
    }
    
    showLoading(true);
    
    try {
        // First check if supervisor has any assignments
        const checkResponse = await fetch(`/api/admin/supervisor/${supervisorId}/deletion-safety`, {
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!checkResponse.ok) {
            throw new Error(`Failed to check supervisor safety: HTTP ${checkResponse.status}`);
        }
        
        const safetyData = await checkResponse.json();
        
        if (safetyData.activeAssignments > 0) {
            showAlert('warning', `Cannot delete supervisor "${supervisorName}" because they have ${safetyData.activeAssignments} active assignments. Use the Safe Deletion tool instead.`);
            
            const useSafeTool = confirm('Would you like to open the Safe Supervisor Deletion tool to handle this properly?');
            if (useSafeTool) {
                openSafeSupervisorDeletion(supervisorId, supervisorName);
            }
            return;
        }
        
        // Safe to delete - proceed with deletion
        const deleteResponse = await fetch(`/api/admin/supervisor/${supervisorId}/safe-delete`, {
            method: 'DELETE',
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!deleteResponse.ok) {
            const errorData = await deleteResponse.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP ${deleteResponse.status}`);
        }
        
        const deleteData = await deleteResponse.json();
        console.log('  Supervisor deleted successfully:', deleteData);
        showAlert('success', `Supervisor "${supervisorName}" has been permanently deleted`);
        
        // Refresh supervisors list
        loadSupervisors(showOnlyActive);
        
    } catch (error) {
        console.error('❌ Error deleting supervisor:', error);
        showAlert('danger', `Failed to delete supervisor: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// Handle transfer select change
function handleTransferSelectChange() {
    const selectValue = document.getElementById('modalTransferToSupervisor').value;
    const createForm = document.getElementById('createNewSupervisorForm');
    const transferButtons = document.getElementById('transferActionButtons');
    
    if (selectValue === 'CREATE_NEW') {
        createForm.style.display = 'block';
        transferButtons.style.display = 'none';
        // Load options for new supervisor form
        loadDivisionsForNewSupervisor();
        loadDepartmentsForNewSupervisor();
    } else if (selectValue) {
        // Regular supervisor selected
        createForm.style.display = 'none';
        transferButtons.style.display = 'flex';
    } else {
        // No selection
        createForm.style.display = 'none';
        transferButtons.style.display = 'none';
    }
}

// Go back to safety check step
function goBackToSafetyCheck() {
    document.getElementById('modalStep3').style.display = 'none';
    document.getElementById('modalStep2').style.display = 'block';
    document.getElementById('modalTransferBtn').style.display = 'inline-block';
    updateModalStepIndicator(2);
}

// Cancel new supervisor creation
function cancelNewSupervisorCreation() {
    document.getElementById('createNewSupervisorForm').style.display = 'none';
    document.getElementById('modalTransferToSupervisor').value = '';
    document.getElementById('modalTransferBtn').style.display = 'none';
}

// Load divisions for new supervisor
async function loadDivisionsForNewSupervisor() {
    try {
        const response = await fetch('/api/admin/locations/divisions', {
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const divisions = await response.json();
        const select = document.getElementById('newSupervisorDivision');
        select.innerHTML = '<option value="">-- Select Division --</option>';
        
        divisions.forEach(division => {
            select.innerHTML += `<option value="${division.id}">${division.name}</option>`;
        });
    } catch (error) {
        console.error('Error loading divisions:', error);
        showAlert('danger', 'Failed to load divisions');
    }
}

// Load departments for new supervisor
async function loadDepartmentsForNewSupervisor() {
    try {
        const response = await fetch('/api/admin/locations/departments', {
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const departments = await response.json();
        const select = document.getElementById('newSupervisorDepartment');
        select.innerHTML = '<option value="">-- Select Department --</option>';
        
        departments.forEach(department => {
            select.innerHTML += `<option value="${department.id}">${department.name}</option>`;
        });
    } catch (error) {
        console.error('Error loading departments:', error);
        showAlert('danger', 'Failed to load departments');
    }
}

// Load cities for new supervisor
async function loadCitiesForNewSupervisor() {
    const divisionId = document.getElementById('newSupervisorDivision').value;
    const citySelect = document.getElementById('newSupervisorCity');
    const colonySelect = document.getElementById('newSupervisorColony');
    
    // Reset cities and colonies
    citySelect.innerHTML = '<option value="">-- Select City --</option>';
    colonySelect.innerHTML = '<option value="">-- Select Colony --</option>';
    
    if (!divisionId) return;
    
    try {
        const response = await fetch(`/api/admin/locations/cities/${divisionId}`, {
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const cities = await response.json();
        cities.forEach(city => {
            citySelect.innerHTML += `<option value="${city.id}">${city.name}</option>`;
        });
    } catch (error) {
        console.error('Error loading cities:', error);
        showAlert('danger', 'Failed to load cities');
    }
}

// Load colonies for new supervisor
async function loadColoniesForNewSupervisor() {
    const cityId = document.getElementById('newSupervisorCity').value;
    const colonySelect = document.getElementById('newSupervisorColony');
    
    // Reset colonies
    colonySelect.innerHTML = '<option value="">-- Select Colony --</option>';
    
    if (!cityId) return;
    
    try {
        const response = await fetch(`/api/admin/locations/colonies/${cityId}`, {
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const colonies = await response.json();
        colonies.forEach(colony => {
            colonySelect.innerHTML += `<option value="${colony.id}">${colony.name}</option>`;
        });
    } catch (error) {
        console.error('Error loading colonies:', error);
        showAlert('danger', 'Failed to load colonies');
    }
}

// Create new supervisor and transfer assignments
async function createNewSupervisorAndTransfer() {
    const username = document.getElementById('newSupervisorUsername').value.trim();
    const password = document.getElementById('newSupervisorPassword').value;
    const divisionId = document.getElementById('newSupervisorDivision').value;
    const cityId = document.getElementById('newSupervisorCity').value;
    const colonyId = document.getElementById('newSupervisorColony').value;
    const departmentId = document.getElementById('newSupervisorDepartment').value;
    
    // Validation
    if (!username || !password || !divisionId || !cityId || !departmentId) {
        showAlert('warning', 'Please fill in all required fields (Username, Password, Division, City, Department)');
        return;
    }
    
    const createBtn = event.target;
    createBtn.disabled = true;
    createBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Creating...';
    
    try {
        // Create new supervisor
        const createResponse = await fetch('/api/admin/supervisor', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                username,
                password,
                division_id: divisionId,
                city_id: cityId,
                colony_id: colonyId || null,
                department_id: departmentId
            })
        });
        
        if (!createResponse.ok) {
            const errorData = await createResponse.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP ${createResponse.status}`);
        }
        
        const newSupervisor = await createResponse.json();
        console.log('  New supervisor created:', newSupervisor);
        
        // Now transfer assignments to the new supervisor
        const assignmentIds = window.modalSafetyData.assignments.map(a => a.id);
        
        const transferResponse = await fetch('/api/admin/transfer-assignments', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                fromSupervisorId: window.modalSupervisorId,
                toSupervisorId: newSupervisor.supervisor.id,
                assignmentIds: assignmentIds
            })
        });
        
        if (!transferResponse.ok) {
            throw new Error(`Failed to transfer assignments: HTTP ${transferResponse.status}`);
        }
        
        const transferResult = await transferResponse.json();
        console.log('  Assignments transferred to new supervisor:', transferResult);
        
        // Show success and move to confirmation
        document.getElementById('modalConfirmationContent').innerHTML = `
            <div class="alert alert-success mb-3">
                <h6><i class="bi bi-check-circle"></i> New Supervisor Created & Assignments Transferred</h6>
                <p><strong>New Supervisor:</strong> ${username}</p>
                <p>All ${assignmentIds.length} assignments have been transferred to the new supervisor.</p>
            </div>
            
            <div class="alert alert-danger">
                <h6><i class="bi bi-exclamation-triangle"></i> Final Confirmation Required</h6>
                <p>You are about to permanently delete supervisor <strong>${window.modalSupervisorName}</strong>.</p>
                <p><strong>This action cannot be undone.</strong></p>
                
                <div class="form-check mt-3">
                    <input class="form-check-input" type="checkbox" id="finalConfirmCheck">
                    <label class="form-check-label" for="finalConfirmCheck">
                        I understand that this will permanently delete the supervisor and this action cannot be undone.
                    </label>
                </div>
            </div>
        `;
        
        // Move to step 4
        document.getElementById('modalStep2').style.display = 'none';
        document.getElementById('modalStep3').style.display = 'none';
        document.getElementById('modalStep4').style.display = 'block';
        updateModalStepIndicator(4);
        
        // Show delete button
        document.getElementById('modalTransferBtn').style.display = 'none';
        document.getElementById('modalDeleteBtn').style.display = 'inline-block';
        
        showAlert('success', `New supervisor "${username}" created and assignments transferred successfully!`);
        
    } catch (error) {
        console.error('❌ Error creating supervisor and transferring:', error);
        showAlert('danger', `Failed to create supervisor and transfer: ${error.message}`);
    } finally {
        // Reset button
        createBtn.disabled = false;
        createBtn.innerHTML = '<i class="bi bi-person-plus"></i> Create & Transfer';
    }
}

// Load locations with hierarchical display
async function loadLocations() {
    console.log('📍 Loading hierarchical locations...');
    showLoading(true);
    
    if (!isAuthenticated) {
        showAlert('danger', 'Not authenticated');
        return;
    }
    
    try {
        const response = await fetch('/api/admin/locations-hierarchy', {
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log('📍 Hierarchical locations data received:', data);
        
        // Calculate total locations count
        const totalCount = (data.divisions?.length || 0) + (data.cities?.length || 0) + (data.colonies?.length || 0);
        
        // Generate hierarchical display using the correct data structure
        const locationContent = generateHierarchicalLocationView(data);
        
        const html = `
            <div class="card">
                <div class="card-header">
                    <div class="d-flex justify-content-between align-items-center">
                        <h5>
                            <i class="bi bi-geo-alt-fill me-2"></i>
                            Locations Management
                        </h5>
                        <div class="d-flex align-items-center">
                            <span class="badge bg-primary me-2">📊 Division → 📍 City → 🏘️ Colony → 📁 Department</span>
                            <span class="badge bg-info">${totalCount} locations</span>
                        </div>
                    </div>
                    <p class="mb-0 text-muted mt-2">
                        <small>Hierarchical View</small>
                    </p>
                </div>
                <div class="card-body">
                    ${locationContent}
                </div>
            </div>
        `;
        
        document.getElementById('locationsContent').innerHTML = html;
        console.log('  Hierarchical locations loaded successfully');
        
    } catch (error) {
        console.error('❌ Error loading locations:', error);
        document.getElementById('locationsContent').innerHTML = `
            <div class="alert alert-danger">
                <i class="bi bi-exclamation-triangle"></i> Error loading locations: ${error.message}
            </div>
        `;
    } finally {
        showLoading(false);
    }
}

// Generate hierarchical view: Division → City → Colony → Department
function generateHierarchicalLocationView(data) {
    const { divisions = [], cities = [], colonies = [], departments = [] } = data;
    
    if (divisions.length === 0 && cities.length === 0 && colonies.length === 0) {
        return `
            <div class="alert alert-info text-center">
                <i class="bi bi-info-circle display-4 mb-3"></i>
                <h5>No locations found</h5>
                <p class="mb-0">No organizational hierarchy data available.</p>
            </div>
        `;
    }
    
    let html = '';
    
    // Group cities by division
    const cityGroups = {};
    cities.forEach(city => {
        if (!cityGroups[city.division_id]) {
            cityGroups[city.division_id] = [];
        }
        cityGroups[city.division_id].push(city);
    });
    
    // Group colonies by city
    const colonyGroups = {};
    colonies.forEach(colony => {
        if (!colonyGroups[colony.city_id]) {
            colonyGroups[colony.city_id] = [];
        }
        colonyGroups[colony.city_id].push(colony);
    });
    
    // Generate hierarchy for each division
    divisions.forEach((division, divIndex) => {
        const divisionCities = cityGroups[division.id] || [];
        const divisionId = `division_${division.id}`;
        
        // Count total colonies in this division
        const totalColonies = divisionCities.reduce((total, city) => {
            return total + (colonyGroups[city.id] || []).length;
        }, 0);
        
        html += `
            <div class="mb-4">
                <div class="card border-primary">
                    <div class="card-header bg-light" data-bs-toggle="collapse" data-bs-target="#${divisionId}" style="cursor: pointer;">
                        <div class="d-flex justify-content-between align-items-center">
                            <h6 class="mb-0">
                                <i class="bi bi-building text-primary me-2"></i>
                                📊 ${division.name} Division
                            </h6>
                            <div>
                                <span class="badge bg-primary me-1">${divisionCities.length} cities</span>
                                <span class="badge bg-info">${totalColonies} colonies</span>
                            </div>
                        </div>
                    </div>
                    <div class="collapse" id="${divisionId}">
                        <div class="card-body ps-4">
        `;
        
        if (divisionCities.length === 0) {
            html += `
                <div class="alert alert-warning">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    No cities found in this division
                </div>
            `;
        } else {
            // Generate cities within this division
            divisionCities.forEach((city, cityIndex) => {
                const cityColonies = colonyGroups[city.id] || [];
                const cityId = `city_${city.id}`;
                
                html += `
                    <div class="mb-3">
                        <div class="card border-info">
                            <div class="card-header bg-light" data-bs-toggle="collapse" data-bs-target="#${cityId}" style="cursor: pointer;">
                                <div class="d-flex justify-content-between align-items-center">
                                    <h6 class="mb-0">
                                        <i class="bi bi-geo-alt text-info me-2"></i>
                                        📍 ${city.name} City
                                    </h6>
                                    <span class="badge bg-info">${cityColonies.length} colonies</span>
                                </div>
                            </div>
                            <div class="collapse" id="${cityId}">
                                <div class="card-body ps-4">
                `;
                
                if (cityColonies.length === 0) {
                    html += `
                        <div class="alert alert-info">
                            <i class="bi bi-info-circle me-2"></i>
                            No colonies found in this city
                        </div>
                    `;
                } else {
                    // Generate colonies within this city
                    cityColonies.forEach((colony, colonyIndex) => {
                        html += `
                            <div class="mb-2">
                                <div class="card border-success">
                                    <div class="card-body py-2">
                                        <div class="d-flex justify-content-between align-items-center">
                                            <h6 class="mb-0">
                                                <i class="bi bi-houses text-success me-2"></i>
                                                🏘️ ${colony.name} Colony
                                            </h6>
                                            <div>
                                                <span class="badge bg-success">Colony</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `;
                    });
                }
                
                html += `
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            });
        }
        
        html += `
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    // Add departments section at the bottom
    if (departments.length > 0) {
        html += `
            <div class="mb-4">
                <div class="card border-warning">
                    <div class="card-header bg-light">
                        <h6 class="mb-0">
                            <i class="bi bi-briefcase text-warning me-2"></i>
                            📁 Departments (${departments.length})
                        </h6>
                    </div>
                    <div class="card-body">
                        <div class="row">
        `;
        
        departments.forEach(dept => {
            html += `
                <div class="col-md-3 mb-2">
                    <div class="card border-warning">
                        <div class="card-body py-2 text-center">
                            <i class="bi bi-briefcase text-warning me-1"></i>
                            <span class="fw-bold">${dept.name}</span>
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += `
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    return html;
}

// Delete supervisor function
async function deleteSupervisor(id, name) {
    if (!confirm(`Are you sure you want to delete supervisor "${name}"?`)) {
        return;
    }
    
    console.log(`🗑️ Deleting supervisor ID: ${id}`);
    showLoading(true);
    
    try {
        const response = await fetch(`/api/admin/supervisors/${id}`, {
            method: 'DELETE',
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log('  Supervisor deleted successfully');
        showAlert('success', `Supervisor "${name}" deleted successfully`);
        
        // Refresh supervisors list
        loadSupervisors();
        
    } catch (error) {
        console.error('❌ Error deleting supervisor:', error);
        showAlert('danger', `Failed to delete supervisor: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// Reset user password (Level 1 Admin only)
async function resetUserPassword(id, name) {
    if (!confirm(`Are you sure you want to reset the password for "${name}"?\n\nA new password will be generated.`)) {
        return;
    }
    
    console.log(`🔑 Resetting password for user ID: ${id}`);
    showLoading(true);
    
    try {
        const response = await fetch(`/api/admin/reset-password/${id}`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log('  Password reset successfully');
        
        // Show the new password in a modal or alert
        const newPassword = data.newPassword;
        const username = data.username;
        
        // Create a modal to display the new password
        const modalHtml = `
            <div class="modal fade" id="passwordResetModal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header bg-info text-white">
                            <h5 class="modal-title">
                                <i class="bi bi-key me-2"></i>Password Reset Successful
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="alert alert-warning">
                                <i class="bi bi-exclamation-triangle me-2"></i>
                                <strong>Important:</strong> Please share this password with the user securely and ask them to change it after first login.
                            </div>
                            <div class="mb-3">
                                <label class="form-label"><strong>Username:</strong></label>
                                <div class="input-group">
                                    <input type="text" class="form-control" value="${username}" readonly>
                                    <button class="btn btn-outline-secondary" onclick="copyToClipboard('${username}', this)">
                                        <i class="bi bi-clipboard"></i>
                                    </button>
                                </div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label"><strong>New Password:</strong></label>
                                <div class="input-group">
                                    <input type="text" class="form-control font-monospace" value="${newPassword}" readonly id="newPasswordField">
                                    <button class="btn btn-outline-secondary" onclick="copyToClipboard('${newPassword}', this)">
                                        <i class="bi bi-clipboard"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Remove any existing modal
        const existingModal = document.getElementById('passwordResetModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Add the modal to the page
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Show the modal
        const modal = new bootstrap.Modal(document.getElementById('passwordResetModal'));
        modal.show();
        
        showAlert('success', `Password reset for "${name}" - Check the popup for new password`);
        
    } catch (error) {
        console.error('❌ Error resetting password:', error);
        showAlert('danger', `Failed to reset password: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// Helper function to copy text to clipboard
function copyToClipboard(text, button) {
    navigator.clipboard.writeText(text).then(() => {
        const originalIcon = button.innerHTML;
        button.innerHTML = '<i class="bi bi-check"></i>';
        button.classList.add('btn-success');
        button.classList.remove('btn-outline-secondary');
        
        setTimeout(() => {
            button.innerHTML = originalIcon;
            button.classList.remove('btn-success');
            button.classList.add('btn-outline-secondary');
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy text: ', err);
        showAlert('warning', 'Failed to copy to clipboard');
    });
}

// Save supervisor function with enhanced validation
async function saveSupervisor() {
    console.log('💾 Saving new supervisor with specific assignment...');
    
    const form = document.getElementById('addSupervisorForm');
    const formData = new FormData(form);
    
    // Build supervisor data with specific assignment
    const supervisorData = {
        // Basic Information
        username: formData.get('username'),
        password: formData.get('password'),
        full_name: formData.get('full_name'),
        employee_id: formData.get('employee_id'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        
        // Role & Specific Assignment
        role: formData.get('role'),
        division_id: formData.get('division_id') || null,
        city_id: formData.get('city_id') || null,
        colony_id: formData.get('colony_id') || null,
        department_id: formData.get('department_id') || null
    };
    
    // Validation for required fields
    if (!supervisorData.username || !supervisorData.password || !supervisorData.full_name || !supervisorData.phone) {
        showAlert('danger', 'Please fill in all required fields (marked with *)');
        return;
    }
    
    // Validation for specific role requirements
    if (supervisorData.role === 'supervisor') {
        // Supervisors need complete assignment: Division → City → Colony → Department
        if (!supervisorData.division_id || !supervisorData.city_id || !supervisorData.colony_id || !supervisorData.department_id) {
            showAlert('danger', 'Supervisors must have complete assignment: Division → City → Colony → Department');
            return;
        }
        
        // Check if department is available (not already assigned)
        const departmentStatusAlert = document.getElementById('departmentStatusAlert');
        if (departmentStatusAlert && departmentStatusAlert.classList.contains('alert-warning')) {
            showAlert('danger', 'This department already has a supervisor. Please choose a different department.');
            return;
        }
        
    } else if (supervisorData.role === 'admin_l2' && !supervisorData.division_id) {
        showAlert('danger', 'Please select a division for Level 2 Admin');
        return;
    } else if (supervisorData.role === 'admin_l3' && (!supervisorData.division_id || !supervisorData.city_id)) {
        showAlert('danger', 'Please select both division and city for Level 3 Admin');
        return;
    }
    
    // Password validation
    if (supervisorData.password.length < 6) {
        showAlert('danger', 'Password must be at least 6 characters long');
        return;
    }
    
    // Phone validation
    if (supervisorData.phone.length < 10) {
        showAlert('danger', 'Please enter a valid phone number');
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch('/api/admin/supervisors/specific-assignment', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(supervisorData)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log('  Supervisor added successfully with specific assignment');
        
        if (supervisorData.role === 'supervisor') {
            showAlert('success', `Supervisor "${supervisorData.full_name}" assigned to specific department successfully!`);
        } else {
            showAlert('success', `${getRoleDisplayName(supervisorData.role)} "${supervisorData.full_name}" created successfully!`);
        }
        
        // Close modal and reset form
        const modal = bootstrap.Modal.getInstance(document.getElementById('addSupervisorModal'));
        modal.hide();
        form.reset();
        resetSupervisorDropdowns();
        
        // Refresh supervisors list
        loadSupervisors();
        
    } catch (error) {
        console.error('❌ Error adding supervisor:', error);
        showAlert('danger', `Failed to add supervisor: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// Logout function
async function handleLogout() {
    console.log('🚪 Logging out...');
    
    try {
        const response = await fetch('/auth/logout', {
            method: 'POST',
            credentials: 'same-origin'
        });
        
        if (response.ok) {
            window.location.href = '/login.html';
        }
    } catch (error) {
        console.error('Logout error:', error);
        showAlert('warning', 'Logout failed, please refresh the page');
    }
}

// Utility functions
function showLoading(show) {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) {
        spinner.classList.toggle('d-none', !show);
    }
}

function showAlert(type, message) {
    const alertArea = document.getElementById('alertArea');
    if (!alertArea) return;
    
    const alertHtml = `
        <div class="alert alert-${type} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    alertArea.innerHTML = alertHtml;
    
    // Auto-hide success alerts after 3 seconds
    if (type === 'success') {
        setTimeout(() => {
            const alert = alertArea.querySelector('.alert');
            if (alert) {
                const bsAlert = new bootstrap.Alert(alert);
                bsAlert.close();
            }
        }, 3000);
    }
}

// async function loadRequests() - now replaced with enhanced version above

function getRoleBadgeClass(role) {
    switch((role || '').toLowerCase()) {
        case 'admin_l1': return 'bg-danger';
        case 'admin_l2': return 'bg-warning text-dark';
        case 'admin_l3': return 'bg-info';
        case 'supervisor': return 'bg-success';
        default: return 'bg-secondary';
    }
}

// Handle role change in add supervisor form
async function handleRoleChange() {
    const roleSelect = document.getElementById('supervisorRole');
    const divisionField = document.getElementById('divisionField');
    const cityField = document.getElementById('cityField');
    const colonyField = document.getElementById('colonyField');
    const departmentField = document.getElementById('departmentField');
    const departmentStatusRow = document.getElementById('departmentStatusRow');
    
    const selectedRole = roleSelect.value;
    console.log('🔄 Role changed to:', selectedRole);
    
    // Hide all fields initially
    divisionField.style.display = 'none';
    cityField.style.display = 'none';
    colonyField.style.display = 'none';
    departmentField.style.display = 'none';
    departmentStatusRow.style.display = 'none';
    
    // Clear required attributes
    document.getElementById('supervisorDivision').removeAttribute('required');
    document.getElementById('supervisorCity').removeAttribute('required');
    document.getElementById('supervisorColony').removeAttribute('required');
    document.getElementById('supervisorDepartment').removeAttribute('required');
    
    // Reset all dropdowns
    resetSupervisorDropdowns();
    
    if (selectedRole === 'supervisor') {
        // Supervisor - Show all step-by-step fields for specific assignment
        divisionField.style.display = 'block';
        cityField.style.display = 'block';
        colonyField.style.display = 'block';
        departmentField.style.display = 'block';
        
        // Make all required for supervisors (they need specific assignment)
        document.getElementById('supervisorDivision').setAttribute('required', 'required');
        document.getElementById('supervisorCity').setAttribute('required', 'required');
        document.getElementById('supervisorColony').setAttribute('required', 'required');
        document.getElementById('supervisorDepartment').setAttribute('required', 'required');
        
        await loadDivisions();
        showAlert('info', 'Please select Division → City → Colony → Department for specific supervisor assignment');
        
    } else if (selectedRole === 'admin_l2') {
        // Level 2 Admin - Show Division field only (manages entire division)
        divisionField.style.display = 'block';
        document.getElementById('supervisorDivision').setAttribute('required', 'required');
        await loadDivisions();
        showAlert('info', 'Level 2 Admin: Select division to manage');
        
    } else if (selectedRole === 'admin_l3') {
        // Level 3 Admin - Show Division and City fields (manages specific city)
        divisionField.style.display = 'block';
        cityField.style.display = 'block';
        
        document.getElementById('supervisorDivision').setAttribute('required', 'required');
        document.getElementById('supervisorCity').setAttribute('required', 'required');
        
        await loadDivisions();
        showAlert('info', 'Level 3 Admin: Select division and city to manage');
    }
    // Level 1 Admin (admin_l1) - no location restrictions needed
}

// Reset all supervisor assignment dropdowns
function resetSupervisorDropdowns() {
    document.getElementById('supervisorDivision').innerHTML = '<option value="">Choose Division</option>';
    document.getElementById('supervisorCity').innerHTML = '<option value="">Choose City</option>';
    document.getElementById('supervisorColony').innerHTML = '<option value="">Choose Colony</option>';
    document.getElementById('supervisorDepartment').innerHTML = '<option value="">Choose Department</option>';
    
    // Hide status
    const statusRow = document.getElementById('departmentStatusRow');
    if (statusRow) {
        statusRow.style.display = 'none';
    }
}

// Load divisions for admin creation
async function loadDivisions() {
    try {
        console.log('🏢 Loading divisions...');
        const response = await fetch('/api/admin/divisions', {
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            const divisionSelect = document.getElementById('supervisorDivision');
            
            // Clear existing options
            divisionSelect.innerHTML = '<option value="">Select Division</option>';
            
            // Add division options
            data.divisions.forEach(division => {
                const option = document.createElement('option');
                option.value = division.id;
                option.textContent = division.name;
                divisionSelect.appendChild(option);
            });
            
            console.log('  Loaded', data.divisions.length, 'divisions');
        } else {
            console.error('❌ Failed to load divisions');
        }
    } catch (error) {
        console.error('❌ Error loading divisions:', error);
    }
}

// Load cities based on selected division
async function loadCitiesForDivision() {
    const divisionSelect = document.getElementById('supervisorDivision');
    const citySelect = document.getElementById('supervisorCity');
    const selectedDivisionId = divisionSelect.value;
    
    try {
        console.log('🏙️ Loading cities for division:', selectedDivisionId);
        
        // Clear existing options
        citySelect.innerHTML = '<option value="">Select City</option>';
        
        if (!selectedDivisionId) {
            return; // No division selected
        }
        
        const response = await fetch(`/api/admin/cities?division_id=${selectedDivisionId}`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            
            // Add city options
            data.cities.forEach(city => {
                const option = document.createElement('option');
                option.value = city.id;
                option.textContent = city.name;
                citySelect.appendChild(option);
            });
            
            console.log('  Loaded', data.cities.length, 'cities for division', selectedDivisionId);
        } else {
            console.error('❌ Failed to load cities');
        }
    } catch (error) {
        console.error('❌ Error loading cities:', error);
    }
}

// Reset add supervisor form to initial state
function resetAddSupervisorForm() {
    document.getElementById('divisionField').style.display = 'none';
    document.getElementById('cityField').style.display = 'none';
    document.getElementById('supervisorDivision').innerHTML = '<option value="">Select Division</option>';
    document.getElementById('supervisorCity').innerHTML = '<option value="">Select City</option>';
}

// Generate hierarchical display for Level 1 Admin (Division -> City -> Department -> Supervisors)
function generateDivisionCityHierarchy(supervisors, colonies = [], currentUser = null) {
    console.log('🏢 Generating supervisor organizational hierarchy...', { supervisors: supervisors.length, colonies: colonies.length });
    
    // Organize supervisors by hierarchical structure
    const hierarchyData = organizeSupervisorsByHierarchy(supervisors, colonies);
    
    if (!hierarchyData || Object.keys(hierarchyData).length === 0) {
        return `
            <div class="alert alert-info text-center">
                <i class="bi bi-people display-4 text-info"></i>
                <h4 class="mt-3">No Supervisors Found</h4>
                <p>No supervisors available in the system.</p>
                <div class="mt-3">
                    <span class="badge bg-primary">Organizational Hierarchy View</span>
                </div>
            </div>
        `;
    }
    
    let html = '';
    
    // Level 1: Divisions
    Object.keys(hierarchyData).sort().forEach(divisionName => {
        const divisionData = hierarchyData[divisionName];
        const divisionId = `sup_div_${divisionName.replace(/\s+/g, '_')}_${Date.now()}`;
        
        // Count total supervisors in this division
        const totalSupervisors = countSupervisorsInDivision(divisionData);
        
        html += `
            <div class="mb-4">
                <div class="card border-primary">
                    <div class="card-header bg-primary text-white" data-bs-toggle="collapse" data-bs-target="#${divisionId}" style="cursor: pointer;" aria-expanded="false">
                        <div class="d-flex justify-content-between align-items-center">
                            <h5 class="mb-0">
                                <i class="bi bi-building me-2"></i>
                                📁 ${divisionName} Division
                            </h5>
                            <span class="badge bg-light text-dark">${totalSupervisors} supervisors</span>
                        </div>
                        <small class="d-block mt-1 opacity-75">Expand to view cities, departments, and supervisors</small>
                    </div>
                    <div class="collapse" id="${divisionId}">
                        <div class="card-body ps-4">
                            ${generateSupervisorCityLevel(divisionData, divisionName, currentUser)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    return html;
}

// Organize supervisors by hierarchical structure: Division → City → Colony → Supervisor
function organizeSupervisorsByHierarchy(supervisors, colonies = []) {
    const hierarchy = {};
    
    // Helper function to ensure hierarchy structure exists
    function ensureHierarchy(divisionName, cityName, colonyName) {
        if (!hierarchy[divisionName]) {
            hierarchy[divisionName] = { cities: {} };
        }
        if (!hierarchy[divisionName].cities[cityName]) {
            hierarchy[divisionName].cities[cityName] = { colonies: {} };
        }
        if (!hierarchy[divisionName].cities[cityName].colonies[colonyName]) {
            hierarchy[divisionName].cities[cityName].colonies[colonyName] = { 
                supervisors: []
            };
        }
    }
    
    // Organize supervisors by colony
    supervisors.forEach(supervisor => {
        const divisionName = supervisor.division_name || 'Unassigned Division';
        const cityName = supervisor.city_name || 'Unassigned City';
        const colonyName = supervisor.colony_name || 'Unassigned Colony';
        
        ensureHierarchy(divisionName, cityName, colonyName);
        hierarchy[divisionName].cities[cityName].colonies[colonyName].supervisors.push(supervisor);
    });
    
    // Add empty colonies that don't have supervisors yet (for reference)
    colonies.forEach(colony => {
        // Find the city this colony belongs to
        supervisors.forEach(supervisor => {
            if (supervisor.city_id === colony.city_id) {
                const divisionName = supervisor.division_name || 'Unassigned Division';
                const cityName = supervisor.city_name || 'Unassigned City';
                
                // Ensure this colony exists in the hierarchy even if no supervisors assigned
                ensureHierarchy(divisionName, cityName, colony.name);
            }
        });
    });
    
    return hierarchy;
}

// Count total supervisors in a division
function countSupervisorsInDivision(divisionData) {
    let count = 0;
    
    Object.values(divisionData.cities).forEach(cityData => {
        Object.values(cityData.colonies).forEach(colonyData => {
            count += (colonyData.supervisors || []).length;
        });
    });
    
    return count;
}

// Generate city level for supervisors hierarchy
function generateSupervisorCityLevel(divisionData, divisionName, currentUser) {
    let html = '';
    
    // Generate cities
    Object.keys(divisionData.cities).sort().forEach(cityName => {
        const cityData = divisionData.cities[cityName];
        const cityId = `sup_city_${divisionName.replace(/\s+/g, '_')}_${cityName.replace(/\s+/g, '_')}_${Date.now()}`;
        
        // Count total supervisors in this city
        const totalSupervisors = countSupervisorsInCity(cityData);
        
        if (totalSupervisors === 0) return; // Skip empty cities
        
        html += `
            <div class="mb-3">
                <div class="card border-info">
                    <div class="card-header bg-info text-white" data-bs-toggle="collapse" data-bs-target="#${cityId}" style="cursor: pointer;" aria-expanded="false">
                        <div class="d-flex justify-content-between align-items-center">
                            <h6 class="mb-0">
                                <i class="bi bi-geo-alt me-2"></i>
                                📁 ${cityName} City
                            </h6>
                            <span class="badge bg-light text-dark">${totalSupervisors} supervisors</span>
                        </div>
                        <small class="d-block mt-1 opacity-75">Expand to view departments and supervisors</small>
                    </div>
                    <div class="collapse" id="${cityId}">
                        <div class="card-body ps-4">
                            ${generateSupervisorColonyLevel(cityData, divisionName, cityName, currentUser)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    return html;
}

// Count total supervisors in a city
function countSupervisorsInCity(cityData) {
    let count = 0;
    
    Object.values(cityData.colonies).forEach(colonyData => {
        count += (colonyData.supervisors || []).length;
    });
    
    return count;
}

// Generate colony level for supervisors hierarchy (now directly under cities)
function generateSupervisorColonyLevel(cityData, divisionName, cityName, currentUser) {
    let html = '';
    
    // Generate colonies
    Object.keys(cityData.colonies).sort().forEach(colonyName => {
        const colonyData = cityData.colonies[colonyName];
        const colonyId = `sup_colony_${divisionName.replace(/\s+/g, '_')}_${cityName.replace(/\s+/g, '_')}_${colonyName.replace(/\s+/g, '_')}_${Date.now()}`;
        
        // Get supervisors in this colony
        const supervisors = colonyData.supervisors || [];
        
        if (supervisors.length === 0) return; // Skip empty colonies
        
        // Group supervisors by department within colony
        const departmentGroups = {};
        supervisors.forEach(supervisor => {
            const deptName = supervisor.department_name || 'Unassigned Department';
            if (!departmentGroups[deptName]) {
                departmentGroups[deptName] = [];
            }
            departmentGroups[deptName].push(supervisor);
        });
        
        html += `
            <div class="mb-3">
                <div class="card border-success">
                                🏘️ ${colonyName}
                            </h6>
                            <span class="badge bg-light text-dark">${supervisors.length} supervisors</span>
                        </div>
                        <small class="d-block mt-1 opacity-75">
                            Departments: ${Object.keys(departmentGroups).join(', ')}
                        </small>
                    </div>
                    <div class="collapse" id="${colonyId}">
                        <div class="card-body ps-4">
                            ${Object.keys(departmentGroups).sort().map(deptName => `
                                <div class="mb-3">
                                    <h6 class="text-muted mb-2">
                                        <i class="bi bi-briefcase me-2"></i>
                                        ${deptName} Department (${departmentGroups[deptName].length} supervisors)
                                    </h6>
                                    ${generateSupervisorList(departmentGroups[deptName], [], currentUser)}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    return html;
}

// Load colonies for selected city
async function loadColoniesForCity() {
    const citySelect = document.getElementById('supervisorCity');
    const colonySelect = document.getElementById('supervisorColony');
    
    const selectedCity = citySelect.value;
    console.log('🏙️ Loading colonies for city:', selectedCity);
    
    if (!selectedCity) {
        colonySelect.innerHTML = '<option value="">Select Colony/Area</option>';
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/colonies?city=${encodeURIComponent(selectedCity)}`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const colonies = await response.json();
        console.log('🏘️ Loaded colonies:', colonies);
        
        colonySelect.innerHTML = '<option value="">Select Colony/Area</option>';
        
        if (colonies && colonies.length > 0) {
            colonies.forEach(colony => {
                const option = document.createElement('option');
                option.value = colony.name || colony;
                option.textContent = colony.name || colony;
                colonySelect.appendChild(option);
            });
        } else {
            colonySelect.innerHTML = '<option value="">No colonies available</option>';
        }
    } catch (error) {
        console.error('❌ Error loading colonies:', error);
        colonySelect.innerHTML = '<option value="">Error loading colonies</option>';
    }
}

// Load departments for selected colony
async function loadDepartmentsForColony() {
    const colonySelect = document.getElementById('supervisorColony');
    const departmentSelect = document.getElementById('supervisorDepartment');
    const departmentField = document.getElementById('departmentField');
    const departmentStatusRow = document.getElementById('departmentStatusRow');
    
    const selectedColony = colonySelect.value;
    console.log('🏢 Loading departments for colony:', selectedColony);
    
    if (!selectedColony) {
        departmentSelect.innerHTML = '<option value="">Choose Department</option>';
        departmentField.style.display = 'none';
        departmentStatusRow.style.display = 'none';
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/departments?colony=${encodeURIComponent(selectedColony)}`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const departments = await response.json();
        console.log('🏢 Loaded departments for colony:', departments);
        
        departmentSelect.innerHTML = '<option value="">Choose Department</option>';
        
        if (departments && departments.length > 0) {
            departments.forEach(dept => {
                const option = document.createElement('option');
                option.value = dept.id || dept.name;
                option.textContent = dept.name || dept;
                option.dataset.hasSupervisor = dept.has_supervisor || false;
                departmentSelect.appendChild(option);
            });
            
            // Show department field
            departmentField.style.display = 'block';
            
        } else {
            departmentSelect.innerHTML = '<option value="">No departments available</option>';
            departmentField.style.display = 'block';
        }
        
    } catch (error) {
        console.error('❌ Error loading departments:', error);
        departmentSelect.innerHTML = '<option value="">Error loading departments</option>';
        departmentField.style.display = 'block';
    }
}

// Check department availability (if it already has a supervisor)
async function checkDepartmentAvailability() {
    const departmentSelect = document.getElementById('supervisorDepartment');
    const departmentStatusRow = document.getElementById('departmentStatusRow');
    const departmentStatusAlert = document.getElementById('departmentStatusAlert');
    
    const selectedDepartment = departmentSelect.value;
    console.log('🔍 Checking availability for department:', selectedDepartment);
    
    if (!selectedDepartment) {
        departmentStatusRow.style.display = 'none';
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/department-availability?department_id=${encodeURIComponent(selectedDepartment)}`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const availability = await response.json();
        console.log('🔍 Department availability:', availability);
        
        departmentStatusRow.style.display = 'block';
        
        if (availability.available) {
            // Department is available
            departmentStatusAlert.className = 'alert alert-success';
            departmentStatusAlert.innerHTML = `
                <i class="bi bi-check-circle me-2"></i>
                <strong>Available!</strong> This department does not have a supervisor yet.
                <br><small>Colony: ${availability.colony_name} | Department: ${availability.department_name}</small>
            `;
        } else {
            // Department already has a supervisor
            departmentStatusAlert.className = 'alert alert-warning';
            departmentStatusAlert.innerHTML = `
                <i class="bi bi-exclamation-triangle me-2"></i>
                <strong>Already Assigned!</strong> This department already has a supervisor: <strong>${availability.current_supervisor}</strong>
                <br><small>Assigned on: ${availability.assigned_date || 'Unknown date'}</small>
                <br><small class="text-muted">Each department can have only ONE supervisor. Please choose a different department.</small>
            `;
        }
        
    } catch (error) {
        console.error('❌ Error checking department availability:', error);
        departmentStatusRow.style.display = 'block';
        departmentStatusAlert.className = 'alert alert-danger';
        departmentStatusAlert.innerHTML = `
            <i class="bi bi-x-circle me-2"></i>
            <strong>Error!</strong> Could not check department availability. Please try again.
        `;
    }
}

function getRoleDisplayName(role) {
    switch((role || '').toLowerCase()) {
        case 'admin_l1': return 'Level 1 Admin';
        case 'admin_l2': return 'Level 2 Admin';
        case 'admin_l3': return 'Level 3 Admin';
        case 'supervisor': return 'Supervisor';
        default: return role || 'Unknown';
    }
}

// Load analytics
function loadAnalytics() {
    console.log('📊 Loading analytics...');
    showLoading(true);
    
    document.getElementById('analyticsContent').innerHTML = `
        <div class="card">
            <div class="card-header">
                <h5>📊 Analytics Dashboard</h5>
            </div>
            <div class="card-body">
                <div class="alert alert-info text-center">
                    <i class="bi bi-graph-up display-4 text-info"></i>
                    <h4 class="mt-3">Analytics Coming Soon</h4>
                    <p>Advanced analytics and reporting features will be available in the next update.</p>
                    <div class="mt-3">
                        <span class="badge bg-primary">Charts</span>
                        <span class="badge bg-success">Reports</span>
                        <span class="badge bg-info">Trends</span>
                        <span class="badge bg-warning">Insights</span>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    showLoading(false);
}

// View request function
// Edit supervisor function
function editSupervisor(id, username) {
    console.log('✏️ Editing supervisor:', id, username);
    showAlert('info', `Supervisor editing functionality for ${username} - Coming soon`);
}

// Generate supervisor list with colony information
function generateSupervisorList(supervisors, colonies, currentUser = null) {
    if (supervisors.length === 0) {
        return '<div class="text-muted small">No supervisors assigned</div>';
    }
    
    let html = '';
    
    // Show supervisors
    html += supervisors.map(supervisor => `
        <div class="card mb-2 ${supervisor.is_active ? '' : 'bg-light'}">
            <div class="card-body py-2">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <h6 class="mb-0">
                            <i class="bi ${getRoleIcon(supervisor.role)} me-2"></i>
                            ${supervisor.name || supervisor.username}
                            ${supervisor.is_active ? '<i class="bi bi-check-circle text-success ms-1" title="Active"></i>' : '<i class="bi bi-x-circle text-danger ms-1" title="Inactive"></i>'}
                        </h6>
                        <small class="text-muted">
                            <span class="badge ${getRoleBadgeClass(supervisor.role)} me-2">${getRoleDisplayName(supervisor.role)}</span>
                            ${supervisor.email || `${supervisor.name.toLowerCase().replace(/\s+/g, '.')}@railway.gov.in`}
                            ${supervisor.department_name ? `<br><i class="bi bi-briefcase me-1"></i>Department: ${supervisor.department_name}` : ''}
                            ${supervisor.colony_name ? `<br><i class="bi bi-house-door me-1"></i>Colony: ${supervisor.colony_name}` : ''}
                        </small>
                    </div>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-${supervisor.is_active ? 'warning' : 'success'}" 
                                onclick="toggleSupervisorStatus(${supervisor.id}, ${supervisor.is_active}, '${(supervisor.name || supervisor.username || '').replace(/'/g, '\\\'')}')">
                            <i class="bi ${supervisor.is_active ? 'bi-pause' : 'bi-play'}"></i>
                        </button>
                        ${currentUser && currentUser.role === 'admin_l1' ? `
                        <button class="btn btn-outline-info" 
                                onclick="resetUserPassword(${supervisor.id}, '${(supervisor.name || supervisor.username || '').replace(/'/g, '\\\'')}')">
                            <i class="bi bi-key"></i>
                        </button>
                        ` : ''}
                        <button class="btn btn-outline-danger" 
                                onclick="deleteSupervisor(${supervisor.id}, '${(supervisor.name || supervisor.username || '').replace(/'/g, '\\\'')}')">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
    
    return html;
}

// Generate hierarchical display for Level 2 Admin (City -> Department -> Users)
function generateLevel2AdminCityHierarchy(supervisors, colonies = [], currentDivision, currentUser = null) {
    console.log('🏢 Generating L2 admin supervisor hierarchy...', { supervisors: supervisors.length, colonies: colonies.length, currentDivision });
    
    // Organize supervisors by city hierarchy structure
    const hierarchyData = organizeSupervisorsByCityHierarchy(supervisors, colonies);
    
    let html = `<div class="mb-3">
        <div class="alert alert-info">
            <i class="bi bi-building me-2"></i>
            <strong>Division: ${currentDivision}</strong>
            <span class="badge bg-primary ms-2">${supervisors.length} total supervisors</span>
        </div>
    </div>`;
    
    if (!hierarchyData || Object.keys(hierarchyData).length === 0) {
        html += `
            <div class="alert alert-warning text-center">
                <i class="bi bi-people display-4 text-warning"></i>
                <h4 class="mt-3">No Supervisors Found</h4>
                <p>No supervisors available in your division.</p>
            </div>
        `;
        return html;
    }
    
    // Level 1: Cities
    Object.keys(hierarchyData).sort().forEach(cityName => {
        const cityData = hierarchyData[cityName];
        const cityId = `l2_city_${cityName.replace(/\s+/g, '_')}_${Date.now()}`;
        
        // Count total supervisors in this city
        const totalSupervisors = countSupervisorsInCity(cityData);
        
        html += `
            <div class="mb-3">
                <div class="card border-info">
                    <div class="card-header bg-info text-white" data-bs-toggle="collapse" data-bs-target="#${cityId}" style="cursor: pointer;" aria-expanded="false">
                        <div class="d-flex justify-content-between align-items-center">
                            <h6 class="mb-0">
                                <i class="bi bi-geo-alt me-2"></i>
                                📁 ${cityName} City
                            </h6>
                            <span class="badge bg-light text-dark">${totalSupervisors} supervisors</span>
                        </div>
                        <small class="d-block mt-1 opacity-75">Expand to view departments and supervisors</small>
                    </div>
                    <div class="collapse" id="${cityId}">
                        <div class="card-body ps-3">
                            ${generateSupervisorColonyLevel(cityData, currentDivision, cityName, currentUser)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    return html;
}

// Organize supervisors by city hierarchy structure (for L2 admin)
function organizeSupervisorsByCityHierarchy(supervisors, colonies = []) {
    const hierarchy = {};
    
    // Helper function to ensure hierarchy structure exists
    function ensureHierarchy(cityName, departmentName) {
        if (!hierarchy[cityName]) {
            hierarchy[cityName] = { departments: {} };
        }
        if (!hierarchy[cityName].departments[departmentName]) {
            hierarchy[cityName].departments[departmentName] = { 
                supervisors: [],
                colonies: []
            };
        }
    }
    
    // Process all supervisors
    supervisors.forEach(supervisor => {
        const cityName = supervisor.city_name || 'Unassigned City';
        const departmentName = supervisor.department_name || 'Unassigned Department';
        
        ensureHierarchy(cityName, departmentName);
        hierarchy[cityName].departments[departmentName].supervisors.push(supervisor);
    });
    
    // Add colonies that each department can serve (based on city)
    colonies.forEach(colony => {
        Object.keys(hierarchy).forEach(cityName => {
            const cityData = hierarchy[cityName];
            // Check if any supervisor in this city can serve this colony
            const hasSupervisorsInCity = Object.values(cityData.departments).some(dept => 
                dept.supervisors.some(sup => sup.city_id === colony.city_id)
            );
            
            if (hasSupervisorsInCity) {
                // Add this colony to each department in this city
                Object.keys(cityData.departments).forEach(departmentName => {
                    const existingColony = cityData.departments[departmentName].colonies.find(c => c.id === colony.id);
                    if (!existingColony) {
                        cityData.departments[departmentName].colonies.push(colony);
                    }
                });
            }
        });
    });
    
    return hierarchy;
}

// Generate flat display for Level 3 Admin (Department -> Users)
function generateFlatSupervisorList(supervisors, colonies = [], currentCity, currentUser = null) {
    console.log('🏢 Generating L3 admin supervisor hierarchy...', { supervisors: supervisors.length, colonies: colonies.length, currentCity });
    
    // Organize supervisors by department hierarchy structure
    const hierarchyData = organizeSupervisorsByDepartmentHierarchy(supervisors, colonies);
    
    let html = `<div class="mb-3">
        <div class="alert alert-info">
            <i class="bi bi-geo-alt me-2"></i>
            <strong>City: ${currentCity}</strong>
            <span class="badge bg-info ms-2">${supervisors.length} total supervisors</span>
        </div>
    </div>`;
    
    if (!hierarchyData || Object.keys(hierarchyData).length === 0) {
        html += `
            <div class="alert alert-warning text-center">
                <i class="bi bi-people display-4 text-warning"></i>
                <h4 class="mt-3">No Supervisors Found</h4>
                <p>No supervisors available in your city.</p>
            </div>
        `;
        return html;
    }
    
    // Level 1: Departments
    Object.keys(hierarchyData).sort().forEach(departmentName => {
        const departmentData = hierarchyData[departmentName];
        const departmentId = `l3_dept_${departmentName.replace(/\s+/g, '_')}_${Date.now()}`;
        
        // Get supervisors in this department
        const supervisors = departmentData.supervisors || [];
        const colonies = departmentData.colonies || [];
        
        if (supervisors.length === 0) return; // Skip empty departments
        
        html += `
            <div class="mb-3">
                <div class="card border-success">
                    <div class="card-header bg-success text-white" data-bs-toggle="collapse" data-bs-target="#${departmentId}" style="cursor: pointer;" aria-expanded="false">
                        <div class="d-flex justify-content-between align-items-center">
                            <h6 class="mb-0">
                                <i class="bi bi-briefcase me-2"></i>
                                📁 ${departmentName} Department
                            </h6>
                            <span class="badge bg-light text-dark">${supervisors.length} supervisors</span>
                        </div>
                        <small class="d-block mt-1 opacity-75">Supervisors serving ${colonies.length} colonies in ${currentCity}</small>
                    </div>
                    <div class="collapse" id="${departmentId}">
                        <div class="card-body ps-3">
                            ${generateSupervisorList(supervisors, colonies, currentUser)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    return html;
}

// Organize supervisors by department hierarchy structure (for L3 admin)
function organizeSupervisorsByDepartmentHierarchy(supervisors, colonies = []) {
    const hierarchy = {};
    
    // Helper function to ensure hierarchy structure exists
    function ensureHierarchy(departmentName) {
        if (!hierarchy[departmentName]) {
            hierarchy[departmentName] = { 
                supervisors: [],
                colonies: []
            };
        }
    }
    
    // Process all supervisors
    supervisors.forEach(supervisor => {
        const departmentName = supervisor.department_name || 'Unassigned Department';
        
        ensureHierarchy(departmentName);
        hierarchy[departmentName].supervisors.push(supervisor);
    });
    
    // Add colonies that each department can serve (based on city)
    colonies.forEach(colony => {
        Object.keys(hierarchy).forEach(departmentName => {
            const departmentData = hierarchy[departmentName];
            // Check if any supervisor in this department can serve this colony
            const hasSupervisorsForColony = departmentData.supervisors.some(sup => sup.city_id === colony.city_id);
            
            if (hasSupervisorsForColony) {
                const existingColony = departmentData.colonies.find(c => c.id === colony.id);
                if (!existingColony) {
                    departmentData.colonies.push(colony);
                }
            }
        });
    });
    
    return hierarchy;
}

// Generate user list for any hierarchy level
function generateUserList(users, currentUser = null) {
    if (users.length === 0) {
        return '<div class="text-muted small">No users found</div>';
    }
    
    return users.map(user => `
        <div class="card mb-2 ${user.is_active ? '' : 'bg-light'}">
            <div class="card-body py-2">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <h6 class="mb-0">
                            <i class="bi ${getRoleIcon(user.role)} me-2"></i>
                            ${user.name || user.username}
                            ${user.is_active ? '<i class="bi bi-check-circle text-success ms-1" title="Active"></i>' : '<i class="bi bi-x-circle text-danger ms-1" title="Inactive"></i>'}
                        </h6>
                        <small class="text-muted">
                            <span class="badge ${getRoleBadgeClass(user.role)} me-2">${getRoleDisplayName(user.role)}</span>
                            ${user.email || 'No email'}
                        </small>
                    </div>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-${user.is_active ? 'warning' : 'success'}" 
                                onclick="toggleSupervisorStatus(${user.id}, ${user.is_active}, '${(user.name || user.username || '').replace(/'/g, '\\\'')}')">
                            <i class="bi ${user.is_active ? 'bi-pause' : 'bi-play'}"></i>
                        </button>
                        ${currentUser && currentUser.role === 'admin_l1' ? `
                        <button class="btn btn-outline-info" 
                                onclick="resetUserPassword(${user.id}, '${(user.name || user.username || '').replace(/'/g, '\\\'')}')">
                            <i class="bi bi-key"></i>
                        </button>
                        ` : ''}
                        <button class="btn btn-outline-danger" 
                                onclick="deleteSupervisor(${user.id}, '${(user.name || user.username || '').replace(/'/g, '\\\'')}')">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

// Generate original table view (fallback)
function generateOriginalTableView(supervisors, accessLevel, currentUser = null) {
    if (supervisors.length === 0) {
        return '<div class="alert alert-info"><i class="bi bi-info-circle"></i> No users found.</div>';
    }
    
    return `
        <div class="table-responsive">
            <table class="table table-striped">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Location</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${supervisors.map(sup => `
                        <tr class="${sup.is_active ? 'table-light' : 'table-secondary'}">
                            <td>
                                <strong>${sup.name || sup.username || 'N/A'}</strong>
                                <br><small class="text-muted">${sup.email || 'No email'}</small>
                            </td>
                            <td><span class="badge ${getRoleBadgeClass(sup.role)}">${getRoleDisplayName(sup.role)}</span></td>
                            <td>
                                <span class="badge ${sup.is_active ? 'bg-success' : 'bg-secondary'}">
                                    ${sup.is_active ? 'Active' : 'Inactive'}
                                </span>
                            </td>
                            <td>${sup.division_name || 'N/A'} / ${sup.city_name || 'N/A'}</td>
                            <td>
                                <div class="btn-group btn-group-sm">
                                    <button class="btn btn-outline-${sup.is_active ? 'warning' : 'success'}" 
                                            onclick="toggleSupervisorStatus(${sup.id}, ${sup.is_active}, '${(sup.name || sup.username || '').replace(/'/g, '\\\'')}')">
                                        <i class="bi ${sup.is_active ? 'bi-pause' : 'bi-play'}"></i>
                                    </button>
                                    ${currentUser && currentUser.role === 'admin_l1' ? `
                                    <button class="btn btn-outline-info" 
                                            onclick="resetUserPassword(${sup.id}, '${(sup.name || sup.username || '').replace(/'/g, '\\\'')}')">
                                        <i class="bi bi-key"></i>
                                    </button>
                                    ` : ''}
                                    <button class="btn btn-outline-danger" 
                                            onclick="deleteSupervisor(${sup.id}, '${(sup.name || sup.username || '').replace(/'/g, '\\\'')}')">
                                        <i class="bi bi-trash"></i>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// Helper functions
function getRoleIcon(role) {
    switch (role) {
        case 'admin_l1': return 'bi-crown';
        case 'admin_l2': return 'bi-building';
        case 'admin_l3': return 'bi-geo-alt';
        case 'supervisor': return 'bi-person';
        default: return 'bi-person';
    }
}

function getRoleDisplayName(role) {
    switch (role) {
        case 'admin_l1': return 'Admin L1';
        case 'admin_l2': return 'Admin L2';  
        case 'admin_l3': return 'Admin L3';
        case 'supervisor': return 'Supervisor';
        default: return role;
    }
}

// Generate hierarchical location display (Division -> City -> Quarters)
function generateLocationHierarchy(locations) {
    if (locations.length === 0) {
        return '<div class="alert alert-info"><i class="bi bi-info-circle"></i> No colonies/locations found.</div>';
    }
    
    // Get current user role
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
    
    // Group by division, then by city
    const divisionGroups = {};
    
    locations.forEach(location => {
        const divisionName = location.division_name || 'Not Assigned';
        const cityName = location.city_name || 'Not Assigned';
        
        if (!divisionGroups[divisionName]) {
            divisionGroups[divisionName] = {
                id: location.division_id,
                cities: {}
            };
        }
        if (!divisionGroups[divisionName].cities[cityName]) {
            divisionGroups[divisionName].cities[cityName] = {
                id: location.city_id,
                colonies: []
            };
        }
        divisionGroups[divisionName].cities[cityName].colonies.push(location);
    });
    
    let html = '';
    Object.keys(divisionGroups).sort().forEach(divisionName => {
        const divisionData = divisionGroups[divisionName];
        const divisionId = `loc_division_${divisionName.replace(/\s+/g, '_')}`;
        const cityGroups = divisionData.cities;
        const allDivisionLocations = Object.values(cityGroups).flatMap(city => city.colonies);
        const uniqueColonies = [...new Set(allDivisionLocations.map(loc => loc.quarter_name))];
        const totalBuildings = allDivisionLocations.length;
        
        // Show delete button only for Level 1 admins
        const deleteButton = currentUser.role === 'admin_l1' ? 
            `<button class="btn btn-danger btn-sm ms-2" onclick="deleteLocation('division', ${divisionData.id}, '${divisionName}')" title="Delete Division">
                <i class="bi bi-trash"></i>
            </button>` : '';
        
        html += `
            <div class="mb-3">
                <div class="card border-primary">
                    <div class="card-header bg-light" data-bs-toggle="collapse" data-bs-target="#${divisionId}" style="cursor: pointer;">
                        <div class="d-flex justify-content-between align-items-center">
                            <h6 class="mb-0">
                                <i class="bi bi-building text-primary me-2"></i>
                                ${divisionName} Division
                            </h6>
                            <div class="d-flex align-items-center">
                                <span class="badge bg-primary me-1">${uniqueColonies.length} colonies</span>
                                <span class="badge bg-secondary me-2">${totalBuildings} buildings</span>
                                ${deleteButton}
                            </div>
                        </div>
                    </div>
                    <div class="collapse" id="${divisionId}">
                        <div class="card-body ps-4">
                            ${generateCityQuartersHierarchy(cityGroups, currentUser)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    return html;
}

// Generate city-level hierarchy with quarters
function generateCityQuartersHierarchy(cityGroups, currentUser) {
    return Object.keys(cityGroups).sort().map(cityName => {
        const cityData = cityGroups[cityName];
        const cityId = `loc_city_${cityName.replace(/\s+/g, '_')}`;
        const cityLocations = cityData.colonies;
        
        // Count unique colonies and total buildings
        const uniqueColonies = [...new Set(cityLocations.map(loc => loc.quarter_name))];
        const totalBuildings = cityLocations.length;
        
        // Show delete button for Level 1 and Level 2 admins (with restrictions)
        const canDeleteCity = currentUser.role === 'admin_l1' || 
                             (currentUser.role === 'admin_l2' && currentUser.division_id == cityLocations[0]?.division_id);
        
        const deleteButton = canDeleteCity ? 
            `<button class="btn btn-danger btn-sm ms-2" onclick="deleteLocation('city', ${cityData.id}, '${cityName}')" title="Delete City">
                <i class="bi bi-trash"></i>
            </button>` : '';
        
        return `
            <div class="mb-2">
                <div class="card border-info">
                    <div class="card-header bg-light" data-bs-toggle="collapse" data-bs-target="#${cityId}" style="cursor: pointer;">
                        <div class="d-flex justify-content-between align-items-center">
                            <h6 class="mb-0">
                                <i class="bi bi-geo-alt text-info me-2"></i>
                                ${cityName} City
                            </h6>
                            <div class="d-flex align-items-center">
                                <span class="badge bg-info me-1">${uniqueColonies.length} colonies</span>
                                <span class="badge bg-secondary me-2">${totalBuildings} buildings</span>
                                ${deleteButton}
                            </div>
                        </div>
                    </div>
                    <div class="collapse" id="${cityId}">
                        <div class="card-body ps-4">
                            ${generateQuartersList(cityLocations, currentUser)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Generate quarters/locations list for a city
function generateQuartersList(locations, currentUser) {
    if (locations.length === 0) {
        return '<div class="text-muted small">No colonies found</div>';
    }
    
    // Group locations by colony name
    const colonyGroups = {};
    locations.forEach(location => {
        const colonyName = location.quarter_name;
        if (!colonyGroups[colonyName]) {
            colonyGroups[colonyName] = [];
        }
        colonyGroups[colonyName].push(location);
    });
    
    return Object.keys(colonyGroups).sort().map(colonyName => {
        const colonyItems = colonyGroups[colonyName];
        const buildingCount = colonyItems.length;
        const colonyId = `colony_${colonyName.replace(/\s+/g, '_')}_${Date.now()}_${Math.random()}`;
        
        // Check if user can delete colonies (all admin levels with restrictions)
        const firstColony = colonyItems[0];
        const canDeleteColony = currentUser.role === 'admin_l1' || 
                               (currentUser.role === 'admin_l2' && currentUser.division_id == firstColony.division_id) ||
                               (currentUser.role === 'admin_l3' && currentUser.city_id == firstColony.city_id);
        
        return `
            <div class="mb-2">
                <div class="card border-success">
                    <div class="card-header bg-light" data-bs-toggle="collapse" data-bs-target="#${colonyId}" style="cursor: pointer;">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <strong class="text-success">
                                    <i class="bi bi-house-door me-1"></i>
                                    ${colonyName}
                                </strong>
                            </div>
                            <div class="d-flex align-items-center">
                                <span class="badge bg-success me-2">${buildingCount} buildings</span>
                                ${canDeleteColony ? 
                                    `<button class="btn btn-danger btn-sm" onclick="deleteLocation('colony', ${firstColony.quarter_id}, '${colonyName}')" title="Delete Colony">
                                        <i class="bi bi-trash"></i>
                                    </button>` : ''
                                }
                            </div>
                        </div>
                    </div>
                    <div class="collapse" id="${colonyId}">
                        <div class="card-body ps-4">
                            ${colonyItems.map(location => {
                                // Check if user can delete individual IDs (same rules as colony deletion)
                                const canDeleteID = currentUser.role === 'admin_l1' || 
                                                   (currentUser.role === 'admin_l2' && currentUser.division_id == location.division_id) ||
                                                   (currentUser.role === 'admin_l3' && currentUser.city_id == location.city_id);
                                
                                return `
                                    <div class="d-flex align-items-center justify-content-between mb-2 ps-3">
                                        <div class="d-flex align-items-center">
                                            <span class="text-muted me-2">│</span>
                                            <div class="flex-grow-1">
                                                <span class="badge bg-light text-dark me-2">ID: ${location.quarter_id}</span>
                                                <span class="text-muted small">
                                                    <i class="bi bi-geo-alt-fill me-1"></i>
                                                    ${location.division_name} → ${location.city_name} → ${location.quarter_name}
                                                </span>
                                            </div>
                                        </div>
                                        ${canDeleteID ? `
                                            <button class="btn btn-outline-danger btn-sm ms-2" onclick="deleteLocation('quarter', ${location.quarter_id}, 'ID ${location.quarter_id}')" title="Delete this specific location">
                                                <i class="bi bi-trash"></i>
                                            </button>
                                        ` : ''}
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Location Management Functions
function showAddLocationModal() {
    // Reset form
    document.getElementById('addLocationForm').reset();
    document.getElementById('locationNameField').style.display = 'none';
    document.getElementById('parentDivisionField').style.display = 'none';
    document.getElementById('parentCityField').style.display = 'none';
    
    // Get current user role to determine allowed location types
    const currentUser = sessionStorage.getItem('currentUser');
    if (currentUser) {
        const user = JSON.parse(currentUser);
        const locationTypeSelect = document.getElementById('locationType');
        
        // Clear existing options
        locationTypeSelect.innerHTML = '<option value="">Select Type</option>';
        
        // Add options based on admin level
        if (user.role === 'admin_l1') {
            locationTypeSelect.innerHTML += '<option value="division">Division</option>';
            locationTypeSelect.innerHTML += '<option value="city">City</option>';
            locationTypeSelect.innerHTML += '<option value="colony">Colony</option>';
        } else if (user.role === 'admin_l2') {
            locationTypeSelect.innerHTML += '<option value="city">City</option>';
            locationTypeSelect.innerHTML += '<option value="colony">Colony</option>';
        } else if (user.role === 'admin_l3') {
            locationTypeSelect.innerHTML += '<option value="colony">Colony</option>';
        }
    }
    
    const modal = new bootstrap.Modal(document.getElementById('addLocationModal'));
    modal.show();
}

async function handleLocationTypeChange() {
    const locationType = document.getElementById('locationType').value;
    const nameField = document.getElementById('locationNameField');
    const divisionField = document.getElementById('parentDivisionField');
    const cityField = document.getElementById('parentCityField');
    
    // Hide all fields first
    nameField.style.display = 'none';
    divisionField.style.display = 'none';
    cityField.style.display = 'none';
    
    if (locationType) {
        nameField.style.display = 'block';
        
        if (locationType === 'city') {
            divisionField.style.display = 'block';
            await loadDivisionsForLocation();
        } else if (locationType === 'colony') {
            divisionField.style.display = 'block';
            cityField.style.display = 'block';
            await loadDivisionsForLocation();
        }
    }
}

async function loadDivisionsForLocation() {
    try {
        const response = await fetch('/api/admin/divisions');
        const data = await response.json();
        
        const divisionSelect = document.getElementById('parentDivision');
        divisionSelect.innerHTML = '<option value="">Select Division</option>';
        
        data.divisions.forEach(division => {
            divisionSelect.innerHTML += `<option value="${division.id}">${division.name}</option>`;
        });
    } catch (error) {
        console.error('Error loading divisions:', error);
        showAlert('danger', 'Failed to load divisions');
    }
}

async function loadCitiesForNewLocation() {
    const divisionId = document.getElementById('parentDivision').value;
    if (!divisionId) return;
    
    try {
        const response = await fetch(`/api/admin/cities?division_id=${divisionId}`);
        const data = await response.json();
        
        const citySelect = document.getElementById('parentCity');
        citySelect.innerHTML = '<option value="">Select City</option>';
        
        data.cities.forEach(city => {
            citySelect.innerHTML += `<option value="${city.id}">${city.name}</option>`;
        });
    } catch (error) {
        console.error('Error loading cities:', error);
        showAlert('danger', 'Failed to load cities');
    }
}

async function saveLocation() {
    const locationType = document.getElementById('locationType').value;
    const locationName = document.getElementById('locationName').value.trim();
    
    if (!locationType || !locationName) {
        showAlert('danger', 'Please fill in all required fields');
        return;
    }
    
    let endpoint = '';
    let payload = { name: locationName };
    
    if (locationType === 'division') {
        endpoint = '/api/admin/divisions';
    } else if (locationType === 'city') {
        const divisionId = document.getElementById('parentDivision').value;
        if (!divisionId) {
            showAlert('danger', 'Please select a division');
            return;
        }
        endpoint = '/api/admin/cities';
        payload.division_id = divisionId;
    } else if (locationType === 'colony') {
        const cityId = document.getElementById('parentCity').value;
        if (!cityId) {
            showAlert('danger', 'Please select a city');
            return;
        }
        endpoint = '/api/admin/colonies';
        payload.city_id = cityId;
    }
    
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showAlert('success', data.message);
            bootstrap.Modal.getInstance(document.getElementById('addLocationModal')).hide();
            loadLocations(); // Refresh locations display
        } else {
            showAlert('danger', data.error || 'Failed to add location');
        }
    } catch (error) {
        console.error('Error adding location:', error);
        showAlert('danger', 'Failed to add location');
    }
}

async function deleteLocation(type, id, name) {
    if (!confirm(`Are you sure you want to delete this ${type}: ${name}?`)) {
        return;
    }
    
    try {
        const endpoint = `/api/admin/${type}s/${id}`;
        const response = await fetch(endpoint, { method: 'DELETE' });
        const data = await response.json();
        
        if (response.ok) {
            showAlert('success', data.message);
            loadLocations(); // Refresh locations display
        } else {
            showAlert('danger', data.error || `Failed to delete ${type}`);
        }
    } catch (error) {
        console.error(`Error deleting ${type}:`, error);
        showAlert('danger', `Failed to delete ${type}`);
    }
}

// View request details in a modal
async function viewRequest(requestId) {
    console.log('👀 Viewing request details for ID:', requestId);
    showLoading(true);
    
    try {
        const response = await fetch(`/api/admin/requests/${requestId}`, {
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Request not found');
            }
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log('📋 Request data received:', data);
        
        showRequestDetailsModal(data.request, data.history);
        
    } catch (error) {
        console.error('❌ Error viewing request:', error);
        showAlert('danger', `Failed to load request details: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// Show request details in a modal
function showRequestDetailsModal(request, history = []) {
    const contentHtml = `
        <div class="row">
            <div class="col-md-6">
                <div class="card">
                    <div class="card-header bg-light">
                        <h6 class="mb-0"><i class="bi bi-person me-2"></i>Request Information</h6>
                    </div>
                    <div class="card-body">
                        <div class="mb-3">
                            <label class="form-label"><strong>Request ID:</strong></label>
                            <p class="mb-1">#${request.id}</p>
                        </div>
                        <div class="mb-3">
                            <label class="form-label"><strong>Name:</strong></label>
                            <p class="mb-1">${request.name || request.user_name || 'N/A'}</p>
                        </div>
                        <div class="mb-3">
                            <label class="form-label"><strong>Employee ID:</strong></label>
                            <p class="mb-1">${request.employee_id || 'N/A'}</p>
                        </div>
                        <div class="mb-3">
                            <label class="form-label"><strong>Email:</strong></label>
                            <p class="mb-1">${request.email || request.user_email || 'N/A'}</p>
                        </div>
                        <div class="mb-3">
                            <label class="form-label"><strong>Phone:</strong></label>
                            <p class="mb-1">${request.phone || request.user_phone || 'N/A'}</p>
                        </div>
                        <div class="mb-3">
                            <label class="form-label"><strong>Designation:</strong></label>
                            <p class="mb-1">${request.designation || request.user_designation || 'N/A'}</p>
                        </div>
                        <div class="mb-3">
                            <label class="form-label"><strong>Status:</strong></label>
                            <p class="mb-1"><span class="badge ${getStatusBadgeClass(request.status)}">${request.status || 'Pending'}</span></p>
                        </div>
                        <div class="mb-3">
                            <label class="form-label"><strong>Priority:</strong></label>
                            <p class="mb-1"><span class="badge ${getPriorityBadgeClass(request.priority)}">${request.priority || 'Normal'}</span></p>
                        </div>
                        <div class="mb-3">
                            <label class="form-label"><strong>Created:</strong></label>
                            <p class="mb-1">${request.created_at ? formatDate(request.created_at) : 'N/A'}</p>
                        </div>
                        ${request.updated_at ? `
                        <div class="mb-3">
                            <label class="form-label"><strong>Last Updated:</strong></label>
                            <p class="mb-1">${formatDate(request.updated_at)}</p>
                        </div>
                        ` : ''}
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="card">
                    <div class="card-header bg-light">
                        <h6 class="mb-0"><i class="bi bi-geo-alt me-2"></i>Location & Department</h6>
                    </div>
                    <div class="card-body">
                        <div class="mb-3">
                            <label class="form-label"><strong>Division:</strong></label>
                            <p class="mb-1">${request.division_name || 'N/A'}</p>
                        </div>
                        <div class="mb-3">
                            <label class="form-label"><strong>City:</strong></label>
                            <p class="mb-1">${request.city_name || 'N/A'}</p>
                        </div>
                        <div class="mb-3">
                            <label class="form-label"><strong>Department:</strong></label>
                            <p class="mb-1">${request.department_name || 'N/A'}</p>
                        </div>
                        <div class="mb-3">
                            <label class="form-label"><strong>Location:</strong></label>
                            <p class="mb-1">${request.location || 'N/A'}</p>
                        </div>
                        ${request.address ? `
                        <div class="mb-3">
                            <label class="form-label"><strong>Address:</strong></label>
                            <p class="mb-1">${request.address}</p>
                        </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>
        
        <div class="card mt-3">
            <div class="card-header bg-light">
                <h6 class="mb-0"><i class="bi bi-chat-text me-2"></i>Description</h6>
            </div>
            <div class="card-body">
                <p class="mb-0">${request.description || 'No description provided'}</p>
            </div>
        </div>
        
        ${history && history.length > 0 ? `
        <div class="card mt-3">
            <div class="card-header bg-light">
                <h6 class="mb-0"><i class="bi bi-clock-history me-2"></i>Assignment History</h6>
            </div>
            <div class="card-body">
                <div class="timeline">
                    ${history.map(item => `
                        <div class="timeline-item mb-3 pb-3 border-bottom">
                            <div class="d-flex">
                                <div class="flex-shrink-0">
                                    <i class="bi bi-person-circle text-primary fs-4"></i>
                                </div>
                                <div class="flex-grow-1 ms-3">
                                    <div class="d-flex justify-content-between">
                                        <h6 class="mb-1">Assigned to: ${item.supervisor_name || 'Unknown'}</h6>
                                        <small class="text-muted">${item.created_at ? formatDate(item.created_at) : 'N/A'}</small>
                                    </div>
                                    <p class="mb-1 text-muted">${item.supervisor_email || 'No email'}</p>
                                    ${item.status ? `<span class="badge ${getStatusBadgeClass(item.status)} me-2">${item.status}</span>` : ''}
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
        ` : ''}
        
        ${request.image_path ? `
        <div class="card mt-3">
            <div class="card-header bg-light">
                <h6 class="mb-0"><i class="bi bi-image me-2"></i>Attached Image</h6>
            </div>
            <div class="card-body text-center">
                <img src="/uploads/${request.image_path}" alt="Request Image" class="img-fluid rounded" style="max-height: 300px;">
            </div>
        </div>
        ` : ''}
    `;
    
    // Update the modal title
    const modalTitle = document.querySelector('#requestDetailsModal .modal-title');
    if (modalTitle) {
        modalTitle.innerHTML = `<i class="bi bi-file-text"></i> Request #${request.id} Details`;
    }
    
    // Update the modal content
    const modalContent = document.getElementById('requestDetailsContent');
    if (modalContent) {
        modalContent.innerHTML = contentHtml;
    }
    
    // Show the modal
    const modal = new bootstrap.Modal(document.getElementById('requestDetailsModal'));
    modal.show();
}

// Helper function to get priority badge class
function getPriorityBadgeClass(priority) {
    switch(priority?.toLowerCase()) {
        case 'high': return 'bg-danger';
        case 'medium': return 'bg-warning text-dark';
        case 'low': return 'bg-success';
        default: return 'bg-secondary';
    }
}

// Helper function to update request status
async function updateRequestStatus(requestId, newStatus) {
    console.log(`🔄 Updating request ${requestId} status to ${newStatus}`);
    showLoading(true);
    
    try {
        const response = await fetch(`/api/admin/requests/${requestId}/status`, {
            method: 'PUT',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ status: newStatus })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log('  Status updated successfully');
        showAlert('success', `Request status updated to ${newStatus}`);
        
        // Close modal and refresh the requests list
        const modal = bootstrap.Modal.getInstance(document.getElementById('requestDetailsModal'));
        modal.hide();
        
        // Refresh requests list
        loadRequests();
        
    } catch (error) {
        console.error('❌ Error updating status:', error);
        showAlert('danger', `Failed to update status: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// Make functions global for inline onclick handlers
window.deleteSupervisor = deleteSupervisor;
window.saveSupervisor = saveSupervisor;
window.loadRequests = loadRequests;
window.loadPendingAssignments = loadPendingAssignments;
window.assignItem = assignItem;
window.assignSupervisorToHierarchy = assignSupervisorToHierarchy;
window.loadSupervisors = loadSupervisors;
window.loadLocations = loadLocations;
window.showActiveSupervisors = showActiveSupervisors;
window.showAllSupervisors = showAllSupervisors;
window.toggleSupervisorStatus = toggleSupervisorStatus;
window.handleRoleChange = handleRoleChange;
window.loadCitiesForDivision = loadCitiesForDivision;
window.showAddLocationModal = showAddLocationModal;
window.handleLocationTypeChange = handleLocationTypeChange;
window.loadCitiesForNewLocation = loadCitiesForNewLocation;
window.saveLocation = saveLocation;
window.deleteLocation = deleteLocation;
window.filterByStatus = filterByStatus;
window.changePage = changePage;
window.changePendingPage = changePendingPage;
window.applyFilters = applyFilters;
window.clearFilters = clearFilters;
window.applyPendingFilters = applyPendingFilters;
window.clearPendingFilters = clearPendingFilters;
window.filterPendingByType = filterPendingByType;
window.assignRequest = assignRequest;
window.reassignRequest = reassignRequest;

// Test function to manually update status cards with test data
window.testStatusCards = function() {
    console.log('🧪 Testing status cards with hardcoded values...');
    const testData = {
        total: 76,
        statuses: {
            'Pending': 52,
            'Not Operable': 13,
            'Resolved': 9,
            'Forwarded to Other Department': 2
        }
    };
    updateStatusCards(testData);
    console.log('🧪 Test data applied to status cards');
};
window.viewRequest = viewRequest;
window.updateRequestStatus = updateRequestStatus;

// ===== ANALYTICS FUNCTIONS =====

// Load analytics data and filters
async function loadAnalytics() {
    console.log('📊 Loading analytics...');
    showLoading(true);
    
    if (!isAuthenticated) {
        showAlert('danger', 'Not authenticated');
        return;
    }
    
    try {
        // Load filter options first
        await loadAnalyticsFilterOptions();
        
        // Then load default analytics
        await applyAnalyticsFilters();
        
    } catch (error) {
        console.error('❌ Error loading analytics:', error);
        showAlert('danger', 'Failed to load analytics');
    } finally {
        showLoading(false);
    }
}

// Load filter options for analytics
async function loadAnalyticsFilterOptions() {
    console.log('📊 Loading analytics filter options...');
    
    try {
        const response = await fetch('/api/admin/analytics/filter-options', {
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log('📊 Analytics filter options received:', data);
        
        // Populate division filter
        const divisionSelect = document.getElementById('analyticsDivision');
        divisionSelect.innerHTML = '<option value="">All Divisions</option>';
        data.divisions.forEach(division => {
            divisionSelect.innerHTML += `<option value="${division.id}">${division.name}</option>`;
        });
        
        // Populate department filter
        const departmentSelect = document.getElementById('analyticsDepartment');
        departmentSelect.innerHTML = '<option value="">All Departments</option>';
        data.departments.forEach(dept => {
            departmentSelect.innerHTML += `<option value="${dept.id}">${dept.name}</option>`;
        });
        
        // Set up division change handler for cities
        divisionSelect.addEventListener('change', async function() {
            const citySelect = document.getElementById('analyticsCity');
            citySelect.innerHTML = '<option value="">All Cities</option>';
            
            if (this.value) {
                const cities = data.cities.filter(city => city.division_id == this.value);
                cities.forEach(city => {
                    citySelect.innerHTML += `<option value="${city.id}">${city.name}</option>`;
                });
            }
        });
        
    } catch (error) {
        console.error('❌ Error loading analytics filter options:', error);
        throw error;
    }
}

// Apply analytics filters and load data
async function applyAnalyticsFilters() {
    console.log('📊 Applying analytics filters...');
    showLoading(true);
    
    try {
        const filters = {
            timePeriod: document.getElementById('analyticsTimePeriod').value,
            division: document.getElementById('analyticsDivision').value,
            city: document.getElementById('analyticsCity').value,
            department: document.getElementById('analyticsDepartment').value
        };
        
        console.log('Applied filters:', filters);
        
        const queryParams = new URLSearchParams();
        Object.keys(filters).forEach(key => {
            if (filters[key]) {
                queryParams.append(key, filters[key]);
            }
        });
        
        const response = await fetch(`/api/admin/analytics/performance?${queryParams}`, {
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log('📊 Analytics data received:', data);
        
        // Display analytics content
        displayAnalyticsData(data, filters);
        
    } catch (error) {
        console.error('❌ Error applying analytics filters:', error);
        showAlert('danger', 'Failed to load analytics data');
        document.getElementById('analyticsContent').innerHTML = `
            <div class="alert alert-danger">
                <i class="bi bi-exclamation-triangle"></i> Error loading analytics: ${error.message}
            </div>
        `;
    } finally {
        showLoading(false);
    }
}

// Clear analytics filters
function clearAnalyticsFilters() {
    document.getElementById('analyticsTimePeriod').value = '30';
    document.getElementById('analyticsDivision').value = '';
    document.getElementById('analyticsCity').innerHTML = '<option value="">All Cities</option>';
    document.getElementById('analyticsDepartment').value = '';
    
    // Reload analytics with cleared filters
    applyAnalyticsFilters();
}

// Display analytics data in structured format
function displayAnalyticsData(data, filters) {
    const analyticsContent = document.getElementById('analyticsContent');
    
    const html = `
        <!-- Performance Summary Cards -->
        <div class="row mb-4">
            <div class="col-md-3">
                <div class="card bg-primary text-white">
                    <div class="card-body text-center">
                        <i class="bi bi-list-task display-6"></i>
                        <h4 class="mt-2">${data.summary.totalRequests}</h4>
                        <p class="mb-0">Total Requests</p>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card bg-success text-white">
                    <div class="card-body text-center">
                        <i class="bi bi-check-circle display-6"></i>
                        <h4 class="mt-2">${data.summary.completedRequests}</h4>
                        <p class="mb-0">Resolved</p>
                        <small>(${data.summary.completionRate}%)</small>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card bg-warning text-white">
                    <div class="card-body text-center">
                        <i class="bi bi-clock display-6"></i>
                        <h4 class="mt-2">${data.summary.avgResolutionTime}</h4>
                        <p class="mb-0">Avg Resolution</p>
                        <small>Days</small>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card bg-info text-white">
                    <div class="card-body text-center">
                        <i class="bi bi-people display-6"></i>
                        <h4 class="mt-2">${data.summary.activeSupervisors}</h4>
                        <p class="mb-0">Active Supervisors</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Supervisor Performance Analysis -->
        <div class="card mb-4">
            <div class="card-header">
                <h5 class="mb-0">
                    <i class="bi bi-person-gear"></i> Supervisor Performance Analysis
                </h5>
            </div>
            <div class="card-body">
                ${generateSupervisorPerformanceTable(data.supervisorPerformance)}
            </div>
        </div>

        <!-- Location Performance Analysis -->
        <div class="card mb-4">
            <div class="card-header">
                <h5 class="mb-0">
                    <i class="bi bi-geo-alt-fill"></i> Location Performance Analysis
                </h5>
            </div>
            <div class="card-body">
                ${generateLocationPerformanceAnalysis(data.locationPerformance)}
            </div>
        </div>

        <!-- Contract Work Recommendations -->
        <div class="card mb-4">
            <div class="card-header">
                <h5 class="mb-0">
                    <i class="bi bi-briefcase"></i> Contract Work Recommendations
                </h5>
            </div>
            <div class="card-body">
                ${generateContractWorkRecommendations(data.contractRecommendations)}
            </div>
        </div>

        <!-- Department Analysis -->
        <div class="card mb-4">
            <div class="card-header">
                <h5 class="mb-0">
                    <i class="bi bi-building"></i> Department Analysis
                </h5>
            </div>
            <div class="card-body">
                ${generateDepartmentAnalysis(data.departmentAnalysis)}
            </div>
        </div>
    `;
    
    analyticsContent.innerHTML = html;
}

// Generate supervisor performance table
function generateSupervisorPerformanceTable(supervisors) {
    if (!supervisors || supervisors.length === 0) {
        return '<div class="alert alert-info">No supervisor performance data available for the selected filters.</div>';
    }
    
    let html = `
        <div class="table-responsive">
            <table class="table table-hover">
                <thead class="table-dark">
                    <tr>
                        <th>Supervisor</th>
                        <th>Location</th>
                        <th>Total Requests</th>
                        <th>Resolved</th>
                        <th>Success Rate</th>
                        <th>Avg Resolution</th>
                        <th>Performance Rating</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    supervisors.forEach(supervisor => {
        const performanceClass = supervisor.rating >= 4 ? 'success' : supervisor.rating >= 3 ? 'warning' : 'danger';
        const ratingStars = '★'.repeat(Math.floor(supervisor.rating)) + '☆'.repeat(5 - Math.floor(supervisor.rating));
        
        html += `
            <tr>
                <td>
                    <strong>${supervisor.name}</strong>
                    <br><small class="text-muted">${supervisor.department}</small>
                </td>
                <td>
                    <small>
                        ${supervisor.division}<br>
                        ${supervisor.city}<br>
                        <span class="text-muted">${supervisor.colony || 'Multiple'}</span>
                    </small>
                </td>
                <td><span class="badge bg-primary">${supervisor.totalRequests}</span></td>
                <td><span class="badge bg-success">${supervisor.completedRequests}</span></td>
                <td>
                    <div class="progress" style="height: 20px;">
                        <div class="progress-bar bg-${performanceClass}" style="width: ${supervisor.successRate}%">
                            ${supervisor.successRate}%
                        </div>
                    </div>
                </td>
                <td><span class="badge bg-info">${supervisor.avgResolution} days</span></td>
                <td>
                    <span class="badge bg-${performanceClass}">
                        ${ratingStars} (${supervisor.rating}/5)
                    </span>
                </td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    return html;
}

// Generate location performance analysis
function generateLocationPerformanceAnalysis(locations) {
    if (!locations || locations.length === 0) {
        return '<div class="alert alert-info">No location performance data available for the selected filters.</div>';
    }
    
    let html = `
        <div class="row">
    `;
    
    locations.forEach(location => {
        const efficiencyClass = location.efficiency >= 80 ? 'success' : location.efficiency >= 60 ? 'warning' : 'danger';
        const recommendationClass = location.needsImprovement ? 'warning' : 'success';
        
        html += `
            <div class="col-md-6 col-lg-4 mb-3">
                <div class="card border-${efficiencyClass}">
                    <div class="card-header bg-${efficiencyClass} text-white">
                        <h6 class="mb-0">${location.name}</h6>
                        <small>${location.type}: ${location.parent}</small>
                    </div>
                    <div class="card-body">
                        <div class="mb-2">
                            <small class="text-muted">Efficiency Score</small>
                            <div class="progress">
                                <div class="progress-bar bg-${efficiencyClass}" style="width: ${location.efficiency}%">
                                    ${location.efficiency}%
                                </div>
                            </div>
                        </div>
                        <div class="row text-center">
                            <div class="col-4">
                                <small class="text-muted">Requests</small>
                                <div class="fw-bold">${location.totalRequests}</div>
                            </div>
                            <div class="col-4">
                                <small class="text-muted">Resolved</small>
                                <div class="fw-bold text-success">${location.completedRequests}</div>
                            </div>
                            <div class="col-4">
                                <small class="text-muted">Avg Days</small>
                                <div class="fw-bold">${location.avgResolution}</div>
                            </div>
                        </div>
                        ${location.needsImprovement ? `
                            <div class="alert alert-${recommendationClass} mt-2 py-1 px-2">
                                <small><i class="bi bi-exclamation-triangle"></i> Needs attention</small>
                            </div>
                        ` : `
                            <div class="alert alert-${recommendationClass} mt-2 py-1 px-2">
                                <small><i class="bi bi-check-circle"></i> Performing well</small>
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;
    });
    
    html += `
        </div>
    `;
    
    return html;
}

// Generate contract work recommendations
function generateContractWorkRecommendations(recommendations) {
    if (!recommendations || recommendations.length === 0) {
        return '<div class="alert alert-info">No contract work recommendations available for the selected filters.</div>';
    }
    
    let html = `
        <div class="alert alert-info mb-3">
            <i class="bi bi-info-circle"></i> 
            <strong>Analysis:</strong> Locations with low request volumes or specialized requirements may benefit from contract-based work rather than dedicated supervisors.
        </div>
    `;
    
    recommendations.forEach(rec => {
        const priorityClass = rec.priority === 'High' ? 'danger' : rec.priority === 'Medium' ? 'warning' : 'success';
        
        html += `
            <div class="card mb-3 border-${priorityClass}">
                <div class="card-header">
                    <div class="d-flex justify-content-between align-items-center">
                        <h6 class="mb-0">${rec.location}</h6>
                        <span class="badge bg-${priorityClass}">${rec.priority} Priority</span>
                    </div>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-8">
                            <p class="mb-2"><strong>Recommendation:</strong> ${rec.recommendation}</p>
                            <p class="mb-2"><strong>Reason:</strong> ${rec.reason}</p>
                            <div class="row">
                                <div class="col-sm-6">
                                    <small class="text-muted">Current Requests/Month:</small>
                                    <div class="fw-bold">${rec.currentWorkload}</div>
                                </div>
                                <div class="col-sm-6">
                                    <small class="text-muted">Estimated Cost Savings:</small>
                                    <div class="fw-bold text-success">${rec.costSavings}</div>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="card bg-light">
                                <div class="card-body py-2">
                                    <small class="text-muted">Suggested Action</small>
                                    <div class="fw-bold">${rec.suggestedAction}</div>
                                    <small class="text-muted mt-1">Timeline: ${rec.timeline}</small>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    return html;
}

// Generate department analysis
function generateDepartmentAnalysis(departments) {
    if (!departments || departments.length === 0) {
        return '<div class="alert alert-info">No department analysis data available for the selected filters.</div>';
    }
    
    let html = `
        <div class="row">
    `;
    
    departments.forEach(dept => {
        const performanceClass = dept.performance >= 80 ? 'success' : dept.performance >= 60 ? 'warning' : 'danger';
        
        html += `
            <div class="col-md-6 mb-3">
                <div class="card">
                    <div class="card-header">
                        <h6 class="mb-0">${dept.name}</h6>
                    </div>
                    <div class="card-body">
                        <div class="row text-center mb-3">
                            <div class="col-3">
                                <small class="text-muted">Requests</small>
                                <div class="fw-bold">${dept.totalRequests}</div>
                            </div>
                            <div class="col-3">
                                <small class="text-muted">Resolved</small>
                                <div class="fw-bold text-success">${dept.completedRequests}</div>
                            </div>
                            <div class="col-3">
                                <small class="text-muted">Avg Days</small>
                                <div class="fw-bold">${dept.avgResolution}</div>
                            </div>
                            <div class="col-3">
                                <small class="text-muted">Supervisors</small>
                                <div class="fw-bold">${dept.supervisorCount}</div>
                            </div>
                        </div>
                        <div class="mb-2">
                            <small class="text-muted">Department Performance</small>
                            <div class="progress">
                                <div class="progress-bar bg-${performanceClass}" style="width: ${dept.performance}%">
                                    ${dept.performance}%
                                </div>
                            </div>
                        </div>
                        <div class="alert alert-light py-1 px-2">
                            <small><strong>Top Issues:</strong> ${dept.topIssues.join(', ')}</small>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += `
        </div>
    `;
    
    return html;
}

// Make analytics functions globally available
window.loadAnalytics = loadAnalytics;
window.applyAnalyticsFilters = applyAnalyticsFilters;
window.clearAnalyticsFilters = clearAnalyticsFilters;

// ==============================================
// AI ADVANCED ANALYTICS FUNCTIONS
// ==============================================

// Example queries for AI Analytics
const analyticsExamples = {
    performance1: "Rank all supervisors by their request resolution rate and average time to complete requests. Show which supervisors are most efficient and identify any performance gaps.",
    performance2: "Compare the efficiency of different departments in handling maintenance requests. Include metrics like average resolution time, success rate, and total requests handled.",
    performance3: "Analyze the time it takes to resolve different types of maintenance requests. Identify which types take longest and suggest optimization opportunities.",
    trend1: "Show the monthly trend of maintenance request volume over the past year. Identify seasonal patterns and predict future request volumes.",
    trend2: "Analyze seasonal maintenance patterns by request type and location. Show which types of issues occur more frequently in different seasons.",
    trend3: "Examine the geographic distribution of maintenance requests across divisions and cities. Identify hotspots and areas that need more attention."
};

// Show/hide analytics examples
function showAnalyticsExamples() {
    const examplesDiv = document.getElementById('analyticsExamples');
    if (examplesDiv.style.display === 'none') {
        examplesDiv.style.display = 'block';
    } else {
        examplesDiv.style.display = 'none';
    }
}

// Set example query in the textarea
function setExampleQuery(exampleKey) {
    const textarea = document.getElementById('aiAnalyticsPrompt');
    if (analyticsExamples[exampleKey]) {
        textarea.value = analyticsExamples[exampleKey];
        
        // Auto-select appropriate analysis type
        const typeSelect = document.getElementById('aiAnalyticsType');
        if (exampleKey.startsWith('performance')) {
            typeSelect.value = 'performance';
        } else if (exampleKey.startsWith('trend')) {
            typeSelect.value = 'trend';
        }
        
        // Hide examples after selection
        document.getElementById('analyticsExamples').style.display = 'none';
        
        // Focus on the textarea
        textarea.focus();
    }
}

// Generate AI Analytics
async function generateAIAnalytics() {
    const prompt = document.getElementById('aiAnalyticsPrompt').value.trim();
    const analysisType = document.getElementById('aiAnalyticsType').value;
    const timeRange = document.getElementById('aiAnalyticsTimeRange').value;
    
    if (!prompt) {
        showAlert('warning', 'Please enter a description of what you want to analyze.');
        return;
    }
    
    // Show loading state
    const generateBtn = document.getElementById('generateAnalyticsBtn');
    const originalBtnText = generateBtn.innerHTML;
    generateBtn.disabled = true;
    generateBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Generating...';
    
    const resultsCard = document.getElementById('aiAnalyticsResults');
    const loadingDiv = document.getElementById('aiAnalyticsLoading');
    const contentDiv = document.getElementById('aiAnalyticsContent');
    
    resultsCard.style.display = 'block';
    loadingDiv.style.display = 'block';
    contentDiv.innerHTML = '';
    
    try {
        // Detect if the query mentions a specific division
        const divisionMentioned = extractDivisionFromQuery(prompt);
        
        // Prepare the AI context with current system data
        const systemContext = await getSystemContextForAI(divisionMentioned);
        
        // Construct the AI prompt for analytics
        const aiPrompt = `
        As a data analyst for the Railway Maintenance Portal (RAMP), analyze the following request:
        
        **Analysis Request:** ${prompt}
        
        **Analysis Type:** ${analysisType}
        **Time Range:** ${timeRange === 'all' ? 'All available data' : `Last ${timeRange} days`}
        ${divisionMentioned ? `**Specific Division Filter:** ${divisionMentioned}` : ''}
        
        **Current System Data:**
        ${systemContext}
        
        IMPORTANT INSTRUCTIONS:
        - If a specific division (like "Ajmer") is mentioned in the query, focus your analysis on that division's data only
        - Always provide specific department names with exact complaint counts
        - Show the department with maximum complaints clearly
        - Include reasoning for why that department has the most complaints
        
        Please provide:
        1. **Executive Summary** - Key findings in 2-3 bullet points
        2. **Department Analysis** - Which department has maximum complaints and why
        3. **Detailed Breakdown** - Specific numbers for each department
        4. **Insights & Recommendations** - Actionable recommendations
        
        Format your response with clear headings and bullet points for easy reading.
        `;
        
        // Call AI Assistant API
        const response = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                question: aiPrompt,
                context: `AI Analytics Request - Analysis Type: ${analysisType}, Time Range: ${timeRange} days`
            })
        });
        
        const data = await response.json();
        
        loadingDiv.style.display = 'none';
        
        if (data.success) {
            displayAIAnalyticsResults(data.response, analysisType, timeRange);
        } else {
            contentDiv.innerHTML = `
                <div class="alert alert-danger">
                    <i class="bi bi-exclamation-triangle"></i> 
                    <strong>Error:</strong> ${data.message || 'Failed to generate analytics'}
                </div>
            `;
        }
        
    } catch (error) {
        console.error('AI Analytics error:', error);
        loadingDiv.style.display = 'none';
        contentDiv.innerHTML = `
            <div class="alert alert-danger">
                <i class="bi bi-exclamation-triangle"></i> 
                <strong>Error:</strong> Unable to connect to AI service. Please try again.
            </div>
        `;
    } finally {
        generateBtn.disabled = false;
        generateBtn.innerHTML = originalBtnText;
    }
}

// Get system context for AI analytics
async function getSystemContextForAI() {
    try {
        // Get current system statistics
        const statsResponse = await fetch('/api/admin/dashboard-stats');
        
        if (!statsResponse.ok) {
            throw new Error(`HTTP ${statsResponse.status}: ${statsResponse.statusText}`);
        }
        
        const stats = await statsResponse.json();
        
        let context = 'CURRENT SYSTEM STATUS:\n';
        context += `- Total Requests: ${stats.totalRequests || 0}\n`;
        
        // Status distribution
        if (stats.statusDistribution && stats.statusDistribution.length > 0) {
            context += `- Request Status Distribution:\n`;
            stats.statusDistribution.forEach(status => {
                context += `  * ${status.status}: ${status.count} requests\n`;
            });
        }
        
        // Department distribution (most important for department analysis)
        if (stats.departmentDistribution && stats.departmentDistribution.length > 0) {
            context += `- Department Complaint Distribution:\n`;
            stats.departmentDistribution.forEach(dept => {
                context += `  * ${dept.department}: ${dept.count} complaints\n`;
            });
        }

        // Division distribution  
        if (stats.divisionDistribution && stats.divisionDistribution.length > 0) {
            context += `- Division Distribution:\n`;
            stats.divisionDistribution.forEach(division => {
                context += `  * ${division.division_name}: ${division.count} requests\n`;
            });
        }

        // Top locations
        if (stats.locationDistribution && stats.locationDistribution.length > 0) {
            context += `- Top Request Locations:\n`;
            stats.locationDistribution.slice(0, 5).forEach(location => {
                context += `  * ${location.location}: ${location.count} requests\n`;
            });
        }
        
        // User context (current admin level and location)
        if (stats.userContext) {
            context += `\nCURRENT USER CONTEXT:\n`;
            context += `- Admin Level: ${stats.userContext.level}\n`;
            if (stats.userContext.division) {
                context += `- Division: ${stats.userContext.division}\n`;
            }
            if (stats.userContext.location) {
                context += `- Location: ${stats.userContext.location}\n`;
            }
        }
        
        // Recent activity
        if (stats.recentActivity && stats.recentActivity.length > 0) {
            context += `- Recent Activity (Last 7 days):\n`;
            stats.recentActivity.slice(0, 7).forEach(activity => {
                context += `  * ${activity.date}: ${activity.count} requests\n`;
            });
        }
        
        // User context
        if (stats.userContext) {
            context += `- Analysis Scope: ${stats.userContext.level} level`;
            if (stats.userContext.location) {
                context += ` (${stats.userContext.location})`;
            }
            if (stats.userContext.division) {
                context += ` - ${stats.userContext.division} Division`;
            }
            context += `\n`;
        }
        
        context += '\nNote: Provide analysis based on typical railway maintenance patterns and best practices.';
        
        return context;
    } catch (error) {
        console.error('Error getting system context:', error);
        return `System context error: ${error.message}. Please provide general railway maintenance analytics guidance based on the user's query.`;
    }
}

// Display AI Analytics Results
function displayAIAnalyticsResults(response, analysisType, timeRange) {
    const contentDiv = document.getElementById('aiAnalyticsContent');
    
    // Format the AI response with better styling
    const formattedResponse = formatAIAnalyticsResponse(response);
    
    contentDiv.innerHTML = `
        <div class="analytics-metadata mb-3">
            <div class="row">
                <div class="col-md-6">
                    <small class="text-muted">
                        <i class="bi bi-clock"></i> Generated: ${new Date().toLocaleString()}
                    </small>
                </div>
                <div class="col-md-6 text-end">
                    <small class="text-muted">
                        <i class="bi bi-gear"></i> Analysis Type: ${analysisType} | Time Range: ${timeRange} days
                    </small>
                </div>
            </div>
        </div>
        
        <div class="ai-analytics-response">
            ${formattedResponse}
        </div>
        
        <div class="mt-4 p-3 bg-light rounded">
            <h6><i class="bi bi-info-circle"></i> About this Analysis</h6>
            <p class="mb-0 small text-muted">
                This analysis was generated by AI based on your current RAMP system data and railway maintenance best practices. 
                Use these insights to guide decision-making, but always verify important findings with detailed data analysis.
            </p>
        </div>
    `;
    
    // Add custom CSS for analytics styling
    if (!document.getElementById('ai-analytics-styles')) {
        const style = document.createElement('style');
        style.id = 'ai-analytics-styles';
        style.textContent = `
            .ai-analytics-response h1, .ai-analytics-response h2, 
            .ai-analytics-response h3, .ai-analytics-response h4,
            .ai-analytics-response h5, .ai-analytics-response h6 {
                color: #0d6efd;
                margin-top: 1.5rem;
                margin-bottom: 0.75rem;
            }
            
            .ai-analytics-response ul, .ai-analytics-response ol {
                margin-left: 1.5rem;
            }
            
            .ai-analytics-response li {
                margin-bottom: 0.5rem;
            }
            
            .ai-analytics-response strong {
                color: #495057;
            }
            
            .ai-analytics-response p {
                margin-bottom: 1rem;
                line-height: 1.6;
            }
            
            .analytics-metadata {
                border-bottom: 1px solid #dee2e6;
                padding-bottom: 0.75rem;
            }
        `;
        document.head.appendChild(style);
    }
}

// Format AI response for better display
function formatAIAnalyticsResponse(response) {
    // Convert markdown-like formatting to HTML
    let formatted = response
        // Headers
        .replace(/^### (.*$)/gm, '<h5>$1</h5>')
        .replace(/^## (.*$)/gm, '<h4>$1</h4>')
        .replace(/^# (.*$)/gm, '<h3>$1</h3>')
        
        // Bold and italic
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        
        // Lists
        .replace(/^\s*[-*]\s+(.*$)/gm, '<li>$1</li>')
        .replace(/^\s*\d+\.\s+(.*$)/gm, '<li>$1</li>')
        
        // Line breaks
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');
    
    // Wrap list items in proper ul tags
    formatted = formatted.replace(/(<li>.*?<\/li>)(\s*<li>.*?<\/li>)*/g, function(match) {
        return '<ul>' + match + '</ul>';
    });
    
    // Wrap in paragraphs if not already wrapped
    if (!formatted.includes('<p>')) {
        formatted = '<p>' + formatted + '</p>';
    }
    
    return formatted;
}

// Clear AI Analytics
function clearAIAnalytics() {
    document.getElementById('aiAnalyticsPrompt').value = '';
    document.getElementById('aiAnalyticsType').value = 'trend';
    document.getElementById('aiAnalyticsTimeRange').value = '30';
    document.getElementById('aiAnalyticsResults').style.display = 'none';
    document.getElementById('analyticsExamples').style.display = 'none';
}

// Export AI Analytics (placeholder)
function exportAIAnalytics() {
    const content = document.getElementById('aiAnalyticsContent').innerText;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RAMP-AI-Analytics-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showAlert('success', 'Analytics report exported successfully!');
}

// Save AI Analytics (placeholder)
function saveAIAnalytics() {
    // In a real implementation, this would save to a database
    showAlert('info', 'Analytics save functionality will be implemented in a future update.');
}

// Extract division name from user query
function extractDivisionFromQuery(query) {
    const queryLower = query.toLowerCase();
    
    // Common division names in railway system
    const divisions = [
        'ajmer', 'jaipur', 'jodhpur', 'bikaner', 'udaipur',
        'kota', 'bharatpur', 'sikar', 'churu', 'alwar'
    ];
    
    for (const division of divisions) {
        if (queryLower.includes(division)) {
            return division.charAt(0).toUpperCase() + division.slice(1) + ' Division';
        }
    }
    
    return null;
}

// Enhanced system context that can filter by division
async function getSystemContextForAI(specificDivision = null) {
    try {
        let endpoint = '/api/admin/dashboard-stats';
        
        // If specific division is mentioned, get division-specific stats
        if (specificDivision) {
            endpoint += `?division=${encodeURIComponent(specificDivision)}`;
        }
        
        // Get current system statistics
        const statsResponse = await fetch(endpoint);
        
        if (!statsResponse.ok) {
            // Fallback to general stats if division-specific fails
            const fallbackResponse = await fetch('/api/admin/dashboard-stats');
            if (!fallbackResponse.ok) {
                throw new Error(`HTTP ${fallbackResponse.status}: ${fallbackResponse.statusText}`);
            }
            const stats = await fallbackResponse.json();
            return formatStatsContext(stats, 'All Divisions');
        }
        
        const stats = await statsResponse.json();
        return formatStatsContext(stats, specificDivision || 'All Divisions');
        
    } catch (error) {
        console.error('Error getting system context:', error);
        return 'System context unavailable - please provide general railway maintenance analytics guidance.';
    }
}

// Format stats into readable context
function formatStatsContext(stats, scopeLabel) {
    let context = `CURRENT SYSTEM STATUS (${scopeLabel}):\n`;
    context += `- Total Requests: ${stats.totalRequests || 0}\n`;
    
    // Status distribution
    if (stats.statusDistribution && stats.statusDistribution.length > 0) {
        context += `- Request Status Distribution:\n`;
        stats.statusDistribution.forEach(status => {
            context += `  * ${status.status}: ${status.count} requests\n`;
        });
    }
    
    // Department distribution (most important for department analysis)
    if (stats.departmentDistribution && stats.departmentDistribution.length > 0) {
        context += `- Department Complaint Distribution:\n`;
        stats.departmentDistribution.forEach(dept => {
            context += `  * ${dept.department}: ${dept.count} complaints\n`;
        });
    }

    // Division distribution  
    if (stats.divisionDistribution && stats.divisionDistribution.length > 0) {
        context += `- Division Distribution:\n`;
        stats.divisionDistribution.forEach(division => {
            context += `  * ${division.division_name}: ${division.count} requests\n`;
        });
    }

    // User context (current admin level and location)
    if (stats.userContext) {
        context += `\nCURRENT USER CONTEXT:\n`;
        context += `- Admin Level: ${stats.userContext.level}\n`;
        if (stats.userContext.division) {
            context += `- Division: ${stats.userContext.division}\n`;
        }
        if (stats.userContext.location) {
            context += `- Location: ${stats.userContext.location}\n`;
        }
    }
    
    context += '\nNote: Provide analysis based on the above data. For department queries, focus on the Department Complaint Distribution section.';
    
    return context;
}

// Make new functions globally available
window.showAnalyticsExamples = showAnalyticsExamples;
window.setExampleQuery = setExampleQuery;
window.generateAIAnalytics = generateAIAnalytics;
window.clearAIAnalytics = clearAIAnalytics;
window.exportAIAnalytics = exportAIAnalytics;
window.saveAIAnalytics = saveAIAnalytics;

console.log('  Working Admin Dashboard JavaScript loaded successfully!');
