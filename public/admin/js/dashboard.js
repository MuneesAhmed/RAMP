document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const statsCards = document.getElementById('statsCards');
    const statusChart = document.getElementById('statusChart');
    const departmentChart = document.getElementById('departmentChart');
    const adminName = document.getElementById('adminName');
    const logoutBtn = document.getElementById('logoutBtn');

    let statusChartInstance = null;
    let departmentChartInstance = null;

    // Check authentication and load user info
    fetch('/auth/me')
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                window.location.href = '/login.html';
                return;
            }
            adminName.textContent = `Welcome, ${data.user.username}`;
            loadDashboard();
        })
        .catch(() => {
            window.location.href = '/login.html';
        });

    // Load dashboard data
    function loadDashboard() {
        fetch('/api/admin/stats')
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    throw new Error(data.error);
                }
                updateStatistics(data);
            })
            .catch(error => {
                console.error('Error loading dashboard:', error);
                alert('Error loading dashboard statistics. Please try refreshing the page.');
            });
    }

    // Update statistics and charts
    function updateStatistics(data) {
        // Update status counts cards
        const totalRequests = data.statusCounts.reduce((sum, item) => sum + item.count, 0);
        const statusColors = {
            'Pending': 'warning',
            'Not Operable': 'secondary',
            'Resolved': 'success',
            'Forwarded to Other Department': 'info'
        };

        statsCards.innerHTML = `
            <div class="col-md-3 mb-4">
                <div class="card bg-primary text-white">
                    <div class="card-body">
                        <h6 class="card-title">Total Requests</h6>
                        <h2 class="card-text">${totalRequests}</h2>
                    </div>
                </div>
            </div>
            ${data.statusCounts.map(status => `
                <div class="col-md-3 mb-4">
                    <div class="card bg-${statusColors[status.status] || 'secondary'} text-white">
                        <div class="card-body">
                            <h6 class="card-title">${status.status}</h6>
                            <h2 class="card-text">${status.count}</h2>
                        </div>
                    </div>
                </div>
            `).join('')}
        `;

        // Update status chart
        if (statusChartInstance) {
            statusChartInstance.destroy();
        }

        const statusLabels = data.statusCounts.map(item => item.status);
        const statusData = data.statusCounts.map(item => item.count);
        const statusBackgroundColors = statusLabels.map(label => {
            switch(label) {
                case 'Pending': return '#ffc107';           // Yellow/Amber
                case 'Not Operable': return '#6c757d';      // Gray
                case 'Resolved': return '#28a745';          // Green
                case 'Forwarded to Other Department': return '#17a2b8'; // Cyan/Teal
                default: return '#dc3545';                  // Red for any unknown status
            }
        });

        statusChartInstance = new Chart(statusChart, {
            type: 'doughnut',
            data: {
                labels: statusLabels,
                datasets: [{
                    data: statusData,
                    backgroundColor: statusBackgroundColors
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'right'
                    }
                }
            }
        });

        // Update department chart
        if (departmentChartInstance) {
            departmentChartInstance.destroy();
        }

        departmentChartInstance = new Chart(departmentChart, {
            type: 'bar',
            data: {
                labels: data.departmentCounts.map(item => item.department),
                datasets: [{
                    label: 'Requests',
                    data: data.departmentCounts.map(item => item.count),
                    backgroundColor: '#1a237e'
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });
    }

    // Handle logout
    logoutBtn.addEventListener('click', function(e) {
        e.preventDefault();
        fetch('/auth/logout', { method: 'POST' })
            .then(() => {
                window.location.href = '/login.html';
            })
            .catch(error => {
                console.error('Logout error:', error);
                alert('Error logging out. Please try again.');
            });
    });
});
