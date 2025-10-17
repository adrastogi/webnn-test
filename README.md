# WebNN Automation Tests

This project contains automated tests for WebNN (Web Neural Network) using Playwright.

## Prerequisites

1. **Chrome Canary**: Install Chrome Canary browser
2. **Node.js**: Install Node.js (version 16 or higher)
3. **Playwright**: Will be installed via npm
4. Install Windows App SDK
https://learn.microsoft.com/en-us/windows/apps/windows-app-sdk/downloads#experimental-release
5. Install IHV specific EPs
6. In powershell with admin priviledge, run DumpPackages.ps1 and search for WindowsMLRuntime

## Setup

1. Install dependencies:
```bash
npm install
```

2. Install Playwright browsers:
```bash
npx playwright install
```

## Running Tests

### Method 1: Using Node.js Script

```bash
# Run WPT tests (default)
node src/main.js

# Run specific test suite
node src/main.js --suite wpt
node src/main.js --suite sample
node src/main.js --suite preview

# Run multiple test suites (comma-separated, no spaces)
node src/main.js --suite "wpt,sample"
node src/main.js --suite "wpt,preview"
node src/main.js --suite "wpt,sample,preview"

# Run specific test cases
node src/main.js --suite wpt --wpt-case abs
node src/main.js --suite wpt --wpt-case arg_min
node src/main.js --suite sample --sample-case image-classification
node src/main.js --suite preview --preview-case image-classification

# Run multiple test cases (comma-separated)
node src/main.js --suite wpt --wpt-case abs,add
node src/main.js --suite wpt --wpt-case abs,add,arg_min

# Run with --ep flag to check ONNX Runtime DLLs
node src/main.js --suite wpt --wpt-case abs --ep
node src/main.js --suite wpt,sample --wpt-case abs --ep

# Run with parallel execution (use multiple jobs)
node src/main.js --suite wpt --wpt-case "add,sub,mul,div" --jobs 2
node src/main.js --suite wpt --wpt-case "add,sub,mul,div" --jobs 4

# Run tests multiple times (repeat mode)
node src/main.js --suite wpt --wpt-case "add,sub" --repeat 3
node src/main.js --suite wpt --wpt-case "add,sub,mul,div" --jobs 2 --repeat 5

# Combine all options
node src/main.js --suite wpt --wpt-case "add,sub" --jobs 2 --repeat 3 --ep
```

### Method 2: Using npm scripts

```bash
npm run test:wpt
npm run test:sample
npm run test:preview
```

### Method 3: Direct Playwright execution

```bash
# Set environment variable and run
$env:TEST_SUITE = "wpt"
npx playwright test --project=chromium-canary

# View report manually (static HTML file)
start report/index.html
```

## Test Cases

### WPT (Web Platform Tests)
- Visits `https://wpt.live/webnn/conformance_tests/`
- Discovers all `.js` test files with class "file"
- Converts each test from `xxx.js` to `xxx.html?gpu`
- Runs each test and collects results

### Sample
- Custom sample tests for WebNN functionality
- Image classification with EfficientNet model

### Preview (To be implemented)
- Preview tests for WebNN features

## Test Case Selection

Use suite-specific case options to run only tests that partially match the case string(s). You can specify multiple cases separated by commas (no spaces):

```bash
# Run only WPT tests containing "abs" in the name
node src/main.js --suite wpt --wpt-case abs
# This will run: abs.html?gpu

# Run only WPT tests containing "arg" in the name
node src/main.js --suite wpt --wpt-case arg
# This will run: arg_min_max.html?gpu, etc.

# Run multiple WPT cases - tests containing "abs" OR "add" (no spaces)
node src/main.js --suite wpt --wpt-case abs,add
# This will run: abs.html?gpu, add.html?gpu, etc.

# Run specific sample case
node src/main.js --suite sample --sample-case image-classification

# Run specific preview case
node src/main.js --suite preview --preview-case image-classification

# Run multiple suites with specific cases for one suite
node src/main.js --suite wpt,sample --wpt-case abs --ep
# This will run: WPT "abs" test + ALL sample tests + DLL check
```

The case selection is case-insensitive and matches any part of the test filename.

## Parallel Execution

Run multiple tests in parallel to speed up execution:

```bash
# Run with 2 parallel jobs
node src/main.js --suite wpt --wpt-case "add,sub,mul,div" --jobs 2

# Run with 4 parallel jobs
node src/main.js --suite wpt --wpt-case "add,sub,mul,div" --jobs 4

# The more jobs, the faster the execution (up to your CPU cores)
node src/main.js --suite wpt --jobs 8
```

