# {{PROJECT_NAME}} — Project Rules

## Methodology: SDD

Pipeline: plan → test → sprint → review → done

### Rules
1. Every feature >1 file MUST have a spec before implementation
2. Specs use EARS notation for acceptance criteria
3. Coders never see specs — tests ARE the spec
4. Bug fixes use issues, not specs

## Build Commands
```bash
npm run build
npm run test
npm run typecheck
```

## Conventions
- File names: kebab-case
- Exports: named, no defaults
- Tests: colocated *.test.ts or __tests__/

## Do NOT
- Skip the spec step
- Let coders read specs/
- Use vitest pool: forks (OOM risk)
- Add features not in the spec
