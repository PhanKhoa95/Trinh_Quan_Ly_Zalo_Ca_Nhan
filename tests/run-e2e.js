const { spawn } = require('child_process');
const path = require('path');
const http = require('./helpers/http-client');
const { runTier1Tests } = require('./tier1-feature-coverage.test');
const { runTier2Tests } = require('./tier2-boundary-corner-cases.test');
const { runTier3Tests } = require('./tier3-cross-concurrent.test');
const { runTier4Tests } = require('./tier4-real-world-workload.test');

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

async function isServerRunning() {
    try {
        const res = await http.get(`${BASE_URL}/api/ping`);
        return res.status === 200;
    } catch (e) {
        return false;
    }
}

async function waitForServer(maxRetries = 20) {
    for (let i = 0; i < maxRetries; i++) {
        if (await isServerRunning()) {
            return true;
        }
        await new Promise(r => setTimeout(r, 500));
    }
    return false;
}

async function main() {
    console.log(`======================================================`);
    console.log(`Zalo Personal Group Manager - E2E Test Suite Runner`);
    console.log(`Target Server: ${BASE_URL}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`======================================================`);

    let serverProcess = null;
    let spawnedServer = false;

    const alreadyRunning = await isServerRunning();
    if (!alreadyRunning) {
        console.log(`[INFO] Server is not running. Spawning server process...`);
        const serverScript = path.resolve(__dirname, '..', 'server', 'server.js');
        serverProcess = spawn('node', [serverScript], {
            cwd: path.resolve(__dirname, '..', 'server'),
            stdio: 'inherit',
            env: { ...process.env, PORT: PORT }
        });
        spawnedServer = true;

        console.log(`[INFO] Waiting for server to initialize on port ${PORT}...`);
        const ready = await waitForServer(30);
        if (!ready) {
            console.error(`[ERROR] Server failed to start on ${BASE_URL} within 15 seconds.`);
            if (serverProcess) serverProcess.kill();
            process.exit(1);
        }
        console.log(`[INFO] Server process started and ready!`);
    } else {
        console.log(`[INFO] Connected to existing server at ${BASE_URL}.`);
    }

    const suiteResults = [];

    try {
        suiteResults.push(await runTier1Tests(BASE_URL));
        suiteResults.push(await runTier2Tests(BASE_URL));
        suiteResults.push(await runTier3Tests(BASE_URL));
        suiteResults.push(await runTier4Tests(BASE_URL));
    } catch (err) {
        console.error(`[CRITICAL ERROR] Test suite execution crashed:`, err);
    } finally {
        if (spawnedServer && serverProcess) {
            console.log(`\n[INFO] Terminating spawned server process...`);
            serverProcess.kill('SIGINT');
        }
    }

    console.log(`\n======================================================`);
    console.log(`E2E TEST SUITE EXECUTION SUMMARY`);
    console.log(`======================================================`);

    let totalPassed = 0;
    let totalFailed = 0;
    let totalDuration = 0;

    suiteResults.forEach(s => {
        totalPassed += s.passed;
        totalFailed += s.failed;
        totalDuration += s.duration;
        const statusStr = s.failed === 0 ? 'PASS' : 'FAIL';
        console.log(`  - [${statusStr}] ${s.name}: ${s.passed} Passed, ${s.failed} Failed (${s.duration}ms)`);
    });

    console.log(`------------------------------------------------------`);
    console.log(`Total Passed:   ${totalPassed}`);
    console.log(`Total Failed:   ${totalFailed}`);
    console.log(`Total Duration: ${totalDuration}ms`);
    console.log(`======================================================`);

    if (totalFailed > 0) {
        console.error(`❌ TEST SUITE FAILED (${totalFailed} failing tests).`);
        process.exit(1);
    } else {
        console.log(`✅ ALL TEST TIERS PASSED SUCCESSFULLY!`);
        process.exit(0);
    }
}

main().catch(err => {
    console.error('Fatal error in runner:', err);
    process.exit(1);
});