**Benefits:**
- Significantly faster test execution
- Wall time vs sum of individual test times shows speedup
- Each test runs in isolated browser context

## Repeat Mode

Run the entire test suite multiple times for stability testing or performance analysis:

```bash
# Run tests 3 times
node src/main.js --suite wpt --wpt-case "add,sub" --repeat 3

# Run with parallel execution, repeated 5 times
node src/main.js --suite wpt --wpt-case "add,sub,mul,div" --jobs 2 --repeat 5

# Combine with all options
node src/main.js --suite wpt --wpt-case "add" --jobs 4 --repeat 10 --ep
```

**How it works:**
- 🔁 **Independent iterations**: Each iteration is a standalone test run
- 📊 **Separate reports**: Each iteration gets its own timestamped report with `_iterN` suffix
- ⏱️ **2-second delay**: Brief pause between iterations for stability
- 📈 **Summary**: Shows pass/fail status for all iterations at the end

**Example output:**
```bash
node src/main.js --suite wpt --wpt-case "add,sub" --repeat 3

# Output:
================================================================================
🔁 ITERATION 1/3
================================================================================
# ... tests run ...
✅ [Iteration 1/3] Test iteration completed successfully
📄 [Iteration 1/3] Timestamped report: report/20251016143025_iter1.html

⏳ Waiting 2 seconds before next iteration...

================================================================================
🔁 ITERATION 2/3
================================================================================
# ... tests run ...
✅ [Iteration 2/3] Test iteration completed successfully
📄 [Iteration 2/3] Timestamped report: report/20251016143142_iter2.html

⏳ Waiting 2 seconds before next iteration...

================================================================================
🔁 ITERATION 3/3
================================================================================
# ... tests run ...
✅ [Iteration 3/3] Test iteration completed successfully
📄 [Iteration 3/3] Timestamped report: report/20251016143258_iter3.html

================================================================================
📊 REPEAT SUMMARY - All 3 iteration(s) completed
================================================================================
   Iteration 1: ✅ PASS
   Iteration 2: ✅ PASS
   Iteration 3: ✅ PASS
================================================================================
```

**Use cases:**
- 🎯 **Stability testing**: Verify tests pass consistently across multiple runs
- 📊 **Performance analysis**: Compare execution times across iterations
- 🐛 **Flakiness detection**: Identify intermittent failures
- 🔬 **Stress testing**: Run tests repeatedly to catch edge cases

## Configuration

The tests run on Chrome Canary with the following flags:
- `--enable-features=WebMachineLearningNeuralNetwork,WebNNOnnxRuntime`
- `--disable-web-security`
- `--disable-features=VizDisplayCompositor`
- `--enable-unsafe-webgpu`

### Chrome Canary Path

The default Chrome Canary path is automatically detected. If you need to specify a custom path, set the `CHROME_CANARY_PATH` environment variable:

**Windows (PowerShell):**
```powershell
$env:CHROME_CANARY_PATH = "C:\path\to\chrome-canary.exe"
```

**Windows (Command Prompt):**
```cmd
set CHROME_CANARY_PATH=C:\path\to\chrome-canary.exe
```

**Linux/Mac:**
```bash
export CHROME_CANARY_PATH="/path/to/chrome-canary"
```

## Output

The test will output:
- Progress information for each test
- Summary of results (passed, failed, errors, unknown)
- Detailed information about failed tests
- **HTML report automatically opens in your default browser after tests complete**

### Manual Report Access
If you need to view the report again later:
```bash
# Open the static HTML file directly
start report/index.html
# or use npm script
npm run report
```

## Troubleshooting

1. **Chrome Canary not found**: Make sure Chrome Canary is installed and the path is correct
2. **Network issues**: Ensure you have internet access to reach `wpt.live`
3. **WebNN features not available**: Make sure you're using a recent version of Chrome Canary with WebNN support

## Email Reports

Send test results via email (requires Outlook):

```bash
# Send to default email (ygu@microsoft.com)
node src/main.js --suite wpt --email

# Send to custom email
node src/main.js --suite wpt --email john.doe@example.com

# Works with all options
node src/main.js --suite wpt --jobs 4 --repeat 3 --email
```

**Email includes:**
- Test summary with pass/fail statistics
- Execution timing and parallel speedup
- Detailed results for each test case

**Requirements:** Windows with Outlook installed and configured.

## File Structure

```
webnn-test/
├── src/
│   ├── webnn.js               # Main test implementation
│   └── main.js                # CLI wrapper and test runner
├── tools/                     # PowerShell utilities
├── report/                    # Generated HTML test reports
├── package.json               # Node.js dependencies
├── playwright.config.js       # Playwright configuration
└── README.md                  # This file
```