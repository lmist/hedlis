#!/bin/bash
set -euo pipefail

# hedlis setup — installs dependencies, builds, and installs browser runtimes

npm install
npm run build

# Install Chromium for both engines
npx playwright install chromium
npx patchright install chromium

# Download the OpenCLI extension
mkdir -p extensions
if [ ! -f extensions/opencli-extension.zip ]; then
  curl -L -o extensions/opencli-extension.zip \
    "https://github.com/jackwener/opencli/releases/download/v1.5.3/opencli-extension.zip"
fi

# Make hedlis available globally from this checkout
npm link

echo ""
echo "Done. Run 'hedlis --help' to get started."
