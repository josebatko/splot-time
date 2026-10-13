#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
build_dir=$(mktemp -d -t splot-time-build)
trap 'rm -rf "$build_dir"' EXIT
revision=1297039793819b25f926289fb033d77c66786c50
git clone https://github.com/ActivityWatch/aw-import-screentime.git "$build_dir/importer"
git -C "$build_dir/importer" checkout --detach "$revision"
cd "$build_dir/importer"
UV_PROJECT_ENVIRONMENT="$build_dir/venv" uv sync --frozen --no-dev --python 3.12
uv pip install --python "$build_dir/venv/bin/python" pyinstaller==6.16.0 certifi==2026.7.22
cd "$root"
PYINSTALLER_CONFIG_DIR="$build_dir/cache" "$build_dir/venv/bin/python" -m PyInstaller --noconfirm SplotTime.spec
"$root/dist/SplotTime.app/Contents/MacOS/SplotTime" --self-test
ditto -c -k --sequesterRsrc --keepParent "$root/dist/SplotTime.app" "$root/dist/SplotTime-mac.zip"
echo 'Built for the architecture of this Mac. Developer ID signing and notarization remain required for team distribution.'
