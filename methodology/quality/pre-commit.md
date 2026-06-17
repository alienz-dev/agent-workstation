# Pre-Commit Gate

## Strategy: Affected Tests Only

Full test suite is too slow for pre-commit. Run only tests affected by staged changes.

## How It Works

```bash
# 1. Get staged files
CHANGED=$(git diff --cached --name-only --diff-filter=ACMR)

# 2. Filter to source files
SRC=$(echo "$CHANGED" | grep -E '\.(ts|tsx|py)$')

# 3. Run typecheck (fast, incremental)
turbo typecheck

# 4. Run affected tests
# Option A: colocated tests (file.ts → file.test.ts)
TESTS=$(echo "$SRC" | sed 's/\.ts$/.test.ts/' | xargs -I{} sh -c 'test -f {} && echo {}')

# Option B: if test exists for changed file, run it
if [ -n "$TESTS" ]; then
  npx vitest run $TESTS --reporter=dot
fi
```

## Skip Conditions
- If all tests passed within last 5 minutes (cache check)
- If only markdown/docs changed
- If `--no-verify` flag (escape hatch)

## Configuration
See `.lefthookrc.yml` in project root.
