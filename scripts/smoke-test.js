const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const databasePath = path.join(
    os.tmpdir(),
    `ramp-smoke-${process.pid}-${Date.now()}.db`
);
const port = 3200 + Math.floor(Math.random() * 500);
const baseUrl = `http://127.0.0.1:${port}`;

let serverOutput = '';
const server = spawn(process.execPath, ['server.js'], {
    cwd: projectRoot,
    env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: String(port),
        DB_PATH: databasePath,
        SESSION_SECRET: 'ramp-smoke-test-secret',
        ADMIN_USERNAME: 'admin',
        ADMIN_PASSWORD: 'password123',
        EMAIL_ENABLED: 'false',
        AI_ASSISTANT_ENABLED: 'false'
    },
    stdio: ['ignore', 'pipe', 'pipe']
});

server.stdout.on('data', chunk => {
    serverOutput += chunk.toString();
});
server.stderr.on('data', chunk => {
    serverOutput += chunk.toString();
});

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

async function waitForServer() {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`${baseUrl}/api/divisions`);
            if (response.ok) return;
        } catch (error) {
            // The process is still starting.
        }
        await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw new Error('Server did not become ready within 20 seconds');
}

async function request(endpoint, options = {}, cookie = '') {
    const headers = { ...(options.headers || {}) };
    if (cookie) headers.cookie = cookie;
    const response = await fetch(`${baseUrl}${endpoint}`, { ...options, headers });
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json')
        ? await response.json()
        : await response.text();
    return { response, body };
}

async function login(username, password) {
    const { response, body } = await request('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    assert(response.status === 200, `Login failed for ${username}: ${JSON.stringify(body)}`);
    return response.headers.get('set-cookie').split(';')[0];
}

async function run() {
    await waitForServer();

    const adminCookie = await login('admin', 'password123');
    const divisionsResult = await request('/api/divisions');
    assert(divisionsResult.response.ok && divisionsResult.body.length === 4, 'Division seed failed');
    const division = divisionsResult.body.find(item => item.name === 'Jaipur Division');

    const citiesResult = await request(`/api/cities/${division.id}`);
    const city = citiesResult.body.find(item => item.name === 'Jaipur');
    assert(city, 'Jaipur city seed failed');

    const coloniesResult = await request(`/api/colonies/${city.id}`);
    const colony = coloniesResult.body[0];
    assert(colony, 'Colony seed failed');

    const departmentsResult = await request('/api/departments');
    const department = departmentsResult.body.find(item => item.name === 'Electrical');
    assert(department, 'Department seed failed');

    const createSupervisor = await request('/api/admin/supervisor', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            username: 'smoke-supervisor',
            password: 'Supervisor123!',
            division_id: division.id,
            city_id: city.id,
            colony_id: colony.id,
            department_id: department.id
        })
    }, adminCookie);
    assert(
        createSupervisor.response.ok && createSupervisor.body.supervisor?.id,
        `Supervisor creation failed: ${JSON.stringify(createSupervisor.body)}`
    );

    const submitRequest = await request('/api/requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            division_id: division.id,
            city_id: city.id,
            colony_id: colony.id,
            wing: 'A',
            quarter_number: '101',
            department_id: department.id,
            location: 'Kitchen',
            description: 'Smoke-test electrical socket issue',
            name: 'Test Employee',
            designation: 'Engineer',
            mobile: '9876543210',
            employee_id: 'SMOKE-001',
            email: 'smoke@example.com'
        })
    });
    assert(
        submitRequest.response.status === 201 && submitRequest.body.requestId,
        `Request submission failed: ${JSON.stringify(submitRequest.body)}`
    );

    const supervisorCookie = await login('smoke-supervisor', 'Supervisor123!');
    let assignedRequest;
    for (let attempt = 0; attempt < 20 && !assignedRequest; attempt++) {
        const result = await request('/api/supervisor/requests', {}, supervisorCookie);
        assignedRequest = result.body.requests?.find(
            item => item.request_id === submitRequest.body.requestId
        );
        if (!assignedRequest) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    assert(assignedRequest, 'Automatic supervisor assignment failed');

    const statusUpdate = await request(`/api/supervisor/requests/${assignedRequest.id}/status`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'Resolved', assigned_worker: 'Smoke Worker' })
    }, supervisorCookie);
    assert(statusUpdate.response.ok, `Status update failed: ${JSON.stringify(statusUpdate.body)}`);

    const tracking = await request(`/api/track/${submitRequest.body.requestId}`);
    assert(
        tracking.response.ok && tracking.body.request.status === 'Resolved',
        'Public request tracking did not return the updated status'
    );

    const adminEndpoints = [
        '/api/admin/stats',
        '/api/admin/overview',
        '/api/admin/supervisors',
        `/api/admin/colonies?city_id=${city.id}`,
        '/api/admin/analytics/performance',
        '/api/admin/dashboard-stats'
    ];
    for (const endpoint of adminEndpoints) {
        const result = await request(endpoint, {}, adminCookie);
        assert(result.response.ok, `${endpoint} failed: ${JSON.stringify(result.body)}`);
    }

    const contact = await request('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            name: 'Smoke Tester',
            email: 'contact@example.com',
            mobile: '9876543210',
            subject: 'technical',
            message: 'Smoke-test message',
            requestId: submitRequest.body.requestId
        })
    });
    assert(contact.response.status === 201, 'Contact form endpoint failed');

    console.log('RAMP smoke test passed.');
}

run()
    .catch(error => {
        console.error(error.message);
        console.error(serverOutput);
        process.exitCode = 1;
    })
    .finally(() => {
        server.kill('SIGTERM');
        if (fs.existsSync(databasePath)) {
            fs.rmSync(databasePath);
        }
        for (const suffix of ['-shm', '-wal']) {
            const sidecar = `${databasePath}${suffix}`;
            if (fs.existsSync(sidecar)) fs.rmSync(sidecar);
        }
    });
