set shell := ["zsh", "-cu"]

help:
  @printf '%s\n' \
    'cloak just recipes:' \
    '  just install      - npm install plus extension and browser bootstrap' \
    '  just browser      - retry Patchright Chromium install' \
    '  just test         - run npm test' \
    '  just typecheck    - run tsc --noEmit' \
    '  just build        - build dist/' \
    '  just ci           - run test, typecheck, and build' \
    '  just run          - run the CLI from source' \
    '  just cli-help     - show source CLI help' \
    '  just binary-help  - show the built CLI help' \
    '  just clean        - remove dist/'

install:
  npm install

browser:
  npx patchright install chromium

test:
  npm test

typecheck:
  npm run typecheck

build:
  npm run build

ci:
  npm test
  npm run typecheck
  npm run build

run:
  node --import tsx src/main.ts

cli-help:
  node --import tsx src/main.ts --help

binary-help:
  node dist/main.js --help

clean:
  rm -rf dist
