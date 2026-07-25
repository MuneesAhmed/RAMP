document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Admin Dashboard Starting...');
    
    const contentArea = document.getElementById('contentArea');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const usernameElement = document.getElementById('adminName');
    const logoutBtn = document.getElementById('logoutBtn');
    const tabLinks = document.querySelectorAll('a[data-bs-toggle="tab"]');
    
    console.log('Found tab links:', tabLinks.length);
    
    // First attempt auto-login
    attemptAutoLogin();

    // Attach event listeners
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    // Load section on tab shown
    tabLinks.forEach(link => {
        link.addEventListener('shown.bs.tab', (e) => {
            const section = e.target.getAttribute('href').substring(1);
            console.log('Tab shown event fired for:', section);
            loadSection(section);
        });
        // Also add click listener for immediate feedback
        link.addEventListener('click', (e) => {
            const section = e.target.getAttribute('href').substring(1);
            console.log('Tab clicked:', section);
            setTimeout(() => loadSection(section), 100);
        });
    });

    function attemptAutoLogin() {
        console.log('🔑 Attempting auto-login...');
        fetch('/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: 'admin',
                password: 'password123'
            }),
            credentials: 'same-origin'
        })
        .then(response => response.json())
        .then(data => {
            console.log('Auto-login result:', data);
            if (data.message) {
                console.log('  Auto-login successful, checking auth...');
                checkAuth();
            } else {
                console.log('❌ Auto-login failed, redirecting...');
                window.location.href = '/login.html';
            }
        })
        .catch(error => {
            console.error('Auto-login error:', error);
            window.location.href = '/login.html';
        });
    }

    function showLoading() {
        loadingSpinner.classList.remove('d-none');
    }

    function hideLoading() {
        loadingSpinner.classList.add('d-none');
    }

    function showError(message) {
        alert('Error: ' + message);
    }

    function checkAuth() {
        console.log('🔍 Starting authentication check...');
        showLoading();
        fetch('/auth/me', {
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
            }
        })
        .then(async response => {
            console.log('Auth response status:', response.status);
            if (!response.ok) {
                throw new Error('Authentication failed');
            }
            const data = await response.json();
            console.log('Auth data:', data);
            if (!data.user || !data.user.role || !data.user.role.startsWith('admin')) {
                throw new Error('Unauthorized access');
            }
            if (usernameElement) {
                usernameElement.textContent = data.user.username;
            }
            console.log('  Authentication successful, loading overview...');
            // Initialize the first tab and load overview
            setTimeout(() => {
                loadSection('overview');
            }, 500);
        })
        .catch(error => {
            console.error('Auth check failed:', error);
            console.log('Redirecting to login...');
            window.location.href = '/login.html';
        })
        .finally(hideLoading);
    }

    function handleLogout() {
        showLoading();
        fetch('/auth/logout', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
            }
        })
        .then(response => response.json())
        .then(data => {
            window.location.href = '/login.html';
        })
        .catch(error => {
            console.error('Logout failed:', error);
            showError('Logout failed. Please try again.');
            hideLoading();
        });
    }

    function loadSection(section) {
        console.log('Loading section:', section);
        showLoading();
        const url = `/api/admin/${section}`;
        console.log('Fetching from URL:', url);
        
        fetch(url, {
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
            }
        })
        .then(async response => {
            console.log('Response status:', response.status);
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Error response:', errorText);
                throw new Error(`Failed to load section: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            console.log('Received data:', data);
            updateContent(section, data);
        })
        .catch(error => {
            console.error('Section load failed:', error);
            showError('Failed to load content. Please try again.');
        })
        .finally(hideLoading);
    }

    function updateContent(section, data) {
        console.log('Updating content for section:', section, 'with data:', data);
        let html = '';
        
        switch(section) {
            case 'overview':
                html = generateDashboardHTML(data.stats || data);
                break;
            case 'requests':
                html = generateRequestsHTML(data.requests || data);
                break;
            case 'supervisors':
                console.log('Supervisors data received:', data);
                html = generateSupervisorsHTML(data);
                break;
            case 'locations':
                console.log('Locations data received:', data);
                html = generateLocationsHTML(data.locations || data);
                break;
            default:
                html = '<div class="alert alert-danger">Invalid section</div>';
        }
        
        const targetPane = document.getElementById(section);
        if (targetPane) {
            targetPane.innerHTML = html;
            console.log('Updated tab pane for:', section);
        } else {
            console.error('Tab pane not found for section:', section);
            contentArea.innerHTML = html;
        }
        
        attachSectionHandlers(section);
    }

    function generateDashboardHTML(data) {
        return `
            <div class="row">
                <div class="col-12">
                    <h2 class="mb-4">Dashboard</h2>
                </div>
                <div class="col-md-3 mb-4">
                    <div class="card text-white bg-primary">
                        <div class="card-body">
                            <h5 class="card-title">Total Users</h5>
                            <p class="card-text display-4">${data.userCount || 0}</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 mb-4">
                    <div class="card text-white bg-success">
                        <div class="card-body">
                            <h5 class="card-title">Active Requests</h5>
                            <p class="card-text display-4">${data.activeRequests || 0}</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 mb-4">
                    <div class="card text-white bg-warning">
                        <div class="card-body">
                            <h5 class="card-title">Pending Approvals</h5>
                            <p class="card-text display-4">${data.pendingApprovals || 0}</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 mb-4">
                    <div class="card text-white bg-info">
                        <div class="card-body">
                            <h5 class="card-title">Total Departments</h5>
                            <p class="card-text display-4">${data.departmentCount || 0}</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function generateRequestsHTML(data) {
        const requests = data.requests || [];
        return `
            <div class="row">
                <div class="col-12">
                    <h2 class="mb-4">Maintenance Requests</h2>
                    <div class="card">
                        <div class="card-body">
                            <div class="table-responsive">
                                <table class="table table-striped">
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>Request Type</th>
                                            <th>User</th>
                                            <th>Status</th>
                                            <th>Priority</th>
                                            <th>Date</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${requests.map(req => `
                                            <tr>
                                                <td>${req.id}</td>
                                                <td>${req.request_type || 'N/A'}</td>
                                                <td>${req.user_name || req.name || 'N/A'}</td>
                                                <td>
                                                    <span class="badge ${getStatusBadgeClass(req.status)}">${req.status || 'Pending'}</span>
                                                </td>
                                                <td>
                                                    <span class="badge ${getPriorityBadgeClass(req.priority)}">${req.priority || 'Normal'}</span>
                                                </td>
                                                <td>${new Date(req.created_at).toLocaleDateString()}</td>
                                                <td>
                                                    <button class="btn btn-sm btn-primary" onclick="viewRequest(${req.id})">View</button>
                                                    <button class="btn btn-sm btn-success" onclick="approveRequest(${req.id})">Approve</button>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function generateSupervisorsHTML(data) {
        console.log('🔥 DEBUGGING: generateSupervisorsHTML called with data:', data);
        console.log('🔥 DEBUGGING: typeof data:', typeof data);
        console.log('🔥 DEBUGGING: data keys:', Object.keys(data));
        console.log('🔥 DEBUGGING: data.hierarchy raw:', data.hierarchy);
        console.log('🔥 DEBUGGING: data.summary raw:', data.summary);
        const hierarchy = data.hierarchy || [];
        const summary = data.summary || {};
        console.log('🔥 DEBUGGING: hierarchy after assignment:', hierarchy);
        console.log('🔥 DEBUGGING: summary after assignment:', summary);
        
        return `
            <div class="row">
                <div class="col-12">
                    <div class="d-flex justify-content-between align-items-center mb-4">
                        <h2>Supervisors Management</h2>
                        <div class="d-flex gap-2">
                            <button class="btn btn-success btn-sm" id="activeOnlyFilter">
                                <i class="bi bi-check-circle"></i> Active Only
                            </button>
                            <button class="btn btn-secondary btn-sm" id="showAllFilter">
                                <i class="bi bi-list"></i> All
                            </button>
                            <button class="btn btn-primary" id="addSupervisorBtn">
                                <i class="bi bi-person-plus"></i> Add Supervisor
                            </button>
                            <button class="btn btn-outline-primary" id="refreshSupervisorsBtn">
                                <i class="bi bi-arrow-clockwise"></i> Refresh
                            </button>
                        </div>
                    </div>
                    
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
                    
                    <!-- Hierarchical Display -->
                    <div class="card">
                        <div class="card-header">
                            <h5 class="mb-0">Supervisors & Admins (${summary.totalSupervisors || 0} total)</h5>
                            <small class="text-muted">Level 1 Admin - Global Access (All Supervisors)</small>
                        </div>
                        <div class="card-body">
                            <div class="btn-group mb-3" role="group">
                                <button type="button" class="btn btn-outline-success btn-sm active" id="activeOnlyBtn">
                                    <i class="bi bi-person-check"></i> Active Only
                                </button>
                                <button type="button" class="btn btn-outline-secondary btn-sm" id="showAllBtn">
                                    <i class="bi bi-list"></i> Show All
                                </button>
                            </div>
                            <button class="btn btn-primary btn-sm float-end" id="addUserBtn">
                                <i class="bi bi-person-plus"></i> Add User
                            </button>
                            
                            <!-- Hierarchy Display -->
                            <div class="hierarchy-container">
                                ${hierarchy.map(division => `
                                    <div class="division-item mb-4">
                                        <div class="d-flex align-items-center p-3 bg-light rounded">
                                            <i class="bi bi-building text-primary me-2"></i>
                                            <h6 class="mb-0 flex-grow-1">${division.division_name}</h6>
                                            <span class="badge bg-primary">${division.totalSupervisors} users</span>
                                        </div>
                                        
                                        ${division.cities.map(city => `
                                            <div class="city-item ms-4 mt-3">
                                                <div class="d-flex align-items-center p-2 bg-light rounded">
                                                    <i class="bi bi-geo-alt text-info me-2"></i>
                                                    <h6 class="mb-0 flex-grow-1">${city.city_name}</h6>
                                                    <span class="badge bg-info">${city.totalSupervisors} users</span>
                                                </div>
                                                
                                                ${city.colonies.map(colony => `
                                                    <div class="colony-item ms-4 mt-2">
                                                        <div class="d-flex align-items-center p-2 border rounded">
                                                            <i class="bi bi-house text-warning me-2"></i>
                                                            <h6 class="mb-0 flex-grow-1">${colony.colony_name}</h6>
                                                            <span class="badge bg-warning text-dark">${colony.totalSupervisors} users</span>
                                                        </div>
                                                        
                                                        <!-- Supervisors List -->
                                                        <div class="supervisors-list ms-4 mt-2">
                                                            ${colony.supervisors.map(supervisor => `
                                                                <div class="supervisor-item d-flex align-items-center p-2 border-start border-3 border-success bg-white mb-1">
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
                                                                            ${supervisor.active_assignments} active assignments
                                                                        </small>
                                                                        <br>
                                                                        <small class="text-muted">${supervisor.email || 'No email'}</small>
                                                                    </div>
                                                                    <div class="btn-group btn-group-sm">
                                                                        <button class="btn btn-outline-primary" onclick="editSupervisor(${supervisor.id}, '${supervisor.username.replace(/'/g, '\\\'')}')" title="Edit">
                                                                            <i class="bi bi-pencil"></i>
                                                                        </button>
                                                                        <button class="btn btn-outline-danger" onclick="deleteSupervisor(${supervisor.id}, '${supervisor.username.replace(/'/g, '\\\'')}')" title="Delete">
                                                                            <i class="bi bi-trash"></i>
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            `).join('')}
                                                        </div>
                                                    </div>
                                                `).join('')}
                                            </div>
                                        `).join('')}
                                    </div>
                                `).join('')}
                            </div>
                            
                            ${hierarchy.length === 0 ? '<p class="text-center text-muted">No supervisors found.</p>' : ''}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Add Supervisor Modal -->
            <div class="modal fade" id="addSupervisorModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Add New Supervisor</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="addSupervisorForm">
                                <div class="mb-3">
                                    <label for="supervisorUsername" class="form-label">Username</label>
                                    <input type="text" class="form-control" id="supervisorUsername" name="username" required>
                                </div>
                                <div class="mb-3">
                                    <label for="supervisorPassword" class="form-label">Password</label>
                                    <input type="password" class="form-control" id="supervisorPassword" name="password" required>
                                </div>
                                <div class="mb-3">
                                    <label for="supervisorRole" class="form-label">Role</label>
                                    <select class="form-control" id="supervisorRole" name="role">
                                        <option value="supervisor">Supervisor</option>
                                        <option value="admin_l1">Admin Level 1</option>
                                        <option value="admin_l2">Admin Level 2</option>
                                        <option value="admin_l3">Admin Level 3</option>
                                    </select>
                                </div>
                                <div class="mb-3">
                                    <label for="supervisorDivision" class="form-label">Division ID</label>
                                    <input type="number" class="form-control" id="supervisorDivision" name="division_id">
                                </div>
                                <div class="mb-3">
                                    <label for="supervisorCity" class="form-label">City ID</label>
                                    <input type="number" class="form-control" id="supervisorCity" name="city_id">
                                </div>
                                <div class="mb-3">
                                    <label for="supervisorDepartment" class="form-label">Department ID</label>
                                    <input type="number" class="form-control" id="supervisorDepartment" name="department_id">
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" onclick="saveSupervisor()">Add Supervisor</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function generateLocationsHTML(data) {
        const locations = data.locations || [];
        return `
            <div class="row">
                <div class="col-12">
                    <div class="d-flex justify-content-between align-items-center mb-4">
                        <h2>Locations Management</h2>
                        <button class="btn btn-primary" id="addLocationBtn">
                            <i class="bi bi-geo-alt-fill"></i> Add Location
                        </button>
                    </div>
                    <div class="card">
                        <div class="card-body">
                            <div class="table-responsive">
                                <table class="table table-striped">
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>Building Name</th>
                                            <th>Floor</th>
                                            <th>Room/Area</th>
                                            <th>Description</th>
                                            <th>Active Requests</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${locations.map(location => `
                                            <tr>
                                                <td>${location.id || 'N/A'}</td>
                                                <td>${location.building || 'N/A'}</td>
                                                <td>${location.floor || 'N/A'}</td>
                                                <td>${location.room || 'N/A'}</td>
                                                <td>${location.description || 'N/A'}</td>
                                                <td>${location.active_requests || 0}</td>
                                                <td>
                                                    <button class="btn btn-sm btn-outline-primary me-1" onclick="editLocation(${location.id})">
                                                        <i class="bi bi-pencil"></i>
                                                    </button>
                                                    <button class="btn btn-sm btn-outline-danger" onclick="deleteLocation(${location.id})">
                                                        <i class="bi bi-trash"></i>
                                                    </button>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // Helper functions for badge classes
    function getStatusBadgeClass(status) {
        switch(status?.toLowerCase()) {
            case 'resolved': return 'bg-success';
            case 'pending': return 'bg-warning';
            case 'not operable': return 'bg-secondary';
            case 'forwarded to other department': return 'bg-info';
            default: return 'bg-secondary';
        }
    }

    function getPriorityBadgeClass(priority) {
        switch(priority?.toLowerCase()) {
            case 'high': return 'bg-danger';
            case 'medium': return 'bg-warning';
            case 'low': return 'bg-success';
            default: return 'bg-secondary';
        }
    }

    function getRoleBadgeClass(role) {
        switch(role?.toLowerCase()) {
            case 'admin_l1': return 'bg-danger';
            case 'admin_l2': return 'bg-warning';
            case 'admin_l3': return 'bg-info';
            case 'supervisor': return 'bg-success';
            default: return 'bg-secondary';
        }
    }

    function attachSectionHandlers(section) {
        if (section === 'supervisors') {
            const addBtn = document.getElementById('addSupervisorBtn');
            if (addBtn) {
                addBtn.addEventListener('click', () => {
                    const modal = new bootstrap.Modal(document.getElementById('addSupervisorModal'));
                    modal.show();
                });
            }
        }
    }

    // Global functions for supervisor management
    window.editSupervisor = function(id, username) {
        console.log('Edit supervisor:', id, username);
        alert('Edit supervisor functionality: Coming soon for ' + username);
    };

    window.deleteSupervisor = function(id, username) {
        console.log('Delete supervisor:', id, username);
        if (confirm(`Are you sure you want to delete supervisor "${username}"?`)) {
            fetch(`/api/admin/supervisors/${id}`, {
                method: 'DELETE',
                credentials: 'same-origin',
                headers: {
                    'Accept': 'application/json'
                }
            })
            .then(response => response.json())
            .then(data => {
                if (data.message) {
                    alert('Supervisor deleted successfully');
                    loadSection('supervisors'); // Refresh the list
                } else {
                    alert('Error: ' + (data.error || 'Failed to delete supervisor'));
                }
            })
            .catch(error => {
                console.error('Error deleting supervisor:', error);
                alert('Error deleting supervisor: ' + error.message);
            });
        }
    };

    window.saveSupervisor = function() {
        const form = document.getElementById('addSupervisorForm');
        const formData = new FormData(form);
        const supervisorData = Object.fromEntries(formData.entries());
        
        fetch('/api/admin/supervisors', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(supervisorData)
        })
        .then(response => response.json())
        .then(data => {
            if (data.message) {
                alert('Supervisor added successfully');
                bootstrap.Modal.getInstance(document.getElementById('addSupervisorModal')).hide();
                loadSection('supervisors'); // Refresh the list
                form.reset();
            } else {
                alert('Error: ' + (data.error || 'Failed to add supervisor'));
            }
        })
        .catch(error => {
            console.error('Error adding supervisor:', error);
            alert('Error adding supervisor: ' + error.message);
        });
    };

    // Other placeholder functions
    window.editLocation = function(id) {
        alert('Edit location functionality coming soon!');
    };

    window.deleteLocation = function(id) {
        alert('Delete location functionality coming soon!');
    };

    window.viewRequest = function(id) {
        alert('View request functionality coming soon!');
    };

    window.approveRequest = function(id) {
        alert('Approve request functionality coming soon!');
    };
});
