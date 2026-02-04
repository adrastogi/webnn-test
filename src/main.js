#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { test, expect, chromium } = require('@playwright/test');

const { WptRunner } = require('./wpt');
const { ModelRunner } = require('./model');
const { launchBrowser } = require('./util');

// Helper to parse comma-separated lists
const parseList = (str) => (str || '').split(',').map(s => s.trim()).filter(s => s.length > 0);

if (require.main === module && process.env.IS_PLAYWRIGHT_CHILD_PROCESS !== 'true') {
  // ===========================================================================
  // CLI / Parent Process Logic
  // ===========================================================================

  const args = process.argv.slice(2);

  // Help Check
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
WebNN Automation Tests

Usage: node src/main.js [options]

Options:
  --config <file>          Path to JSON configuration file
  --suite <name>           Test suite to run (default: wpt). Values: wpt, model
  --list                   List all test cases in the specified suite
  --jobs <number>          Number of parallel jobs (default: 4)
  --repeat <number>        Number of times to repeat the test run (default: 1)
  --device <type>          Device type to use (default: gpu). Values: cpu, gpu, npu
  --chrome-channel <name>  Chrome channel to use (default: canary). Values: stable, canary, dev, beta
  --browser-arg <arg>     Extra arguments for browser launch, split by space
  --email [address]        Send email report
  --pause <case>           Pause execution on failure
  --browser-path <path>    Custom path to browser executable
  --skip-retry             Skip the retry stage for failed tests
  --verbose                Capture detailed per-subtest failure information

Test Selection:
  --wpt-case <filter>      Run specific WPT test cases
  --wpt-range <range>      Run tests by index range
  --model-case <filter>    Run specific Model cases

Examples:
  node src/main.js --config config.json
  node src/main.js --suite wpt --wpt-case abs
`);
    process.exit(0);
  }

  // List Mode Handling
  if (args.includes('--list')) {
    process.env.LIST_MODE = 'true';
  } else {
    process.env.LIST_MODE = 'false';
  }

  // --- Argument Parsing ---

  // Common Args
  const getArg = (name) => {
    const idx = args.findIndex(a => a === name);
    return (idx !== -1 && idx + 1 < args.length) ? args[idx + 1] : null;
  };
  const getArgValue = (prefix) => {
    const arg = args.find(a => a.startsWith(prefix));
    return arg ? arg.split('=')[1] : null;
  };

  const jobsStr = getArg('--jobs') || '4';
  const jobs = parseInt(jobsStr, 10);
  const repeatStr = getArg('--repeat') || '1';
  const repeat = parseInt(repeatStr, 10);

  let emailAddress = null;
  const emailIdx = args.findIndex(a => a === '--email');
  if (emailIdx !== -1) {
      if (emailIdx + 1 < args.length && !args[emailIdx + 1].startsWith('--')) {
          emailAddress = args[emailIdx + 1];
      } else {
          emailAddress = 'ygu@microsoft.com';
      }
  }

  const chromeChannel = (getArg('--chrome-channel') || 'canary').toLowerCase();
  const validChannels = ['canary', 'dev', 'beta', 'stable'];
  if (!validChannels.includes(chromeChannel)) {
      console.error(`Invalid --chrome-channel value: ${chromeChannel}`);
      console.error(`Valid channels are: ${validChannels.join(', ')}`);
      process.exit(1);
  }

  let playwrightChannel = (chromeChannel === 'stable') ? 'chrome' : `chrome-${chromeChannel}`;

  const globalExtraArgs = getArg('--browser-arg');
  const browserPath = getArg('--browser-path');
  const skipRetry = args.includes('--skip-retry');
  const configFile = getArg('--config');
  const pauseCase = getArg('--pause');
  const wptRange = getArg('--wpt-range');
  const verbose = args.includes('--verbose');

  // --- Config Generation ---
  let runConfigs = [];

  if (configFile) {
      const configPath = path.isAbsolute(configFile) ? configFile : path.resolve(process.cwd(), configFile);
      if (!fs.existsSync(configPath)) {
          console.error(`Config file not found: ${configPath}`);
          process.exit(1);
      }
      try {
          const rawConfigs = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          // Normalize configs and expand devices
          runConfigs = rawConfigs.flatMap((item, idx) => {
               const devices = (item.device || 'gpu').split(',').map(d => d.trim()).filter(Boolean);
               return devices.map(device => ({
                  name: item.name || `Config_${idx+1}`,
                  suite: item.suite || 'wpt',
                  device: device,
                  browserArgs: item['browser-arg'] ? `${globalExtraArgs || ''} ${item['browser-arg']}`.trim() : globalExtraArgs,
                  wptCase: item['wpt-case'] || null,
                  modelCase: item['model-case'] || null,
                  wptRange: null,
                  pauseCase: null
               }));
          });
      } catch (e) {
          console.error(`Error reading config file: ${e.message}`);
          process.exit(1);
      }
  } else {
      // CLI Mode -> Generate Cartesian Product
      let suites = parseList(getArg('--suite') || 'wpt');
      let deviceArg = getArg('--device');
      if (!deviceArg) {
          const dVal = getArgValue('--device=');
          deviceArg = dVal || 'gpu';
      }
      let devices = parseList(deviceArg);

      const wptCase = getArg('--wpt-case') || getArg('--model-case');
      const modelCase = getArg('--model-case') || getArg('--wpt-case');

      // Expand "all" suite
      if (suites.includes('all')) suites = ['wpt', 'model'];

      // Generate configs
      // Order: Device outer, Suite inner
      for (const d of devices) {
          for (const s of suites) {
              runConfigs.push({
                  name: 'Default',
                  suite: s,
                  device: d,
                  browserArgs: globalExtraArgs,
                  wptCase: (s === 'wpt') ? (getArg('--wpt-case') || wptCase) : null,
                  modelCase: (s === 'model') ? (getArg('--model-case') || modelCase) : null,
                  wptRange: wptRange,
                  pauseCase: pauseCase
              });
          }
      }
  }

  // --- Environment Setup ---
  process.env.JOBS = jobs.toString();
  process.env.CHROME_CHANNEL = playwrightChannel;
  process.env.TEST_CONFIG_LIST = JSON.stringify(runConfigs);
  process.env.IS_LIST_MODE = process.env.LIST_MODE;
  if (emailAddress) {
      process.env.EMAIL_ADDRESS = emailAddress;
      process.env.EMAIL_TO = emailAddress;
  }
  if (browserPath) process.env.BROWSER_PATH = browserPath;
  if (skipRetry) process.env.SKIP_RETRY = 'true';
  if (verbose) process.env.VERBOSE = 'true';

  delete process.env.TEST_SUITE;
  delete process.env.DEVICE;
  delete process.env.WPT_CASE;
  delete process.env.MODEL_CASE;
  delete process.env.EXTRA_BROWSER_ARGS;

  // --- Execution & Iteration Loop ---

  const runIteration = (iteration, totalIterations) => {
      return new Promise((resolve, reject) => {
          const iterationPrefix = totalIterations > 1 ? `[Iteration ${iteration}/${totalIterations}] ` : '';

          if (totalIterations > 1) {
            console.log(`\n${'='.repeat(80)}`);
            console.log(`[Iteration] ITERATION ${iteration}/${totalIterations}`);
            console.log(`${'='.repeat(80)}\n`);
          }

          process.env.TEST_ITERATION = iteration.toString();
          process.env.TEST_TOTAL_ITERATIONS = totalIterations.toString();

          const playwrightArgs = [
            'test',
            '-c', path.join(__dirname, '..', 'runner.config.js'),
            'src/main.js',
            '--reporter=line,html',
            '--timeout=0'
          ];
          if (process.env.CI) playwrightArgs.push('--retries=2');

          const playwrightCli = path.join(__dirname, '..', 'node_modules', '@playwright', 'test', 'cli.js');

          const childProcess = spawn(process.execPath, [playwrightCli, ...playwrightArgs], {
             stdio: 'inherit',
             shell: false,
             env: { ...process.env, IS_PLAYWRIGHT_CHILD_PROCESS: 'true' }
          });

          childProcess.on('close', (code) => {
              // Report Copy Logic
              if (code === 0) {
                  const reportTempDir = path.join(__dirname, '..', 'report-temp');
                  const reportDir = path.join(__dirname, '..', 'report');
                  try {
                      if (fs.existsSync(reportTempDir)) {
                          if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, {recursive: true});

                           const copyDir = (src, dest) => {
                                if (!fs.existsSync(dest)) fs.mkdirSync(dest, {recursive: true});
                                fs.readdirSync(src, {withFileTypes: true}).forEach(ent => {
                                    const s = path.join(src, ent.name), d = path.join(dest, ent.name);
                                    if (ent.isDirectory()) copyDir(s, d);
                                    else fs.copyFileSync(s, d);
                                });
                           };
                           copyDir(reportTempDir, reportDir);

                           const now = new Date();
                           const timestamp = now.getFullYear().toString() +
                             (now.getMonth() + 1).toString().padStart(2, '0') +
                             now.getDate().toString().padStart(2, '0') +
                             now.getHours().toString().padStart(2, '0') +
                             now.getMinutes().toString().padStart(2, '0') +
                             now.getSeconds().toString().padStart(2, '0');
                           const suffix = totalIterations > 1 ? `_iter${iteration}` : '';
                           const newName = path.join(reportDir, `${timestamp}${suffix}.html`);
                           if (fs.existsSync(path.join(reportDir, 'index.html'))) {
                               fs.renameSync(path.join(reportDir, 'index.html'), newName);
                               console.log(`[Report] Generated: ${newName}`);
                           }
                      }
                  } catch (e) {
                      console.error('Error handling report:', e);
                  }
                  resolve(0);
              } else {
                  console.log(`\n[Fail] ${iterationPrefix}Test iteration failed with code ${code}`);
                  reject(code);
              }
          });
      });
  };

  (async () => {
    if (process.env.LIST_MODE === 'true') {
         // Run Playwright with specific env to triggering Listing
         await runIteration(1, 1);
    } else {
         const results = [];
         for (let i = 1; i <= repeat; i++) {
             try {
                 await runIteration(i, repeat);
                 results.push(0);
             } catch (c) {
                 results.push(c);
             }
             if (i < repeat) await new Promise(r => setTimeout(r, 2000));
         }
         process.exit(results.every(r => r === 0) ? 0 : 1);
    }
  })();

} else {
  // ===========================================================================
  // Child Process / Playwright Test Logic
  // ===========================================================================

  test.describe('WebNN Tests', () => {
      let browser, context, page;
      const launchInstance = async () => launchBrowser();

      test.afterAll(async () => {
          if (browser) await browser.close();
      });

      if (process.env.IS_LIST_MODE === 'true') {
          // Listing Logic
          test('List Tests', async () => {
               const configs = JSON.parse(process.env.TEST_CONFIG_LIST || '[]');
               // Collect unique suites
               const uniqueSuites = [...new Set(configs.map(c => c.suite))];

               // Launch minimal browser for discovery
               const instance = await launchInstance();
               page = instance.page;
               browser = instance.browser || instance.context;

               for (const suite of uniqueSuites) {
                    console.log(`\n=== Suite: ${suite.toUpperCase()} ===`);
                    if (suite === 'wpt') {
                        console.log('Discovering WPT tests from https://wpt.live/webnn/conformance_tests/ ...');
                        await page.goto('https://wpt.live/webnn/conformance_tests/');
                        try {
                            await page.waitForSelector('.file', {timeout: 10000});
                            const files = await page.$$eval('.file a', links =>
                                links.map(l => l.textContent.trim()).filter(t => t.endsWith('.js'))
                            );
                            files.forEach((f, i) => console.log(`[${i}] ${f}`));
                        } catch(e) { console.log('Could not load WPT file list'); }
                    } else if (suite === 'model') {
                        const runner = new ModelRunner(page);
                        Object.keys(runner.models).forEach((k, i) => {
                             const m = runner.models[k];
                             console.log(`[${i}] ${k}: ${m.name} (${m.type})`);
                        });
                    }
               }
          });
      } else {
          test('Run Configured Tests', async () => {
              const configs = JSON.parse(process.env.TEST_CONFIG_LIST || '[]');
              let results = [];
              let runner = null;
              const startTime = Date.now();
              let dllResults = null;

              for (const [idx, config] of configs.entries()) {
                   console.log(`\n=== Running Config: ${config.name} (Suite: ${config.suite}, Device: ${config.device}) ===`);

                   process.env.EXTRA_BROWSER_ARGS = config.browserArgs || '';
                   process.env.DEVICE = config.device;

                   // Always relaunch for isolation between configs
                   if (browser) {
                       await browser.close();
                       browser = null;
                       await new Promise(r => setTimeout(r, 1000));
                   }

                   const instance = await launchInstance();
                   browser = instance.browser || instance.context;
                   context = instance.context;
                   page = instance.page;

                   let currentRunner;
                   if (config.suite === 'wpt') {
                       currentRunner = new WptRunner(page);
                       currentRunner.launchNewBrowser = launchInstance;
                   } else {
                       currentRunner = new ModelRunner(page);
                       currentRunner.launchNewBrowser = launchInstance;
                   }
                   runner = currentRunner;

                   if (idx === 0) {
                        const processName = (process.env.CHROME_CHANNEL || '').includes('edge') ? 'msedge.exe' : 'chrome.exe';
                        // Short delay to ensure process is stable
                        // await new Promise(r => setTimeout(r, 2000));
                        // dllResults = await currentRunner.checkOnnxruntimeDlls(processName);
                   }

                   process.env.WPT_CASE = config.wptCase || '';
                   process.env.MODEL_CASE = config.modelCase || '';
                   process.env.WPT_RANGE = config.wptRange || '';
                   process.env.PAUSE_CASE = config.pauseCase || '';

                   // Callback to run DLL check after first case execution
                   const onFirstCaseComplete = async () => {
                       if (idx === 0 && !dllResults) {
                           const processName = (process.env.CHROME_CHANNEL || '').includes('edge') ? 'msedge.exe' : 'chrome.exe';
                           console.log('[Info] First case completed. Checking DLLs...');
                           dllResults = await currentRunner.checkOnnxruntimeDlls(processName);
                       }
                   };

                   let runRes = [];
                   if (config.suite === 'wpt') {
                       runRes = await currentRunner.runWptTests(context, browser, onFirstCaseComplete);
                   } else {
                       runRes = await currentRunner.runModelTests(onFirstCaseComplete);
                   }

                   // Ensure check ran if for some reason callback wasn't triggered (e.g. 0 tests)
                   if (idx === 0 && !dllResults) await onFirstCaseComplete();


                   runRes.forEach(r => {
                       r.configName = config.name;
                       r.device = config.device;
                       r.fullConfig = config;
                   });
                   results = results.concat(runRes);
              }

              if (results.length > 0 && runner) {
                   const wallTime = ((Date.now() - startTime) / 1000).toFixed(2);
                   const sumOfTestTimes = results.reduce((acc, r) => acc + (parseFloat(r.executionTime)||0), 0).toFixed(2);
                   const subtitle = configs.map(c => c.name).join(', ');
                   const suiteNames = [...new Set(configs.map(c => c.suite))];

                   const report = runner.generateHtmlReport(suiteNames, subtitle, results, dllResults, wallTime, sumOfTestTimes);

                   const reportDir = path.join(__dirname, '..', 'report-temp');
                   if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, {recursive:true});
                   fs.writeFileSync(path.join(reportDir, 'index.html'), report);

                   if (process.env.EMAIL_TO) {
                       await runner.sendEmailReport(process.env.EMAIL_TO, suiteNames, results, wallTime, sumOfTestTimes, null, report);
                   }
              }
          });
      }
  });
}

