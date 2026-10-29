const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getWptConformanceUrl, getWptTimeoutMs } = require('../src/wpt');

const withEnv = (name, value, fn) => {
    const previous = process.env[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
    try { fn(); } finally {
        if (previous === undefined) delete process.env[name];
        else process.env[name] = previous;
    }
};

test('WPT URL defaults to wpt.live', () => {
    withEnv('WPT_BASE_URL', undefined, () => {
        assert.equal(getWptConformanceUrl(), 'https://wpt.live/webnn/conformance_tests/');
    });
});

test('WPT base URL accepts a server root or full conformance_tests URL', () => {
    const expected = 'http://localhost:8000/webnn/conformance_tests/';
    assert.equal(getWptConformanceUrl('http://localhost:8000'), expected);
    assert.equal(getWptConformanceUrl('http://localhost:8000/'), expected);
    assert.equal(getWptConformanceUrl('http://localhost:8000/webnn/conformance_tests/'), expected);
});

test('WPT timeout honors WPT_TIMEOUT seconds and falls back to 60s', () => {
    withEnv('WPT_TIMEOUT', '180', () => assert.equal(getWptTimeoutMs(), 180000));
    withEnv('WPT_TIMEOUT', undefined, () => assert.equal(getWptTimeoutMs(), 60000));
});
