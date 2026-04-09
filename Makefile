.DEFAULT_GOAL := help

.PHONY: help install browser test typecheck build ci run cli-help binary-help clean

help:
	@printf '%s\n' \
		'cloak make targets:' \
		'  make install      - npm install plus extension and browser bootstrap' \
		'  make browser      - retry Patchright Chromium install' \
		'  make test         - run npm test' \
		'  make typecheck    - run tsc --noEmit' \
		'  make build        - build dist/' \
		'  make ci           - run test, typecheck, and build' \
		'  make run          - run the CLI from source' \
		'  make cli-help     - show source CLI help' \
		'  make binary-help  - show the built CLI help' \
		'  make clean        - remove dist/'

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
