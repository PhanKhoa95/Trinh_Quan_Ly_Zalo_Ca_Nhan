class TestSuite {
    constructor(name) {
        this.name = name;
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
        this.results = [];
    }

    test(description, fn) {
        this.tests.push({ description, fn });
    }

    async run() {
        console.log(`\n======================================================`);
        console.log(`SUITE: ${this.name}`);
        console.log(`======================================================`);
        const suiteStart = Date.now();

        for (const t of this.tests) {
            const start = Date.now();
            try {
                await t.fn();
                const duration = Date.now() - start;
                this.passed++;
                this.results.push({ description: t.description, status: 'PASS', duration });
                console.log(`  [PASS] ${t.description} (${duration}ms)`);
            } catch (err) {
                const duration = Date.now() - start;
                this.failed++;
                this.results.push({ description: t.description, status: 'FAIL', duration, error: err.message });
                console.error(`  [FAIL] ${t.description} (${duration}ms)`);
                console.error(`         Error: ${err.message}`);
            }
        }

        const suiteDuration = Date.now() - suiteStart;
        console.log(`------------------------------------------------------`);
        console.log(`Suite Summary: ${this.passed} Passed, ${this.failed} Failed (${suiteDuration}ms)`);
        return {
            name: this.name,
            passed: this.passed,
            failed: this.failed,
            duration: suiteDuration,
            results: this.results
        };
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

assert.equal = function(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(message || `Expected '${expected}', but got '${actual}'`);
    }
};

assert.strictEqual = assert.equal;

assert.notEqual = function(actual, expected, message) {
    if (actual === expected) {
        throw new Error(message || `Expected value not to be '${expected}'`);
    }
};

assert.includes = function(actual, substring, message) {
    if (!actual || !actual.includes(substring)) {
        throw new Error(message || `Expected '${actual}' to include '${substring}'`);
    }
};

module.exports = {
    TestSuite,
    assert
};
