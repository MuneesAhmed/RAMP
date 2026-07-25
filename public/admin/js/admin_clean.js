document.addEventListener('DOMContentLoaded', function() {
    const contentArea = document.getElementById('contentArea');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const usernameElement = document.getElementById('adminName');
    const logoutBtn = document.getElementById('logoutBtn');
    const tabLinks = document.querySelectorAll('a[data-bs-toggle="tab"]');
    
    // Check authentication status
    checkAuth();

    // Attach event listeners
    logoutBtn.addEventListener('click', handleLogout);
    
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
        showLoading();
        fetch('/auth/me', {
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
            }
        })
        .then(async response => {
            if (!response.ok) {
                throw new Error('Authentication failed');
            }
            const data = await response.json();
            if (!data.user || !data.user.role || !data.user.role.startsWith('admin')) {
                throw new Error('Unauthorized access');
            }
            if (usernameElement) {
                usernameElement.textContent = data.user.username;
            }
            const defaultTab = document.querySelector('a[href="#overview"]');
            if (defaultTab) new bootstrap.Tab(defaultTab).show();
            loadSection('overview');
        })
        .catch(error => {
            console.error('Auth check failed:', error);
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
                html = generateSupervisorsHTML(data.supervisors || data);
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
        const supervisors = data.supervisors || [];
        return `
            <div class="row">
                <div class="col-12">
                    <div class="d-flex justify-content-between align-items-center mb-4">
                        <h2>Supervisors Management</h2>
                        <button class="btn btn-primary" id="addSupervisorBtn">
                            <i class="bi bi-person-plus"></i> Add New Supervisor
                        </button>
                    </div>
                    <div class="card">
                        <div class="card-body">
                            <div class="table-responsive">
                                <table class="table table-striped">
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>Username</th>
                                            <th>Role</th>
                                            <th>Email</th>
                                            <th>Division ID</th>
                                            <th>Status</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${supervisors.map(supervisor => `
                                            <tr>
                                                <td>${supervisor.id}</td>
                                                <td>${supervisor.name || supervisor.username || 'N/A'}</td>
                                                <td>
                                                    <span class="badge ${getRoleBadgeClass(supervisor.role)}">${supervisor.role}</span>
                                                </td>
                                                <td>${supervisor.email || 'N/A'}</td>
                                                <td>${supervisor.division_id || 'N/A'}</td>
                                                <td>
                                                    <span class="badge ${supervisor.is_active ? 'bg-success' : 'bg-secondary'}">
                                                        ${supervisor.is_active ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <button class="btn btn-sm btn-outline-primary me-1" onclick="editSupervisor(${supervisor.id}, '${(supervisor.name || supervisor.username || '').replace(/'/g, '\\\'')}')" title="Edit Supervisor">
                                                        <i class="bi bi-pencil"></i>
                                                    </button>
                                                    <button class="btn btn-sm btn-outline-danger" onclick="deleteSupervisor(${supervisor.id}, '${(supervisor.name || supervisor.username || '').replace(/'/g, '\\\'')}')" title="Delete Supervisor">
                                                        <i class="bi bi-trash"></i>
                                                    </button>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                            ${supervisors.length === 0 ? '<p class="text-center text-muted">No supervisors found.</p>' : ''}
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
